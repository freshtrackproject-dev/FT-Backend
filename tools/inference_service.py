"""
Minimal FastAPI inference service for Ultralytics PyTorch models (.pt).

Usage:
1. Install dependencies:
   py -m pip install fastapi uvicorn python-multipart pillow ultralytics

2. Run the service:
   py -m uvicorn tools.inference_service:app --host 0.0.0.0 --port 8001

3. POST an image to /infer as form-data with key 'image'.
   The response JSON matches the Node backend shape: { success: true, detections: [...] }

Note: This service uses the Ultralytics YOLO API to load and run the model. It expects 'models/best.pt' by default.
"""
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from pathlib import Path
import shutil
import tempfile
import uvicorn
import os

app = FastAPI(title="PyTorch Inference Service")

MODEL_PATH = Path(__file__).resolve().parents[1] / 'models' / 'best.pt'
IMG_SIZE = 640
CONF_THRESHOLD = 0.15

# Lazy load model
_model = None

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None


def get_model():
    global _model
    if _model is None:
        if YOLO is None:
            raise RuntimeError('ultralytics package not installed')
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f'Model file not found: {MODEL_PATH}')
        _model = YOLO(str(MODEL_PATH))
    return _model


@app.get('/health')
async def health():
    """Simple health endpoint used by Render or orchestrators.

    Returns service status and whether the model is loadable.
    """
    model_ok = True
    reason = None
    try:
        # Attempt to lazy-load the model without raising an exception to the caller
        _ = get_model()
    except Exception as e:
        model_ok = False
        reason = str(e)

    return JSONResponse({'status': 'ok' if model_ok else 'error', 'model_loaded': model_ok, 'detail': reason})


@app.post('/infer')
async def infer(image: UploadFile = File(...)):
    # save upload to temp file
    suffix = Path(image.filename).suffix or '.jpg'
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = Path(tmp.name)
        shutil.copyfileobj(image.file, tmp)
    try:
        model = get_model()
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=str(e))

    try:
        # Run prediction
        results = model.predict(source=str(tmp_path), imgsz=IMG_SIZE, conf=CONF_THRESHOLD)
        # results is a list-like; take first
        r = results[0]
        # Boxes: try to access normalized x,y,w,h if available; else compute from xyxy
        dets = []
        names = {}
        try:
            names = model.names if hasattr(model, 'names') else {}
        except Exception:
            names = {}

        # r.boxes has attributes: xyxy, xywhn, conf, cls
        boxes = getattr(r, 'boxes', None)
        if boxes is None:
            # no detections
            return JSONResponse({'success': True, 'detections': []})

        # Extract arrays
        try:
            xywhn = boxes.xywhn.cpu().numpy()  # normalized cx,cy,w,h
            confs = boxes.conf.cpu().numpy()
            clss = boxes.cls.cpu().numpy().astype(int)
        except Exception:
            # fallback: compute from xyxy
            try:
                xyxy = boxes.xyxy.cpu().numpy()
                confs = boxes.conf.cpu().numpy()
                clss = boxes.cls.cpu().numpy().astype(int)
                # convert xyxy to normalized xywhn using image size
                h, w = r.orig_shape[:2]
                xywhn = []
                for x1,y1,x2,y2 in xyxy:
                    cx = (x1 + x2) / 2.0 / w
                    cy = (y1 + y2) / 2.0 / h
                    ww = (x2 - x1) / w
                    hh = (y2 - y1) / h
                    xywhn.append([cx, cy, ww, hh])
                import numpy as _np
                xywhn = _np.array(xywhn)
            except Exception:
                # last fallback: empty
                xywhn = []
                confs = []
                clss = []

        for i in range(len(xywhn)):
            cx, cy, ww, hh = xywhn[i]
            conf = float(confs[i]) if i < len(confs) else 0.0
            cls = int(clss[i]) if i < len(clss) else -1
            label = names.get(cls, f'cls_{cls}') if isinstance(names, dict) else str(cls)
            dets.append({
                'x': float(cx),
                'y': float(cy),
                'width': float(ww),
                'height': float(hh),
                'confidence': float(conf),
                'class_id': int(cls),
                'label': label,
            })

        # Return detections; Node server will attach storage data if needed
        return JSONResponse({'success': True, 'detections': dets})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


if __name__ == '__main__':
    uvicorn.run('tools.inference_service:app', host='0.0.0.0', port=8001, reload=False)
