// ✅ Use onnxruntime-web for full cross-platform compatibility (Render, Docker, local)
const ort = require("onnxruntime-web");
const sharp = require("sharp");
const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");

const MODEL_PATH = process.env.MODEL_PATH || path.join(__dirname, "../models/best.onnx");
const CLASS_NAMES = [
  "Fresh_Apple", "Fresh_Banana", "Fresh_Beef", "Fresh_Carrot", "Fresh_Chicken",
  "Fresh_Cucumber", "Fresh_Manggo", "Fresh_Okra", "Fresh_Orange", "Fresh_Pepper",
  "Fresh_Pork", "Fresh_Potato", "Fresh_Strawberry",
  "Rotten_Apple", "Rotten_Banana", "Rotten_Beef", "Rotten_Carrot", "Rotten_Chicken",
  "Rotten_Cucumber", "Rotten_Manggo", "Rotten_Okra", "Rotten_Orange", "Rotten_Pepper",
  "Rotten_Pork", "Rotten_Potato", "Rotten_Strawberry"
];

let session = null;

// ✅ Load ONNX model with WASM backend
async function loadModel() {
  if (!session) {
    console.log(`📦 Loading YOLO model (WASM) from: ${MODEL_PATH}`);

    // ✅ Required for WASM backend to locate runtime files
    ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/";

    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["wasm"],
    });

    console.log("✅ YOLO model loaded successfully with WASM backend!");
  }
  return session;
}

// ✅ Preprocess image → tensor
async function preprocessImage(imagePath) {
  console.log(`🖼️ Preprocessing image: ${imagePath}`);

  try {
    const image = sharp(imagePath).resize(640, 640).toColorspace("srgb");
    const buffer = await image.raw().toBuffer({ resolveWithObject: true });
    const { data, info } = buffer;
    const floatArray = new Float32Array(info.width * info.height * 3);

    // Normalize pixel values [0–1]
    for (let i = 0; i < data.length; i++) {
      floatArray[i] = data[i] / 255.0;
    }

    return new ort.Tensor("float32", floatArray, [1, 3, info.height, info.width]);
  } catch (err) {
    console.warn("❌ sharp processing failed, fallback to Jimp:", err.message);

    const img = await Jimp.read(imagePath);
    img.resize(640, 640);
    const data = new Float32Array(3 * 640 * 640);
    let idx = 0;

    for (let y = 0; y < 640; y++) {
      for (let x = 0; x < 640; x++) {
        const { r, g, b } = Jimp.intToRGBA(img.getPixelColor(x, y));
        data[idx++] = r / 255.0;
        data[idx++] = g / 255.0;
        data[idx++] = b / 255.0;
      }
    }

    return new ort.Tensor("float32", data, [1, 3, 640, 640]);
  }
}

// ✅ Postprocess YOLO output
function postprocess(outputData, threshold = 0.25) {
  const numDetections = outputData.length / (5 + CLASS_NAMES.length);
  const detections = [];

  for (let i = 0; i < numDetections; i++) {
    const offset = i * (5 + CLASS_NAMES.length);
    const x = outputData[offset];
    const y = outputData[offset + 1];
    const w = outputData[offset + 2];
    const h = outputData[offset + 3];
    const objectness = outputData[offset + 4];

    let bestScore = 0;
    let bestClass = -1;

    for (let j = 5; j < 5 + CLASS_NAMES.length; j++) {
      if (outputData[offset + j] > bestScore) {
        bestScore = outputData[offset + j];
        bestClass = j - 5;
      }
    }

    const score = objectness * bestScore;
    if (score > threshold) {
      detections.push({
        className: CLASS_NAMES[bestClass] || "Unknown",
        confidence: score.toFixed(2),
        bbox: [x, y, w, h],
      });
    }
  }

  return detections;
}

// ✅ Main detection function
async function processImage(filePath) {
  const start = Date.now();
  try {
    const model = await loadModel();
    const tensor = await preprocessImage(filePath);
    const feeds = { images: tensor };
    const results = await model.run(feeds);

    const output = results[Object.keys(results)[0]];
    const detections = postprocess(output.data);

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ Detection complete: ${detections.length} objects found in ${duration}s`);

    return detections;
  } catch (err) {
    console.error("❌ Detection error:", err);
    throw err;
  }
}

module.exports = { processImage };
