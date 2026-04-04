from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.models.schemas import MaintenanceDueResponse, MaintenanceCompleteRequest, UserRole
from app.core.database import sql1_db
from app.core.dependencies import require_role
from datetime import datetime, timedelta, timezone
import uuid

router = APIRouter()


def _resolve_asset_row(asset_ref: str):
    response = sql1_db.get_client().table("assets").select("*") \
        .or_(f"asset_code.eq.{asset_ref},id.eq.{asset_ref}") \
        .limit(1) \
        .execute()
    return response.data[0] if response.data else None


def _parse_db_datetime(value: str) -> datetime:
    """Parse DB datetime formats robustly across schema/data variations."""
    if not value:
        raise ValueError("Empty datetime value")

    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        parsed = datetime.strptime(normalized, "%Y-%m-%dT%H:%M:%S.%f%z")

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


@router.get("/due")
async def get_maintenance_due(
    current_user: dict = Depends(require_role([UserRole.ADMIN]))
):
    """Get assets due for maintenance"""
    try:
        from app.core.config import settings
        
        # Get all assets
        assets = sql1_db.get_client().table("assets") \
            .select("*") \
            .execute()
        
        due_assets = []
        now = datetime.now(timezone.utc)
        
        for asset in assets.data:
            last_serviced = asset.get("last_serviced_at")
            interval_days = asset.get("service_interval_days", 90)
            
            if last_serviced:
                last_serviced_dt = _parse_db_datetime(last_serviced)
                next_service = last_serviced_dt + timedelta(days=interval_days)
                days_until_due = (next_service - now).days
            else:
                # Never serviced
                days_until_due = 0
            
            # Determine status
            if days_until_due < 0:
                status = "OVERDUE"
            elif days_until_due <= settings.MAINTENANCE_WARNING_DAYS:
                status = "DUE_SOON"
            else:
                continue  # Not due yet
            
            due_assets.append(MaintenanceDueResponse(
                id=asset.get("asset_code") or asset["id"],
                asset_name=asset["asset_name"],
                asset_type=asset["asset_type"],
                last_serviced_at=asset.get("last_serviced_at"),
                service_interval_days=interval_days,
                days_until_due=days_until_due,
                status=status
            ))
        
        # Sort by urgency
        due_assets.sort(key=lambda x: x.days_until_due)
        
        return {"assets": due_assets, "total": len(due_assets)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/complete")
async def mark_maintenance_complete(
    request: MaintenanceCompleteRequest,
    current_user: dict = Depends(require_role([UserRole.ADMIN]))
):
    """Mark asset maintenance as complete"""
    try:
        asset_ref = request.get_asset_ref()
        asset = _resolve_asset_row(asset_ref)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")

        technician_id = request.technician_id
        try:
            if technician_id:
                uuid.UUID(str(technician_id))
        except ValueError:
            technician_id = None

        if not technician_id:
            technician_id = current_user.get("user_id")

        # Update asset
        sql1_db.get_client().table("assets") \
            .update({
                "last_serviced_at": datetime.utcnow().isoformat(),
                "status": "WAREHOUSE_RECEIVED"
            }) \
            .eq("id", asset["id"]) \
            .execute()
        
        # Log maintenance event
        event_data = {
            "asset_id": asset["id"],
            "user_id": technician_id,
            "event_type": "MAINTAINED",
            "metadata": {"notes": request.notes, "asset_code": asset.get("asset_code")},
            "created_at": datetime.utcnow().isoformat()
        }

        try:
            event_response = sql1_db.get_client().table("events").insert(event_data).execute()
        except Exception as event_error:
            # Older DB schemas may not include MAINTAINED in event_type enum.
            if "invalid input value for enum event_type" in str(event_error):
                event_data["event_type"] = "REGISTERED"
                event_data["metadata"] = {
                    "notes": request.notes,
                    "event_subtype": "MAINTAINED",
                }
                event_response = sql1_db.get_client().table("events").insert(event_data).execute()
            else:
                raise

        if event_response.data:
            try:
                import importlib
                audit_api = importlib.import_module("app.api.audit")
                event_id = event_response.data[0].get("id")
                if event_id:
                    await audit_api.create_audit_entry(event_id=event_id, event_data=event_data)
            except Exception as audit_error:
                # Do not fail maintenance completion when audit DB schema is out-of-sync.
                print(f"Audit logging failed for maintenance event: {str(audit_error)}")
        
        return {
            "message": "Maintenance completed successfully",
            "asset_id": asset["id"],
            "asset_code": asset.get("asset_code") or asset["id"],
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schedule")
async def get_maintenance_schedule(
    current_user: dict = Depends(require_role([UserRole.ADMIN]))
):
    """Get full maintenance schedule for all assets"""
    try:
        assets = sql1_db.get_client().table("assets").select("*").execute()
        
        schedule = []
        now = datetime.now(timezone.utc)
        
        for asset in assets.data:
            last_serviced = asset.get("last_serviced_at")
            interval_days = asset.get("service_interval_days", 90)
            
            if last_serviced:
                last_serviced_dt = _parse_db_datetime(last_serviced)
                next_service = last_serviced_dt + timedelta(days=interval_days)
                days_until_due = (next_service - now).days
            else:
                days_until_due = -999  # Never serviced
            
            schedule.append({
                "id": asset.get("asset_code") or asset["id"],
                "asset_code": asset.get("asset_code"),
                "asset_name": asset["asset_name"],
                "asset_type": asset["asset_type"],
                "last_serviced_at": last_serviced,
                "next_service_date": (now + timedelta(days=days_until_due)).isoformat() if days_until_due > -999 else None,
                "service_interval_days": interval_days,
                "days_until_due": days_until_due
            })
        
        # Sort by next service date
        schedule.sort(key=lambda x: x["days_until_due"])
        
        return {"schedule": schedule, "total": len(schedule)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
