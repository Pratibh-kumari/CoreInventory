from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from typing import Optional
from app.core.security import decode_access_token
from app.models.schemas import UserRole

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Extract and verify JWT token, return user info"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = decode_access_token(credentials.credentials)
        if payload is None:
            raise credentials_exception
        
        user_id: str = payload.get("sub")
        user_role: str = payload.get("role")
        
        if user_id is None or user_role is None:
            raise credentials_exception
        
        return {
            "user_id": user_id,
            "role": UserRole(user_role)
        }
    except JWTError:
        raise credentials_exception


def require_role(required_roles: list[UserRole]):
    """Dependency to check if user has required role"""
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    return role_checker
