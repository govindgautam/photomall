from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os

from database.db import SessionLocal
from app.models.photo import Photo
from app.utils.auth_utils import get_current_user_optional, get_current_user

router = APIRouter(tags=["Downloads"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/original/{photo_id}")
@router.get("/download/original/{photo_id}")  # backward-compatible alias
async def download_original_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    _current_user: str = Depends(get_current_user_optional),
):
    """
    Original (High-Res) photo download karne ke liye secure route.
    Abhi ye open hai, lekin yahan hum 'is_paid' ya 'user_token' ka logic laga sakte hain.
    """
    # 1. Database se photo fetch karo
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # 2. File path verify karo
    file_path = photo.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Original file missing on server")

    # 3. Professional filename (Original name restore karna)
    original_filename = os.path.basename(file_path).split("_", 1)[-1] 

    # 4. Serve the file as a download
    return FileResponse(
        path=file_path, 
        filename=f"GovindPhoto_{original_filename}",
        media_type='image/jpeg'
    )


@router.get("/secure-file")
async def download_secure_file(
    path: str = Query(..., description="Relative file path, e.g. uploads/previews/a.jpg"),
    _current_user: str = Depends(get_current_user),
):
    """
    Secured file serving route for incremental privacy control.
    Existing static /uploads remains for backward compatibility.
    """
    normalized = path.replace("\\", "/").lstrip("/")
    if ".." in normalized:
        raise HTTPException(status_code=400, detail="Invalid file path")
    abs_path = os.path.abspath(normalized)
    uploads_root = os.path.abspath("uploads")
    if not abs_path.startswith(uploads_root):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=abs_path)