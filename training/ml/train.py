"""CUDA-only MobileNetV3 training for the private Chess Vision baseline."""

from __future__ import annotations

import argparse
import json
import os
import platform
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from .contract import CLASS_NAMES, IMAGENET_MEAN, IMAGENET_STD, MODEL_ARCHITECTURE
from .dataset import RectifiedSquareDataset, prepare_experiment, sha256_file, write_json_atomic
from .metrics import board_reconstruction_metrics, classification_metrics


DEFAULT_SEED = 20260721


def require_cuda(torch_module):
    """Refuse CPU fallback: the user requested that this baseline train on GPU."""
    if not torch_module.cuda.is_available():
        raise RuntimeError('CUDA is required for Chess Vision training; install the pinned CUDA PyTorch wheels and retry.')
    return torch_module.device('cuda:0')


def seed_everything(torch_module, seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch_module.manual_seed(seed)
    torch_module.cuda.manual_seed_all(seed)
    torch_module.backends.cudnn.benchmark = False
    torch_module.backends.cudnn.deterministic = True


def make_model(torch_module, weights):
    from torchvision.models import mobilenet_v3_small

    model = mobilenet_v3_small(weights=weights)
    classifier = model.classifier[-1]
    model.classifier[-1] = torch_module.nn.Linear(classifier.in_features, len(CLASS_NAMES))
    return model


def make_transforms():
    from torchvision import transforms

    normalization = transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD)
    training = transforms.Compose([
        transforms.RandomApply([transforms.ColorJitter(brightness=0.22, contrast=0.22, saturation=0.14, hue=0.025)], p=0.8),
        transforms.RandomAffine(degrees=5, translate=(0.04, 0.04), scale=(0.94, 1.06), interpolation=transforms.InterpolationMode.BILINEAR),
        transforms.RandomApply([transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 0.8))], p=0.25),
        transforms.ToTensor(),
        normalization,
        transforms.RandomErasing(p=0.12, scale=(0.015, 0.07), ratio=(0.6, 1.7), value='random'),
    ])
    evaluation = transforms.Compose([transforms.ToTensor(), normalization])
    return training, evaluation


def _class_sampler(torch_module, dataset: RectifiedSquareDataset):
    class_counts = [0] * len(CLASS_NAMES)
    for _, _, label in dataset.samples:
        class_counts[label] += 1
    if any(count == 0 for count in class_counts):
        raise ValueError(f'Training split is missing classes: {class_counts}')
    weights = torch_module.DoubleTensor([1 / class_counts[label] for _, _, label in dataset.samples])
    return torch_module.utils.data.WeightedRandomSampler(weights, num_samples=len(weights), replacement=True), class_counts


def _evaluate(torch_module, model, loader, device) -> dict[str, Any]:
    model.eval()
    prediction_batches, target_batches, artifact_ids = [], [], []
    with torch_module.no_grad():
        for images, labels, batch_artifact_ids in loader:
            images = images.to(device, non_blocking=True)
            with torch_module.amp.autocast(device_type='cuda', enabled=True):
                logits = model(images)
            prediction_batches.append(logits.argmax(dim=1))
            target_batches.append(labels)
            artifact_ids.extend(batch_artifact_ids)
    predictions = torch_module.cat(prediction_batches).cpu().tolist()
    targets = torch_module.cat(target_batches).tolist()
    metrics = classification_metrics(targets, predictions, CLASS_NAMES)
    metrics['board_reconstruction'] = board_reconstruction_metrics(artifact_ids, targets, predictions)
    return metrics


def _train_epoch(torch_module, model, loader, optimizer, scaler, criterion, device) -> float:
    model.train()
    total_loss = torch_module.zeros((), device=device)
    total_samples = 0
    for images, labels, _ in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)
        optimizer.zero_grad(set_to_none=True)
        with torch_module.amp.autocast(device_type='cuda', enabled=True):
            logits = model(images)
            loss = criterion(logits, labels)
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        total_loss += loss.detach() * labels.size(0)
        total_samples += labels.size(0)
    return (total_loss / total_samples).item()


