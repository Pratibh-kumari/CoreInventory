from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import CheckoutRequest, ReturnRequest, GateAccessRequest, UserRole
from app.core.database import sql1_db
from app.core.dependencies import require_role
from datetime import datetime

router = APIRouter()


def _resolve_asset_row(asset_ref: str):
    response = sql1_db.get_client().table("assets").select("*") \
        .or_(f"asset_code.eq.{asset_ref},id.eq.{asset_ref}") \
        .limit(1) \
        .execute()
    return response.data[0] if response.data else None


@router.post("/checkout")
async def checkout_asset(
    request: CheckoutRequest,
    current_user: dict = Depends(require_role([UserRole.WAREHOUSE]))
):
    """Checkout asset from armoury (RFID gate)"""
    try:
        asset_ref = request.get_asset_ref()
        # Verify asset exists and is in warehouse
        asset = _resolve_asset_row(asset_ref)

        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")

        if asset["status"] not in {"WAREHOUSE", "WAREHOUSE_RECEIVED"}:
            raise HTTPException(status_code=400, detail="Asset is not available for checkout")
        
        # Update asset status
        try:
            sql1_db.get_client().table("assets") \
                .update({
                    "status": "CHECKED_OUT",
                    "current_custodian_id": request.personnel_id
                }) \
                .eq("id", asset["id"]) \
                .execute()
        except Exception:
            sql1_db.get_client().table("assets") \
                .update({
                    "status": "CHECKED_OUT",
                    "current_custodian": request.personnel_id
                }) \
                .eq("id", asset["id"]) \
                .execute()
        
        # Log custody transfer
        event_data = {
            "asset_id": asset["id"],
            "user_id": request.personnel_id,
            "event_type": "CHECKED_OUT",
            "metadata": {
                "previous_status": asset["status"],
                "asset_code": asset.get("asset_code"),
            },
            "created_at": datetime.utcnow().isoformat()
        }
        event_response = sql1_db.get_client().table("events").insert(event_data).execute()
        if event_response.data:
            from app.api.audit import create_audit_entry
            event_id = event_response.data[0].get("id")
            if event_id:
                await create_audit_entry(event_id=event_id, event_data=event_data)
        
        return {
            "message": "Asset checked out successfully",
            "asset_id": asset["id"],
            "asset_code": asset.get("asset_code") or asset["id"],
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/return")
async def return_asset(
    request: ReturnRequest,
    current_user: dict = Depends(require_role([UserRole.WAREHOUSE]))
):
    """Return asset to armoury (RFID gate)"""
    try:
        asset_ref = request.get_asset_ref()
        # Verify asset exists and is checked out
        asset = _resolve_asset_row(asset_ref)

        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")

        if asset["status"] != "CHECKED_OUT":
            raise HTTPException(status_code=400, detail="Asset is not checked out")
        
        # Update asset status
        try:
            sql1_db.get_client().table("assets") \
                .update({
                    "status": "WAREHOUSE_RECEIVED",
                    "current_custodian_id": None
                }) \
                .eq("id", asset["id"]) \
                .execute()
        except Exception:
            sql1_db.get_client().table("assets") \
                .update({
                    "status": "WAREHOUSE_RECEIVED",
                    "current_custodian": None
                }) \
                .eq("id", asset["id"]) \
                .execute()
        
        # Log custody transfer
        event_data = {
            "asset_id": asset["id"],
            "user_id": request.personnel_id,
            "event_type": "RETURNED",
            "metadata": {
                "previous_status": "CHECKED_OUT",
                "asset_code": asset.get("asset_code"),
            },
            "created_at": datetime.utcnow().isoformat()
        }
        event_response = sql1_db.get_client().table("events").insert(event_data).execute()
        if event_response.data:
            from app.api.audit import create_audit_entry
            event_id = event_response.data[0].get("id")
            if event_id:
                await create_audit_entry(event_id=event_id, event_data=event_data)
        
        return {
            "message": "Asset returned successfully",
            "asset_id": asset["id"],
            "asset_code": asset.get("asset_code") or asset["id"],
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/custody/{asset_ref}")
async def get_custody_history(
    asset_ref: str,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.WAREHOUSE]))
):
    """Get custody history for an asset"""
    try:
        asset = _resolve_asset_row(asset_ref)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")

        events = sql1_db.get_client().table("events") \
            .select("*") \
            .eq("asset_id", asset["id"]) \
            .in_("event_type", ["CHECKED_OUT", "RETURNED", "CUSTODY_TRANSFER"]) \
            .order("created_at", desc=True) \
            .execute()

        return {
            "asset_id": asset["id"],
            "asset_code": asset.get("asset_code") or asset["id"],
            "custody_events": events.data,
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/gate/validate")
async def validate_gate_access(
    request: GateAccessRequest,
    current_user: dict = Depends(require_role([UserRole.WAREHOUSE, UserRole.ADMIN]))
):
    """Validate whether personnel can exit gate with a specific asset."""
    try:
        asset_ref = request.get_asset_ref()
        asset_response = sql1_db.get_client().table("assets") \
            .select("id,asset_code,status,current_custodian_id,current_custodian") \
            .or_(f"asset_code.eq.{asset_ref},id.eq.{asset_ref}") \
            .limit(1) \
            .execute()

        if not asset_response.data:
            return {
                "allow": False,
                "reason": "ASSET_NOT_FOUND",
                "message": "Asset not found",
            }

        asset = asset_response.data[0]
        current_custodian = asset.get("current_custodian_id", asset.get("current_custodian"))

        allowed = asset.get("status") == "CHECKED_OUT" and str(current_custodian) == str(request.personnel_id)

        event_data = {
            "asset_id": asset["id"],
            "user_id": request.personnel_id,
            "event_type": "CUSTODY_TRANSFER",
            "metadata": {
                "event_subtype": "GATE_ACCESS_GRANTED" if allowed else "GATE_ACCESS_DENIED",
                "asset_code": asset.get("asset_code"),
                "status": asset.get("status"),
                "expected_custodian": current_custodian,
                "evaluated_by": current_user.get("user_id"),
            },
            "created_at": datetime.utcnow().isoformat(),
        }

        event_response = sql1_db.get_client().table("events").insert(event_data).execute()
        if event_response.data:
            from app.api.audit import create_audit_entry
            event_id = event_response.data[0].get("id")
            if event_id:
                await create_audit_entry(event_id=event_id, event_data=event_data)

        if allowed:
            return {
                "allow": True,
                "reason": "ACCESS_GRANTED",
                "message": "Gate opened. Custody verified.",
            }

        alert_message = (
            f"Unauthorized gate exit attempt for asset {asset.get('asset_code') or asset['id']} by personnel {request.personnel_id}. "
            f"Current custodian={current_custodian}, status={asset.get('status')}"
        )
        try:
            sql1_db.get_client().table("alerts").insert({
                "alert_type": "UNAUTHORIZED_GATE_ATTEMPT",
                "severity": "CRITICAL",
                "message": alert_message,
                "asset_id": asset["id"],
                "created_at": datetime.utcnow().isoformat(),
                "is_dismissed": False,
            }).execute()
        except Exception:
            sql1_db.get_client().table("alerts").insert({
                "type": "UNAUTHORIZED_GATE_ATTEMPT",
                "severity": "CRITICAL",
                "message": alert_message,
                "asset_id": asset["id"],
                "timestamp": datetime.utcnow().isoformat(),
                "dismissed": False,
            }).execute()

        return {
            "allow": False,
            "reason": "ACCESS_DENIED",
            "message": "Alarm triggered. Asset not checked out to this personnel.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
