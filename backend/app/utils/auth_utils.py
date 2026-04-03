# backend/app/utils/auth_utils.py
import os
import bcrypt
from datetime import datetime, timedelta
from typing import Union, Any, Optional
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, HTTPAuthorizationCredentials, HTTPBearer
from dotenv import load_dotenv
from sqlalchemy.orm import Session

load_dotenv()

# ============================================================================
# CONFIGURATION
# ============================================================================
SECRET_KEY = os.getenv("SECRET_KEY", "GOVIND_SECRET_KEY_9079")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24)))  # 1 Day

# Define the OAuth2 scheme for token extraction.
# Senior Architect Note: The tokenUrl must match the nested path in main.py.
# App router mounts auth routes at /api/py/auth/*
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/py/auth/login")
optional_bearer = HTTPBearer(auto_error=False)

# ============================================================================
# DATABASE DEPENDENCY (Import here to avoid circular imports)
# ============================================================================
def get_db():
    from database.db import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================================
# PASSWORD HASHING
# ============================================================================
def get_hashed_password(password: str) -> str:
    """
    Converts a plain password into a secure hash using bcrypt.
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(password: str, hashed_pass: str) -> bool:
    """
    Compares a plain password with a hashed password to verify identity.
    """
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed_pass.encode('utf-8'))
    except Exception:
        return False


# ============================================================================
# JWT TOKEN MANAGEMENT
# ============================================================================
def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Generates a JWT Access Token for photographer identification.
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Payload: Storing the User ID in the 'sub' (subject) field
    to_encode = {"exp": expire, "sub": str(subject)}
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[str]:
    """
    Decodes the token and extracts the User ID.
    Used for validating requests in protected routes.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        return user_id
    except JWTError:
        return None


# ============================================================================
# DEPENDENCY INJECTION FOR PROTECTED ROUTES
# ============================================================================
def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    """
    Dependency to protect routes. 
    Verifies the token and returns the current user ID.
    """
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Please login to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer),
) -> str:
    """
    Non-breaking auth guard:
    - no token => anonymous (keeps legacy flows runnable)
    - invalid token => 401
    - valid token => user id
    """
    if credentials is None:
        return "anonymous"
    user_id = verify_token(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Please login to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


# ============================================================================
# ADVANCED: FULL USER OBJECT FROM TOKEN
# ============================================================================
def get_current_user_object(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Returns the full User object from the token.
    Use this when you need user details in protected routes.
    """
    from app.models.user import User
    
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Please login to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def get_current_user_object_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer),
    db: Session = Depends(get_db)
):
    """
    Returns the full User object if authenticated, otherwise returns None.
    """
    from app.models.user import User
    
    if credentials is None:
        return None
    
    user_id = verify_token(credentials.credentials)
    if not user_id:
        return None
    
    user = db.query(User).filter(User.id == int(user_id)).first()
    return user


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================
def get_token_from_header(authorization: Optional[str]) -> Optional[str]:
    """
    Extract token from Authorization header.
    Format: "Bearer <token>"
    """
    if not authorization:
        return None
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    
    return parts[1]