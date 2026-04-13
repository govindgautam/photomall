import os
import logging
import asyncio
import time
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.sql import text 
from sqlalchemy import distinct, func, or_, and_, case, desc
from app.schemas.event import EventDetailResponse
from datetime import datetime

from pydantic import BaseModel
import json
from functools import lru_cache
from app.utils.auth_utils import get_current_user_optional
import shutil
import httpx

# --- Local Imports ---
from database.db import SessionLocal
from app.models.event import Event
from app.models.photo import Photo
from app.models.face_embedding import FaceEmbedding
from app.models.user import User
from app.schemas.event import EventCreate
from app.utils.qr_generator import generate_event_qr
from ai_service.face_service import extract_faces, generate_face_embedding_from_face
from app.utils.websocket_manager import manager
from ai_service.tagging_complete_trigger import on_tagging_progress
from app.services.email_notification import email_notification_service

# --- Global Architect Config ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("EventArchitect")

router = APIRouter(tags=["Events Management"])

# --- Performance Configuration ---
DASHBOARD_CACHE_TTL = 300
STATS_CACHE_TTL = 60
MAX_EVENTS_PER_PAGE = 50

# --- In-memory cache ---
_dashboard_cache: Dict[str, Dict] = {}
_stats_cache: Dict[str, Any] = {}

# --- Pydantic Models ---
class EventUpdate(BaseModel):
    name: str | None = None
    location: str | None = None

class DashboardStats(BaseModel):
    total_events: int
    total_photos: int
    total_faces: int
    storage_used: str
    recent_events: List[EventDetailResponse]
    processing_events: int
    completed_events: int
    average_photos_per_event: float

# --- Helper function to get subscribers ---
async def get_event_subscribers(event_id: int) -> List[str]:
    """Get all subscribed guests for an event from Neon database"""
    db = SessionLocal()
    try:
        from app.models.event_subscriber import EventSubscriber
        subscribers = db.query(EventSubscriber.guest_email).filter(
            EventSubscriber.event_id == event_id,
            EventSubscriber.is_active == True
        ).all()
        return [s[0] for s in subscribers]
    except Exception as e:
        print(f"Error getting subscribers: {e}")
        return []
    finally:
        db.close()
# --- Database Session Factory ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Cache Management Functions ---
def _get_cache_key(prefix: str, **kwargs) -> str:
    key_parts = [prefix]
    for k, v in sorted(kwargs.items()):
        key_parts.append(f"{k}={v}")
    return "|".join(key_parts)

def _is_cache_valid(cache_entry: Dict, ttl: int) -> bool:
    return time.time() - cache_entry.get('timestamp', 0) < ttl

def _set_cache(cache_dict: Dict, key: str, data: Any):
    cache_dict[key] = {'data': data, 'timestamp': time.time()}

def _get_cache(cache_dict: Dict, key: str, ttl: int) -> Optional[Any]:
    entry = cache_dict.get(key)
    if entry and _is_cache_valid(entry, ttl):
        return entry['data']
    return None

def _calculate_storage_usage() -> float:
    total_size = 0
    paths = ["uploads/originals", "uploads/previews"]
    for path in paths:
        if os.path.exists(path):
            for dirpath, dirnames, filenames in os.walk(path):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    total_size += os.path.getsize(fp)
    return round(total_size / (1024 * 1024), 2)

# ==================== UPLOAD ENDPOINT WITH EMAIL TRIGGER ====================

