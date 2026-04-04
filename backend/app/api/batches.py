from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from fastapi.responses import FileResponse
from typing import List
from app.models.schemas import (
    BatchCreate, BatchResponse, BatchScanRequest, BatchDeliverRequest,
    RequestDeliveryRequest, AcceptDeliveryRequest, UserRole
)
from app.core.database import sql1_db
from app.core.dependencies import get_current_user, require_role
from app.core.config import settings
from app.core.qr_signing import sign_asset_id, build_qr_payload
from datetime import datetime
import uuid
import math
import os
import zipfile
from io import BytesIO

try:
    import qrcode
    QR_AVAILABLE = True
except ImportError:
    QR_AVAILABLE = False

router = APIRouter()

QR_CODES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "qr_codes")


import re
_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)


def _resolve_asset_row(asset_ref: str):
    """Resolve asset by asset_code first, then by UUID id."""
    # Try asset_code (e.g. AST-5B2D9F55)
    response = sql1_db.get_client().table("assets").select("id,asset_code,asset_name") \
        .eq("asset_code", asset_ref).limit(1).execute()
    if response.data:
        return response.data[0]
    # Try UUID id only if it looks like a valid UUID
    if _UUID_RE.match(asset_ref):
        response = sql1_db.get_client().table("assets").select("id,asset_code,asset_name") \
            .eq("id", asset_ref).limit(1).execute()
        return response.data[0] if response.data else None
    return None


def _generate_qr_for_asset(batch_id: str, asset_code: str) -> bool:
    """Generate RSA-signed QR code PNG for a single asset, save to qr_codes folder."""
    if not QR_AVAILABLE:
        print("qrcode library not available — skipping QR generation")
        return False
    try:
        signature = sign_asset_id(asset_code)
        payload = build_qr_payload(asset_code, signature)
        qr_folder = os.path.join(QR_CODES_DIR, batch_id)
        os.makedirs(qr_folder, exist_ok=True)
        img = qrcode.make(payload)
        img_path = os.path.join(qr_folder, f"{asset_code}.png")
        img.save(img_path)
        return True
    except Exception as e:
        print(f"QR generation failed for {asset_code}: {e}")
        return False


def _batch_row_to_response(batch: dict, assets: List[dict]) -> BatchResponse:
    """Convert DB row + enriched assets to BatchResponse."""
    raw_status = batch.get("status", "PENDING")
    valid_statuses = {"PENDING", "PENDING_PICKUP", "ACCEPTED", "IN_TRANSIT", "DELIVERED", "CANCELLED"}
    if raw_status not in valid_statuses:
        raw_status = "PENDING"

    return BatchResponse(
        id=batch["id"],
        batch_code=batch.get("batch_code"),
        transporter_id=batch.get("transporter_id"),
        destination=batch.get("destination", ""),
        status=raw_status,
        expected_delivery=batch.get("expected_delivery") or datetime.utcnow().isoformat(),
        created_at=batch.get("created_at") or datetime.utcnow().isoformat(),
        assets=assets,
        driver_name=batch.get("driver_name"),
        qr_generated=batch.get("qr_generated", False),
        created_by=batch.get("created_by"),
    )


def _enrich_assets(batch_id: str) -> List[dict]:
    """Fetch and enrich batch_assets with asset info."""
    assets_response = sql1_db.get_client().table("batch_assets").select("*").eq("batch_id", batch_id).execute()
    enriched = []
    for row in (assets_response.data or []):
        asset = sql1_db.get_client().table("assets").select("asset_code,asset_name").eq("id", row["asset_id"]).limit(1).execute()
        info = asset.data[0] if asset.data else {}
        enriched.append({
            **row,
            "asset_code": info.get("asset_code", row["asset_id"]),
            "asset_name": info.get("asset_name", info.get("asset_code", row["asset_id"])),
        })
    return enriched


def _get_available_drivers() -> List[dict]:
    """Fetch active transporter users for driver assignment."""
    try:
        response = sql1_db.get_client().table("users") \
            .select("id,name,email,role,is_active") \
            .eq("role", "TRANSPORTER") \
            .eq("is_active", True) \
            .order("name", desc=False) \
            .execute()
    except Exception:
        # Fallback for schemas without is_active column.
        response = sql1_db.get_client().table("users") \
            .select("id,name,email,role") \
            .eq("role", "TRANSPORTER") \
            .order("name", desc=False) \
            .execute()

    drivers = []
    for user in (response.data or []):
        drivers.append({
            "id": user.get("id"),
            "name": user.get("name"),
            "email": user.get("email"),
        })
    return drivers


