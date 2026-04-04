from fastapi import APIRouter, HTTPException, status
from datetime import timedelta
from app.models.schemas import LoginRequest, LoginResponse, UserCreate, UserResponse
from app.core.security import create_access_token, get_password_hash, verify_password
from app.core.database import sql1_db
from app.core.config import settings

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Authenticate user and return JWT token"""
    try:
        # Query user from Supabase
        response = sql1_db.get_client().table("users").select("*").eq("email", request.email).execute()
        
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )
        
        user = response.data[0]
        
        # Verify password
        if not verify_password(request.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )

        if not request.device_fingerprint:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Device fingerprint is required"
            )

        existing_fingerprint = user.get("device_fingerprint")
        if existing_fingerprint and existing_fingerprint != request.device_fingerprint:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Login rejected from unrecognized device"
            )

        if not existing_fingerprint:
            sql1_db.get_client().table("users") \
                .update({"device_fingerprint": request.device_fingerprint}) \
                .eq("id", user["id"]) \
                .execute()
        
        # Create access token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["id"], "role": user["role"], "dfp": request.device_fingerprint},
            expires_delta=access_token_expires
        )
        
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            user_id=user["id"],
            role=user["role"]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
        )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user_data: UserCreate):
    """Register a new user (ADMIN only in production)"""
    try:
        # Check if user already exists
        existing = sql1_db.get_client().table("users").select("*").eq("email", user_data.email).execute()
        
        if existing.data and len(existing.data) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Hash password
        password_hash = get_password_hash(user_data.password)
        
        # Insert user
        insert_data = {
            "name": user_data.name,
            "email": user_data.email,
            "password_hash": password_hash,
            "role": user_data.role.value,
            "rfid_tag": user_data.rfid_tag
        }
        
        response = sql1_db.get_client().table("users").insert(insert_data).execute()
        
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user"
            )
        
        user = response.data[0]
        
        return UserResponse(
            id=user["id"],
            name=user["name"],
            email=user["email"],
            role=user["role"],
            rfid_tag=user.get("rfid_tag"),
            created_at=user["created_at"]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info():
    """Get current authenticated user info"""
    # This will be called with Depends(get_current_user) in production
    # For now, returning a placeholder
    return {
        "id": "placeholder",
        "name": "Current User",
        "email": "user@example.com",
        "role": "ADMIN",
        "rfid_tag": None,
        "created_at": "2025-01-01T00:00:00Z"
    }
