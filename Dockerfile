# ==============================================================================
# SHACHINA MULTI-STAGE PRODUCTION DOCKERFILE
# Stage 1: Build Optimized React/Tailwind Frontend
# Stage 2: Fast, Secure Python 3.12 Backend Server
# ==============================================================================

# --- Stage 1: Frontend Build ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit || npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production Backend & Static Serving ---
FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    ENVIRONMENT=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Backend and Quant Engine
COPY backend/ backend/
COPY shachina_quant/ shachina_quant/

# Copy Pre-built Frontend SPA
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

EXPOSE 8000

# Run uvicorn using dynamic $PORT (default 8000)
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
