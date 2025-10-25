"""
Minimal FastAPI inference service for Ultralytics YOLO OBB model.

This service:
1. Accepts images via POST /infer endpoint
2. Runs YOLO OBB detection
3. Returns normalized bounding boxes in the format expected by the frontend

Format:
{
    "success": true,
    "detections": [
        {
            "label": str,
            "confidence": float,
            "bbox": {
                "x": float,  # normalized top-left x
                "y": float,  # normalized top-left y
                "width": float,
                "height": float
            }
        }
    ]
}

Dependencies: fastapi uvicorn python-multipart pillow ultralytics
"""
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import tempfile
import uvicorn
import os
import numpy as np
import shutil

# Ensure uploads directory exists
UPLOADS_DIR = Path("/app/uploads")
CROPS_DIR = UPLOADS_DIR / "crops"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
CROPS_DIR.mkdir(parents=True, exist_ok=True)

# Set permissions
for dir_path in [UPLOADS_DIR, CROPS_DIR]:
    os.chmod(dir_path, 0o777)

app = FastAPI(title="PyTorch Inference Service")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR), check_dir=True), name="uploads")

MODEL_PATH = Path(__file__).resolve().parents[1] / 'models' / 'best.pt'
IMG_SIZE = int(os.getenv('IMG_SIZE', '640'))
CONF_THRESHOLD = float(os.getenv('CONF_THRESHOLD', '0.25'))
IOU_THRESHOLD = float(os.getenv('IOU_THRESHOLD', '0.5'))
MAX_DET = int(os.getenv('MAX_DET', '100'))

# Lazy load model
_model = None

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

def get_model():
    """Initialize and return the YOLO model with configured parameters."""
    global _model
    if _model is None:
        if YOLO is None:
            raise RuntimeError('ultralytics package not installed')
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f'Model file not found: {MODEL_PATH}')
        
        print(f"DEBUG: Loading model from {MODEL_PATH}")
        try:
            _model = YOLO(str(MODEL_PATH))
            print(f"DEBUG: Model loaded successfully: {type(_model)}")
            print(f"DEBUG: Model task: {getattr(_model, 'task', 'unknown')}")
            print(f"DEBUG: Model names: {getattr(_model, 'names', {})}")
            
            # Configure inference parameters
            _model.overrides = {
                'conf': CONF_THRESHOLD,
                'iou': IOU_THRESHOLD,
                'max_det': MAX_DET,
                'verbose': True
            }
        except Exception as e:
            print(f"DEBUG: Error loading model: {str(e)}")
            raise
    return _model

@app.get('/')
async def root():
    """API root endpoint."""
    return {"message": "FreshTrack Inference API", "docs": "/docs"}

@app.get('/health', include_in_schema=True)
@app.head('/health', include_in_schema=True)
async def health():
    """Health check endpoint."""
    try:
        _ = get_model()
        return JSONResponse({
            'status': 'ok',
            'model_loaded': True
        })
    except Exception as e:
        return JSONResponse({
            'status': 'error',
            'model_loaded': False,
            'detail': str(e)
        })

