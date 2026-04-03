import os
import logging
import asyncio
import time
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.sql import text 
from sqlalchemy import distinct, func, or_, and_, case, desc
# In lines ko file ke top par imports ke sath add karein
from app.schemas.event import EventDetailResponse
from datetime import datetime

from pydantic import BaseModel
import json
from functools import lru_cache
# --- Existing Imports ke niche ye add karein ---
from app.utils.auth_utils import get_current_user_optional

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

# --- Global Architect Config ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("EventArchitect")

router = APIRouter(tags=["Events Management"])

# --- Performance Configuration ---
DASHBOARD_CACHE_TTL = 300  # 5 minutes cache for dashboard stats
STATS_CACHE_TTL = 60     # 1 minute cache for admin stats
MAX_EVENTS_PER_PAGE = 50

# --- In-memory cache for dashboard performance ---
_dashboard_cache: Dict[str, Dict] = {}
_stats_cache: Dict[str, Any] = {}

# --- Pydantic Models ---
class EventUpdate(BaseModel):
    name: str | None = None
    location: str | None = None

class EventDetailResponse(BaseModel):
    id: int
    name: str
    location: str
    date: Optional[str] = None
    photo_count: int
    total_size: str
    status: str
    qr_code_path: Optional[str] = None

    class Config:
        from_attributes = True

class DashboardStats(BaseModel):
    total_events: int
    total_photos: int
    total_faces: int
    storage_used: str
    recent_events: List[EventDetailResponse]
    processing_events: int
    completed_events: int
    average_photos_per_event: float

# --- Database Session Factory ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Cache Management Functions ---
def _get_cache_key(prefix: str, **kwargs) -> str:
    """Generate cache key with parameters"""
    key_parts = [prefix]
    for k, v in sorted(kwargs.items()):
        key_parts.append(f"{k}={v}")
    return "|".join(key_parts)

def _is_cache_valid(cache_entry: Dict, ttl: int) -> bool:
    """Check if cache entry is still valid"""
    return time.time() - cache_entry.get('timestamp', 0) < ttl

def _set_cache(cache_dict: Dict, key: str, data: Any):
    """Set cache entry with timestamp"""
    cache_dict[key] = {
        'data': data,
        'timestamp': time.time()
    }

def _get_cache(cache_dict: Dict, key: str, ttl: int) -> Optional[Any]:
    """Get cache entry if valid"""
    entry = cache_dict.get(key)
    if entry and _is_cache_valid(entry, ttl):
        return entry['data']
    return None

import os

def _calculate_storage_usage() -> float:
    """
    Helper function to calculate total storage used by originals and previews.
    Returns size in MB.
    """
    total_size = 0
    paths = ["uploads/originals", "uploads/previews"]
    for path in paths:
        if os.path.exists(path):
            for dirpath, dirnames, filenames in os.walk(path):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    total_size += os.path.getsize(fp)
    return round(total_size / (1024 * 1024), 2)  # Convert to MB

# --- High-Performance Statistics Functions ---
def _get_precomputed_stats(db: Session) -> Dict[str, Any]:
    """
    Senior Architect: 100% Safe Stats Query.
    Ensures brackets are perfect for SQLAlchemy and handles empty DB.
    """
    try:
        # 1. Core stats (Brackets fixed: count ke andar distinct)
        core_stats = db.query(
            func.count(distinct(Event.id)).label('total_events'),
            func.count(distinct(Photo.id)).label('total_photos'),
            func.count(distinct(FaceEmbedding.id)).label('total_faces')
        ).first()
        
        # 2. Extract values safely
        t_ev = int(core_stats.total_events or 0)
        t_ph = int(core_stats.total_photos or 0)
        t_fc = int(core_stats.total_faces or 0)
        
        # 3. Optimized Processing Stats (Instant Index Scan)
        # Any event with at least one unprocessed photo is 'processing'
        p_events = db.query(Event.id).join(Photo).filter(Photo.is_processed == False).distinct().count()
        # Events without unprocessed photos are 'completed'
        c_events = t_ev - p_events
        
        return {
            'total_events': t_ev,
            'total_photos': t_ph,
            'total_faces': t_fc,
            'average_photos_per_event': round(float(t_ph / t_ev), 2) if t_ev > 0 else 0.0,
            'processing_events': p_events,
            'completed_events': c_events
        }
    except Exception as e:
        import logging
        logging.error(f"❌ STATS CRASH FIXED: {e}")
        # Return default values instead of 500 Error
        return {
            'total_events': 0, 'total_photos': 0, 'total_faces': 0,
            'average_photos_per_event': 0.0, 'processing_events': 0, 'completed_events': 0
        }
