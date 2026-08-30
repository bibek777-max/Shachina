"""
SHACHINA: Ultimate AI Personal Assistant & Global Trading Intelligence Platform
FastAPI Backend Application Entrypoint.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.app.core.config import settings
from backend.app.db.database import engine, Base, AsyncSessionLocal
from backend.app.api.auth import router as auth_router, seed_bibek_user
from backend.app.api.markets import router as markets_router
from backend.app.api.user_data import router as user_data_router
from backend.app.api.assistant import router as assistant_router
from backend.app.api.websocket import router as ws_router
from shachina_quant.data.factory import MarketDataProviderRegistry


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB tables and seed Bibek user
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSessionLocal() as session:
        await seed_bibek_user(session)
    
    # Initialize Quant Provider Registry
    MarketDataProviderRegistry.initialize()
    print("🚀 [SHACHINA QUANT ENGINE] Initialized successfully. Primary Market: NEPSE (Asia/Kathmandu).")
    
    yield
    
    # Shutdown
    await engine.dispose()
    print("🛑 [SHACHINA QUANT ENGINE] Shutdown completed.")


app = FastAPI(
    title=settings.PROJECT_TITLE,
    version="1.0.0",
    description="Production-grade trading intelligence, quantitative analysis, and AI assistant platform for Bibek.",
    lifespan=lifespan,
)

# Enable CORS for Next.js/React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(markets_router, prefix=settings.API_V1_PREFIX)
app.include_router(user_data_router, prefix=settings.API_V1_PREFIX)
app.include_router(assistant_router, prefix=settings.API_V1_PREFIX)
app.include_router(ws_router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "platform": "SHACHINA",
        "owner": settings.OWNER_NAME,
        "engine": "active",
        "primary_market": settings.PRIMARY_MARKET,
        "default_timezone": settings.DEFAULT_TIMEZONE,
        "default_currency": settings.DEFAULT_CURRENCY,
        "zero_fabrication_policy": "ENFORCED",
    }


# Mount Static Frontend Build if present
dist_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.exists(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_target = os.path.join(dist_path, full_path)
        if full_path and os.path.exists(file_target) and os.path.isfile(file_target):
            return FileResponse(file_target)
        return FileResponse(os.path.join(dist_path, "index.html"))
