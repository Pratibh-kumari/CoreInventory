from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.models.schemas import AuditVerifyResponse, UserRole
from app.core.database import sql1_db, sql2_db
from app.core.dependencies import require_role
import hashlib
import json

router = APIRouter()


@router.get("/verify", response_model=AuditVerifyResponse)
async def verify_audit_chain(current_user: dict = Depends(require_role([UserRole.AUDITOR, UserRole.ADMIN]))):
    """Verify the integrity of the audit chain"""
    try:
        # Get all audit entries from SQL_2
        audit_entries = sql2_db.get_client().table("audit_log") \
            .select("*") \
            .order("id", desc=False) \
            .execute()
        
        if not audit_entries.data:
            return AuditVerifyResponse(
                status="OK",
                total_entries=0,
                message="No audit entries found"
            )
        
        tampered_entries = []
        previous_hash = "0" * 64  # Genesis hash
        
        # Verify each entry
        for entry in audit_entries.data:
            # Recompute hash
            event_data_json = json.dumps(entry["event_data"], sort_keys=True)
            computed_hash = hashlib.sha256(
                (event_data_json + previous_hash).encode()
            ).hexdigest()
            
            # Compare with stored hash
            if computed_hash != entry["entry_hash"]:
                tampered_entries.append(entry["id"])
            
            # Update previous hash for next iteration
            previous_hash = entry["entry_hash"]
        
        # Determine status
        if tampered_entries:
            status = "TAMPERED"
            message = f"Audit chain integrity compromised. {len(tampered_entries)} tampered entries detected."
        else:
            status = "OK"
            message = "Audit chain integrity verified. All entries intact."
        
        return AuditVerifyResponse(
            status=status,
            total_entries=len(audit_entries.data),
            tampered_entries=tampered_entries,
            message=message
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audit verification failed: {str(e)}")


@router.get("/log")
async def get_audit_log(
    limit: int = 100,
    offset: int = 0,
    current_user: dict = Depends(require_role([UserRole.AUDITOR, UserRole.ADMIN]))
):
    """Get paginated audit log entries"""
    try:
        end = offset + max(limit, 1) - 1
        response = sql2_db.get_client().table("audit_log") \
            .select("*") \
            .order("id", desc=True) \
            .range(offset, end) \
            .execute()
        
        return {
            "total": len(response.data),
            "entries": response.data
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def create_audit_entry(event_id: str, event_data: dict):
    """Create a new audit log entry with hash chain (internal helper)"""
    try:
        # Get the last hash from SQL_2
        last_entry = sql2_db.get_client().table("audit_log") \
            .select("entry_hash") \
            .order("id", desc=True) \
            .limit(1) \
            .execute()
        
        previous_hash = last_entry.data[0]["entry_hash"] if last_entry.data else "0" * 64
        
        # Build canonical payload for the audit schema.
        normalized_event_data = event_data or {}
        event_type = normalized_event_data.get("event_type")
        if not event_type:
            event_type = "UNKNOWN"

        # Compute new hash
        event_data_json = json.dumps(normalized_event_data, sort_keys=True)
        entry_hash = hashlib.sha256(
            (event_data_json + previous_hash).encode()
        ).hexdigest()
        
        # Insert into SQL_2 (write-only)
        audit_entry = {
            "event_id": event_id,
            "event_type": str(event_type),
            "asset_id": normalized_event_data.get("asset_id"),
            "batch_id": normalized_event_data.get("batch_id"),
            "user_id": normalized_event_data.get("user_id"),
            "event_data": normalized_event_data,
            "entry_hash": entry_hash,
            "prev_hash": previous_hash
        }
        
        sql2_db.get_client().table("audit_log").insert(audit_entry).execute()
        
        return entry_hash
    
    except Exception as e:
        print(f"Failed to create audit entry: {str(e)}")
        raise
