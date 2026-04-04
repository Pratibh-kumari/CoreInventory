from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # Supabase Configuration
    SUPABASE_URL_SQL1: str
    SUPABASE_KEY_SQL1: str
    SUPABASE_URL_SQL2: str
    SUPABASE_KEY_SQL2: str
    
    # JWT Configuration
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    
    # AES Encryption
    AES_KEY: str

    # Factory RSA keys for QR signing (optional in development)
    FACTORY_PRIVATE_KEY_PEM: Optional[str] = None
    FACTORY_PUBLIC_KEY_PEM: Optional[str] = None
    
    # Backend Configuration
    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"
    
    # Geofence Settings
    GEOFENCE_RADIUS_METERS: float = 5000.0
    MAX_STOP_DURATION_MINUTES: int = 10
    GPS_SIGNAL_LOSS_MINUTES: int = 5
    DELIVERY_RADIUS_METERS: float = 100.0
    
    # Maintenance
    MAINTENANCE_WARNING_DAYS: int = 7
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
