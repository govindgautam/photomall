# backend/app/routes/user_routes.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database.db import SessionLocal
from app.models.user import User
from app.utils.auth_utils import get_current_user

router = APIRouter(tags=["User Settings"])

class SMTPSettings(BaseModel):
    email: str
    smtp_password: str
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/smtp-settings")
def get_smtp_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's email settings"""
    return {
        "email": current_user.email or "",
        "smtp_server": current_user.smtp_server or "smtp.gmail.com",
        "smtp_port": current_user.smtp_port or 587
    }

@router.post("/smtp-settings")
def save_smtp_settings(
    settings: SMTPSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save user's email settings"""
    current_user.email = settings.email
    current_user.smtp_password = settings.smtp_password
    current_user.smtp_server = settings.smtp_server
    current_user.smtp_port = settings.smtp_port
    
    db.commit()
    
    return {
        "success": True,
        "message": "Email settings saved successfully"
    }