def _ensure_qr_codes_for_batch(batch_id: str):
    """Generate missing QR files for a batch from stored assets."""
    assets = _enrich_assets(batch_id)
    if not assets:
        return False, "No assets are linked to this batch."

    generated_any = False
    attempted = 0
    for asset in assets:
        asset_code = asset.get("asset_code") or asset.get("asset_id")
        if not asset_code:
            continue
        attempted += 1
        ok = _generate_qr_for_asset(batch_id, str(asset_code))
        if ok:
            generated_any = True

    if generated_any:
        try:
            sql1_db.get_client().table("batches").update({"qr_generated": True}).eq("id", batch_id).execute()
        except Exception:
            pass

    if not generated_any:
        if attempted == 0:
            return False, "Batch assets are missing asset codes/ids for QR generation."
        return False, "QR generation failed for all assets."

    return True, "QR codes regenerated successfully."


def _get_qr_file_names(batch_id: str) -> List[str]:
    """Return QR PNG file names for a batch; regenerate if missing."""
    qr_folder = os.path.join(QR_CODES_DIR, batch_id)
    if not os.path.exists(qr_folder) or not os.listdir(qr_folder):
        regenerated, reason = _ensure_qr_codes_for_batch(batch_id)
        if not regenerated:
            raise HTTPException(
                status_code=404,
                detail=f"QR codes are not available for this batch yet. {reason}",
            )

    files = [f for f in os.listdir(qr_folder) if f.lower().endswith(".png")]
    if not files:
        raise HTTPException(status_code=404, detail="No QR PNG files found for this batch.")

    return sorted(files)


