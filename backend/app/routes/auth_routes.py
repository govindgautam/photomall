# backend/app/routes/auth_routes.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
import jwt
import os

from database.db import SessionLocal
from app.models.user import User
from app.utils.auth_utils import get_hashed_password, verify_password, create_access_token

# Senior Architect Fix: Prefix hata diya gaya hai taaki main.py ke saath clash na ho
router = APIRouter(tags=["Authentication"])

# ============================================================================
# CONFIGURATION
# ============================================================================
SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-change-this-in-production-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================================
# PYDANTIC MODELS
# ============================================================================
class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    name: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    created_at: datetime


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================
def create_access_token(user_id: int) -> str:
    """Create JWT access token"""
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> int:
    """Decode JWT token and return user_id"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        return int(user_id)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ============================================================================
# AUTH ENDPOINTS
# ============================================================================
@router.post("/signup", response_model=TokenResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    """
    Create new user account
    """
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password
    
    if not name or not password:
        raise HTTPException(status_code=400, detail="Name and password are required")
    
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    # Check if user already exists
    user = db.query(User).filter(User.email == email).first()
    if user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    new_user = User(
        name=name,
        email=email,
        password=get_hashed_password(password),
        role="photographer"  # Default role for new users
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create access token
    access_token = create_access_token(new_user.id)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": new_user.id,
        "name": new_user.name
    }


@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if user is None or not verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=400, 
            detail="Incorrect email or password"  # ✅ String, not object
        )
    
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name
    }

@router.post("/login-json", response_model=TokenResponse)
def login_json(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Login with JSON body (alternative to form data)
    """
    user = db.query(User).filter(User.email == request.email).first()
    if user is None or not verify_password(request.password, user.password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    access_token = create_access_token(user.id)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name
    }


@router.get("/me", response_model=UserResponse)
def get_current_user(
    token: str = Depends(lambda: None),  # Will get from header
    db: Session = Depends(get_db)
):
    """
    Get current user info from token
    """
    # This would normally use Depends(get_current_user) but keeping simple for now
    # For actual implementation, use the auth_utils.get_current_user function
    raise HTTPException(status_code=501, detail="Use get_current_user from auth_utils")


@router.post("/register")
def register(
    request: SignupRequest,
    db: Session = Depends(get_db)
):
    """
    Register new user account (alias for signup but matches requested payload)
    """
    name = request.name.strip()
    email = request.email.strip().lower()
    password = request.password
    
    if not name or not password:
        raise HTTPException(status_code=400, detail="Name and password are required")
        
    # Check if user exists
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = get_hashed_password(password)
    new_user = User(
        name=name,
        email=email,
        password=hashed_password,
        role="photographer"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"success": True, "message": "User registered successfully"}

@router.post("/logout")
def logout():
    """
    Logout endpoint (client-side token removal)
    """
    return {"message": "Logged out successfully"}