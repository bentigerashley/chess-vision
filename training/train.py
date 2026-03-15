#!/usr/bin/env python3
"""
Train a 13-class chess piece classifier and export to TFLite for ChessVision Android app.

Dataset: folder-per-class (--data-dir) or CSV with path,label (--dataset-csv).
Output: chess_piece_classifier.tflite with input [1, 224, 224, 3] float32, output [1, 13] logits.

Class indices must match com.chessvision.model.PieceType:
  0=empty, 1-6=white (P,N,B,R,Q,K), 7-12=black (p,n,b,r,q,k)
"""

import argparse
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

# -----------------------------------------------------------------------------
# Class names and order (must match Android PieceType enum)
# -----------------------------------------------------------------------------
CLASS_NAMES = [
    "empty",
    "white_pawn", "white_knight", "white_bishop", "white_rook", "white_queen", "white_king",
    "black_pawn", "black_knight", "black_bishop", "black_rook", "black_queen", "black_king",
]
NUM_CLASSES = len(CLASS_NAMES)
CLASS_TO_INDEX = {name: i for i, name in enumerate(CLASS_NAMES)}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def collect_images_from_folders(data_dir: Path):
    """Scan data_dir for 13 class folders; return list of (path, label_index)."""
    data_dir = Path(data_dir)
    if not data_dir.is_dir():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    samples = []
    for class_name in CLASS_NAMES:
        folder = data_dir / class_name
        if not folder.is_dir():
            print(f"Warning: missing folder {folder}, skipping class '{class_name}'")
            continue
        idx = CLASS_TO_INDEX[class_name]
        for path in folder.iterdir():
            if path.suffix.lower() in IMAGE_EXTENSIONS:
                samples.append((str(path.resolve()), idx))

    if len(samples) == 0:
        raise ValueError(
            f"No images found under {data_dir}. "
            f"Expected subfolders: {CLASS_NAMES}. "
            f"Supported extensions: {IMAGE_EXTENSIONS}"
        )
    return samples


def collect_images_from_csv(csv_path: Path):
    """Load CSV with columns 'path' and 'label'; return list of (path, label_index)."""
    csv_path = Path(csv_path)
    if not csv_path.is_file():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    df = pd.read_csv(csv_path)
    if "path" not in df.columns or "label" not in df.columns:
        raise ValueError("CSV must have columns 'path' and 'label'")

    samples = []
    csv_dir = csv_path.parent
    for _, row in df.iterrows():
        path = Path(row["path"])
        if not path.is_absolute():
            path = csv_dir / path
        path = path.resolve()
        if not path.is_file():
            print(f"Warning: file not found, skipping: {path}")
            continue
        label = str(row["label"]).strip().lower()
        if label not in CLASS_TO_INDEX:
            print(f"Warning: unknown label '{label}', skipping {path}")
            continue
        samples.append((str(path), CLASS_TO_INDEX[label]))

    if len(samples) == 0:
        raise ValueError("No valid rows in CSV.")
    return samples


def load_and_preprocess_image(path: str, image_size: int):
    """Load image, resize to image_size x image_size, RGB, normalize to [0,1]."""
    raw = tf.io.read_file(path)
    img = tf.io.decode_image(raw, channels=3, expand_animations=False)
    img.set_shape([None, None, 3])
    img = tf.image.resize(img, [image_size, image_size], method="bilinear")
    img = tf.cast(img, tf.float32) / 255.0
    return img


def build_dataset(samples, image_size: int, batch_size: int, shuffle: bool = True, augment: bool = False):
    """Build a tf.data.Dataset from list of (path, label_index)."""
    paths = [s[0] for s in samples]
    labels = np.array([s[1] for s in samples], dtype=np.int32)

    def gen():
        for i in range(len(paths)):
            yield paths[i], labels[i]

    ds = tf.data.Dataset.from_generator(
        gen,
        output_signature=(
            tf.TensorSpec(shape=(), dtype=tf.string),
            tf.TensorSpec(shape=(), dtype=tf.int32),
        ),
    )
    if shuffle:
        ds = ds.shuffle(buffer_size=min(1024, len(samples)), seed=42)

    def load_and_map(path, label):
        img = load_and_preprocess_image(path, image_size)
        if augment:
            img = tf.image.random_flip_left_right(img)
            img = tf.image.random_brightness(img, max_delta=0.1)
            img = tf.image.random_contrast(img, lower=0.9, upper=1.1)
            img = tf.clip_by_value(img, 0.0, 1.0)
        return img, label

    ds = ds.map(
        lambda path, label: load_and_map(path, label),
        num_parallel_calls=tf.data.AUTOTUNE,
    )
    ds = ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return ds


