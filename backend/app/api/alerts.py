from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from app.models.schemas import UserRole
from app.core.database import sql1_db
from app.core.dependencies import require_role

router = APIRouter()


@router.get("/active")
async def get_active_alerts(current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.WAREHOUSE]))):
    """Get all active (non-dismissed) alerts"""
    try:
        # Query without strict schema-dependent filters to support older DB schemas.
        try:
            response = sql1_db.get_client().table("alerts") \
                .select("*") \
                .order("created_at", desc=True) \
                .limit(50) \
                .execute()
        except Exception:
            try:
                response = sql1_db.get_client().table("alerts") \
                    .select("*") \
                    .order("timestamp", desc=True) \
                    .limit(50) \
                    .execute()
            except Exception:
                response = sql1_db.get_client().table("alerts") \
                    .select("*") \
                    .limit(50) \
                    .execute()
        
        alerts = []
        for alert in (response.data or []):
            # Treat missing dismissed column as active.
            if alert.get("is_dismissed", alert.get("dismissed", False)):
                continue

            severity = str(alert.get("severity", "INFO")).upper()
            if severity not in {"INFO", "WARNING", "ALERT", "CRITICAL"}:
                severity = "INFO"

            alerts.append({
                "id": alert.get("id", "unknown"),
                "type": alert.get("alert_type", alert.get("type", "ALERT")),
                "severity": severity,
                "message": alert.get("message", "Alert"),
                "batch_id": alert.get("batch_id"),
                "asset_id": alert.get("asset_id"),
                "timestamp": alert.get("created_at") or alert.get("timestamp") or datetime.utcnow().isoformat(),
                "dismissed": alert.get("is_dismissed", alert.get("dismissed", False)),
            })
        
        return {"alerts": alerts, "total": len(alerts)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{alert_id}/dismiss")
async def dismiss_alert(
    alert_id: str,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.WAREHOUSE]))
):
    """Dismiss an alert"""
    try:
        # If the dismissed column does not exist in older schemas, this becomes a no-op.
        try:
            sql1_db.get_client().table("alerts") \
                .update({"is_dismissed": True}) \
                .eq("id", alert_id) \
                .execute()
        except Exception:
            sql1_db.get_client().table("alerts") \
                .update({"dismissed": True}) \
                .eq("id", alert_id) \
                .execute()
        
        return {"message": "Alert dismissed successfully"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
