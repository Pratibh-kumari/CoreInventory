from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta
from app.core.database import sql1_db
from app.core.config import settings

scheduler = BackgroundScheduler()


def check_maintenance_due():
    """Daily check for assets due for maintenance"""
    try:
        print(f"[{datetime.utcnow()}] Running maintenance check...")
        
        assets = sql1_db.get_client().table("assets").select("*").execute()
        
        for asset in assets.data:
            last_serviced = asset.get("last_serviced_at")
            interval_days = asset.get("service_interval_days", 90)
            
            if last_serviced:
                last_serviced_dt = datetime.fromisoformat(last_serviced.replace('Z', '+00:00'))
                next_service = last_serviced_dt + timedelta(days=interval_days)
                now_ref = datetime.now(last_serviced_dt.tzinfo) if last_serviced_dt.tzinfo else datetime.utcnow()
                days_until_due = (next_service - now_ref).days
                
                if days_until_due <= settings.MAINTENANCE_WARNING_DAYS:
                    # Create alert
                    severity = "CRITICAL" if days_until_due < 0 else "WARNING"
                    alert = {
                        "alert_type": "MAINTENANCE_DUE",
                        "severity": severity,
                        "message": f"Asset {asset['asset_name']} ({asset['id']}) {'OVERDUE' if days_until_due < 0 else 'due soon'} for maintenance",
                        "asset_id": asset["id"],
                        "created_at": datetime.utcnow().isoformat(),
                        "is_dismissed": False
                    }
                    try:
                        sql1_db.get_client().table("alerts").insert(alert).execute()
                    except Exception:
                        legacy_alert = {
                            "type": "MAINTENANCE_DUE",
                            "severity": severity,
                            "message": alert["message"],
                            "asset_id": asset["id"],
                            "timestamp": datetime.utcnow().isoformat(),
                            "dismissed": False,
                        }
                        sql1_db.get_client().table("alerts").insert(legacy_alert).execute()
                    print(f"  Alert created for asset: {asset['id']}")
        
        print(f"[{datetime.utcnow()}] Maintenance check completed")
    
    except Exception as e:
        print(f"Maintenance check failed: {str(e)}")


def check_active_alerts():
    """Periodic check for active alerts"""
    try:
        # Get active IN_TRANSIT batches
        batches = sql1_db.get_client().table("batches") \
            .select("id") \
            .eq("status", "IN_TRANSIT") \
            .execute()
        
        for batch in batches.data:
            # Check for GPS signal loss
            latest_gps = sql1_db.get_client().table("gps_tracking") \
                .select("*") \
                .eq("batch_id", batch["id"]) \
                .limit(1)

            try:
                latest_gps = latest_gps.order("created_at", desc=True).execute()
            except Exception:
                latest_gps = latest_gps.order("timestamp", desc=True).execute()
            
            if latest_gps.data:
                last_update_raw = latest_gps.data[0].get("created_at", latest_gps.data[0].get("timestamp"))
                last_update = datetime.fromisoformat(str(last_update_raw).replace('Z', '+00:00'))
                now_ref = datetime.now(last_update.tzinfo) if last_update.tzinfo else datetime.utcnow()
                time_since_update = (now_ref - last_update).total_seconds() / 60
                
                if time_since_update > settings.GPS_SIGNAL_LOSS_MINUTES:
                    # Check if alert already exists
                    existing_alert = sql1_db.get_client().table("alerts") \
                        .select("id") \
                        .eq("batch_id", batch["id"]) \
                        .eq("alert_type", "GPS_SIGNAL_LOSS")

                    try:
                        existing_alert = existing_alert.eq("is_dismissed", False).execute()
                    except Exception:
                        existing_alert = sql1_db.get_client().table("alerts") \
                            .select("id") \
                            .eq("batch_id", batch["id"]) \
                            .eq("type", "GPS_SIGNAL_LOSS") \
                            .eq("dismissed", False) \
                            .execute()
                    
                    if not existing_alert.data:
                        alert = {
                            "alert_type": "GPS_SIGNAL_LOSS",
                            "severity": "ALERT",
                            "message": f"GPS signal lost for batch {batch['id']} for over {settings.GPS_SIGNAL_LOSS_MINUTES} minutes",
                            "batch_id": batch["id"],
                            "created_at": datetime.utcnow().isoformat(),
                            "is_dismissed": False
                        }
                        try:
                            sql1_db.get_client().table("alerts").insert(alert).execute()
                        except Exception:
                            legacy_alert = {
                                "type": "GPS_SIGNAL_LOSS",
                                "severity": "ALERT",
                                "message": alert["message"],
                                "batch_id": batch["id"],
                                "timestamp": datetime.utcnow().isoformat(),
                                "dismissed": False,
                            }
                            sql1_db.get_client().table("alerts").insert(legacy_alert).execute()
                        print(f"  GPS signal loss alert for batch: {batch['id']}")
        
    except Exception as e:
        print(f"Alert check failed: {str(e)}")


def start_scheduler():
    """Start the background scheduler"""
    print("Initializing scheduler...")
    
    # Daily maintenance check at midnight
    scheduler.add_job(
        check_maintenance_due,
        CronTrigger(hour=0, minute=0),
        id='maintenance_check',
        replace_existing=True
    )
    
    # Check alerts every 5 minutes
    scheduler.add_job(
        check_active_alerts,
        'interval',
        minutes=5,
        id='alert_check',
        replace_existing=True
    )
    
    scheduler.start()
    print("Scheduler started successfully")
    
    return scheduler


def stop_scheduler():
    """Stop the background scheduler"""
    print("Stopping scheduler...")
    scheduler.shutdown()
    print("Scheduler stopped")