@router.post("/create", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def create_batch(
    batch_data: BatchCreate,
    current_user: dict = Depends(require_role([UserRole.MANUFACTURER, UserRole.ADMIN]))
):
    """Create a new dispatch batch with QR code generation (MANUFACTURER or ADMIN)"""
    try:
        batch_id = str(uuid.uuid4())
        batch_code = f"BCH-{batch_id.split('-')[0].upper()}"

        insert_data = {
            "id": batch_id,
            "batch_code": batch_code,
            "transporter_id": batch_data.transporter_id or None,
            "created_by": current_user["user_id"],
            "origin": "FACTORY",
            "destination": batch_data.destination,
            "status": "PENDING",
            "expected_delivery": batch_data.expected_delivery.isoformat(),
            "qr_generated": False,
        }

        try:
            batch_response = sql1_db.get_client().table("batches").insert(insert_data).execute()
        except Exception:
            # Fallback for legacy schema without some columns
            legacy = {k: v for k, v in insert_data.items() if k in
                      ("id", "transporter_id", "destination", "status", "expected_delivery")}
            batch_response = sql1_db.get_client().table("batches").insert(legacy).execute()

        if not batch_response.data:
            raise HTTPException(status_code=500, detail="Failed to create batch")

        # Add assets to batch + generate QR codes
        batch_assets = []
        qr_generated_all = True
        for asset_ref in batch_data.asset_ids:
            asset = _resolve_asset_row(asset_ref)
            if not asset:
                raise HTTPException(status_code=400, detail=f"Asset not found: {asset_ref}")

            asset_data = {
                "batch_id": batch_id,
                "asset_id": asset["id"],
                "scanned_at_dispatch": False,
                "scanned_at_delivery": False,
            }
            sql1_db.get_client().table("batch_assets").insert(asset_data).execute()

            asset_code = asset.get("asset_code") or asset["id"]
            ok = _generate_qr_for_asset(batch_id, asset_code)
            if not ok:
                qr_generated_all = False

            batch_assets.append({
                **asset_data,
                "asset_code": asset_code,
                "asset_name": asset.get("asset_name") or asset_code,
            })

        # Mark QR generated flag
        try:
            sql1_db.get_client().table("batches").update({"qr_generated": qr_generated_all}).eq("id", batch_id).execute()
        except Exception:
            pass

        await log_batch_event(batch_id, "BATCH_CREATED", current_user["user_id"])

        return BatchResponse(
            id=batch_id,
            batch_code=batch_code,
            transporter_id=batch_data.transporter_id,
            destination=batch_data.destination,
            status="PENDING",
            expected_delivery=batch_data.expected_delivery,
            created_at=datetime.utcnow(),
            assets=batch_assets,
            qr_generated=qr_generated_all,
            created_by=current_user["user_id"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[BatchResponse])
async def list_batches(current_user: dict = Depends(get_current_user)):
    """List batches — filtered by role"""
    try:
        role = current_user.get("role", "")
        query = sql1_db.get_client().table("batches").select("*").order("created_at", desc=True)

        if role == "MANUFACTURER":
            # Show batches the manufacturer created
            query = query.eq("created_by", current_user["user_id"])
        elif role == "TRANSPORTER":
            # Show PENDING_PICKUP (requests) + ACCEPTED/IN_TRANSIT (active)
            query = query.in_("status", ["PENDING_PICKUP", "ACCEPTED", "IN_TRANSIT"])
        elif role == "WAREHOUSE":
            # Show incoming deliveries
            query = query.in_("status", ["ACCEPTED", "IN_TRANSIT", "DELIVERED"])
        # ADMIN and AUDITOR see all

        response = query.execute()
        batches = []
        for batch in response.data:
            enriched = _enrich_assets(batch["id"])
            batches.append(_batch_row_to_response(batch, enriched))
        return batches
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drivers")
async def list_available_drivers(current_user: dict = Depends(get_current_user)):
    """List available transporter users for driver assignment."""
    try:
        drivers = _get_available_drivers()
        return {"drivers": drivers, "total": len(drivers)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(batch_id: str, current_user: dict = Depends(get_current_user)):
    """Get batch details"""
    try:
        response = sql1_db.get_client().table("batches").select("*").eq("id", batch_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch = response.data[0]
        enriched = _enrich_assets(batch_id)
        return _batch_row_to_response(batch, enriched)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{batch_id}/request-delivery")
async def request_delivery(
    batch_id: str,
    body: RequestDeliveryRequest,
    current_user: dict = Depends(require_role([UserRole.MANUFACTURER, UserRole.ADMIN]))
):
    """MANUFACTURER requests delivery dispatch — status: PENDING → PENDING_PICKUP"""
    try:
        batch_resp = sql1_db.get_client().table("batches").select("*").eq("id", batch_id).execute()
        if not batch_resp.data:
            raise HTTPException(status_code=404, detail="Batch not found")

        batch = batch_resp.data[0]
        if batch["status"] != "PENDING":
            raise HTTPException(
                status_code=400,
                detail=f"Batch must be in PENDING state to request delivery (current: {batch['status']})"
            )

        sql1_db.get_client().table("batches").update({"status": "PENDING_PICKUP"}).eq("id", batch_id).execute()
        await log_batch_event(batch_id, "DELIVERY_REQUESTED", current_user["user_id"])

        return {"message": "Delivery request sent. Waiting for transporter.", "batch_id": batch_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{batch_id}/accept")
async def accept_delivery(
    batch_id: str,
    body: AcceptDeliveryRequest,
    current_user: dict = Depends(require_role([UserRole.TRANSPORTER, UserRole.ADMIN]))
):
    """TRANSPORTER accepts delivery request and assigns driver — status: PENDING_PICKUP → ACCEPTED"""
    try:
        batch_resp = sql1_db.get_client().table("batches").select("*").eq("id", batch_id).execute()
        if not batch_resp.data:
            raise HTTPException(status_code=404, detail="Batch not found")

        batch = batch_resp.data[0]
        if batch["status"] != "PENDING_PICKUP":
            raise HTTPException(
                status_code=400,
                detail=f"Batch must be in PENDING_PICKUP state to accept (current: {batch['status']})"
            )

        update_data = {
            "status": "ACCEPTED",
            "transporter_id": current_user["user_id"],
            "driver_name": body.driver_name,
        }

        try:
            sql1_db.get_client().table("batches").update(update_data).eq("id", batch_id).execute()
        except Exception:
            # Fallback if driver_name column doesn't exist yet
            sql1_db.get_client().table("batches").update({
                "status": "ACCEPTED",
                "transporter_id": current_user["user_id"],
            }).eq("id", batch_id).execute()

        await log_batch_event(batch_id, "DELIVERY_ACCEPTED", current_user["user_id"])

        return {
            "message": f"Batch accepted. Driver {body.driver_name} assigned.",
            "batch_id": batch_id,
            "driver_name": body.driver_name,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{batch_id}/qr-codes")
async def download_qr_codes(
    batch_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download all QR codes for a batch as a ZIP file"""
    batch_response = sql1_db.get_client().table("batches").select("id,qr_generated").eq("id", batch_id).limit(1).execute()
    if not batch_response.data:
        raise HTTPException(status_code=404, detail="Batch not found")

    qr_folder = os.path.join(QR_CODES_DIR, batch_id)

    if not os.path.exists(qr_folder) or not os.listdir(qr_folder):
        regenerated, reason = _ensure_qr_codes_for_batch(batch_id)
        if not regenerated or not os.path.exists(qr_folder) or not os.listdir(qr_folder):
            raise HTTPException(
                status_code=404,
                detail=f"QR codes are not available for this batch yet. {reason}",
            )

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in os.listdir(qr_folder):
            fpath = os.path.join(qr_folder, fname)
            if os.path.isfile(fpath):
                zf.write(fpath, fname)
    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=qr-codes-{batch_id[:8]}.zip"},
    )


@router.get("/{batch_id}/qr-files")
async def list_qr_files(
    batch_id: str,
    current_user: dict = Depends(get_current_user)
):
    """List QR file names for preview in browser."""
    batch_response = sql1_db.get_client().table("batches").select("id").eq("id", batch_id).limit(1).execute()
    if not batch_response.data:
        raise HTTPException(status_code=404, detail="Batch not found")

    files = _get_qr_file_names(batch_id)
    return {"batch_id": batch_id, "files": files}


@router.get("/{batch_id}/qr/{asset_code}")
async def get_qr_image(
    batch_id: str,
    asset_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Serve a single QR image for in-browser preview."""
    batch_response = sql1_db.get_client().table("batches").select("id").eq("id", batch_id).limit(1).execute()
    if not batch_response.data:
        raise HTTPException(status_code=404, detail="Batch not found")

    safe_asset_code = os.path.basename(asset_code)
    if safe_asset_code != asset_code:
        raise HTTPException(status_code=400, detail="Invalid asset code")

    # Ensure files exist before trying to serve
    _get_qr_file_names(batch_id)

    qr_path = os.path.join(QR_CODES_DIR, batch_id, f"{safe_asset_code}.png")
    if not os.path.exists(qr_path):
        raise HTTPException(status_code=404, detail="QR image not found")

    return FileResponse(qr_path, media_type="image/png")


@router.post("/{batch_id}/scan")
async def scan_asset_into_batch(
    batch_id: str,
    scan_data: BatchScanRequest,
    current_user: dict = Depends(require_role([UserRole.TRANSPORTER]))
):
    """Scan an asset into batch at dispatch"""
    try:
        asset_ref = scan_data.get_asset_ref()
        resolved_asset = _resolve_asset_row(asset_ref)
        if not resolved_asset:
            raise HTTPException(status_code=400, detail=f"Asset not found: {asset_ref}")

        asset_in_batch = sql1_db.get_client().table("batch_assets") \
            .select("*").eq("batch_id", batch_id).eq("asset_id", resolved_asset["id"]).execute()

        if not asset_in_batch.data:
            raise HTTPException(status_code=400, detail="Asset not in batch")

        sql1_db.get_client().table("batch_assets") \
            .update({"scanned_at_dispatch": True}) \
            .eq("batch_id", batch_id).eq("asset_id", resolved_asset["id"]).execute()

        return {"message": "Asset scanned successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{batch_id}/confirm")
async def confirm_batch_dispatch(
    batch_id: str,
    current_user: dict = Depends(require_role([UserRole.TRANSPORTER]))
):
    """Confirm all assets scanned and initiate dispatch — status: ACCEPTED → IN_TRANSIT"""
    try:
        batch_assets = sql1_db.get_client().table("batch_assets").select("*").eq("batch_id", batch_id).execute()
        all_scanned = all(asset["scanned_at_dispatch"] for asset in batch_assets.data)

        if not all_scanned:
            raise HTTPException(status_code=400, detail="Not all assets have been scanned")

        sql1_db.get_client().table("batches").update({"status": "IN_TRANSIT"}).eq("id", batch_id).execute()

        for asset in batch_assets.data:
            sql1_db.get_client().table("assets").update({"status": "IN_TRANSIT"}).eq("id", asset["asset_id"]).execute()

        await log_batch_event(batch_id, "DISPATCHED", current_user["user_id"])

        return {"message": "Batch dispatched successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{batch_id}/deliver")
async def confirm_batch_delivery(
    batch_id: str,
    delivery_data: BatchDeliverRequest,
    current_user: dict = Depends(require_role([UserRole.TRANSPORTER]))
):
    """Confirm delivery after validating count and location"""
    try:
        batch_response = sql1_db.get_client().table("batches").select("*").eq("id", batch_id).execute()
        if not batch_response.data:
            raise HTTPException(status_code=404, detail="Batch not found")

        batch = batch_response.data[0]
        if batch["status"] != "IN_TRANSIT":
            raise HTTPException(status_code=400, detail="Batch is not in transit")

        batch_assets_response = sql1_db.get_client().table("batch_assets").select("*").eq("batch_id", batch_id).execute()
        batch_assets = batch_assets_response.data or []

        expected_asset_ids = {asset["asset_id"] for asset in batch_assets}
        delivered_asset_ids = set()
        for asset_ref in delivery_data.get_scanned_asset_refs():
            asset = _resolve_asset_row(asset_ref)
            if not asset:
                raise HTTPException(status_code=400, detail=f"Asset not found: {asset_ref}")
            delivered_asset_ids.add(asset["id"])

        missing_assets = list(expected_asset_ids - delivered_asset_ids)
        unknown_assets = list(delivered_asset_ids - expected_asset_ids)

        if missing_assets or unknown_assets:
            create_alert(
                alert_type="DELIVERY_MISMATCH",
                severity="CRITICAL",
                message=(f"Delivery mismatch for batch {batch_id}. "
                         f"Missing: {len(missing_assets)}, Unknown: {len(unknown_assets)}"),
                batch_id=batch_id,
            )
            raise HTTPException(status_code=400, detail={
                "message": "Delivery count mismatch detected",
                "missing_assets": missing_assets,
                "unknown_assets": unknown_assets,
            })

        destination_coords = parse_destination_coordinates(batch.get("destination"))
        if destination_coords is not None:
            distance_km = haversine_distance(
                destination_coords[0], destination_coords[1],
                delivery_data.get_latitude(), delivery_data.get_longitude(),
            )
            if distance_km * 1000 > settings.DELIVERY_RADIUS_METERS:
                create_alert(
                    alert_type="DELIVERY_LOCATION_MISMATCH",
                    severity="CRITICAL",
                    message=(f"Delivery outside allowed radius for batch {batch_id}. "
                             f"Distance: {distance_km * 1000:.2f}m"),
                    batch_id=batch_id,
                )
                raise HTTPException(
                    status_code=400,
                    detail=f"Delivery location outside allowed radius of {settings.DELIVERY_RADIUS_METERS}m"
                )

        for asset in batch_assets:
            sql1_db.get_client().table("batch_assets") \
                .update({"scanned_at_delivery": True}).eq("batch_id", batch_id).eq("asset_id", asset["asset_id"]).execute()
            sql1_db.get_client().table("assets").update({"status": "WAREHOUSE_RECEIVED"}).eq("id", asset["asset_id"]).execute()

        sql1_db.get_client().table("batches").update({"status": "DELIVERED"}).eq("id", batch_id).execute()
        await log_batch_event(batch_id, "DELIVERED", current_user["user_id"])

        return {"message": "Batch delivered successfully", "batch_id": batch_id, "delivered_count": len(delivered_asset_ids)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def log_batch_event(batch_id: str, event_type: str, user_id: str):
    """Log batch event to SQL_1 events table and audit chain"""
    try:
        event_data = {
            "batch_id": batch_id,
            "user_id": user_id,
            "event_type": event_type,
            "created_at": datetime.utcnow().isoformat()
        }
        response = sql1_db.get_client().table("events").insert(event_data).execute()
        if response.data:
            from app.api.audit import create_audit_entry
            event_id = response.data[0].get("id")
            if event_id:
                await create_audit_entry(event_id=event_id, event_data=event_data)
    except Exception as e:
        print(f"Failed to log batch event: {str(e)}")


def create_alert(alert_type: str, severity: str, message: str, batch_id: str):
    """Create an alert record"""
    try:
        alert = {
            "alert_type": alert_type,
            "severity": severity,
            "message": message,
            "batch_id": batch_id,
            "created_at": datetime.utcnow().isoformat(),
            "is_dismissed": False,
        }
        try:
            sql1_db.get_client().table("alerts").insert(alert).execute()
        except Exception:
            sql1_db.get_client().table("alerts").insert({
                "type": alert_type, "severity": severity, "message": message,
                "batch_id": batch_id, "timestamp": datetime.utcnow().isoformat(), "dismissed": False,
            }).execute()
    except Exception as e:
        print(f"Failed to create alert: {str(e)}")


def parse_destination_coordinates(destination: str):
    if not destination or "," not in destination:
        return None
    try:
        lat_str, lng_str = destination.split(",", 1)
        return float(lat_str.strip()), float(lng_str.strip())
    except ValueError:
        return None


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
