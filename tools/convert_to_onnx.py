"""
Simple PyTorch -> ONNX export helper for this repo.
Place your .pt/.pth model at models/model.pt (or edit MODEL_PATH below), then run:

    python tools/convert_to_onnx.py

Notes:
- Adjust INPUT_SHAPE to match your model's expected input (channels, height, width).
- If your model has a custom forward signature (returns multiple tensors), adapt the export accordingly.
- If export fails with unsupported ops, try changing opset_version or use the model's official export script.
"""
from pathlib import Path
import torch

# Config - edit if needed
# Resolve paths relative to repo root (two levels up from this script)
REPO_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = REPO_ROOT / 'models' / 'best.pt'  # your PyTorch checkpoint
ONNX_PATH = REPO_ROOT / 'models' / 'best.onnx'  # destination ONNX
OPSET_VERSION = 12
INPUT_SHAPE = (1, 3, 416, 416)


def load_model(model_path: Path):
    """Try to load a state_dict or full model object."""
    if not model_path.exists():
        print(f"❌ Model file not found at: {model_path}")
        try:
            print("📂 Listing files in models/:")
            for p in (model_path.parent).iterdir():
                print(' -', p.name)
        except Exception:
            pass
        raise FileNotFoundError(f"Model file not found: {model_path}")

    # Try common loading patterns
    try:
        model = torch.load(model_path, map_location='cpu')
        # If this is a state_dict, user must reconstruct model and load state_dict.
        if isinstance(model, dict) and 'state_dict' in model:
            print("Loaded checkpoint with 'state_dict'. You need to rebuild model architecture and load state_dict manually.")
            raise RuntimeError('State dict detected - reconstruct model before exporting')
        return model
    except Exception as e:
        raise RuntimeError(f'Failed to load PyTorch model: {e}')


if __name__ == '__main__':
    print(f"Exporting {MODEL_PATH} -> {ONNX_PATH} (opset {OPSET_VERSION})")
    model = load_model(MODEL_PATH)
    model.eval()

    dummy_input = torch.randn(*INPUT_SHAPE)

    try:
        torch.onnx.export(
            model,
            dummy_input,
            str(ONNX_PATH),
            opset_version=OPSET_VERSION,
            input_names=['images'],
            output_names=['output'],
            dynamic_axes={'images': {0: 'batch'}, 'output': {0: 'batch'}},
            do_constant_folding=True,
            verbose=True,
        )
        print(f"✅ Exported ONNX to {ONNX_PATH}")
    except Exception as e:
        print("❌ Export failed:", e)
        print("Hint: try changing OPSET_VERSION, or use the model's official export script if available.")
        raise
