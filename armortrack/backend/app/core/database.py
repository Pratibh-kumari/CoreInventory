from supabase import create_client, Client
from app.core.config import settings


class DatabaseClient:
    """Supabase database client for SQL_1 (operational database)"""
    
    def __init__(self):
        self.client: Client = create_client(
            settings.SUPABASE_URL_SQL1,
            settings.SUPABASE_KEY_SQL1
        )
    
    def get_client(self) -> Client:
        return self.client


class AuditDatabaseClient:
    """Supabase database client for SQL_2 (audit database)"""
    
    def __init__(self):
        self.client: Client = create_client(
            settings.SUPABASE_URL_SQL2,
            settings.SUPABASE_KEY_SQL2
        )
    
    def get_client(self) -> Client:
        return self.client


# Singleton instances
sql1_db = DatabaseClient()
sql2_db = AuditDatabaseClient()
