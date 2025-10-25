const express = require('express');
const app = express();

// /api/health endpoint for Docker Compose and frontend health checks
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'node-backend', time: new Date().toISOString() });
});

// Add HEAD support to health endpoint
app.head('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'node-backend', time: new Date().toISOString() });
});

// Add root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'FreshTrack Backend API' });
});

const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { processImage, preloadModel } = require('./services/imageProcessor');
const { getStorageData } = require('./services/storageService');
const { getModelInfo } = require('./services/imageProcessor');



// 🧩 Load environment variables with fallbacks
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const LOG_FORMAT = process.env.LOG_FORMAT || 'dev';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// ==============================
// 🌐 Middleware
// ==============================
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: process.env.MAX_UPLOAD_SIZE || '10mb' }));
app.use(morgan(LOG_FORMAT));

// Serve uploaded files and crops
app.use('/uploads', (req, res, next) => {
  const filePath = path.join(__dirname, 'uploads', req.url);
  console.log('📸 Request for:', req.url);
  console.log('📸 Full path:', filePath);
  console.log('📸 File exists:', fs.existsSync(filePath));
  
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  if (!fs.existsSync(filePath)) {
    console.log('❌ File not found:', filePath);
    return res.status(404).send('File not found');
  }

  next();
}, express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path, stat) => {
    res.set('Cache-Control', 'no-cache');
    res.set('Content-Type', 'image/jpeg');
  }
}));

// Proxy route for crop images from inference service
const { INFERENCE_BASE_URL } = require('./services/imageProcessor');
const http = require('http');
const https = require('https');

app.get('/crops/*', async (req, res) => {
  try {
    const cropPath = req.path.replace('/crops/', '');
    const fullUrl = `${INFERENCE_BASE_URL}/app/uploads/crops/${cropPath}`;
    
    console.log('🔄 Proxying crop image request to:', fullUrl);
    
    // Determine which protocol to use based on the URL
    const protocol = fullUrl.startsWith('https') ? https : http;
    
    protocol.get(fullUrl, (response) => {
      // Forward the content-type header
      res.setHeader('Content-Type', response.headers['content-type']);
      
      // If the image isn't found on the inference server, return 404
      if (response.statusCode === 404) {
        console.log('❌ Crop image not found on inference server:', fullUrl);
        return res.status(404).send('Crop image not found');
      }
      
      console.log('✅ Successfully proxying crop image:', fullUrl);
      // Stream the response directly to the client
      response.pipe(res);
    }).on('error', (err) => {
      console.error('❌ Error proxying crop image:', err);
      res.status(500).send('Error retrieving crop image');
    });
  } catch (error) {
    console.error('❌ Error in crop proxy route:', error);
    res.status(500).send('Server error');
  }
});

// Debug endpoint to check file existence
app.get('/debug/file-exists', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'No file path provided' });
  }
  const fullPath = path.join(__dirname, filePath);
  const exists = fs.existsSync(fullPath);
  console.log(`🔍 Checking file existence: ${fullPath} - ${exists ? 'EXISTS' : 'NOT FOUND'}`);
  if (exists) {
    const stats = fs.statSync(fullPath);
    res.json({
      exists: true,
      path: fullPath,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    });
  } else {
    res.json({ exists: false, path: fullPath });
  }
});

// Additional route to check if files exist
app.get('/check-file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'No file path provided' });
  }
  const fullPath = path.join('/app/uploads', filePath);
  const exists = fs.existsSync(fullPath);
  res.json({
    exists,
    path: fullPath,
    stats: exists ? fs.statSync(fullPath) : null
  });
});

// Increase timeout for long-running requests
app.use((req, res, next) => {
  // Set timeout to 2 minutes
  req.setTimeout(120000);
  res.setTimeout(120000);
  next();
});

// ==============================
// 📁 Uploads folder setup
// ==============================
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ==============================
// 📸 Multer setup
// ==============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// ==============================
// 💓 Health & Root routes
// ==============================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.send('🚀 FreshTrack Backend is running!');
});

