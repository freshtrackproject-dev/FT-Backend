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
from datetime import datetime
import psutil  # For memory monitoring

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
# Optimized thresholds for multi-class, multi-instance detection
# Lower confidence threshold (0.5) to catch more detections, especially for weaker classes
# Lower IOU threshold (0.45) to allow more overlapping detections of same/different classes
CONF_THRESHOLD = float(os.getenv('CONF_THRESHOLD', '0.5'))
IOU_THRESHOLD = float(os.getenv('IOU_THRESHOLD', '0.45'))
MAX_DET = int(os.getenv('MAX_DET', '100'))

# Class-specific confidence thresholds for all classes
# Optimized based on validation metrics: Precision (P), Recall (R), mAP50, mAP50-95
# Updated based on confusion matrix analysis to reduce misclassifications
# Lower thresholds for classes with lower recall or high background confusion
# Higher thresholds for high-performing classes to reduce false positives
CLASS_SPECIFIC_THRESHOLDS = {
    # Fresh fruits - thresholds based on validation performance and confusion matrix
    'Fresh_Apple': 0.50,      # P=0.999, R=1.0 - excellent, higher threshold to reduce false positives
    'Fresh_Banana': 0.30,     # R=0.828 (lowest recall), 24% background confusion - lower threshold to improve detection
    'Fresh_Orange': 0.40,     # P=0.971, R=0.995, 13% background confusion - lower threshold to catch missed detections
    'Fresh_Strawberry': 0.50, # P=0.989, R=0.994 - excellent, higher threshold
    'Fresh_Manggo': 0.50,     # P=0.993, R=0.996 - excellent, higher threshold
    
    # Fresh vegetables - thresholds based on validation performance and confusion matrix
    'Fresh_Carrot': 0.40,     # R=0.945 - good, keep moderate threshold
    'Fresh_Pepper': 0.35,     # R=0.927 - lower threshold to improve detection
    'Fresh_Cucumber': 0.45,   # R=0.99 - excellent, slightly higher threshold
    'Fresh_Okra': 0.30,       # R=0.88 (low recall), 13% background confusion - lower threshold to improve detection
    'Fresh_Potato': 0.45,     # R=0.981 - excellent, slightly higher threshold
    
    # Fresh meats - high performance, higher thresholds
    'Fresh_Beef': 0.50,       # P=1.0, R=1.0 - perfect, higher threshold
    'Fresh_Chicken': 0.50,    # P=0.965, R=0.988 - excellent, higher threshold
    'Fresh_Pork': 0.50,       # P=0.999, R=0.998 - perfect, higher threshold
    
    # Rotten fruits - thresholds based on validation performance and confusion matrix
    'Rotten_Apple': 0.40,     # P=0.99, R=0.989 - excellent, moderate threshold
    'Rotten_Banana': 0.40,    # P=0.999, R=1.0 - perfect, moderate threshold
    'Rotten_Orange': 0.40,    # P=0.999, R=0.997, 14% background confusion - lower threshold to catch missed detections
    'Rotten_Strawberry': 0.50, # P=0.984, R=0.992 - excellent, higher threshold
    'Rotten_Manggo': 0.45,   # R=0.979 - excellent, slightly higher threshold
    
    # Rotten vegetables - thresholds based on validation performance and confusion matrix
    'Rotten_Carrot': 0.45,    # R=0.977 - excellent, slightly higher threshold
    'Rotten_Pepper': 0.30,    # R=0.95, mAP50-95=0.701 (lowest) - lower threshold for better detection
    'Rotten_Cucumber': 0.45, # R=0.977 - excellent, slightly higher threshold
    'Rotten_Okra': 0.30,     # R=0.891 (low recall), 5% background confusion - lower threshold to improve detection
    'Rotten_Potato': 0.40,   # R=0.886 (low recall) - lower threshold to improve detection
    
    # Rotten meats - high performance, higher thresholds
    'Rotten_Beef': 0.50,     # P=0.999, R=1.0 - perfect, higher threshold
    'Rotten_Chicken': 0.50,  # P=0.993, R=1.0 - perfect, higher threshold
    'Rotten_Pork': 0.50,    # P=0.997, R=1.0 - perfect, higher threshold
}

