from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from database.db import SessionLocal
from app.models.user import User
from app.utils.auth_utils import get_hashed_password, verify_password, create_access_token

# Senior Architect Fix: Prefix hata diya gaya hai taaki main.py ke saath clash na ho
router = APIRouter(tags=["Authentication"]) 

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password
    if not name or not password:
        raise HTTPException(status_code=400, detail="Name and password are required")

    user = db.query(User).filter(User.email == email).first()
    if user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = User(
        name=name,
        email=email,
        password=get_hashed_password(password)
    )
    db.add(new_user)
    db.commit()
    return {"message": "Account created successfully", "user_id": new_user.id, "name": new_user.name}

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if user is None or not verify_password(form_data.password, user.password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name
    }