# ---- Base lightweight Node image ----
FROM node:18-bullseye-slim

# No need for build-essential, Python, or libopencv — WASM runs in pure JS
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libpng-dev \
    libjpeg-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency files first (for caching)
COPY package*.json ./

# Install dependencies (Render sets NODE_ENV=production automatically)
RUN npm ci --omit=dev

# Copy source files
COPY . .

# Ensure uploads and data folders exist with proper permissions
RUN mkdir -p uploads/crops data && \
    chmod -R 777 uploads && \
    chmod -R 777 data

# ✅ Optimize for WebAssembly
ENV NODE_OPTIONS="--no-experimental-fetch"
ENV PORT=10000
ENV ORT_WEB_WASM_PATH="https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/"

# Expose backend port
EXPOSE 10000

# Start the app
CMD ["node", "server.js"]