# Common misclassification pairs from confusion matrix
# Format: (misclassified_as, actual_class): confidence_adjustment_factor
# Negative values reduce confidence, positive values increase confidence
MISCLASSIFICATION_ADJUSTMENTS = {
    # Fresh_Banana often misclassified as Fresh_Apple (12%)
    ('Fresh_Apple', 'Fresh_Banana'): -0.15,  # Reduce confidence if Apple detected where Banana likely
    # Fresh_Okra and Fresh_Orange confusion (1% each way)
    ('Fresh_Orange', 'Fresh_Okra'): -0.10,
    ('Fresh_Okra', 'Fresh_Orange'): -0.10,
    # Rotten_Pepper misclassified as Rotten_Orange (1%)
    ('Rotten_Orange', 'Rotten_Pepper'): -0.10,
    # Rotten_Strawberry misclassified as Rotten_Potato (1%)
    ('Rotten_Potato', 'Rotten_Strawberry'): -0.10,
}

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
    start_time = datetime.now()
    try:
        print(f"\n🚀 [INFER START] Processing request at {start_time.isoformat()}")
        
        # Create crops directory and ensure it exists
        crops_dir = Path('/app/uploads/crops')
        crops_dir.mkdir(parents=True, exist_ok=True)
        print(f"📁 Crops directory ready")
        
        # Save and preprocess uploaded image
        suffix = Path(image.filename).suffix or '.jpg'
        print(f"📥 Receiving image: {image.filename}")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = Path(tmp.name)
            from PIL import Image
            img = Image.open(image.file)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(tmp_path, format='JPEG', quality=95)
            print(f"✅ Image saved to temp file: {tmp_path}")
            
        # Store original image size for later use
        orig_width, orig_height = img.size
        print(f"📐 Image dimensions: {orig_width}x{orig_height}")

        # Run inference
        print(f"🤖 Loading model...")
        model = get_model()
        
        print(f"🔍 Running YOLO inference...")
        inference_start = datetime.now()
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
        
        inference_time = (datetime.now() - inference_start).total_seconds()
        print(f"✅ YOLO inference completed in {inference_time:.2f}s")
        
        # Check memory usage
        try:
            process = psutil.Process()
            mem_info = process.memory_info()
            mem_mb = mem_info.rss / 1024 / 1024
            print(f"💾 Current memory usage: {mem_mb:.1f}MB")
        except:
            pass
        
        if not results:
            print(f"ℹ️ No detections found, returning empty results")
            return JSONResponse({'success': True, 'detections': []})

        r = results[0]
        detections = []
        all_detections_raw = []  # Store all detections before filtering for misclassification analysis
        
        def get_class_threshold(label: str) -> float:
            """Get class-specific confidence threshold or use default."""
            return CLASS_SPECIFIC_THRESHOLDS.get(label, CONF_THRESHOLD)
        
        def apply_misclassification_adjustment(label: str, conf: float, other_detections: list) -> float:
            """Apply confidence adjustments based on common misclassifications."""
            adjusted_conf = conf
            
            # Check for common misclassification patterns
            for (misclassified_as, actual_class), adjustment in MISCLASSIFICATION_ADJUSTMENTS.items():
                if label == misclassified_as:
                    # Check if there are nearby detections of the actual class
                    for other_det in other_detections:
                        if other_det['label'] == actual_class:
                            # If actual class exists nearby, reduce confidence of misclassified class
                            adjusted_conf += adjustment
                            break
            
            return max(0.0, min(1.0, adjusted_conf))
        
        def process_detection_box(box_data, conf, cls_id, orig_width, orig_height, img, crops_dir, detection_idx):
            """Process a single detection box (OBB or regular)."""
            # Extract coordinates based on box format
            if len(box_data) >= 4:
                cx, cy, w, h = box_data[:4]  # center-x, center-y, width, height
            else:
                return None
            
            # Get class label
            label = model.names.get(cls_id, f'class_{cls_id}')
            
            # Filter out background class (causes significant confusion)
            if label.lower() == 'background':
                return None
            
            # Apply class-specific threshold
            class_threshold = get_class_threshold(label)
            if conf < class_threshold:
                return None
            
            # Normalize coordinates if they're in pixel coordinates
            if cx > 1 or cy > 1 or w > 1 or h > 1:
                try:
                    cx = cx / orig_width
                    w = w / orig_width
                    cy = cy / orig_height
                    h = h / orig_height
                except Exception as e:
                    print(f"DEBUG: Error normalizing pixel coords: {e}")
                    return None

            # Ensure values are in [0,1]
            cx = float(max(0.0, min(1.0, cx)))
            cy = float(max(0.0, min(1.0, cy)))
            w = float(max(0.0, min(1.0, w)))
            h = float(max(0.0, min(1.0, h)))
            
            # Skip invalid boxes
            if w <= 0 or h <= 0:
                return None

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
            
            # Ensure valid crop dimensions
            if x2_pixel <= x_pixel or y2_pixel <= y_pixel:
                return None
            
            # Crop the exact bounding box
            exact_crop = img.crop((x_pixel, y_pixel, x2_pixel, y2_pixel))
            
            # Resize to a standard size
            TARGET_SIZE = (224, 224)
            resized_crop = exact_crop.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
            
            crop_filename = f"{label}_{detection_idx}_{conf:.3f}.jpg"
            crop_path = crops_dir / crop_filename
            try:
                resized_crop.save(crop_path, format='JPEG', quality=95)
            except Exception as e:
                print(f"DEBUG: Error saving crop: {str(e)}")
                return None
            
            return {
                'label': label,
                'confidence': conf,
                'bbox': {
                    'x': cx - w/2,  # Convert to top-left for frontend
                    'y': cy - h/2,  # Convert to top-left for frontend
                    'width': w,
                    'height': h
                },
                'cropped_path': f"/uploads/crops/{crop_filename}",
                'class_id': cls_id
            }

        # Process OBB detections
        if hasattr(r, 'obb') and r.obb is not None:
            obb = r.obb.cpu()
            if hasattr(obb, 'data'):
                box_data = obb.data.numpy()
                if len(box_data) > 0:
                    for i in range(len(box_data)):
                        conf = float(box_data[i][5])    # confidence score
                        cls_id = int(box_data[i][6])    # class ID
                        box_coords = box_data[i][:4]    # box coordinates
                        
                        detection = process_detection_box(
                            box_coords, conf, cls_id, orig_width, orig_height, 
                            img, crops_dir, i
                        )
                        if detection:
                            all_detections_raw.append(detection)
        
        # Process regular bounding box detections (if OBB not available)
        elif hasattr(r, 'boxes') and r.boxes is not None:
            boxes = r.boxes.cpu()
            if hasattr(boxes, 'data'):
                box_data = boxes.data.numpy()
                if len(box_data) > 0:
                    for i in range(len(box_data)):
                        # YOLO boxes format: x1, y1, x2, y2, conf, cls
                        x1, y1, x2, y2 = box_data[i][:4]
                        conf = float(box_data[i][4])
                        cls_id = int(box_data[i][5])
                        
                        # Convert to center format for processing
                        cx = (x1 + x2) / 2.0
                        cy = (y1 + y2) / 2.0
                        w = x2 - x1
                        h = y2 - y1
                        
                        detection = process_detection_box(
                            [cx, cy, w, h], conf, cls_id, orig_width, orig_height,
                            img, crops_dir, i
                        )
                        if detection:
                            all_detections_raw.append(detection)
        
        # Apply misclassification adjustments to all detections
        for detection in all_detections_raw:
            adjusted_conf = apply_misclassification_adjustment(
                detection['label'], 
                detection['confidence'], 
                all_detections_raw
            )
            # Re-check threshold after adjustment
            class_threshold = get_class_threshold(detection['label'])
            if adjusted_conf >= class_threshold:
                detection['confidence'] = adjusted_conf
                detections.append(detection)
        
        # Sort detections by confidence (highest first) for better quality
        detections.sort(key=lambda x: x['confidence'], reverse=True)
        
        # Limit to MAX_DET (already handled by YOLO, but ensure we don't exceed)
        detections = detections[:MAX_DET]
        
        # Calculate detection statistics
        class_counts = {}
        for det in detections:
            label = det['label']
            class_counts[label] = class_counts.get(label, 0) + 1
        
        stats = {
            'total_detections': len(detections),
            'unique_classes': len(class_counts),
            'class_distribution': class_counts,
            'avg_confidence': sum(d['confidence'] for d in detections) / len(detections) if detections else 0.0
        }
        
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"✅ [INFER SUCCESS] Completed in {elapsed:.2f}s with {stats['total_detections']} detections")
        print(f"📊 Detection stats: {stats['total_detections']} total, {stats['unique_classes']} classes, avg conf: {stats['avg_confidence']:.3f}")
        print(f"📊 Class distribution: {class_counts}")

        return JSONResponse({
            'success': True, 
            'detections': detections,
            'stats': stats
        })
    
    except Exception as e:
        elapsed = (datetime.now() - start_time).total_seconds()
        error_msg = str(e)
        print(f"\n❌ [INFER ERROR] Request failed after {elapsed:.2f}s")
        print(f"   Error: {error_msg}")
        print(f"   Type: {type(e).__name__}")
        
        # Try to log memory at time of error
        try:
            process = psutil.Process()
            mem_info = process.memory_info()
            mem_mb = mem_info.rss / 1024 / 1024
            print(f"   Memory: {mem_mb:.1f}MB")
        except:
            pass
        
        raise HTTPException(status_code=500, detail=f"Inference error: {error_msg}")
    
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
