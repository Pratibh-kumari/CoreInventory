from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from app.api import auth, assets, batches, gps, armoury, audit, maintenance, health, alerts
from app.core.scheduler import start_scheduler, stop_scheduler

security = HTTPBearer()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize scheduler
    print("Starting ArmorTrack Backend...")
    scheduler = start_scheduler()
    yield
    # Shutdown: Clean up
    print("Shutting down ArmorTrack Backend...")
    stop_scheduler()

app = FastAPI(
    title="ArmorTrack API",
    description="Defence-Grade Equipment Accountability System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(assets.router, prefix="/api/assets", tags=["Assets"])
app.include_router(batches.router, prefix="/api/batches", tags=["Batches"])
app.include_router(gps.router, prefix="/api/gps", tags=["GPS Tracking"])
app.include_router(armoury.router, prefix="/api/armoury", tags=["Armoury"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])
app.include_router(maintenance.router, prefix="/api/maintenance", tags=["Maintenance"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(health.router, prefix="/api", tags=["Health"])

@app.get("/")
async def root():
    return {
        "name": "ArmorTrack API",
        "version": "1.0.0",
        "status": "running",
        "message": "Defence-Grade Equipment Accountability System"
    }
