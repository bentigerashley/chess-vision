# Chess piece classifier – training

This folder contains everything needed to train the TFLite model used by the ChessVision app. The app expects a single `.tflite` file that takes **224×224 RGB** images and outputs **13 class logits** (empty + 6 white + 6 black pieces).

---

## 1. Dataset format

The training script expects one of two layouts.

### Option A: Folder per class (recommended)

Organize your images so that each class has its own folder. Folder names must match the **exact** names below (lowercase, underscores). The script will discover all images under each folder.

```
your_dataset/
├── empty/
│   ├── img001.jpg
│   └── ...
├── white_pawn/
├── white_knight/
├── white_bishop/
├── white_rook/
├── white_queen/
├── white_king/
├── black_pawn/
├── black_knight/
├── black_bishop/
├── black_rook/
├── black_queen/
└── black_king/
```

- **empty** – images of an empty square (no piece).
- **white_pawn**, **white_knight**, … **white_king** – white pieces on a square.
- **black_pawn**, … **black_king** – black pieces on a square.

Each image should show **one square** (cropped from a board), or a full board crop that you will split into squares before training. The script assumes each image is **one square**; if you have full-board images, use the “Option B” CSV flow or pre-crop them (e.g. with the same grid used in the app).

Supported extensions: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`.

### Option B: CSV with paths and labels

Alternatively you can provide a CSV file with columns:

- `path` – path to the image file (absolute or relative to CSV location).
- `label` – one of: `empty`, `white_pawn`, `white_knight`, `white_bishop`, `white_rook`, `white_queen`, `white_king`, `black_pawn`, `black_knight`, `black_bishop`, `black_rook`, `black_queen`, `black_king`.

Example:

```csv
path,label
/path/to/images/sq_a1.jpg,white_rook
/path/to/images/sq_e4.png,empty
```

Use `--dataset-csv your_file.csv` when running the script (see below).

---

## 2. Environment

Use Python 3.9+ and a virtual environment:

```bash
cd training
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate
pip install -r requirements.txt
```

---

## 3. Train and export

**Using folder-based dataset:**

```bash
python train.py --data-dir /path/to/your_dataset --output-dir ./output
```

**Using CSV:**

```bash
python train.py --dataset-csv /path/to/labels.csv --output-dir ./output
```

Optional arguments:

| Argument | Default | Description |
|----------|---------|-------------|
| `--data-dir` | - | Root directory containing the 13 class folders (Option A). |
| `--dataset-csv` | - | CSV with `path` and `label` (Option B). Use this or `--data-dir`, not both. |
| `--output-dir` | `./output` | Where to save the TFLite model and logs. |
| `--epochs` | 30 | Training epochs. |
| `--batch-size` | 32 | Batch size. |
| `--val-split` | 0.2 | Fraction of data used for validation (0.0–1.0). |
| `--image-size` | 224 | Input size (width and height). Must be 224 for the app. |
| `--seed` | 42 | Random seed for reproducibility. |

After training, the script writes:

- `output/chess_piece_classifier.tflite` – model to use in the app.
- `output/chess_piece_classifier_float32.tflite` – same model, explicit float32 (optional).
- Training logs and optional checkpoints in `output/`.

---

## 4. Put the model in the app

1. Copy the generated TFLite file into the Android project assets:

   ```text
   app/src/main/assets/chess_piece_classifier.tflite
   ```

2. Rebuild the app. The app loads the model from assets and runs inference with:
   - **Input:** 224×224 RGB, normalized to [0, 1] per channel (R, G, B).
   - **Output:** shape `[1, 13]` float logits; the app applies softmax and takes argmax.

Class index mapping (must match `PieceType` in the app):

| Index | Class      | FEN |
|-------|------------|-----|
| 0     | empty      | -   |
| 1     | white_pawn | P   |
| 2     | white_knight | N |
| 3     | white_bishop | B |
| 4     | white_rook | R   |
| 5     | white_queen | Q  |
| 6     | white_king | K   |
| 7     | black_pawn | p   |
| 8     | black_knight | n |
| 9     | black_bishop | b |
| 10    | black_rook | r   |
| 11    | black_queen | q  |
| 12    | black_king | k   |

---

## 5. Tips

- **Balance:** Try to have a similar number of images per class so the model doesn’t bias toward frequent classes.
- **Square crops:** Training on single-square crops (as the app sees them after board detection) usually works better than full-board images unless you crop to squares first.
- **Augmentation:** The script uses light augmentation (flips, small rotation, brightness/contrast). For more variety you can extend `train.py`.
- **Validation:** Watch validation accuracy and loss; if validation loss increases while training loss decreases, try fewer epochs or stronger regularization.
- **Quantization (optional):** For a smaller/faster model you can experiment with TFLite int8 quantization in `train.py`; the app currently expects float input/output, so you’d need to adjust the Android preprocessing/inference if you switch to quantized models.

If you tell me how your dataset is structured (folders vs CSV, and whether images are single-square or full-board), I can suggest exact commands or script changes.
