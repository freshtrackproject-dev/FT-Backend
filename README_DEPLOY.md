Model management
- If you only use `models/best.pt`, you can remove `models/best.onnx` to save space. However, keep backups of the `.pt` file before deleting it from the repo if you rely on it for production.
- Large models increase build and push times in Docker; consider downloading a model at container startup from an object store (S3) using a startup script.
Troubleshooting
- Node errors about `INFERENCE_URL` or failed fetch: Ensure the inference service is running and the URL is reachable. In Render the internal hostname is the other service's name (configured in `render.yaml`).
- Python errors about `ultralytics` or missing model: Ensure `requirements.txt` is installed and `models/best.pt` exists in the image or is downloaded during startup.
# FreshTrack Backend — Deployment & Local Run

This README explains how to run the backend locally and how to deploy the two-service setup (Node API + Python Ultralytics inference service) using the provided Dockerfiles and `render.yaml`.

Overview
- The repo runs two services:
  - `freshtrack-backend` (Node.js) — main API which receives image uploads and forwards inference to the Python service.
  - `freshtrack-inference` (Python/FastAPI) — Ultralytics-based inference service that loads `models/best.pt` and answers `/infer` requests.

Prerequisites
- Docker (for building images). For local dev: Node 18+ and Python 3.11+.

Files added / important files
- `tools/inference_service.py` — FastAPI microservice (expects `models/best.pt`).
- `requirements.txt` — Python dependencies for the inference service.
- `Dockerfile.python` — Dockerfile to build the inference service image.
- `Dockerfile` — Node service Dockerfile (already present).
- `render.yaml` — multi-service Render configuration (defines both services and wiring via `INFERENCE_URL`).

Local development (recommended)

1) Start the Python inference service

PowerShell:
```powershell
py -m pip install -r requirements.txt
py -m uvicorn tools.inference_service:app --host 0.0.0.0 --port 8001
```

2) Start the Node server

PowerShell:
```powershell
npm install
node server.js
```

3) Test an image upload

PowerShell (Invoke-RestMethod):
```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/api/detect' -Method Post -Form @{ image = Get-Item '.\test.jpg' }
```

or curl (cross-platform):
```bash
curl -X POST -F "image=@test.jpg" http://localhost:3000/api/detect
```

Render deployment notes
- The repository includes `render.yaml` which configures two services for Render:
  - `freshtrack-backend` uses `Dockerfile` and sets `INFERENCE_URL` to `http://freshtrack-inference:8001/infer` so the Node container forwards inference requests to the inference service on the Render internal network.
  - `freshtrack-inference` uses `Dockerfile.python` and expects `models/best.pt` in `/app/models/best.pt` within the image.

Steps to deploy on Render (high level):
1. Push this repo to GitHub (or connect Render to your repo).
2. In Render, create a new Web Service by importing the repo or enable auto-deploy using `render.yaml`.
3. Ensure both services build successfully. If your model is large, consider storing it in an object store (S3) and downloading at container start, or add it to the repo if acceptable.
4. Verify service health in Render console. Both services expose `/health`:
   - Node: `/health` (port 3000)
   - Inference: `/health` (port 8001)

Environment variables
- Node service (in `render.yaml`) sets:
  - `INFERENCE_URL` -> `http://freshtrack-inference:8001/infer`
  - `STORAGE_PATH` -> `/app/data/storage_data.json`

- Inference service expects `MODEL_PATH` or will use `models/best.pt` inside the image.

Model management
- If you only use `models/best.pt`, you can remove `models/best.onnx` to save space. However, keep backups of the `.pt` file before deleting it from the repo if you rely on it for production.
- Large models increase build and push times in Docker; consider downloading a model at container startup from an object store (S3) using a startup script.

Troubleshooting
- Node errors about `INFERENCE_URL` or failed fetch: Ensure the inference service is running and the URL is reachable. In Render the internal hostname is the other service's name (configured in `render.yaml`).
- Python errors about `ultralytics` or missing model: Ensure `requirements.txt` is installed and `models/best.pt` exists in the image or is downloaded during startup.
- If deployment fails due to image size: offload the model to an external storage and fetch it in `Dockerfile.python` or at container start.

Cleanup / housekeeping
- To reclaim space from local development you can remove `node_modules/` and re-run `npm install` when needed.
- Use `trash/` to back up large files before deletion.

If you want, I can:
- Produce a small `startup` script for the Python Dockerfile that fetches `best.pt` from a URL (S3) at container start.
- Create `.dockerignore` tuned to exclude `node_modules`, local venvs, and other large artifacts.

Contact / next steps
- Let me know if you want the README adjusted (more detail about Render, or to include a sample `docker-compose.yml` for local multi-container testing).