def _weight_provenance(torch_module, weights) -> dict[str, Any]:
    filename = os.path.basename(weights.url)
    cached = Path(torch_module.hub.get_dir()) / 'checkpoints' / filename
    return {
        'enum': 'MobileNet_V3_Small_Weights.IMAGENET1K_V1',
        'url': weights.url,
        'cached_path': str(cached),
        'sha256': sha256_file(cached) if cached.is_file() else None,
    }


def export_and_verify(checkpoint_path: Path, output_dir: Path, torch_module) -> tuple[Path, dict[str, Any]]:
    """Produce the portable artifact and its parity evidence as one success boundary."""
    from .export import export_experiment
    from .verify_export import verify_export

    onnx_path = export_experiment(checkpoint_path, output_dir, torch_module)
    report = verify_export(checkpoint_path, onnx_path, output_dir / 'model-contract.json')
    write_json_atomic(output_dir / 'onnx-verification.json', report)
    return onnx_path, report


def train(arguments) -> Path:
    import torch
    from torch.utils.data import DataLoader
    from torchvision.models import MobileNet_V3_Small_Weights

    device = require_cuda(torch)
    seed_everything(torch, arguments.seed)
    output_dir = arguments.output.resolve()
    _, splits, split_manifest = prepare_experiment(arguments.dataset, output_dir, arguments.seed, validate=True)
    train_transform, evaluation_transform = make_transforms()
    train_dataset = RectifiedSquareDataset(splits['train'], transform=train_transform)
    validation_dataset = RectifiedSquareDataset(splits['validation'], transform=evaluation_transform)
    test_dataset = RectifiedSquareDataset(splits['test'], transform=evaluation_transform)
    sampler, train_class_counts = _class_sampler(torch, train_dataset)
    loader_options = {'batch_size': arguments.batch_size, 'num_workers': arguments.workers, 'pin_memory': True}
    train_loader = DataLoader(train_dataset, sampler=sampler, **loader_options)
    validation_loader = DataLoader(validation_dataset, shuffle=False, **loader_options)
    test_loader = DataLoader(test_dataset, shuffle=False, **loader_options)

    weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1
    model = make_model(torch, weights).to(device)
    for parameter in model.features.parameters():
        parameter.requires_grad = False
    optimizer = torch.optim.AdamW(model.parameters(), lr=arguments.learning_rate, weight_decay=arguments.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(1, arguments.epochs - arguments.freeze_epochs))
    scaler = torch.amp.GradScaler('cuda', enabled=True)
    criterion = torch.nn.CrossEntropyLoss(label_smoothing=0.03)
    checkpoint_path = output_dir / 'best.pt'
    experiment_path = output_dir / 'experiment.json'
    started_at = datetime.now(timezone.utc).isoformat()
    experiment = {
        'schema_version': 'chess-vision.training-experiment/v1',
        'status': 'running',
        'started_at': started_at,
        'synthetic_only': True,
        'pwa_eligible': False,
        'model': {'architecture': MODEL_ARCHITECTURE, 'classes': list(CLASS_NAMES), 'weights': _weight_provenance(torch, weights)},
        'runtime': {
            'device': str(device),
            'gpu_name': torch.cuda.get_device_name(device),
            'torch': torch.__version__,
            'cuda': torch.version.cuda,
            'python': platform.python_version(),
            'platform': platform.platform(),
        },
        'hyperparameters': {
            'seed': arguments.seed,
            'epochs': arguments.epochs,
            'freeze_epochs': arguments.freeze_epochs,
            'batch_size': arguments.batch_size,
            'learning_rate': arguments.learning_rate,
            'weight_decay': arguments.weight_decay,
            'balanced_sampler': 'inverse-class-frequency',
            'mixed_precision': True,
        },
        'split_manifest': split_manifest,
        'train_class_counts': train_class_counts,
    }
    write_json_atomic(experiment_path, experiment)

    best_macro_f1 = -1.0
    bad_epochs = 0
    epochs = []
    for epoch in range(1, arguments.epochs + 1):
        if epoch == arguments.freeze_epochs + 1:
            for parameter in model.features.parameters():
                parameter.requires_grad = True
        loss = _train_epoch(torch, model, train_loader, optimizer, scaler, criterion, device)
        validation = _evaluate(torch, model, validation_loader, device)
        if epoch > arguments.freeze_epochs:
            scheduler.step()
        epoch_result = {'epoch': epoch, 'train_loss': loss, 'validation': validation, 'learning_rate': optimizer.param_groups[0]['lr']}
        epochs.append(epoch_result)
        print(json.dumps({'epoch': epoch, 'loss': round(loss, 5), 'validation_macro_f1': round(validation['macro_f1'], 5)}), flush=True)
        if validation['macro_f1'] > best_macro_f1:
            best_macro_f1 = validation['macro_f1']
            bad_epochs = 0
            torch.save({
                'schema_version': 'chess-vision.checkpoint/v1',
                'architecture': MODEL_ARCHITECTURE,
                'classes': list(CLASS_NAMES),
                'model_state': model.state_dict(),
                'epoch': epoch,
                'validation_macro_f1': best_macro_f1,
                'split_manifest_sha256': sha256_file(output_dir / 'split-manifest.json'),
            }, checkpoint_path)
        else:
            bad_epochs += 1
            if bad_epochs >= arguments.early_stopping_patience:
                print(f'Early stopping after {epoch} epochs without validation macro-F1 improvement.', flush=True)
                break

    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    model.load_state_dict(checkpoint['model_state'])
    test_metrics = _evaluate(torch, model, test_loader, device)
    metrics_path = output_dir / 'metrics.json'
    metrics = {
        'schema_version': 'chess-vision.metrics/v1',
        'selected_epoch': checkpoint['epoch'],
        'selected_validation_macro_f1': checkpoint['validation_macro_f1'],
        'epochs': epochs,
        'test': test_metrics,
        'test_puzzle_ids': split_manifest['splits']['test']['puzzle_ids'],
        'checkpoint_sha256': sha256_file(checkpoint_path),
    }
    write_json_atomic(metrics_path, metrics)
    try:
        onnx_path, parity_report = export_and_verify(checkpoint_path, output_dir, torch)
    except Exception as error:
        experiment.update({
            'status': 'failed_export_verification',
            'failed_at': datetime.now(timezone.utc).isoformat(),
            'checkpoint': checkpoint_path.name,
            'metrics': metrics_path.name,
            'failure': str(error),
        })
        write_json_atomic(experiment_path, experiment)
        raise
    experiment.update({
        'status': 'completed',
        'completed_at': datetime.now(timezone.utc).isoformat(),
        'checkpoint': checkpoint_path.name,
        'metrics': metrics_path.name,
        'onnx': onnx_path.name,
        'onnx_verification': 'onnx-verification.json',
        'onnx_verification_max_absolute_delta': parity_report['max_absolute_delta'],
    })
    write_json_atomic(experiment_path, experiment)
    return output_dir


def parse_arguments():
    parser = argparse.ArgumentParser(description='Train the private CUDA Chess Vision square classifier.')
    parser.add_argument('--dataset', type=Path, required=True, help='Validated training/output render directory')
    parser.add_argument('--output', type=Path, required=True, help='Ignored training/output model directory')
    parser.add_argument('--seed', type=int, default=DEFAULT_SEED)
    parser.add_argument('--epochs', type=int, default=16)
    parser.add_argument('--freeze-epochs', type=int, default=4)
    parser.add_argument('--batch-size', type=int, default=64)
    parser.add_argument('--workers', type=int, default=0, help='Keep 0 on the small corpus to share the rectified-image cache.')
    parser.add_argument('--learning-rate', type=float, default=3e-4)
    parser.add_argument('--weight-decay', type=float, default=1e-4)
    parser.add_argument('--early-stopping-patience', type=int, default=5)
    return parser.parse_args()


def main() -> None:
    output = train(parse_arguments())
    print(f'Completed CUDA training experiment: {output}', flush=True)


if __name__ == '__main__':
    main()