def build_model(image_size: int, num_classes: int):
    """MobileNetV2 backbone + small head for 13-way classification."""
    base = keras.applications.MobileNetV2(
        input_shape=(image_size, image_size, 3),
        include_top=False,
        weights="imagenet",
        pooling="avg",
    )
    base.trainable = True
    # Optional: freeze early layers to speed up training
    for layer in base.layers[:-30]:
        layer.trainable = False

    inputs = keras.Input(shape=(image_size, image_size, 3))
    x = base(inputs)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(num_classes, activation="linear", name="logits")(x)

    model = keras.Model(inputs=inputs, outputs=outputs)
    return model


def main():
    parser = argparse.ArgumentParser(description="Train chess piece classifier and export TFLite")
    parser.add_argument("--data-dir", type=str, default=None, help="Root directory with 13 class folders")
    parser.add_argument("--dataset-csv", type=str, default=None, help="CSV with path,label (alternative to --data-dir)")
    parser.add_argument("--output-dir", type=str, default="./output", help="Where to save TFLite and logs")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--val-split", type=float, default=0.2, help="Validation fraction (0..1)")
    parser.add_argument("--image-size", type=int, default=224, help="Input size (must be 224 for app)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.data_dir is None and args.dataset_csv is None:
        print("Provide either --data-dir or --dataset-csv.", file=sys.stderr)
        sys.exit(1)
    if args.data_dir is not None and args.dataset_csv is not None:
        print("Provide only one of --data-dir or --dataset-csv.", file=sys.stderr)
        sys.exit(1)

    tf.keras.utils.set_random_seed(args.seed)

    if args.data_dir:
        samples = collect_images_from_folders(Path(args.data_dir))
    else:
        samples = collect_images_from_csv(Path(args.dataset_csv))

    np.random.seed(args.seed)
    np.random.shuffle(samples)
    n = len(samples)
    n_val = max(1, int(n * args.val_split))
    n_train = n - n_val
    train_samples = samples[:n_train]
    val_samples = samples[n_train:]

    print(f"Train samples: {n_train}, validation: {n_val}")

    train_ds = build_dataset(
        train_samples, args.image_size, args.batch_size, shuffle=True, augment=True
    )
    val_ds = build_dataset(
        val_samples, args.image_size, args.batch_size, shuffle=False, augment=False
    )

    model = build_model(args.image_size, NUM_CLASSES)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-4),
        loss=keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        metrics=["accuracy"],
    )

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=5, restore_best_weights=True
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=3, min_lr=1e-6
        ),
    ]

    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        callbacks=callbacks,
    )

    # Export to TFLite (logits output, no softmax – app applies softmax)
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = []
    tflite_model = converter.convert()

    tflite_path = out_dir / "chess_piece_classifier.tflite"
    tflite_path.write_bytes(tflite_model)
    print(f"Saved TFLite model to {tflite_path}")

    # Quick sanity check: run one inference
    interp = tf.lite.Interpreter(model_path=str(tflite_path))
    interp.allocate_tensors()
    in_details = interp.get_input_details()[0]
    out_details = interp.get_output_details()[0]
    assert in_details["shape"] == (1, args.image_size, args.image_size, 3), in_details["shape"]
    assert out_details["shape"] == (1, NUM_CLASSES), out_details["shape"]
    print("TFLite signature check passed: input [1, 224, 224, 3], output [1, 13]")

    print("\nNext step: copy the model into the Android project:")
    print("  cp", tflite_path, "path/to/chess-vision/app/src/main/assets/chess_piece_classifier.tflite")


if __name__ == "__main__":
    main()
