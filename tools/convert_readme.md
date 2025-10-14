Convert PyTorch (.pt) to ONNX

1. Place your PyTorch model at `models/model.pt` or update `tools/convert_to_onnx.py`'s MODEL_PATH.
2. Adjust `INPUT_SHAPE` and `OPSET_VERSION` in `tools/convert_to_onnx.py` if needed.
3. Run:

```powershell
python tools\convert_to_onnx.py
```

If the script detects a `state_dict` rather than a full model object, you'll need to reconstruct your model architecture and load the `state_dict` before exporting. For complex models (especially YOLO variants), prefer using the repo's official export script (e.g., Ultralytics export utilities).
