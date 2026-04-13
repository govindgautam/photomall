# backend/app/routes/email_routes.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import Optional, List  # ✅ Added List also
import logging

from database.db import SessionLocal
from app.models.event import Event
from app.models.otp import OTP
from app.models.photo import Photo  # ✅ Add this import
from app.utils.email_service import email_service

router = APIRouter(tags=["Email Access"])
logger = logging.getLogger(__name__)

# ==================== Pydantic Models ====================

class SendOTPRequest(BaseModel):
    email: str
    event_id: int

class VerifyOTPRequest(BaseModel):
    email: str
    event_id: int
    otp: str

class OTPResponse(BaseModel):
    success: bool
    message: str
    event_name: Optional[str] = None
    event_id: Optional[int] = None

# ==================== Database Dependency ====================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==================== OTP Endpoints ====================

@router.post("/send-otp", response_model=OTPResponse)
def send_otp(
    request: SendOTPRequest,
    db: Session = Depends(get_db)
):
    """Send OTP to guest email for event access"""
    # Check if event exists
    event = db.query(Event).filter(Event.id == request.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Generate simple OTP
    import random
    otp_code = f"{random.randint(100000, 999999)}"
    
    # Save OTP to database
    expires_at = datetime.now() + timedelta(minutes=10)
    
    new_otp = OTP(
        email=request.email,
        event_id=request.event_id,
        otp_code=otp_code,
        expires_at=expires_at,
        is_used=False
    )
    db.add(new_otp)
    db.commit()
    
    # Return OTP (for testing without email)
    return OTPResponse(
        success=True,
        message=f"✅ OTP: {otp_code} (Valid for 10 minutes)",
        event_name=event.name,
        event_id=event.id
    )

@router.post("/verify-otp", response_model=OTPResponse)
def verify_otp(
    request: VerifyOTPRequest,
    db: Session = Depends(get_db)
):
    """Verify OTP and grant access"""
    # Find valid OTP
    otp_record = db.query(OTP).filter(
        OTP.email == request.email,
        OTP.event_id == request.event_id,
        OTP.otp_code == request.otp,
        OTP.is_used == False,
        OTP.expires_at > datetime.now()
    ).first()
    
    if not otp_record:
        expired_otp = db.query(OTP).filter(
            OTP.email == request.email,
            OTP.event_id == request.event_id,
            OTP.otp_code == request.otp,
            OTP.is_used == False
        ).first()
        
        if expired_otp and expired_otp.expires_at <= datetime.now():
            raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
        
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Mark OTP as used
    otp_record.is_used = True
    db.commit()
    
    # Add email to event's allowed guests
    event = db.query(Event).filter(Event.id == request.event_id).first()
    if event:
        if event.allowed_guests is None:
            event.allowed_guests = []
        
        if request.email not in event.allowed_guests:
            event.allowed_guests.append(request.email)
            db.commit()
    
    return OTPResponse(
        success=True,
        message="OTP verified successfully! You can now access your photos.",
        event_name=event.name if event else None,
        event_id=request.event_id
    )


@router.get("/check-access/{event_id}/{email}")
def check_access(
    event_id: int,
    email: str,
    db: Session = Depends(get_db)
):
    """Check if email has access to event"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        return {"has_access": False, "message": "Event not found"}
    
    has_access = False
    if event.allowed_guests and email in event.allowed_guests:
        has_access = True
    
    if not event.privacy_mode:
        has_access = True
    
    return {
        "has_access": has_access,
        "event_id": event_id,
        "event_name": event.name,
        "photo_count": db.query(Photo).filter(Photo.event_id == event_id).count()
    }
