# ---- Base Node image ----
FROM node:18-slim

# Install system dependencies for ONNXRuntime
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    libglib2.0-0 \
    libpng-dev \
    libjpeg-dev \
    libopencv-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency files first (better caching)
COPY package*.json ./

# Install dependencies (Render automatically sets NODE_ENV=production)
RUN npm ci --omit=dev

# Copy only the necessary project files (based on .dockerignore)
COPY . .

# Ensure uploads and data folders exist (avoids runtime errors)
RUN mkdir -p uploads data

# Expose your backend port
EXPOSE 8080

# Use environment variable if available
ENV PORT=8080

# Start the app
CMD ["node", "server.js"]