@app.post('/infer')
async def infer(image: UploadFile = File(...)):
    """Process an image and return detections with cropped object images.
    
    Returns:
        JSONResponse with format:
        {
            "success": true,
            "detections": [
                {
                    "label": str,
                    "confidence": float,
                    "bbox": {
                        "x": float,  # normalized top-left x
                        "y": float,  # normalized top-left y
                        "width": float,
                        "height": float
                    },
                    "cropped_path": str  # path to the cropped image
                }
            ]
        }
    """
    tmp_path = None
    crops_dir = None
    try:
        # Create crops directory and ensure it exists
        crops_dir = Path('/app/uploads/crops')
        crops_dir.mkdir(parents=True, exist_ok=True)
        print(f"DEBUG: Crops directory path: {crops_dir}")
        print(f"DEBUG: Crops directory exists: {crops_dir.exists()}")
        print(f"DEBUG: Crops directory is writable: {os.access(crops_dir, os.W_OK)}")
        
        # Save and preprocess uploaded image
        suffix = Path(image.filename).suffix or '.jpg'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = Path(tmp.name)
            from PIL import Image
            img = Image.open(image.file)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(tmp_path, format='JPEG', quality=95)
            
        # Store original image size for later use
        orig_width, orig_height = img.size

        # Run inference
        model = get_model()
        results = model.predict(
            source=str(tmp_path),
            imgsz=IMG_SIZE,
            conf=CONF_THRESHOLD,
            iou=IOU_THRESHOLD,
            max_det=MAX_DET,
            device='cpu',
            verbose=True
        )

        if not results:
            return JSONResponse({'success': True, 'detections': []})

        r = results[0]
        detections = []

        # Process OBB detections
        if hasattr(r, 'obb') and r.obb is not None:
            obb = r.obb.cpu()
            if hasattr(obb, 'data'):
                box_data = obb.data.numpy()
                if len(box_data) > 0:
                    # Process each detection
                    for i in range(len(box_data)):
                        cx, cy, w, h = box_data[i][:4]  # center-x, center-y, width, height
                        conf = float(box_data[i][5])    # confidence score
                        cls_id = int(box_data[i][6])    # class ID
                        
                        # Normalize coordinates if needed
                        if cx > 1 or cy > 1:
                            h, w = r.orig_shape
                            cx = cx / w
                            cy = cy / h
                            w = w / w
                            h = h / h

                        # Ensure values are in [0,1]
                        cx = float(max(0.0, min(1.0, cx)))
                        cy = float(max(0.0, min(1.0, cy)))
                        w = float(max(0.0, min(1.0, w)))
                        h = float(max(0.0, min(1.0, h)))

                        # Convert center coordinates to top-left for frontend
                        x = cx - w/2
                        y = cy - h/2

                        # Get class label
                        label = model.names.get(cls_id, f'class_{cls_id}')
                        
                        # Convert normalized coordinates back to pixels for cropping
                        x_pixel = int(x * orig_width)
                        y_pixel = int(y * orig_height)
                        w_pixel = int(w * orig_width)
                        h_pixel = int(h * orig_height)
                        
                        # Ensure coordinates are within bounds
                        x_pixel = max(0, x_pixel)
                        y_pixel = max(0, y_pixel)
                        w_pixel = min(w_pixel, orig_width - x_pixel)
                        h_pixel = min(h_pixel, orig_height - y_pixel)
                        
                        # Crop and save the detected object
                        crop = img.crop((x_pixel, y_pixel, x_pixel + w_pixel, y_pixel + h_pixel))
                        crop_filename = f"{label}_{i}_{conf:.2f}.jpg"
                        crop_path = crops_dir / crop_filename
                        print(f"DEBUG: Saving crop to: {crop_path}")
                        try:
                            crop.save(crop_path, format='JPEG', quality=95)
                            print(f"DEBUG: Successfully saved crop to: {crop_path}")
                            print(f"DEBUG: Crop file exists: {crop_path.exists()}")
                        except Exception as e:
                            print(f"DEBUG: Error saving crop: {str(e)}")
                            raise
                        
                        detections.append({
                            'label': label,
                            'confidence': conf,
                            'bbox': {
                                'x': float(max(0.0, min(1.0, x))),
                                'y': float(max(0.0, min(1.0, y))),
                                'width': float(w),
                                'height': float(h)
                            },
                                                        'cropped_path': f"/crops/{crop_filename}"
                        })

        return JSONResponse({'success': True, 'detections': detections})
    
    except Exception as e:
        print(f"DEBUG: Error during inference: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        # Clean up temporary input file
        if tmp_path:
            try:
                tmp_path.unlink()
            except:
                pass
        
        # Clean up old crops (keep only last 100)
        if crops_dir and crops_dir.exists():
            try:
                crop_files = list(crops_dir.glob('*.jpg'))
                crop_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
                
                # Keep only the 100 most recent crops
                for old_crop in crop_files[100:]:
                    old_crop.unlink()
            except:
                pass

if __name__ == '__main__':
    uvicorn.run('tools.inference_service:app', host='0.0.0.0', port=8001, reload=False)