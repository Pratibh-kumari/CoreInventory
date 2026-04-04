from fastapi import APIRouter
from datetime import datetime
from app.core.database import sql1_db, sql2_db

router = APIRouter()


@router.get("/health")
async def health_check():
    """Check system health (backend, SQL_1, SQL_2)"""
    health_status = {
        "backend": True,
        "sql1": False,
        "sql2": False,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Check SQL_1
    try:
        sql1_db.get_client().table("assets").select("id").limit(1).execute()
        health_status["sql1"] = True
    except Exception as e:
        print(f"SQL_1 health check failed: {str(e)}")
    
    # Check SQL_2
    try:
        sql2_db.get_client().table("audit_log").select("id").limit(1).execute()
        health_status["sql2"] = True
    except Exception as e:
        print(f"SQL_2 health check failed: {str(e)}")
    
    return health_status
