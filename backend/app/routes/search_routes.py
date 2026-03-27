import os
import uuid
import shutil
import logging
import asyncio
import tempfile
from typing import Optional, List
from PIL import Image

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form
from sqlalchemy.orm import Session
from sqlalchemy import case

# --- Service & DB Imports ---
from ai_service.face_service import extract_faces, generate_face_embedding_from_face, MATCH_THRESHOLD_DEFAULT
from ai_service.search_identity import search_matching_photos_with_scores
from database.db import SessionLocal
from app.models.photo import Photo
from app.models.event import Event
from app.models.face_embedding import FaceEmbedding
from ai_index import faiss_index

def ensure_index_loaded():
    if faiss_index.index is None or faiss_index.index.ntotal == 0:
        logger.info("[Search] FAISS index is empty! Attempting to load from DB...")
        db = SessionLocal()
        try:
            all_embeddings = db.query(FaceEmbedding).all()
            if all_embeddings:
                faiss_index.add_embeddings_to_index(all_embeddings)
                logger.info(f"[Search] Forced hand-cranked {len(all_embeddings)} embeddings into FAISS.")
        except Exception as e:
            logger.error(f"[Search] Index loading failed during check: {e}")
        finally:
            db.close()

# Senior Architect Fix: Defined tags for clear OpenAPI documentation
router = APIRouter(tags=["AI Face Search"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Keep transient selfie files outside backend source tree to prevent Uvicorn reload loops.
TEMP_SEARCH_FOLDER = os.path.join(tempfile.gettempdir(), "event-photo-finder-search")
os.makedirs(TEMP_SEARCH_FOLDER, exist_ok=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _parse_event_id(event_id_raw: str) -> int:
    """
    Validates and converts event ID to integer. 
    Essential for scope-level filtering in high-concurrency environments.
    """
    try:
        # Strip any accidental quotes or whitespace from frontend
        clean_id = str(event_id_raw).replace('"', '').replace("'", "").strip()
        return int(clean_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="Invalid Event ID format. Please provide a numeric ID.",
        )

@router.post("")
@router.post("/")
async def search_face(
    eventId: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    HIGH-SPEED FACE SEARCH: Detect -> Embedding -> Vector Search -> Event Scoping.
    Senior Architect Fix: Enhanced score normalization to prevent 'Not Present' errors.
    """
    file_path: Optional[str] = None

    try:
        ensure_index_loaded()
        if faiss_index.index:
            logger.info(f"[Search] Total Vectors in RAM: {faiss_index.index.ntotal}")
        else:
            logger.info(f"[Search] Total Vectors in RAM: 0")
        # 1. Basic File & Event Validation
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Please upload an image (JPEG or PNG).",
            )

        event_id_int = _parse_event_id(eventId)
        
        # Verify event existence early
        event = db.query(Event).filter(Event.id == event_id_int).first()
        if not event:
            raise HTTPException(
                status_code=404,
                detail=f"Event ID {event_id_int} not found in database.",
            )

        # 2. Secure & Optimized File Saving
        unique_filename = f"search_{uuid.uuid4().hex}.jpg"
        file_path = os.path.join(TEMP_SEARCH_FOLDER, unique_filename)
        
        try:
            with Image.open(file.file) as img:
                # Orientation fix (Auto-rotate)
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
                
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                
                # Resize for faster AI inference (Standardize to 640px)
                img.thumbnail((800, 800), Image.Resampling.LANCZOS)
                img.save(file_path, "JPEG", quality=90, optimize=True)
        except Exception as img_err:
            logger.error(f"[Search] PIL Pre-processing failed: {img_err}")
            file.file.seek(0)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

        logger.info(f"[Search] Processing Selfie for Event: {event_id_int}")

        # 3. AI Extraction
        # Offloading to thread pool to keep FastAPI event loop responsive
        faces = await asyncio.to_thread(extract_faces, file_path)
        
        if not faces or len(faces) == 0:
            logger.warning(f"[Search] No face detected in selfie.")
            return []

        # Select the most centered/largest face
        best_face = max(faces, key=lambda x: x["facial_area"]["w"] * x["facial_area"]["h"])
        face_crop = best_face.get("face")
        
        if face_crop is None:
            return []

        # 4. Generate Embedding
        query_embedding = await asyncio.to_thread(generate_face_embedding_from_face, face_crop)
        
        if query_embedding is None:
            logger.error("[Search] Failed to vectorize face identity.")
            return []

        # 5. FAISS Vector Search
        # Search for top 500 potential candidates to filter by event later
        raw_matches = await asyncio.to_thread(
            search_matching_photos_with_scores,
            query_embedding,
            k=500,
            threshold=None,
        )

        logger.info(f"[Search] Raw Matches found: {len(raw_matches) if raw_matches else 0}")

        if not raw_matches:
            logger.info(f"[Search] Zero vector matches found in FAISS.")
            return []

        # Map photo IDs and filter by confidence
        # FAISS might return distances; we need to ensure they are within a 'matchable' range
        photo_ids = [int(m["photo_id"]) for m in raw_matches if "photo_id" in m]
        
        if not photo_ids:
            return []

        # 6. Database Retrieval with Strict Event Scoping
        # ARCHITECT NOTE: We query only photos belonging to the specific event
        photos = (
            db.query(Photo.id, Photo.file_path, Photo.event_id)
            .filter(
                Photo.id.in_(photo_ids),
                Photo.event_id == event_id_int  # RESTORED: Scoped strictly to event
            )
            .all()
        )
        
        # Create lookup map for O(1) access
        photo_map = {p.id: p for p in photos}

        # 7. Final Scoring & Formatting
        results = []
        for m in raw_matches:
            pid = int(m.get("photo_id"))
            if pid in photo_map:
                photo = photo_map[pid]
                
                # Clean URL construction
                path = photo.file_path or ""
                image_url = path if path.startswith("/") else f"/{path}"
                
                results.append({
                    "photo_id": pid,
                    "image_url": image_url,
                    "url": image_url,
                    "similarity": round(float(m.get("similarity", 0.0)), 4),
                    "event_id": photo.event_id
                })

        logger.info(f"[Search] ✅ Found {len(results)} matches for User in Event {event_id_int}")
        return results

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.exception(f"[Search] CRITICAL ERROR: {e}")
        raise HTTPException(status_code=500, detail="Search engine failure.")
    finally:
        # Cleanup
        if file_path and os.path.exists(file_path):
            try: os.remove(file_path)
            except: pass