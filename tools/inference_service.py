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
                        # Normalize and store original YOLO format coordinates (center-based)
                        cx = float(max(0.0, min(1.0, cx)))
                        cy = float(max(0.0, min(1.0, cy)))
                        w = float(max(0.0, min(1.0, w)))
                        h = float(max(0.0, min(1.0, h)))

                        # Get class label
                        label = model.names.get(cls_id, f'class_{cls_id}')
                        
                        # Use the raw YOLO bounding box coordinates for initial cropping
                        box_x = int(x * orig_width)  # YOLO x is center
                        box_y = int(y * orig_height)  # YOLO y is center
                        box_w = int(w * orig_width)
                        box_h = int(h * orig_height)

                        # Convert center coordinates to top-left for cropping
                        x1 = max(0, box_x - box_w // 2)
                        y1 = max(0, box_y - box_h // 2)
                        x2 = min(orig_width, box_x + box_w // 2)
                        y2 = min(orig_height, box_y + box_h // 2)

                        print(f"DEBUG: Raw crop coordinates - x1: {x1}, y1: {y1}, x2: {x2}, y2: {y2}")
                        print(f"DEBUG: Original detection - x: {x}, y: {y}, w: {w}, h: {h}")
                        
                        # First crop using exact YOLO coordinates
                        exact_crop = img.crop((x1, y1, x2, y2))
                        
                        # After exact crop, resize to standard size while preserving aspect ratio
                        TARGET_SIZE = (224, 224)
                        
                        # Calculate resize dimensions
                        crop_width, crop_height = exact_crop.size
                        aspect_ratio = crop_width / crop_height
                        
                        if aspect_ratio > 1:
                            # Width is larger
                            new_width = TARGET_SIZE[0]
                            new_height = int(new_width / aspect_ratio)
                        else:
                            # Height is larger
                            new_height = TARGET_SIZE[1]
                            new_width = int(new_height * aspect_ratio)
                        
                        # Create final image with white background
                        final_crop = Image.new('RGB', TARGET_SIZE, 'white')
                        
                        # Resize exact crop
                        resized_crop = exact_crop.resize((new_width, new_height), Image.Resampling.LANCZOS)
                        
                        # Center the resized crop
                        paste_x = (TARGET_SIZE[0] - new_width) // 2
                        paste_y = (TARGET_SIZE[1] - new_height) // 2
                        final_crop.paste(resized_crop, (paste_x, paste_y))
                        
                        print(f"DEBUG: Final crop dimensions - input: {exact_crop.size}, resized: {resized_crop.size}, output: {final_crop.size}")
                        
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
                        
                        # Use the exact YOLO coordinates for bbox
                        detections.append({
                            'label': label,
                            'confidence': conf,
                            'bbox': {
                                'x': x,  # Original YOLO x (center)
                                'y': y,  # Original YOLO y (center)
                                'width': w,  # Original YOLO width
                                'height': h  # Original YOLO height
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