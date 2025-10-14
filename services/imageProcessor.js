const fs = require("fs");
const path = require("path");
let ort;
let ORT_RUNTIME = 'onnxruntime-web';
try {
  ort = require('onnxruntime-node');
  ORT_RUNTIME = 'onnxruntime-node';
  console.log('⚙️ Using native onnxruntime-node for inference');
} catch (e) {
  try {
    ort = require('onnxruntime-web');
    ORT_RUNTIME = 'onnxruntime-web';
    console.log('⚙️ Using onnxruntime-web for inference');
  } catch (err) {
    console.error('❌ No onnxruntime runtime available. Please install onnxruntime-node or onnxruntime-web');
    throw err;
  }
}
const { getStorageData } = require("../services/storageService");

// Path and constants
const MODEL_PATH = process.env.MODEL_PATH || path.join(__dirname, "../models/best.onnx");
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
    if (!this.model) {
      console.log(`📦 Loading YOLO model from: ${MODEL_PATH}`);
      try {
        const resolved = path.resolve(MODEL_PATH);
        console.log(`🔎 Resolved model path: ${resolved}`);
        const exists = fs.existsSync(resolved);
        console.log(`📁 Model file exists: ${exists}`);
        if (exists) {
          try {
            const stat = fs.statSync(resolved);
            console.log(`📦 Model file size: ${stat.size} bytes`);
          } catch (sErr) {
            console.warn('⚠️ Could not stat model file:', sErr.message);
          }
        }
      } catch (diagErr) {
        console.warn('⚠️ Model path diagnostics failed:', diagErr.message);
      }
      try {
        if (ORT_RUNTIME === 'onnxruntime-node') {
          // onnxruntime-node can accept a path to the model file
          this.model = await ort.InferenceSession.create(MODEL_PATH);
          console.log(`✅ YOLO model loaded successfully (${ORT_RUNTIME}) from path`);
        } else {
          // onnxruntime-web expects an ArrayBuffer
          const arrayBuffer = fs.readFileSync(MODEL_PATH).buffer;
          this.model = await ort.InferenceSession.create(arrayBuffer);
          console.log(`✅ YOLO model loaded successfully (${ORT_RUNTIME}) from buffer`);
        }
      } catch (err) {
        console.error("❌ Failed to load ONNX model:", err && err.stack ? err.stack : err);
        // Provide hints
        if (!fs.existsSync(MODEL_PATH)) {
          console.error('❌ Hint: model file does not exist at the configured path. Check MODEL_PATH env or file placement.');
        } else {
          console.error('❌ Hint: model file exists but failed to load. This could be due to incompatible model format or runtime mismatch.');
        }
        throw err;
      }
    }
  }

  async preprocessImage(imagePath) {
    const jimpModule = await import("jimp");
    const Jimp = jimpModule.default;

    if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

    console.log("🖼️ Preprocessing image:", imagePath);
    const image = await Jimp.read(imagePath);

    const size = 416;
    await image.resize(size, size);

    const input = new Float32Array(3 * size * size);
    let i = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pixel = image.getPixelColor(x, y);
        const rgba = Jimp.intToRGBA(pixel);
        input[i++] = rgba.r / 255;
        input[i++] = rgba.g / 255;
        input[i++] = rgba.b / 255;
      }
    }

    return new ort.Tensor("float32", input, [1, 3, size, size]);
  }

  async detectObjects(imagePath) {
    await this.loadModel();
    const inputTensor = await this.preprocessImage(imagePath);
    let results;

    try {
      results = await this.model.run({ images: inputTensor });
    } catch (err) {
      console.error("❌ Inference failed:", err);
      throw new Error("ONNX inference failed");
    }

    const output = results[Object.keys(results)[0]];
    return this.postprocess(output);
  }

  postprocess(output) {
    const data = output.data;
    const numPredictions = output.dims[1];
    const numAttributes = output.dims[2];
    const detections = [];

    for (let i = 0; i < numPredictions; i++) {
      const offset = i * numAttributes;
      const x = data[offset];
      const y = data[offset + 1];
      const w = data[offset + 2];
      const h = data[offset + 3];
      const conf = data[offset + 4];

      // Build class scores array (bounded by known classes)
      const maxClassEntries = Math.min(numAttributes - 5, CLASS_NAMES.length);
      const classScores = [];
      for (let j = 0; j < maxClassEntries; j++) {
        classScores.push(data[offset + 5 + j]);
      }

      // Helper: sigmoid for objectness, softmax for class probs
      const sigmoid = (x) => 1 / (1 + Math.exp(-x));
      const softmax = (arr) => {
        const max = Math.max(...arr);
        const exps = arr.map((v) => Math.exp(v - max));
        const sum = exps.reduce((s, e) => s + e, 0);
        return exps.map((e) => e / sum);
      };

      // If classScores is empty, skip
      if (classScores.length === 0) continue;

      // Convert raw scores to probabilities
      let classProbs;
      try {
        classProbs = softmax(classScores);
      } catch (e) {
        classProbs = classScores.map((v) => v);
      }

      // Best class index and its probability
      let bestClass = 0;
      let bestClassProb = classProbs[0] || 0;
      for (let k = 1; k < classProbs.length; k++) {
        if (classProbs[k] > bestClassProb) {
          bestClassProb = classProbs[k];
          bestClass = k;
        }
      }

      // Compute final confidence as sigmoid(objectness) * class_probability
      const objectness = Number(conf);
      const objProb = Number.isFinite(objectness) ? sigmoid(objectness) : 0;
      let finalConf = objProb * (bestClassProb || 0);
      // Clamp 0..1
      finalConf = Math.max(0, Math.min(1, finalConf));

      if (finalConf >= CONFIDENCE_THRESHOLD) {
        // Map bestClass to a label, guard against null / out-of-range indexes
        let label;
        if (bestClass === null || bestClass < 0 || bestClass >= CLASS_NAMES.length) {
          label = `Unknown_${bestClass ?? 'na'}`;
        } else {
          label = CLASS_NAMES[bestClass];
        }
        const storageInfo = getStorageData(label);
        if (!storageInfo) console.warn(`⚠️ Missing storage info for ${label}`);

        detections.push({
          x,
          y,
          width: w,
          height: h,
          confidence: finalConf,
          class_id: bestClass,
          label,
          storage_info: storageInfo || {
            storage: "Unknown",
            shelf_life: null,
            tips: "No data available",
            status: "Unknown",
          },
        });
      }
    }

    return this.nonMaxSuppression(detections, NMS_THRESHOLD);
  }

  nonMaxSuppression(boxes, threshold) {
    if (boxes.length === 0) return [];
    boxes.sort((a, b) => b.confidence - a.confidence);
    const selected = [];

    const iou = (a, b) => {
      const xA = Math.max(a.x, b.x);
      const yA = Math.max(a.y, b.y);
      const xB = Math.min(a.x + a.width, b.x + b.width);
      const yB = Math.min(a.y + a.height, b.y + b.height);
      const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
      const boxAArea = a.width * a.height;
      const boxBArea = b.width * b.height;
      return interArea / (boxAArea + boxBArea - interArea);
    };

    while (boxes.length > 0) {
      const current = boxes.shift();
      selected.push(current);
      boxes = boxes.filter((b) => iou(current, b) < threshold);
    }

    return selected;
  }
}

const imageProcessor = new ImageProcessor();

async function processImage(filePath) {
  const detectionDate = new Date().toISOString();
  try {
    const detections = await imageProcessor.detectObjects(filePath);

    // ✅ Add calculated shelf life data
    const enriched = detections.map((det) => {
      const info = det.storage_info;
      if (info && info.shelf_life) {
        const daysElapsed = 0;
        return {
          ...det,
          detection_date: detectionDate,
          remaining_life: info.shelf_life - daysElapsed,
        };
      }
      return det;
    });

    console.log(`✅ Detection complete: ${enriched.length} objects found`);
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

module.exports = { processImage, preloadModel };
