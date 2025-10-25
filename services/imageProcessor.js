const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { getStorageData } = require("../services/storageService");

// Forward inference to a Python service (Ultralytics) by default
const INFERENCE_URL = process.env.INFERENCE_URL || 'http://localhost:8001/infer';

// Use Node.js http(s) module and form-data for multipart
const http = require('http');
const https = require('https');
const FormDataImpl = require('form-data');

// Path and constants
// MODEL_PATH is not used; detection is forwarded to Python service
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.5;
const NMS_THRESHOLD = parseFloat(process.env.NMS_THRESHOLD) || 0.4;

// ✅ Class names (must match YOLO training order)
const CLASS_NAMES = [
  "Fresh_Apple",
  "Fresh_Banana",
  "Fresh_Beef",
  "Fresh_Carrot",
  "Fresh_Chicken",
  "Fresh_Cucumber",
  "Fresh_Manggo",
  "Fresh_Okra",
  "Fresh_Orange",
  "Fresh_Pepper",
  "Fresh_Pork",
  "Fresh_Potato",
  "Fresh_Strawberry",
  "Rotten_Apple",
  "Rotten_Banana",
  "Rotten_Beef",
  "Rotten_Carrot",
  "Rotten_Chicken",
  "Rotten_Cucumber",
  "Rotten_Manggo",
  "Rotten_Okra",
  "Rotten_Orange",
  "Rotten_Pepper",
  "Rotten_Pork",
  "Rotten_Potato",
  "Rotten_Strawberry",
];

class ImageProcessor {
  constructor() {
    this.model = null;
  }

  async loadModel() {
    // Using remote PyTorch inference service — nothing to preload here.
    return;
  }

  // preprocessImage is unused; all preprocessing is handled by Python service

  async detectObjects(imagePath) {
    // Forward image to Python inference service and expect detections in same basic shape
    return new Promise((resolve, reject) => {
      const form = new FormDataImpl();
      const fileStream = fs.createReadStream(imagePath);
      form.append('image', fileStream, { filename: path.basename(imagePath) });

      // Parse the INFERENCE_URL to get hostname and port
      const inferenceUrl = new URL(INFERENCE_URL);
      const isHttps = inferenceUrl.protocol === 'https:';
      const options = {
        hostname: inferenceUrl.hostname,
        port: inferenceUrl.port || (isHttps ? 443 : 8001),
        path: inferenceUrl.pathname,
        method: 'POST',
        headers: form.getHeaders()
      };

      const client = isHttps ? https : http;
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              throw new Error(`Inference service error: ${res.statusCode} ${res.statusMessage} ${data}`);
            }
            const json = JSON.parse(data);
            console.log('📥 Raw inference response:', JSON.stringify(json, null, 2));
            // Expect json.detections as array of {x,y,width,height,confidence,class_id,label}
            // Map to internal postprocess-like detections with storage_info
            const detections = (json.detections || []).map((d) => {
              // Normalize label for storage lookup (e.g., Fresh_Apples -> Fresh_Apple, Rotten_Bananas -> Rotten_Banana)
              let normalizedLabel = d.label;
              if (
                typeof normalizedLabel === 'string' &&
                (normalizedLabel.startsWith('Fresh_') || normalizedLabel.startsWith('Rotten_')) &&
                normalizedLabel.endsWith('s')
              ) {
                normalizedLabel = normalizedLabel.slice(0, -1);
              }
              return {
                x: d.x,
                y: d.y,
                width: d.width,
                height: d.height,
                confidence: d.confidence,
                class_id: d.class_id,
                label: normalizedLabel,
                storage_info: getStorageData(normalizedLabel) || null,
              };
            });
            resolve(detections);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      form.pipe(req);
    });
  }

  // postprocess is unused; all postprocessing is handled by Python service

  // nonMaxSuppression is unused; all NMS is handled by Python service
}

const imageProcessor = new ImageProcessor();

// Diagnostic: get model info
// In the current setup we forward inference to a Python service (Ultralytics .pt).
// This helper returns a safe diagnostic object suitable for the Node server's
// /api/model-info endpoint without attempting to load ONNX runtimes locally.
async function getModelInfo() {
  return {
    loaded: false,
    mode: 'pt-forwarding',
    message: 'Model diagnostics are handled by the Python inference service. Call the inference service /health or /model-info if exposed there.',
  };
}

async function processImage(filePath) {
  const detectionDate = new Date().toISOString();
  console.log(`🔄 Processing image at ${filePath}`);
  try {
    console.log(`🌐 Sending request to inference service at ${INFERENCE_URL}`);
    const detections = await imageProcessor.detectObjects(filePath);

    // ✅ Add calculated shelf life data and use cropped images
    const enriched = detections.map(det => {
      const info = det.storage_info;
      
      // Use the cropped_path from the inference service
      const croppedUrl = det.cropped_path || null;
      
      if (info && info.shelf_life) {
        const daysElapsed = 0;
        return {
          ...det,
          detection_date: detectionDate,
          remaining_life: info.shelf_life - daysElapsed,
          croppedImage: croppedUrl
        };
      }
      return {
        ...det,
        croppedImage: croppedUrl
      };
    });

    console.log(`✅ Detection complete: ${enriched.length} objects found`);
    console.log('🔍 Detection details:', JSON.stringify(enriched, null, 2));
    
    // Log storage info for each detection
    enriched.forEach(det => {
      console.log(`📦 Storage info for ${det.label}:`, JSON.stringify(det.storage_info, null, 2));
    });
    
    return enriched;
  } catch (error) {
    console.error("❌ Error during YOLO detection:", error);
    throw error;
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      console.info(`ℹ️ Uploaded file already deleted or missing: ${filePath}`);
    }
  }
}

async function preloadModel() {
  await imageProcessor.loadModel();
}

module.exports = { processImage, preloadModel, getModelInfo };