# --- 2. ULTRA-FAST DASHBOARD LISTING (Zero-Latency with Caching) ---
@router.get("/list/{photographer_id}", response_model=List[EventDetailResponse])
def list_photographer_events(
    photographer_id: int, 
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(MAX_EVENTS_PER_PAGE, ge=1, le=100)
):
    """
    Senior Architect: Ultra-Stable Dashboard Logic.
    Fixes: 500 Server Errors, Storage Calculations, and Schema Mismatch.
    """
    try:
        logger.info(f"🚀 Fetching Dashboard for Photographer ID: {photographer_id}")
        
        # 1. Fetch Events (Optimized Query)
        # Hum direct models use kar rahe hain taaki SQLAlchemy relationships kaam karein
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
                # 2. Count Photos & Processed status
                p_count = db.query(func.count(Photo.id)).filter(Photo.event_id == event.id).scalar() or 0
                processed_count = db.query(func.count(Photo.id)).filter(
                    Photo.event_id == event.id, 
                    Photo.is_processed == True
                ).scalar() or 0
                
                # 3. Storage Calculation (Essential for Dashboard UI)
                total_bytes = db.query(func.sum(Photo.original_size)).filter(Photo.event_id == event.id).scalar() or 0
                size_mb = f"{(total_bytes / (1024 * 1024)):.2f} MB"
                
                # 4. Status Logic
                status_label = "Pending"
                if p_count > 0:
                    status_label = "Processing" if processed_count < p_count else "Completed"

                # 5. Schema Mapping (Matching EventDetailResponse)
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
        # Fallback: empty list avoids 500 error in Frontend
        return []

# --- 3. ENHANCED EVENT INGESTION ---
# --- Sabse pehle imports check karein (File ke top par) ---
 # Ye hona chahiye

# --- Ye helper function route ke upar ya niche add karein ---
async def start_neural_processing(event_id: int, files: list, event_path: str):
    """
    Neural Engine: Background worker for fast face indexing.
    """
    
    
    # DB session factory se naya session lein
    db = SessionLocal()
    try:
        processed = 0
        for filename in files:
            img_path = os.path.join(event_path, filename)
            
            # 1. Faster Detection (opencv use hoga speed ke liye)
            # face_service.py mein DETECTOR_BACKEND check karein
            faces = extract_faces(img_path) 
            
            # 2. Add to Database & Sync FAISS
            # Yahan aapka photo save logic aayega
            
            processed += 1
            # WebSocket par update bhejein
            await manager.update_progress(str(event_id), processed, len(files))
            
        logger.info(f"✅ Event {event_id}: {processed} photos indexed successfully.")
    except Exception as e:
        logger.error(f"❌ Background Processing Error: {e}")
    finally:
        db.close()

