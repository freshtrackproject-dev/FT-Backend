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
import numpy as np

app = FastAPI(title="PyTorch Inference Service")

MODEL_PATH = Path(__file__).resolve().parents[1] / 'models' / 'best.pt'
IMG_SIZE = int(os.getenv('IMG_SIZE', '640'))
CONF_THRESHOLD = float(os.getenv('CONF_THRESHOLD', '0.25'))  # Adjust from 0.15 to 0.25
IOU_THRESHOLD = float(os.getenv('IOU_THRESHOLD', '0.5'))
MAX_DET = int(os.getenv('MAX_DET', '100'))

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
        print(f"DEBUG: Loading model from {MODEL_PATH}")
        try:
            _model = YOLO(str(MODEL_PATH))
            # Force detect task mode regardless of model type
            _model.overrides['task'] = 'detect'
            print(f"DEBUG: Model loaded successfully: {type(_model)}")
            print(f"DEBUG: Model task: {getattr(_model, 'task', 'unknown')}")
            print(f"DEBUG: Model names: {getattr(_model, 'names', {})}")
        except Exception as e:
            print(f"DEBUG: Error loading model: {str(e)}")
            raise
    return _model


# Root endpoint
@app.get('/')
async def root():
    """API root endpoint."""
    return {"message": "FreshTrack Inference API", "docs": "/docs"}

