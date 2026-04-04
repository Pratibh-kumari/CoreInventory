from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from app.models.schemas import AssetCreate, AssetResponse, AssetUpdate, AssetStatus, QRSignResponse, QRVerifyRequest, UserRole
from app.core.database import sql1_db
from app.core.dependencies import get_current_user, require_role
from app.core.qr_signing import sign_asset_id, verify_asset_signature, build_qr_payload
from app.core.asset_crypto import encrypt_payload
from datetime import datetime

router = APIRouter()


import re
_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)


def _resolve_asset_row(asset_ref: str):
    """Resolve asset by asset_code first, then by UUID id."""
    response = sql1_db.get_client().table("assets").select("*") \
        .eq("asset_code", asset_ref).limit(1).execute()
    if response.data:
        return response.data[0]
    if _UUID_RE.match(asset_ref):
        response = sql1_db.get_client().table("assets").select("*") \
            .eq("id", asset_ref).limit(1).execute()
        return response.data[0] if response.data else None
    return None


def _to_asset_response(asset: dict) -> AssetResponse:
    """Normalize DB rows to AssetResponse while tolerating missing columns."""
    raw_status = asset.get("status", "REGISTERED")
    if raw_status not in {"REGISTERED", "WAREHOUSE", "WAREHOUSE_RECEIVED", "IN_TRANSIT", "DEPLOYED", "MAINTENANCE", "CHECKED_OUT"}:
        raw_status = "WAREHOUSE"

    return AssetResponse(
        id=asset.get("asset_code") or asset.get("id", "unknown"),
        asset_code=asset.get("asset_code"),
        asset_name=asset.get("asset_name", "Unnamed Asset"),
        asset_type=asset.get("asset_type", "Unknown"),
        status=AssetStatus(raw_status),
        current_custodian=asset.get("current_custodian_id", asset.get("current_custodian")),
        location_name=asset.get("location_name"),
        last_serviced_at=asset.get("last_serviced_at"),
        service_interval_days=asset.get("service_interval_days", 90),
        created_at=asset.get("created_at") or datetime.utcnow().isoformat(),
    )


@router.post("/register", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def register_asset(
    asset_data: AssetCreate,
    current_user: dict = Depends(require_role([UserRole.MANUFACTURER, UserRole.ADMIN]))
):
    """Register a new asset (MANUFACTURER or ADMIN only)"""
    try:
        # Generate unique asset ID
        import uuid
        asset_id = str(uuid.uuid4())
        asset_code = f"AST-{asset_id.split('-')[0].upper()}"
        
        # Insert asset into SQL_1
        insert_data = {
            "id": asset_id,
            "asset_code": asset_code,
            "asset_name": asset_data.asset_name,
            "asset_type": asset_data.asset_type,
            "encrypted_payload": encrypt_payload(asset_data.metadata),
            "status": "REGISTERED",
            "last_serviced_at": None,
            "service_interval_days": 90,
            "created_by": current_user["user_id"],
        }

        try:
            response = sql1_db.get_client().table("assets").insert(insert_data).execute()
        except Exception:
            legacy_insert = {
                "id": asset_id,
                "asset_name": asset_data.asset_name,
                "asset_type": asset_data.asset_type,
                "encrypted_payload": encrypt_payload(asset_data.metadata),
                "status": "WAREHOUSE",
                "last_serviced_at": None,
                "service_interval_days": 90,
            }
            response = sql1_db.get_client().table("assets").insert(legacy_insert).execute()
        
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register asset"
            )
        
        asset = response.data[0]
        
        # Log event
        await log_asset_event(asset_id, "REGISTERED", current_user["user_id"])
        
        return _to_asset_response(asset)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Asset registration failed: {str(e)}"
        )


@router.get("/{asset_ref}", response_model=AssetResponse)
async def get_asset(
    asset_ref: str,
    current_user: dict = Depends(get_current_user)
):
    """Get asset details by ID"""
    try:
        asset = _resolve_asset_row(asset_ref)

        if not asset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found"
            )

        return _to_asset_response(asset)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve asset: {str(e)}"
        )


@router.get("/", response_model=List[AssetResponse])
async def list_assets(
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.MANUFACTURER, UserRole.AUDITOR]))
):
    """List assets — MANUFACTURER sees their own, ADMIN/WAREHOUSE/AUDITOR see all"""
    try:
        query = sql1_db.get_client().table("assets").select("*")

        role = current_user.get("role", "")
        if role == "MANUFACTURER":
            # Show assets created by this manufacturer
            try:
                response = query.eq("created_by", current_user["user_id"]).order("created_at", desc=True).execute()
            except Exception:
                # Fallback if created_by column not available
                response = query.order("created_at", desc=True).execute()
        else:
            try:
                response = query.order("created_at", desc=True).execute()
            except Exception:
                response = query.execute()
        
        assets = []
        for asset in (response.data or []):
            assets.append(_to_asset_response(asset))
        
        return assets
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve assets: {str(e)}"
        )


@router.put("/{asset_ref}", response_model=AssetResponse)
async def update_asset(
    asset_ref: str,
    asset_update: AssetUpdate,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.WAREHOUSE]))
):
    """Update asset information"""
    try:
        # Build update data
        update_data = asset_update.model_dump(exclude_unset=True)

        if "current_custodian" in update_data:
            update_data["current_custodian_id"] = update_data.pop("current_custodian")
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No update data provided"
            )
        
        asset = _resolve_asset_row(asset_ref)
        if not asset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found"
            )

        try:
            response = sql1_db.get_client().table("assets").update(update_data).eq("id", asset["id"]).execute()
        except Exception:
            if "current_custodian_id" in update_data:
                update_data["current_custodian"] = update_data.pop("current_custodian_id")
            response = sql1_db.get_client().table("assets").update(update_data).eq("id", asset["id"]).execute()
        
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found"
            )
        
        asset = response.data[0]
        
        return _to_asset_response(asset)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update asset: {str(e)}"
        )


@router.post("/{asset_ref}/sign-qr", response_model=QRSignResponse)
async def sign_asset_qr(
    asset_ref: str,
    current_user: dict = Depends(require_role([UserRole.MANUFACTURER, UserRole.ADMIN]))
):
    """Generate RSA signature payload for an asset ID"""
    try:
        asset = _resolve_asset_row(asset_ref)
        if not asset:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

        qr_subject = asset.get("asset_code") or asset.get("id")

        signature = sign_asset_id(qr_subject)
        qr_payload = build_qr_payload(qr_subject, signature)

        return QRSignResponse(asset_id=qr_subject, signature=signature, qr_payload=qr_payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sign QR payload: {str(e)}"
        )


@router.post("/verify-qr")
async def verify_asset_qr(
    request: QRVerifyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Verify RSA signature for an asset ID"""
    try:
        is_valid = verify_asset_signature(request.asset_id, request.signature)
        return {"asset_id": request.asset_id, "valid": is_valid}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify QR signature: {str(e)}"
        )


async def log_asset_event(asset_id: str, event_type: str, user_id: str, metadata: dict = None):
    """Log an asset event (internal helper)"""
    try:
        event_data = {
            "asset_id": asset_id,
            "user_id": user_id,
            "event_type": event_type,
            "metadata": metadata or {},
            "created_at": datetime.utcnow().isoformat()
        }

        response = sql1_db.get_client().table("events").insert(event_data).execute()
        if response.data:
            from app.api.audit import create_audit_entry
            event_id = response.data[0].get("id")
            if event_id:
                await create_audit_entry(event_id=event_id, event_data=event_data)
    except Exception as e:
        print(f"Failed to log event: {str(e)}")