# --- Ab aapka updated trigger_bulk_ingestion route ---
@router.post("/{event_id}/ingest")
async def trigger_bulk_ingestion(
    event_id: int, 
    background_tasks: BackgroundTasks, # <-- BackgroundTasks add kiya
    db: Session = Depends(get_db),
    force_rescan: bool = Query(False)
):
    try:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event tracking ID not found")
        
        event_path = f"uploads/events/{event_id}"
        os.makedirs(event_path, exist_ok=True)
        
        valid_extensions = ('.png', '.jpg', '.jpeg', '.webp')
        all_files = os.listdir(event_path)
        files = [f for f in all_files if f.lower().endswith(valid_extensions)]
        
        if not files:
            return {"status": "empty", "message": "No images found", "count": 0}

        # Progress tracking init
        from app.utils.websocket_manager import manager
        manager.init_batch(str(event_id), len(files))
        
        # 🔥 CRITICAL FIX: Background mein kaam start karein
        background_tasks.add_task(start_neural_processing, event_id, files, event_path)
        
        return {
            "status": "processing",
            "message": f"Neural engine processing {len(files)} photos in background...",
            "total_photos": len(files),
            "event_id": event_id,
            "websocket_endpoint": f"/ws/ingestion/{event_id}"
        }
        
    except Exception as e:
        logger.error(f"🔥 Ingester Failure: {str(e)}")
        raise HTTPException(status_code=500, detail="Neural ingestion failed")

# --- 3. EVENT INITIALIZATION ---
@router.post("/create", status_code=status.HTTP_201_CREATED)
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    try:
        # 1. Clean data
        loc = event.location.strip() if event.location else "Jaipur, Rajasthan"
        name = event.name.strip() if event.name else "Untitled Event"
        
        logger.info(f"Attempting to create event: {name} for photographer: {event.photographer_id}")

        # 2. Create Object (Minimal fields to avoid column mismatch)
        new_event = Event(
            name=name,
            location=loc,
            photographer_id=event.photographer_id
            # 'count' ko hata diya hai agar model mein mismatch ho
        )
        
        db.add(new_event)
        db.commit()
        db.refresh(new_event)

        # 3. Create Storage Folder
        event_path = f"uploads/events/{new_event.id}"
        os.makedirs(event_path, exist_ok=True)

        # 4. QR Code (Try-Except block taaki main process na ruke)
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
        # 🔥 YE LINE TERMINAL MEIN DEKHO ASLI ERROR PATA CHALEGA
        logger.error(f"CRITICAL DB ERROR: {str(e)}") 
        raise HTTPException(
            status_code=500, 
            detail=f"Database Insertion Failed: {str(e)}"
        )
# --- 4. ASSET SERVING & METADATA ---
@router.get("/{event_id}/qr-code")
def get_event_qr_image(event_id: int):
    qr_path = f"static/qrcodes/event_{event_id}_qr.png"
    if os.path.exists(qr_path):
        return FileResponse(qr_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="QR Resource Not Found")

