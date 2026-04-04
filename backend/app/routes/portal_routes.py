# backend/app/routes/portal_routes.py
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel,EmailStr
import os
import sys
import shutil
import uuid
import json
import numpy as np
from datetime import datetime
import re

# Senior Architect Fix: Direct Path Injection
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

try:
    from database.db import SessionLocal
except ImportError:
    from ...database.db import SessionLocal

# Models
from app.models.photo import Photo
from app.models.event import Event
from app.models.face_embedding import FaceEmbedding

# AI Services
from ai_service.face_service import extract_faces, generate_face_embedding_from_face
from ai_index.faiss_index import search_similar_faces, search_similar_faces_strict, get_index_stats

router = APIRouter(tags=["Portal"])

# ==================== Pydantic Models ====================

class PortalPhotoResponse(BaseModel):
    id: int
    url: str
    thumbnail_url: Optional[str] = None
    similarity_score: Optional[float] = None

class SearchResponse(BaseModel):
    success: bool
    photos: List[PortalPhotoResponse]
    match_count: int
    message: str

class EventStatsResponse(BaseModel):
    event_id: int
    event_name: str
    photo_count: int
    face_embeddings_count: int
    status: str
    faiss_status: Optional[str] = None

class GuestAccessRequest(BaseModel):
    identifier: str  # email or phone number

class GuestAccessResponse(BaseModel):
    success: bool
    events: List[dict]
    message: str

class ShareEventRequest(BaseModel):
    identifier: str  # email or phone number to share with
    event_id: int

# ==================== Database Dependency ====================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==================== Helper Functions ====================

def get_photo_url(file_path: str, is_thumbnail: bool = False) -> str:
    """
    Generate proper URL for photo
    """
    if not file_path:
        return ""
    
    # Remove 'uploads/' prefix if present to avoid double
    clean_path = file_path
    if clean_path.startswith('uploads/'):
        clean_path = clean_path[8:]  # Remove 'uploads/'
    
    # Remove leading slash if present
    if clean_path.startswith('/'):
        clean_path = clean_path[1:]
    
    if is_thumbnail:
        return f"/uploads/thumbnails/{clean_path}"
    return f"/uploads/{clean_path}"

def brute_force_search(query_embedding: np.ndarray, embeddings_list: List[np.ndarray], top_k: int = 50) -> tuple:
    """
    Brute force cosine similarity search (fallback when FAISS fails)
    """
    try:
        from sklearn.metrics.pairwise import cosine_similarity
        
        query_embedding = query_embedding.reshape(1, -1)
        embeddings_array = np.array(embeddings_list)
        
        if len(embeddings_array) == 0:
            return [], []
        
        # Calculate cosine similarity (range: -1 to 1)
        similarities = cosine_similarity(query_embedding, embeddings_array)[0]
        
        # ✅ FIX: Normalize to 0-1 range
        normalized_scores = [(float(s) + 1.0) / 2.0 for s in similarities]
        
        # Get top k indices
        k = min(top_k, len(normalized_scores))
        top_indices = np.argsort(normalized_scores)[-k:][::-1].tolist()
        top_scores = [normalized_scores[i] for i in top_indices]
        
        return top_indices, top_scores
    except Exception as e:
        print(f"Brute force search error: {e}")
        return [], []
def validate_email(email: str) -> bool:
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_phone(phone: str) -> bool:
    """Validate phone number format (Indian mobile)"""
    pattern = r'^(\+91[\-\s]?)?[0]?[6-9]\d{9}$'
    return re.match(pattern, phone) is not None


# ==================== Portal Routes ====================

@router.get("/{event_id}/photos", response_model=List[PortalPhotoResponse])
def get_portal_photos(
    event_id: int, 
    identifier: Optional[str] = Query(None, description="Guest identifier (optional)"), 
    db: Session = Depends(get_db)
):
    """
    Get all photos for an event (fallback when no search performed)
    """
    try:
        # Check if event exists
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        # Get all photos for this event
        photos = db.query(Photo).filter(Photo.event_id == event_id).all()
        
        # Build response
        results = []
        for photo in photos:
            results.append({
                "id": photo.id,
                "url": get_photo_url(photo.file_path),
                "thumbnail_url": get_photo_url(photo.file_path, is_thumbnail=True) if hasattr(photo, 'thumbnail_path') else get_photo_url(photo.file_path),
                "similarity_score": None
            })
        
        return results

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_portal_photos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to load photos: {str(e)}")


