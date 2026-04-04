from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum


# Enums
class UserRole(str, Enum):
    MANUFACTURER = "MANUFACTURER"
    TRANSPORTER = "TRANSPORTER"
    WAREHOUSE = "WAREHOUSE"
    ADMIN = "ADMIN"
    AUDITOR = "AUDITOR"


class AssetStatus(str, Enum):
    REGISTERED = "REGISTERED"
    WAREHOUSE = "WAREHOUSE"
    WAREHOUSE_RECEIVED = "WAREHOUSE_RECEIVED"
    IN_TRANSIT = "IN_TRANSIT"
    DEPLOYED = "DEPLOYED"
    MAINTENANCE = "MAINTENANCE"
    CHECKED_OUT = "CHECKED_OUT"


class BatchStatus(str, Enum):
    PENDING = "PENDING"
    PENDING_PICKUP = "PENDING_PICKUP"
    ACCEPTED = "ACCEPTED"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


class EventType(str, Enum):
    REGISTERED = "REGISTERED"
    DISPATCHED = "DISPATCHED"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    CHECKED_OUT = "CHECKED_OUT"
    RETURNED = "RETURNED"
    MAINTAINED = "MAINTAINED"
    CUSTODY_TRANSFER = "CUSTODY_TRANSFER"


class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    ALERT = "ALERT"
    CRITICAL = "CRITICAL"


# Auth Models
class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_fingerprint: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    role: UserRole


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole
    rfid_tag: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    rfid_tag: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


# Asset Models
class AssetCreate(BaseModel):
    asset_name: str
    asset_type: str
    metadata: Optional[dict] = None


class AssetResponse(BaseModel):
    id: str
    asset_code: Optional[str] = None
    asset_name: str
    asset_type: str
    status: AssetStatus
    current_custodian: Optional[str] = None
    location_name: Optional[str] = None
    last_serviced_at: Optional[datetime] = None
    service_interval_days: int = 90
    created_at: datetime
    
    class Config:
        from_attributes = True


class AssetUpdate(BaseModel):
    asset_name: Optional[str] = None
    asset_type: Optional[str] = None
    status: Optional[AssetStatus] = None
    current_custodian: Optional[str] = None


class QRSignResponse(BaseModel):
    asset_id: str
    signature: str
    qr_payload: str


class QRVerifyRequest(BaseModel):
    asset_id: str
    signature: str


# Batch Models
class BatchCreate(BaseModel):
    transporter_id: str
    destination: str
    asset_ids: List[str]
    expected_delivery: datetime


class BatchResponse(BaseModel):
    id: str
    batch_code: Optional[str] = None
    transporter_id: Optional[str] = None
    destination: str
    status: BatchStatus
    expected_delivery: datetime
    created_at: datetime
    assets: List[dict] = []
    driver_name: Optional[str] = None
    qr_generated: bool = False
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


class RequestDeliveryRequest(BaseModel):
    notes: Optional[str] = None


class AcceptDeliveryRequest(BaseModel):
    driver_name: str


class BatchScanRequest(BaseModel):
    asset_id: Optional[str] = None
    asset_code: Optional[str] = None

    def get_asset_ref(self) -> str:
        value = self.asset_code if self.asset_code else self.asset_id
        if not value:
            raise ValueError("Missing asset_code/asset_id")
        return value


class BatchDeliverRequest(BaseModel):
    scanned_asset_ids: List[str]
    scanned_asset_codes: Optional[List[str]] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    def get_latitude(self) -> float:
        value = self.latitude if self.latitude is not None else self.lat
        if value is None:
            raise ValueError("Missing latitude/lat")
        return value

    def get_longitude(self) -> float:
        value = self.longitude if self.longitude is not None else self.lng
        if value is None:
            raise ValueError("Missing longitude/lng")
        return value

    def get_scanned_asset_refs(self) -> List[str]:
        if self.scanned_asset_codes:
            return self.scanned_asset_codes
        return self.scanned_asset_ids


# GPS Models
class GPSUpdateRequest(BaseModel):
    batch_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    timestamp: datetime

    def get_latitude(self) -> float:
        value = self.latitude if self.latitude is not None else self.lat
        if value is None:
            raise ValueError("Missing latitude/lat")
        return value

    def get_longitude(self) -> float:
        value = self.longitude if self.longitude is not None else self.lng
        if value is None:
            raise ValueError("Missing longitude/lng")
        return value


class GPSResponse(BaseModel):
    batch_id: str
    latitude: float
    longitude: float
    timestamp: datetime


# Armoury Models
class CheckoutRequest(BaseModel):
    asset_id: Optional[str] = None
    asset_code: Optional[str] = None
    personnel_id: str

    def get_asset_ref(self) -> str:
        value = self.asset_code if self.asset_code else self.asset_id
        if not value:
            raise ValueError("Missing asset_code/asset_id")
        return value


class ReturnRequest(BaseModel):
    asset_id: Optional[str] = None
    asset_code: Optional[str] = None
    personnel_id: str

    def get_asset_ref(self) -> str:
        value = self.asset_code if self.asset_code else self.asset_id
        if not value:
            raise ValueError("Missing asset_code/asset_id")
        return value


class GateAccessRequest(BaseModel):
    asset_id: Optional[str] = None
    asset_code: Optional[str] = None
    personnel_id: str

    def get_asset_ref(self) -> str:
        value = self.asset_code if self.asset_code else self.asset_id
        if not value:
            raise ValueError("Missing asset_code/asset_id")
        return value


# Audit Models
class AuditLogResponse(BaseModel):
    id: int
    event_id: str
    event_data: dict
    entry_hash: str
    prev_hash: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditVerifyResponse(BaseModel):
    status: str  # "OK" or "TAMPERED"
    total_entries: int
    tampered_entries: List[int] = []
    message: str


# Maintenance Models
class MaintenanceCompleteRequest(BaseModel):
    asset_id: Optional[str] = None
    asset_code: Optional[str] = None
    technician_id: Optional[str] = None
    notes: Optional[str] = None

    def get_asset_ref(self) -> str:
        value = self.asset_code if self.asset_code else self.asset_id
        if not value:
            raise ValueError("Missing asset_code/asset_id")
        return value


class MaintenanceDueResponse(BaseModel):
    id: str
    asset_name: str
    asset_type: str
    last_serviced_at: Optional[datetime]
    service_interval_days: int
    days_until_due: int
    status: str  # "OVERDUE", "DUE_SOON", "OK"


# Alert Models
class AlertResponse(BaseModel):
    id: str
    type: str
    severity: AlertSeverity
    message: str
    batch_id: Optional[str] = None
    asset_id: Optional[str] = None
    timestamp: datetime
    dismissed: bool = False
    
    class Config:
        from_attributes = True


# Health Check
class HealthResponse(BaseModel):
    backend: bool
    sql1: bool
    sql2: bool
    timestamp: datetime