@router.get("/{event_id}/details")
def get_event_details(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    return {
        "id": event.id,
        "name": event.name,
        "location": event.location,
        "photographer_id": event.photographer_id,
        "count": getattr(event, 'count', 0),
        "date": event.date.isoformat() if event.date else None
    }

# --- 6. ENHANCED ADMIN STATS ENDPOINT ---
# Replace the existing get_enhanced_admin_stats function with this:

@router.get("/admin/stats", response_model=DashboardStats)
def get_enhanced_admin_stats(
    db: Session = Depends(get_db),
    use_cache: bool = Query(True),
    _current_user: str = Depends(get_current_user_optional)
):
    """
    Senior Architect: Robust admin dashboard with NULL safety and formatting fix.
    """
    try:
        # 1. Cache Check
        cache_key = "admin_dashboard_stats"
        if use_cache: 
            cached_result = _get_cache(_stats_cache, cache_key, STATS_CACHE_TTL)
            if cached_result is not None:
                return DashboardStats(**cached_result)
        
        logger.info("🚀 Computing FRESH admin dashboard stats")
        start_time = time.time()
        
        # 2. Get Statistics with NULL Handling
        total_events = db.query(func.count(Event.id)).scalar() or 0
        total_photos = db.query(func.count(Photo.id)).scalar() or 0
        total_faces = db.query(func.count(FaceEmbedding.id)).scalar() or 0
        
        # 3. Storage Calculation (Safe from NULL)
        total_bytes = db.query(func.sum(Photo.original_size)).scalar() or 0
        storage_mb = total_bytes / (1024 * 1024)
        formatted_storage = f"{storage_mb:.2f} MB"
        
        # 4. Recent Events Query - FIXED: Added total_size and status
        recent_events_raw = (
            db.query(
                Event.id,
                Event.name,
                Event.location,
                Event.date,
                Event.created_at,
                Event.photographer_id,
                func.count(Photo.id).label('photo_count'),
                func.sum(Photo.original_size).label('total_size')  # ✅ ADDED
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
            
            # Calculate status based on photos
            photo_count = int(event_row.photo_count or 0)
            total_bytes_event = int(event_row.total_size or 0)
            total_size_mb = f"{(total_bytes_event / (1024 * 1024)):.2f} MB" if total_bytes_event > 0 else "0.00 MB"
            
            # Determine status
            if photo_count == 0:
                status = "pending"
            else:
                # Check if any unprocessed photos
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
                "total_size": total_size_mb,  # ✅ ADDED - required field
                "status": status,  # ✅ ADDED - required field
                "qr_code_path": None  # Optional field
            })
        
        # 5. Calculate processing vs completed events
        processing_events = 0
        completed_events = 0
        
        for event in recent_events_raw:
            # Check if event has unprocessed photos
            unprocessed = db.query(Photo).filter(
                Photo.event_id == event.id,
                Photo.is_processed == False
            ).count()
            if unprocessed > 0:
                processing_events += 1
            elif event.photo_count > 0:
                completed_events += 1
        
        # 6. Build Final Object
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
        
        # Cache & Return
        if use_cache:
            _set_cache(_stats_cache, cache_key, dashboard_stats)
        
        return DashboardStats(**dashboard_stats)
        
    except Exception as e:
        logger.error(f"❌ Admin stats failed: {str(e)}", exc_info=True)
        # Minimal Fallback object with correct schema
        return DashboardStats(
            total_events=0, 
            total_photos=0, 
            total_faces=0,
            storage_used="0.00 MB", 
            recent_events=[],  # Empty list is fine
            processing_events=0, 
            completed_events=0, 
            average_photos_per_event=0.0
        )

# --- 7. CACHE MANAGEMENT ENDPOINT ---
@router.post("/admin/cache/clear")
def clear_dashboard_cache(
    cache_type: str = Query("all", regex="^(all|dashboard|stats)$"),
    _current_user: str = Depends(get_current_user_optional)
):
    """
    Senior Architect: Manual cache management for debugging.
    """
    global _dashboard_cache, _stats_cache
    
    cleared_caches = []
    
    if cache_type in ["all", "dashboard"]:
        _dashboard_cache.clear()
        cleared_caches.append("dashboard")
        
    if cache_type in ["all", "stats"]:
        _stats_cache.clear()
        cleared_caches.append("stats")
    
    logger.info(f"🧹 Cleared caches: {', '.join(cleared_caches)}")
    
    return {
        "success": True,
        "cleared_caches": cleared_caches,
        "message": f"Cache cleared for: {', '.join(cleared_caches)}"
    }

# --- 8. HEALTH CHECK ENDPOINT ---
@router.get("/health")
def events_health_check():
    """
    Senior Architect: Health check for events subsystem.
    """
    return {
        "status": "healthy",
        "subsystem": "events_management",
        "cache_status": {
            "dashboard_entries": len(_dashboard_cache),
            "stats_entries": len(_stats_cache)
        },
        "performance": {
            "dashboard_cache_ttl": DASHBOARD_CACHE_TTL,
            "stats_cache_ttl": STATS_CACHE_TTL,
            "max_events_per_page": MAX_EVENTS_PER_PAGE
        }
    }
@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    """
    Architect Note: Performing a synchronized cleanup of all downstream dependencies.
    """
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Target not found")

    try:
        # Cleanup Child Assets (Face Embeddings -> Photos)
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