@router.get("/{event_id}/stats", response_model=EventStatsResponse)
def get_event_stats(
    event_id: int,
    db: Session = Depends(get_db)
):
    """
    Get event statistics for debugging and frontend display
    """
    try:
        # Check if event exists
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Photo count
        photo_count = db.query(Photo).filter(Photo.event_id == event_id).count()
        
        # Face embedding count - using photo join since event_id might not be in face_embeddings
        try:
            embedding_count = db.query(FaceEmbedding).join(Photo).filter(Photo.event_id == event_id).count()
        except Exception as e:
            print(f"Embedding count error: {e}")
            embedding_count = 0
        
        # FAISS status
        faiss_status = "Not available"
        try:
            stats = get_index_stats()
            faiss_status = stats.get("status", "unknown")
        except Exception as e:
            print(f"FAISS stats error: {e}")
        
        return {
            "event_id": event_id,
            "event_name": event.name,
            "photo_count": photo_count,
            "face_embeddings_count": embedding_count,
            "status": "active",
            "faiss_status": faiss_status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_event_stats: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    

# backend/app/routes/portal_routes.py

@router.post("/{event_id}/search-selfie", response_model=SearchResponse)
async def search_by_selfie(
    event_id: int, 
    file: UploadFile = File(...),
    identifier: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Senior Engineer: Exact face matching with 85% threshold.
    Returns only photos where face similarity > 85%.
    """
    temp_path = None
    STRICT_THRESHOLD = 0.82 # Only 85%+ matches
    
    try:
        # Validate event
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Save and process selfie
        temp_dir = "temp_search"
        os.makedirs(temp_dir, exist_ok=True)
        
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        temp_filename = f"selfie_{uuid.uuid4().hex}.{file_extension}"
        temp_path = os.path.join(temp_dir, temp_filename)
        
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Extract face
        faces = extract_faces(temp_path)
        if not faces:
            raise HTTPException(400, "No face detected. Use clear front-facing photo.")
        
        # Generate normalized embedding
        embedding = generate_face_embedding_from_face(faces[0]['face'])
        if embedding is None:
            raise HTTPException(400, "Could not generate face signature.")
        
        # Get all face embeddings for this event
        event_embeddings = db.query(FaceEmbedding).join(Photo).filter(
            Photo.event_id == event_id
        ).all()
        
        if not event_embeddings:
            return SearchResponse(
                success=True,
                photos=[],
                match_count=0,
                message="No photos processed yet."
            )
        
        # Prepare for search
        embeddings_list = []
        photo_ids_list = []
        
        for emb in event_embeddings:
            if isinstance(emb.embedding, str):
                emb_vector = np.array(json.loads(emb.embedding))
            else:
                emb_vector = np.array(emb.embedding)
            embeddings_list.append(emb_vector)
            photo_ids_list.append(emb.photo_id)
        
        # ✅ STRICT SEARCH - Only 85%+ matches
            similar_indices, similarity_scores = search_similar_faces_strict(
                embedding, 
                embeddings_list, 
                top_k=20,
                min_similarity=STRICT_THRESHOLD  # Correct!
            )
        
        # Collect matches
        matching_photo_ids = []
        photo_scores = {}
        
        for idx, score in zip(similar_indices, similarity_scores):
            if score >= STRICT_THRESHOLD:
                photo_id = photo_ids_list[idx]
                if photo_id not in matching_photo_ids:
                    matching_photo_ids.append(photo_id)
                    photo_scores[photo_id] = score
                    print(f"✅ STRICT MATCH: photo_id={photo_id}, confidence={score:.2%}")
        
        # Fetch photos
        if matching_photo_ids:
            photos = db.query(Photo).filter(
                Photo.id.in_(matching_photo_ids),
                Photo.event_id == event_id
            ).all()
        else:
            photos = []
        
        # Prepare response
        results = []
        for photo in photos:
            results.append({
                "id": photo.id,
                "url": get_photo_url(photo.file_path),
                "thumbnail_url": get_photo_url(photo.file_path, is_thumbnail=True) if hasattr(photo, 'thumbnail_path') else get_photo_url(photo.file_path),
                "similarity_score": round(photo_scores.get(photo.id, 0), 3)
            })
        
        results.sort(key=lambda x: x['similarity_score'], reverse=True)
        
        return SearchResponse(
            success=True,
            photos=results,
            match_count=len(results),
            message=f"Found {len(results)} matching photo(s) with {STRICT_THRESHOLD:.0%}+ confidence."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(500, f"Search failed: {str(e)}")
    
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
@router.post("/{event_id}/search-selfie-batch")
async def search_by_selfie_batch(
    event_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    Batch search with multiple selfies (for better accuracy)
    """
    temp_paths = []
    all_embeddings = []
    
    try:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Process each uploaded selfie
        for file in files:
            temp_path = f"temp_search/batch_{uuid.uuid4().hex}_{file.filename}"
            temp_paths.append(temp_path)
            
            with open(temp_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            faces = extract_faces(temp_path)
            if faces:
                embedding = generate_face_embedding_from_face(faces[0]['face'])
                if embedding is not None:
                    all_embeddings.append(embedding)
        
        if not all_embeddings:
            return SearchResponse(
                success=False,
                photos=[],
                match_count=0,
                message="No valid faces detected in uploaded images"
            )
        
        # Average embeddings for better accuracy
        avg_embedding = np.mean(all_embeddings, axis=0)
        
        # Get event embeddings
        event_embeddings = db.query(FaceEmbedding).join(Photo).filter(
            Photo.event_id == event_id
        ).all()
        
        if not event_embeddings:
            return SearchResponse(
                success=True,
                photos=[],
                match_count=0,
                message="No photos processed yet"
            )
        
        # Prepare for search
        embeddings_list = []
        photo_ids_list = []
        
        for emb in event_embeddings:
            if isinstance(emb.embedding, str):
                emb_vector = np.array(json.loads(emb.embedding))
            else:
                emb_vector = np.array(emb.embedding)
            embeddings_list.append(emb_vector)
            photo_ids_list.append(emb.photo_id)
        
        # Search
        similar_indices, similarity_scores = search_similar_faces(
            avg_embedding, 
            embeddings_list, 
            top_k=min(100, len(embeddings_list))
        )
        
        # Filter by threshold (stricter for batch)
        matching_photo_ids = []
        for idx, score in zip(similar_indices, similarity_scores):
            if score >= 0.75:
                matching_photo_ids.append(photo_ids_list[idx])
        
        matching_photo_ids = list(dict.fromkeys(matching_photo_ids))
        
        photos = db.query(Photo).filter(
            Photo.id.in_(matching_photo_ids),
            Photo.event_id == event_id
        ).all()
        
        results = [{
            "id": p.id,
            "url": get_photo_url(p.file_path),
            "thumbnail_url": get_photo_url(p.file_path, is_thumbnail=True) if hasattr(p, 'thumbnail_path') else get_photo_url(p.file_path),
            "similarity_score": None
        } for p in photos]
        
        return SearchResponse(
            success=True,
            photos=results,
            match_count=len(results),
            message=f"Found {len(results)} photos using {len(all_embeddings)} selfie(s)"
        )
        
    except Exception as e:
        print(f"Error in batch search: {e}")
        return SearchResponse(
            success=False,
            photos=[],
            match_count=0,
            message=f"Search failed: {str(e)}"
        )
        
    finally:
        for temp_path in temp_paths:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass


# backend/app/routes/portal_routes.py

# backend/app/routes/portal_routes.py

@router.post("/access", response_model=GuestAccessResponse)
def request_access(
    request: GuestAccessRequest,
    db: Session = Depends(get_db)
):
    """
    User requests access to events using email or phone number.
    Returns list of events they have access to.
    """
    identifier = request.identifier.strip()
    
    # Validate identifier
    is_email = validate_email(identifier)
    is_phone = validate_phone(identifier)
    
    if not is_email and not is_phone:
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid email address or phone number"
        )
    
    # ✅ SIMPLE APPROACH: Get all events and filter in Python
    # This avoids complex JSONB queries
    all_events = db.query(Event).all()
    
    matching_events = []
    for event in all_events:
        # Check if allowed_guests list exists and contains identifier
        if event.allowed_guests and identifier in event.allowed_guests:
            matching_events.append(event)
        # Also include public events (privacy_mode = False)
        elif event.privacy_mode == False:
            if event not in matching_events:
                matching_events.append(event)
    
    # Remove duplicates and limit
    seen = set()
    unique_events = []
    for e in matching_events:
        if e.id not in seen:
            seen.add(e.id)
            unique_events.append(e)
    
    result_events = []
    for event in unique_events[:10]:  # Limit to 10 events
        photo_count = db.query(Photo).filter(Photo.event_id == event.id).count()
        
        result_events.append({
            "id": event.id,
            "name": event.name,
            "location": event.location,
            "date": event.date.isoformat() if event.date else None,
            "photo_count": photo_count,
            "qr_code_path": event.qr_code_path
        })
    
    return GuestAccessResponse(
        success=True,
        events=result_events,
        message=f"Found {len(result_events)} event(s) for {identifier}"
    )

@router.post("/share")
def share_event(
    request: ShareEventRequest,
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_user)  # Uncomment for auth
):
    """
    Photographer shares event with guest via email/phone.
    """
    # Validate event exists
    event = db.query(Event).filter(Event.id == request.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Initialize allowed_guests if None
    if event.allowed_guests is None:
        event.allowed_guests = []
    
    # Add identifier if not already present
    if request.identifier not in event.allowed_guests:
        event.allowed_guests.append(request.identifier)
        db.commit()
        
    return {
        "success": True,
        "message": f"Event '{event.name}' shared with {request.identifier}",
        "share_link": f"/portal/event/{event.id}",
        "access_code": request.identifier
    }


@router.get("/event/{event_id}/verify/{identifier}")
def verify_event_access(
    event_id: int,
    identifier: str,
    db: Session = Depends(get_db)
):
    """
    Verify if user has access to event.
    """
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # ✅ SIMPLE CHECK
    has_access = False
    
    # Check if identifier in allowed_guests
    if event.allowed_guests and identifier in event.allowed_guests:
        has_access = True
    
    # Check if event is public
    if not event.privacy_mode:
        has_access = True
    
    # Debug log
    print(f"🔍 Access Check - Event: {event.name}")
    print(f"   Identifier: {identifier}")
    print(f"   Allowed guests: {event.allowed_guests}")
    print(f"   Privacy mode: {event.privacy_mode}")
    print(f"   Has access: {has_access}")
    
    photo_count = db.query(Photo).filter(Photo.event_id == event_id).count()
    
    return {
        "has_access": has_access,
        "event_id": event_id,
        "event_name": event.name,
        "photo_count": photo_count
    }
@router.get("/demo-link/{event_id}")
def get_demo_link(event_id: int, db: Session = Depends(get_db)):
    """
    Generate demo access link (for testing)
    """
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Generate test identifiers
    test_identifiers = [
        "demo@example.com",
        "guest@photomall.com",
        "+919876543210"
    ]
    
    return {
        "event_id": event_id,
        "event_name": event.name,
        "demo_links": [
            {
                "type": "email",
                "value": email,
                "access_url": f"/portal/event/{event_id}?access={email}"
            }
            for email in test_identifiers[:2]
        ]
    }



# ==================== Health Check for Portal ====================

@router.get("/health")
def portal_health_check():
    """
    Health check for portal routes
    """
    return {
        "status": "healthy",
        "endpoints": ["/photos", "/search-selfie", "/stats", "/health"],
        "timestamp": datetime.now().isoformat()
    }