@router.post("/{event_id}/upload")
async def upload_photos(
    event_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload multiple photos to an event
    """
    try:
        # Check if event exists
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Create upload directory
        upload_dir = f"uploads/events/{event_id}"
        os.makedirs(upload_dir, exist_ok=True)
        
        uploaded_count = 0
        uploaded_files = []
        
        for file in files:
            # Validate file type
            if not file.content_type.startswith('image/'):
                continue
            
            # Generate unique filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{timestamp}_{file.filename}"
            file_path = os.path.join(upload_dir, filename)
            
            # Save file
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Create photo record in database
            photo = Photo(
                event_id=event_id,
                file_path=file_path,
                original_size=os.path.getsize(file_path),
                is_processed=False
            )
            db.add(photo)
            
            uploaded_count += 1
            uploaded_files.append(filename)
            
            # Close file
            await file.close()
        
        # Commit all photos to database
        db.commit()
        
        # ✅ SEND EMAIL IMMEDIATELY AFTER UPLOAD
        try:
            from app.services.email_notification import email_notification_service
            
            # Send to admin
            await email_notification_service.notify_admin(
                admin_email="govindgautam9079077974@gmail.com",
                event_name=event.name,
                event_id=event_id,
                photo_count=uploaded_count,
                face_count=0
            )
            print(f"✅ Admin email sent for event {event_id}")
            
            # Send to subscribed guests
            subscribers = await get_event_subscribers(event_id)
            if subscribers:
                await email_notification_service.notify_multiple_guests(
                    guest_emails=subscribers,
                    event_name=event.name,
                    event_id=event_id
                )
                print(f"✅ Guest emails sent to {len(subscribers)} subscribers")
            
        except Exception as e:
            print(f"❌ Email error: {e}")
        
        return {
            "success": True,
            "uploaded_count": uploaded_count,
            "files": uploaded_files,
            "message": f"Successfully uploaded {uploaded_count} photos"
        }
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ==================== BACKGROUND PROCESSING ====================

async def process_photos_background(event_id: int, files: List[str], upload_dir: str):
    """
    Background task to process uploaded photos for face detection
    """
    db = SessionLocal()
    try:
        processed = 0
        total = len(files)
        
        for filename in files:
            file_path = os.path.join(upload_dir, filename)
            
            # Update photo record
            photo = db.query(Photo).filter(Photo.file_path == file_path).first()
            if photo:
                photo.is_processed = True
                db.commit()
            
            processed += 1
            await manager.update_progress(str(event_id), processed, total)
            
            # Extract faces if needed (optional)
            try:
                faces = extract_faces(file_path)
                # Here you can add face embedding generation logic
            except Exception as face_err:
                logger.error(f"Face extraction error for {filename}: {face_err}")
        
        logger.info(f"✅ Event {event_id}: {processed} photos processed successfully")
        
    except Exception as e:
        logger.error(f"Background processing error: {e}")
    finally:
        db.close()

# ==================== EXISTING ENDPOINTS ====================

@router.get("/list/{photographer_id}", response_model=List[EventDetailResponse])
def list_photographer_events(
    photographer_id: int, 
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(MAX_EVENTS_PER_PAGE, ge=1, le=100)
):
    try:
        logger.info(f"🚀 Fetching Dashboard for Photographer ID: {photographer_id}")
        
        events = (
            db.query(Event)
            .filter(Event.photographer_id == photographer_id)
            .order_by(desc(Event.id))
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )

        if not events:
            logger.info(f"ℹ️ No events found for photographer {photographer_id}")
            return []

        event_payload = []
        
        for event in events:
            try:
                p_count = db.query(func.count(Photo.id)).filter(Photo.event_id == event.id).scalar() or 0
                processed_count = db.query(func.count(Photo.id)).filter(
                    Photo.event_id == event.id, 
                    Photo.is_processed == True
                ).scalar() or 0
                
                total_bytes = db.query(func.sum(Photo.original_size)).filter(Photo.event_id == event.id).scalar() or 0
                size_mb = f"{(total_bytes / (1024 * 1024)):.2f} MB"
                
                status_label = "Pending"
                if p_count > 0:
                    status_label = "Processing" if processed_count < p_count else "Completed"

                event_data = {
                    "id": event.id,
                    "name": event.name or "Untitled Event",
                    "location": event.location or "Standard Site",
                    "date": event.date.isoformat() if event.date and hasattr(event.date, 'isoformat') else None,
                    "photo_count": int(p_count),
                    "total_size": size_mb,
                    "status": status_label,
                    "qr_code_path": event.qr_code_path
                }
                
                event_payload.append(event_data)
                
            except Exception as row_error:
                logger.error(f"⚠️ Skipping row due to error: {row_error}")
                continue

        logger.info(f"✅ Dashboard ready with {len(event_payload)} events")
        return event_payload

    except Exception as e:
        logger.error(f"❌ Critical Dashboard Error: {str(e)}", exc_info=True)
        return []


@router.post("/create", status_code=status.HTTP_201_CREATED)
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    try:
        loc = event.location.strip() if event.location else "Jaipur, Rajasthan"
        name = event.name.strip() if event.name else "Untitled Event"
        
        logger.info(f"Attempting to create event: {name} for photographer: {event.photographer_id}")

        new_event = Event(
            name=name,
            location=loc,
            photographer_id=event.photographer_id
        )
        
        db.add(new_event)
        db.commit()
        db.refresh(new_event)

        event_path = f"uploads/events/{new_event.id}"
        os.makedirs(event_path, exist_ok=True)

        try:
            generate_event_qr(new_event.id)
        except Exception as qr_err:
            logger.error(f"QR Error (Non-critical): {qr_err}")

        return {
            "success": True,
            "message": "Resource initialized",
            "data": {"id": new_event.id, "name": new_event.name}
        }

    except Exception as e:
        db.rollback()
        logger.error(f"CRITICAL DB ERROR: {str(e)}") 
        raise HTTPException(
            status_code=500, 
            detail=f"Database Insertion Failed: {str(e)}"
        )


@router.get("/admin/stats", response_model=DashboardStats)
def get_enhanced_admin_stats(
    db: Session = Depends(get_db),
    use_cache: bool = Query(True),
    _current_user: str = Depends(get_current_user_optional)
):
    try:
        cache_key = "admin_dashboard_stats"
        if use_cache: 
            cached_result = _get_cache(_stats_cache, cache_key, STATS_CACHE_TTL)
            if cached_result is not None:
                return DashboardStats(**cached_result)
        
        logger.info("🚀 Computing FRESH admin dashboard stats")
        start_time = time.time()
        
        total_events = db.query(func.count(Event.id)).scalar() or 0
        total_photos = db.query(func.count(Photo.id)).scalar() or 0
        total_faces = db.query(func.count(FaceEmbedding.id)).scalar() or 0
        
        total_bytes = db.query(func.sum(Photo.original_size)).scalar() or 0
        storage_mb = total_bytes / (1024 * 1024)
        formatted_storage = f"{storage_mb:.2f} MB"
        
        recent_events_raw = (
            db.query(
                Event.id,
                Event.name,
                Event.location,
                Event.date,
                Event.created_at,
                Event.photographer_id,
                func.count(Photo.id).label('photo_count'),
                func.sum(Photo.original_size).label('total_size')
            )
            .outerjoin(Photo, Event.id == Photo.event_id)
            .group_by(Event.id)
            .order_by(desc(Event.id))
            .limit(10)
            .all()
        )
        
        recent_events = []
        for event_row in recent_events_raw:
            raw_date = event_row.date or event_row.created_at
            iso_date = raw_date.isoformat() if raw_date and hasattr(raw_date, 'isoformat') else None
            
            photo_count = int(event_row.photo_count or 0)
            total_bytes_event = int(event_row.total_size or 0)
            total_size_mb = f"{(total_bytes_event / (1024 * 1024)):.2f} MB" if total_bytes_event > 0 else "0.00 MB"
            
            if photo_count == 0:
                status = "pending"
            else:
                unprocessed = db.query(Photo).filter(
                    Photo.event_id == event_row.id,
                    Photo.is_processed == False
                ).count()
                status = "processing" if unprocessed > 0 else "completed"
            
            recent_events.append({
                "id": event_row.id,
                "name": event_row.name or "Untitled Event",
                "location": event_row.location or "Standard Site",
                "date": iso_date,
                "photo_count": photo_count,
                "total_size": total_size_mb,
                "status": status,
                "qr_code_path": None
            })
        
        processing_events = 0
        completed_events = 0
        
        for event in recent_events_raw:
            unprocessed = db.query(Photo).filter(
                Photo.event_id == event.id,
                Photo.is_processed == False
            ).count()
            if unprocessed > 0:
                processing_events += 1
            elif event.photo_count > 0:
                completed_events += 1
        
        avg_photos = (total_photos / total_events) if total_events > 0 else 0.0

        dashboard_stats = {
            "total_events": int(total_events),
            "total_photos": int(total_photos),
            "total_faces": int(total_faces),
            "storage_used": formatted_storage,
            "recent_events": recent_events,
            "processing_events": processing_events,
            "completed_events": completed_events,
            "average_photos_per_event": round(float(avg_photos), 2)
        }
        
        if use_cache:
            _set_cache(_stats_cache, cache_key, dashboard_stats)
        
        return DashboardStats(**dashboard_stats)
        
    except Exception as e:
        logger.error(f"❌ Admin stats failed: {str(e)}", exc_info=True)
        return DashboardStats(
            total_events=0, 
            total_photos=0, 
            total_faces=0,
            storage_used="0.00 MB", 
            recent_events=[],
            processing_events=0, 
            completed_events=0, 
            average_photos_per_event=0.0
        )


@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Target not found")

    try:
        photo_ids = [pid for (pid,) in db.query(Photo.id).filter(Photo.event_id == event_id).all()]
        if photo_ids:
            db.query(FaceEmbedding).filter(FaceEmbedding.photo_id.in_(photo_ids)).delete(synchronize_session=False)
            db.query(Photo).filter(Photo.id.in_(photo_ids)).delete(synchronize_session=False)
        
        db.delete(event)
        db.commit()
        logger.info(f"🗑️ Wiped Event {event_id} and all sub-resources.")
        return {"success": True, "message": "Resource and children purged", "id": event_id}
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Deletion Transaction Aborted: {e}")
        raise HTTPException(status_code=500, detail="System failed to purge resource due to constraints")
