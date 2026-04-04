from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.models.schemas import GPSUpdateRequest, GPSResponse, UserRole
from app.core.database import sql1_db
from app.core.dependencies import require_role
from datetime import datetime
import math

router = APIRouter()


@router.post("/update")
async def update_gps(gps_data: GPSUpdateRequest, current_user: dict = Depends(require_role([UserRole.TRANSPORTER]))):
    """Update GPS location for a batch (called by ESP32)"""
    try:
        # Store GPS update
        latitude = gps_data.get_latitude()
        longitude = gps_data.get_longitude()

        # Prefer canonical schema columns and fall back to legacy names.
        try:
            sql1_db.get_client().table("gps_tracking").insert({
                "batch_id": gps_data.batch_id,
                "lat": latitude,
                "lng": longitude,
                "created_at": gps_data.timestamp.isoformat(),
            }).execute()
        except Exception:
            sql1_db.get_client().table("gps_tracking").insert({
                "batch_id": gps_data.batch_id,
                "latitude": latitude,
                "longitude": longitude,
                "timestamp": gps_data.timestamp.isoformat(),
            }).execute()
        
        # Check for alerts (geofence, stops, etc.)
        await check_gps_alerts(gps_data)
        
        return {"message": "GPS update received", "status": "OK"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/track/{batch_id}", response_model=List[GPSResponse])
async def get_batch_gps(batch_id: str, current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.WAREHOUSE]))):
    """Get GPS tracking history for a batch"""
    try:
        response = sql1_db.get_client().table("gps_tracking") \
            .select("*") \
            .eq("batch_id", batch_id) \
            .limit(100)

        try:
            response = response.order("created_at", desc=True).execute()
        except Exception:
            response = response.order("timestamp", desc=True).execute()
        
        return [GPSResponse(
            batch_id=record["batch_id"],
            latitude=record.get("lat", record.get("latitude")),
            longitude=record.get("lng", record.get("longitude")),
            timestamp=record.get("created_at", record.get("timestamp"))
        ) for record in response.data]
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active")
async def get_active_batches_gps(current_user: dict = Depends(require_role([UserRole.ADMIN]))):
    """Get latest GPS position for all active batches"""
    try:
        # Get IN_TRANSIT batches
        batches = sql1_db.get_client().table("batches") \
            .select("id, destination") \
            .eq("status", "IN_TRANSIT") \
            .execute()
        
        active_batches = []
        for batch in batches.data:
            # Get latest GPS position
            gps_response = sql1_db.get_client().table("gps_tracking") \
                .select("*") \
                .eq("batch_id", batch["id"]) \
                .limit(1)

            try:
                gps_response = gps_response.order("created_at", desc=True).execute()
            except Exception:
                gps_response = gps_response.order("timestamp", desc=True).execute()
            
            if gps_response.data:
                gps = gps_response.data[0]
                active_batches.append({
                    "batch_id": batch["id"],
                    "latitude": gps.get("lat", gps.get("latitude")),
                    "longitude": gps.get("lng", gps.get("longitude")),
                    "destination": batch["destination"],
                    "timestamp": gps.get("created_at", gps.get("timestamp"))
                })
        
        return {"batches": active_batches}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def check_gps_alerts(gps_data: GPSUpdateRequest):
    """Check for geofence violations and other GPS alerts"""
    try:
        from app.core.config import settings
        
        # Get batch info
        batch = sql1_db.get_client().table("batches") \
            .select("*") \
            .eq("id", gps_data.batch_id) \
            .execute()
        
        if not batch.data:
            return
        
        batch_info = batch.data[0]
        
        # Get previous GPS position
        prev_gps = sql1_db.get_client().table("gps_tracking") \
            .select("*") \
            .eq("batch_id", gps_data.batch_id) \
            .limit(2)

        try:
            prev_gps = prev_gps.order("created_at", desc=True).execute()
        except Exception:
            prev_gps = prev_gps.order("timestamp", desc=True).execute()
        
        if len(prev_gps.data) >= 2:
            prev = prev_gps.data[1]
            
            # Calculate distance from previous position
            distance = haversine_distance(
                prev.get("lat", prev.get("latitude")), prev.get("lng", prev.get("longitude")),
                gps_data.get_latitude(), gps_data.get_longitude()
            )
            
            # Check for unscheduled stop (less than 10m movement in 10 minutes)
            prev_ts = prev.get("created_at", prev.get("timestamp"))
            prev_dt = datetime.fromisoformat(str(prev_ts).replace("Z", "+00:00"))
            current_ts = gps_data.timestamp
            if prev_dt.tzinfo and current_ts.tzinfo is None:
                current_ts = current_ts.replace(tzinfo=prev_dt.tzinfo)
            elif prev_dt.tzinfo is None and current_ts.tzinfo:
                prev_dt = prev_dt.replace(tzinfo=current_ts.tzinfo)
            time_diff = (current_ts - prev_dt).total_seconds() / 60
            
            if distance < 0.01 and time_diff > settings.MAX_STOP_DURATION_MINUTES:
                # Create alert
                alert = {
                    "alert_type": "UNSCHEDULED_STOP",
                    "severity": "WARNING",
                    "message": f"Batch {gps_data.batch_id} has stopped for over {settings.MAX_STOP_DURATION_MINUTES} minutes",
                    "batch_id": gps_data.batch_id,
                    "created_at": datetime.utcnow().isoformat(),
                    "is_dismissed": False,
                }
                try:
                    sql1_db.get_client().table("alerts").insert(alert).execute()
                except Exception:
                    legacy_alert = {
                        "type": "UNSCHEDULED_STOP",
                        "severity": "WARNING",
                        "message": alert["message"],
                        "batch_id": gps_data.batch_id,
                        "timestamp": datetime.utcnow().isoformat(),
                        "dismissed": False,
                    }
                    sql1_db.get_client().table("alerts").insert(legacy_alert).execute()
        
        destination_coords = parse_destination_coordinates(batch_info.get("destination"))
        if destination_coords is not None:
            distance_from_destination_km = haversine_distance(
                destination_coords[0],
                destination_coords[1],
                gps_data.get_latitude(),
                gps_data.get_longitude(),
            )
            distance_meters = distance_from_destination_km * 1000

            if distance_meters > settings.GEOFENCE_RADIUS_METERS:
                alert = {
                    "alert_type": "GEOFENCE_VIOLATION",
                    "severity": "CRITICAL",
                    "message": (
                        f"Batch {gps_data.batch_id} exceeded geofence radius "
                        f"({distance_meters:.2f}m > {settings.GEOFENCE_RADIUS_METERS}m)"
                    ),
                    "batch_id": gps_data.batch_id,
                    "created_at": datetime.utcnow().isoformat(),
                    "is_dismissed": False,
                }
                try:
                    sql1_db.get_client().table("alerts").insert(alert).execute()
                except Exception:
                    legacy_alert = {
                        "type": "GEOFENCE_VIOLATION",
                        "severity": "CRITICAL",
                        "message": alert["message"],
                        "batch_id": gps_data.batch_id,
                        "timestamp": datetime.utcnow().isoformat(),
                        "dismissed": False,
                    }
                    sql1_db.get_client().table("alerts").insert(legacy_alert).execute()
        
    except Exception as e:
        print(f"GPS alert check failed: {str(e)}")


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two GPS points in kilometers"""
    R = 6371  # Earth radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c


def parse_destination_coordinates(destination: str):
    """Parse destination in 'lat,lng' format if available"""
    if not destination or "," not in destination:
        return None
    try:
        lat_str, lng_str = destination.split(",", 1)
        return float(lat_str.strip()), float(lng_str.strip())
    except ValueError:
        return None
