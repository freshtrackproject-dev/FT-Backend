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

# Add file existence check endpoint
@app.get("/check-file")
async def check_file(filepath: str):
    try:
        # Remove /uploads from the start of the path as it's already included in UPLOADS_DIR
        clean_path = filepath.replace("/uploads/", "")
        full_path = UPLOADS_DIR / clean_path

        print(f"DEBUG: Checking file existence:")
        print(f"  Input path: {filepath}")
        print(f"  Cleaned path: {clean_path}")
        print(f"  Full path: {full_path}")
        print(f"  UPLOADS_DIR: {UPLOADS_DIR}")
        print(f"  Exists: {full_path.exists()}")
        
        if full_path.exists():
            stats = full_path.stat()
            return {
                "exists": True,
                "path": str(full_path),
                "size": stats.st_size,
                "is_file": full_path.is_file(),
                "created": stats.st_ctime,
                "modified": stats.st_mtime
            }
        else:
            # List contents of uploads directory for debugging
            print("\nContents of uploads directory:")
            for item in UPLOADS_DIR.rglob("*"):
                print(f"  {item.relative_to(UPLOADS_DIR)}")
            return {
                "exists": False,
                "path": str(full_path),
                "uploads_dir_exists": UPLOADS_DIR.exists(),
                "uploads_dir_contents": [str(p.relative_to(UPLOADS_DIR)) for p in UPLOADS_DIR.rglob("*") if p.is_file()]
            }
    except Exception as e:
        print(f"ERROR checking file: {str(e)}")
        return {"error": str(e)}

# Configure static file serving with proper headers
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Create a custom StaticFiles class with logging
class LoggingStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        print(f"\nDEBUG: Static file request:")
        print(f"  Path: {path}")
        print(f"  Directory: {self.directory}")
        print(f"  Full path: {os.path.join(self.directory, path)}")
        return await super().get_response(path, scope)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files with logging
app.mount("/uploads", LoggingStaticFiles(
    directory=str(UPLOADS_DIR),
    check_dir=True,
    html=False), name="uploads")

# Add direct file serving endpoint for debugging
@app.get("/files/{filepath:path}")
async def serve_file(filepath: str):
    full_path = UPLOADS_DIR / filepath
    if not full_path.exists():
        print(f"File not found: {full_path}")
        return {"error": "File not found"}
    return FileResponse(str(full_path))

# Log startup configuration
print(f"🗂️  Uploads directory: {UPLOADS_DIR} (exists: {UPLOADS_DIR.exists()}, writable: {os.access(str(UPLOADS_DIR), os.W_OK)})")
print(f"🖼️  Crops directory: {CROPS_DIR} (exists: {CROPS_DIR.exists()}, writable: {os.access(str(CROPS_DIR), os.W_OK)})")

MODEL_PATH = Path(__file__).resolve().parents[1] / 'models' / 'best.pt'
IMG_SIZE = int(os.getenv('IMG_SIZE', '640'))
# Updated threshold based on model performance metrics (mAP50: 0.879, Precision: 0.844)
# Higher threshold reduces false positives while maintaining good detection rate
CONF_THRESHOLD = float(os.getenv('CONF_THRESHOLD', '0.70'))
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
            verbose=True,
            save=False,  # Don't save annotated images
            show=False,  # Don't show visualization
            save_txt=False,  # Don't save labels
            save_conf=False,  # Don't save confidences
            save_crop=False  # Don't use YOLO's built-in cropping
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

                        # Log raw detection values for debugging
                        raw_cx, raw_cy, raw_w, raw_h = cx, cy, w, h
                        print(f"DEBUG: raw detection[{i}]: cx={raw_cx}, cy={raw_cy}, w={raw_w}, h={raw_h}, conf={conf}, cls={cls_id}")

                        # Normalize coordinates if they're in pixel coordinates (some model outputs may be in px)
                        # Use the actual original image width/height saved earlier (orig_width, orig_height)
                        if cx > 1 or cy > 1 or w > 1 or h > 1:
                            try:
                                cx = cx / orig_width
                                w = w / orig_width
                                cy = cy / orig_height
                                h = h / orig_height
                            except Exception as e:
                                print(f"DEBUG: Error normalizing pixel coords: {e}")

                        # Ensure values are in [0,1]
                        cx = float(max(0.0, min(1.0, cx)))
                        cy = float(max(0.0, min(1.0, cy)))
                        w = float(max(0.0, min(1.0, w)))
                        h = float(max(0.0, min(1.0, h)))

                        print(f"DEBUG: normalized detection[{i}]: cx={cx}, cy={cy}, w={w}, h={h}")

                        # Ensure values are in [0,1]
                        # Normalize and store original YOLO format coordinates (center-based)
                        cx = float(max(0.0, min(1.0, cx)))
                        cy = float(max(0.0, min(1.0, cy)))
                        w = float(max(0.0, min(1.0, w)))
                        h = float(max(0.0, min(1.0, h)))

                        # Get class label
                        label = model.names.get(cls_id, f'class_{cls_id}')
                        
                        # Convert normalized center coordinates to pixels for cropping
                        center_x = cx * orig_width
                        center_y = cy * orig_height
                        half_w = (w * orig_width) / 2
                        half_h = (h * orig_height) / 2
                        
                        # Calculate box corners for exact crop
                        x_pixel = int(max(0, center_x - half_w))
                        y_pixel = int(max(0, center_y - half_h))
                        x2_pixel = int(min(orig_width, center_x + half_w))
                        y2_pixel = int(min(orig_height, center_y + half_h))
                        
                        # First crop the exact bounding box
                        exact_crop = img.crop((x_pixel, y_pixel, x2_pixel, y2_pixel))
                        
                        # Resize to a standard size (224x224 is common for many vision models)
                        TARGET_SIZE = (224, 224)
                        resized_crop = exact_crop.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
                        
                        crop_filename = f"{label}_{i}_{conf:.2f}.jpg"
                        crop_path = crops_dir / crop_filename
                        print(f"DEBUG: Saving crop to: {crop_path}")
                        try:
                            resized_crop.save(crop_path, format='JPEG', quality=95)
                            print(f"DEBUG: Successfully saved crop to: {crop_path}")
                            print(f"DEBUG: Crop file exists: {crop_path.exists()}")
                        except Exception as e:
                            print(f"DEBUG: Error saving crop: {str(e)}")
                            raise
                        
                        detections.append({
                            'label': label,
                            'confidence': conf,
                            'bbox': {
                                'x': cx - w/2,  # Convert to top-left for frontend
                                'y': cy - h/2,  # Convert to top-left for frontend
                                'width': w,
                                'height': h
                            },
                                                        'cropped_path': f"/uploads/crops/{crop_filename}"
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