// ==============================
// 🧠 Detection route
// ==============================
app.post('/api/detect', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('⚠️ No image uploaded.');
      return res.status(400).json({ success: false, message: 'No image uploaded.' });
    }

    const imagePath = path.join(UPLOAD_DIR, req.file.filename);
    console.log(`🖼️ Preprocessing image: ${imagePath}`);
    console.log('📝 Request headers:', req.headers);
    console.log('📁 File info:', req.file);

    // Run model detection
    const start = Date.now();
    const detections = await processImage(imagePath);
    const processing_time_ms = Date.now() - start;

    // Attach storage info and normalize detections into the frontend shape
    for (const detection of detections) {
      detection.storage = getStorageData(detection.label);
    }

  const normalizedDetections = detections.map((det) => {
      // Most YOLO outputs are center-x, center-y, width, height (normalized)
      // Get the bounding box coordinates from the detection
      const x = Number(det.x) || 0;
      const y = Number(det.y) || 0;
      const width = Number(det.width) || 0;
      const height = Number(det.height) || 0;

      // Ensure values are within valid range [0,1]
      const normalizedX = Math.max(0, Math.min(1, x));
      const normalizedY = Math.max(0, Math.min(1, y));
      const normalizedWidth = Math.max(0, Math.min(1, width));
      const normalizedHeight = Math.max(0, Math.min(1, height));

      const defaultStorage = {
        storage: det.storage?.storage || det.storage_info?.storage || 'Unknown',
        shelf_life: det.storage?.shelf_life ?? det.storage_info?.shelf_life ?? null,
        tips: det.storage?.tips || det.storage_info?.tips || 'No data available',
        signs_of_spoilage: det.storage?.signs_of_spoilage || det.storage_info?.signs_of_spoilage || 'No data available',
        status: det.storage?.status || det.storage_info?.status || 'Unknown',
        waste_disposal: det.storage?.waste_disposal ?? det.storage_info?.waste_disposal ?? null,
      };

      return {
        label: det.label,
        confidence: Number(det.confidence) || 0,
        bbox: { 
          x: normalizedX, 
          y: normalizedY, 
          width: normalizedWidth, 
          height: normalizedHeight 
        },
        storage: defaultStorage,
        croppedImage: det.croppedImage,
      };
    });

    const response = {
      success: true,
      detections: normalizedDetections,
      processing_time_ms,
      timestamp: new Date().toISOString(),
      imageUrl: `/uploads/${req.file.filename}`
    };
    
    console.log('✨ Normalized detections:', JSON.stringify(normalizedDetections, null, 2));
    console.log(`⏱️ Processing time: ${processing_time_ms}ms`);
    console.log('📤 Sending response:', JSON.stringify(response, null, 2));
    
    res.status(200).json(response);
    // Note: processImage already attempts to delete the uploaded file. No further cleanup here.
  } catch (error) {
    console.error('❌ Detection error:', error);
    res.status(500).json({ success: false, message: 'Error processing image', error: error.message });
  }
});

// ==============================
// 🗂️ Storage routes
// ==============================
app.get('/api/storage/:itemName', (req, res) => {
  const { itemName } = req.params;
  const data = getStorageData(itemName);
  if (!data) return res.status(404).json({ success: false, message: 'Item not found' });
  res.json({ success: true, storage: data });
});

app.get('/api/storage', (req, res) => {
  try {
    const data = getStorageData();
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error fetching storage data:', error);
    res.status(500).json({ success: false, message: 'Error fetching storage data' });
  }
});

// ==============================
// 🔍 Model info (diagnostic)
// ==============================
app.get('/api/model-info', async (req, res) => {
  try {
    const info = await getModelInfo();
    res.json({ success: true, info });
  } catch (err) {
    console.error('❌ Model info error:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ==============================
// 🕓 Daily upload cleanup
// ==============================
setInterval(() => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return console.error('Error reading uploads directory:', err);
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    files.forEach((file) => {
      const filePath = path.join(UPLOAD_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && now - stats.mtimeMs > DAY_MS) {
          fs.unlink(filePath, () => console.log(`🧽 Deleted old upload: ${file}`));
        }
      });
    });
  });
}, 24 * 60 * 60 * 1000);

// ==============================
// 🚀 Start server
// ==============================
// Preload model and then start server
(async () => {
  try {
    await preloadModel();
  } catch (err) {
    console.warn('⚠️ Model preload failed, continuing to start server:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  });
})();