# Add HEAD support to health endpoint
@app.get('/health', include_in_schema=True)
@app.head('/health', include_in_schema=True)
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
    # save and preprocess upload
    suffix = Path(image.filename).suffix or '.jpg'
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = Path(tmp.name)
        # Convert to RGB while saving
        from PIL import Image
        img = Image.open(image.file)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.save(tmp_path, format='JPEG', quality=95)
    try:
        model = get_model()
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=str(e))

    try:
        # Run prediction with configured thresholds
        print(f"DEBUG: predict(imgsz={IMG_SIZE}, conf={CONF_THRESHOLD}, iou={IOU_THRESHOLD}, max_det={MAX_DET})")
        
        # Check image before prediction
        from PIL import Image
        img = Image.open(tmp_path)
        print(f"DEBUG: Input image size: {img.size}, mode: {img.mode}")
        
        results = model.predict(
            source=str(tmp_path),
            imgsz=IMG_SIZE,
            conf=CONF_THRESHOLD,
            iou=IOU_THRESHOLD,
            max_det=MAX_DET,
            verbose=True,  # Enable verbose output
            device='cpu',
            task='detect',  # Force detection task
            retina_masks=True,
            save=False,
            save_txt=False
        )
        print(f"DEBUG: Raw results: {results}")
        print(f"DEBUG: Results type: {type(results)}")
        if len(results):
            print(f"DEBUG: First result keys: {dir(results[0])}")
            print(f"DEBUG: First result boxes keys: {dir(results[0].boxes) if hasattr(results[0], 'boxes') else 'No boxes'}")
            if hasattr(results[0], 'boxes'):
                print(f"DEBUG: Boxes count: {len(results[0].boxes)}")
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
        print(f"DEBUG: boxes object: {boxes}")
        print(f"DEBUG: boxes type: {type(boxes)}")
        if boxes is not None:
            print(f"DEBUG: boxes has length: {len(boxes) if hasattr(boxes, '__len__') else 'no length'}")
            if hasattr(boxes, 'xyxy'):
                print(f"DEBUG: boxes.xyxy shape: {boxes.xyxy.shape if hasattr(boxes.xyxy, 'shape') else 'no shape'}")
            if hasattr(boxes, 'conf'):
                print(f"DEBUG: boxes.conf shape: {boxes.conf.shape if hasattr(boxes.conf, 'shape') else 'no shape'}")
                if hasattr(boxes.conf, 'cpu'):
                    confs_cpu = boxes.conf.cpu().numpy()
                    print(f"DEBUG: confidence values: {confs_cpu}")
        
        if boxes is None or (hasattr(boxes, '__len__') and len(boxes) == 0):
            # no detections
            print(f"DEBUG: No boxes found in result")
            return JSONResponse({'success': True, 'detections': []})

        print(f"DEBUG: Found {len(boxes)} boxes before extraction")

        # Access raw tensors directly for debugging
        print(f"DEBUG: Accessing raw result attributes...")
        print(f"DEBUG: Result boxes available: {hasattr(r, 'boxes')}")
        if hasattr(r, 'boxes'):
            print(f"DEBUG: Boxes attributes: {dir(r.boxes)}")
            print(f"DEBUG: Raw tensors:")
            if hasattr(r.boxes, 'xyxy'):
                print(f"  xyxy: {r.boxes.xyxy}")
            if hasattr(r.boxes, 'conf'):
                print(f"  conf: {r.boxes.conf}")
            if hasattr(r.boxes, 'cls'):
                print(f"  cls: {r.boxes.cls}")
        
        # Initialize variables
        xywhn = []
        confs = []
        clss = []
        
        # Extract arrays with detailed debugging
        print("DEBUG: Attempting to extract normalized coordinates...")
        try:
            print("DEBUG: Checking OBB attributes...")
            if hasattr(r, 'obb') and r.obb is not None:
                print("DEBUG: Found OBB object:", r.obb)
                print("DEBUG: OBB attributes:", dir(r.obb))
                boxes = r.obb.cpu()
                print("DEBUG: OBB boxes attributes:", dir(boxes))
                
                # Try to get boxes in the right format
                if hasattr(boxes, 'xyxy'):
                    print("DEBUG: Using OBB xyxy format")
                    xyxy = boxes.xyxy.numpy()
                elif hasattr(boxes, 'xywh'):
                    print("DEBUG: Converting OBB xywh to xyxy format")
                    xywh = boxes.xywh.numpy()
                    # Convert xywh to xyxy
                    xyxy = []
                    for x, y, w, h in xywh:
                        x1 = x - w/2
                        y1 = y - h/2
                        x2 = x + w/2
                        y2 = y + h/2
                        xyxy.append([x1, y1, x2, y2])
                    xyxy = np.array(xyxy)
                else:
                    print("DEBUG: No recognized box format in OBB")
                    print("DEBUG: Available OBB box attributes:", dir(boxes))
                    raise ValueError("No recognized box format in OBB object")
                
                # Get confidence and class
                if hasattr(boxes, 'conf'):
                    confs = boxes.conf.numpy()
                else:
                    print("DEBUG: No confidence scores found")
                    confs = np.ones(len(xyxy))
                
                if hasattr(boxes, 'cls'):
                    clss = boxes.cls.numpy().astype(int)
                else:
                    print("DEBUG: No class indices found")
                    clss = np.zeros(len(xyxy), dtype=int)
                
            elif hasattr(r, 'boxes') and r.boxes is not None:
                print("DEBUG: Using regular detection boxes")
                boxes = r.boxes.cpu()
                xyxy = boxes.xyxy.numpy()
                confs = boxes.conf.numpy()
                clss = boxes.cls.numpy().astype(int)
            else:
                print("DEBUG: No detection boxes found in results")
                return JSONResponse({'success': True, 'detections': []})

            print(f"DEBUG: xyxy shape: {xyxy.shape}, values: {xyxy}")
            print(f"DEBUG: confs shape: {confs.shape}, values: {confs}")
            print(f"DEBUG: clss shape: {clss.shape}, values: {clss}")
            
            # Get image dimensions
            h, w = r.orig_shape[:2]
            print(f"DEBUG: Image dimensions: {w}x{h}")
            
            # Convert to normalized coordinates
            xywhn = []
            for x1,y1,x2,y2 in xyxy:
                cx = (x1 + x2) / 2.0 / w
                cy = (y1 + y2) / 2.0 / h
                ww = (x2 - x1) / w
                hh = (y2 - y1) / h
                xywhn.append([cx, cy, ww, hh])
            
            import numpy as _np
            xywhn = _np.array(xywhn)
            print(f"DEBUG: Converted to normalized: {xywhn.shape}, values: {xywhn}")
        except Exception as e:
            print(f"DEBUG: Error extracting coordinates: {str(e)}")
            print("DEBUG: Falling back to empty detections")

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

        print(f"DEBUG: Returning {len(dets)} detections")
        # Return detections; Node server will attach storage data if needed
        return JSONResponse({'success': True, 'detections': dets})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# Add root endpoint redirect to docs
@app.get("/")
async def root():
    return {"message": "API docs at /docs"}


if __name__ == '__main__':
    uvicorn.run('tools.inference_service:app', host='0.0.0.0', port=8001, reload=False)
