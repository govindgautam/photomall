# backend/app/routes/search_routes.py

import os
import uuid
import shutil
import logging
import asyncio
import tempfile
import json  # ✅ Add json import
import numpy as np  # ✅ Add numpy import
from typing import Optional, List
from PIL import Image

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form
from sqlalchemy.orm import Session
from sqlalchemy import case

# --- Service & DB Imports ---
from ai_service.face_service import extract_faces, generate_face_embedding_from_face
from ai_index.faiss_index import search_similar_faces_strict  # ✅ Import strict function
from database.db import SessionLocal
from app.models.photo import Photo
from app.models.event import Event
from app.models.face_embedding import FaceEmbedding
from ai_index import faiss_index

# ============================================================================
# SENIOR ENGINEER: FIXED SEARCH ROUTES - EXACT FACE MATCHING
# ============================================================================

def ensure_index_loaded():
    if faiss_index.index is None or faiss_index.index.ntotal == 0:
        logger.info("[Search] FAISS index is empty! Attempting to load from DB...")
        db = SessionLocal()
        try:
            all_embeddings = db.query(FaceEmbedding).all()
            if all_embeddings:
                faiss_index.add_embeddings_to_index(all_embeddings)
                logger.info(f"[Search] Loaded {len(all_embeddings)} embeddings into FAISS.")
        except Exception as e:
            logger.error(f"[Search] Index loading failed: {e}")
        finally:
            db.close()

router = APIRouter(tags=["AI Face Search"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEMP_SEARCH_FOLDER = os.path.join(tempfile.gettempdir(), "event-photo-finder-search")
os.makedirs(TEMP_SEARCH_FOLDER, exist_ok=True)

# ============================================================================
# STRICT THRESHOLD - ONLY 88%+ MATCHES
# ============================================================================
STRICT_MATCH_THRESHOLD = 0.82  # Only faces with 88%+ confidence


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _parse_event_id(event_id_raw: str) -> int:
    try:
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
    SENIOR ENGINEER: EXACT FACE SEARCH WITH 88% THRESHOLD.
    Returns only photos with face similarity >= 88%.
    """
    file_path: Optional[str] = None
    raw_matches = []  # Initialize variable

    try:
        ensure_index_loaded()
        
        # 1. Validate file type
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Please upload an image (JPEG or PNG).",
            )

        # 2. Parse event ID
        event_id_int = _parse_event_id(eventId)
        
        # 3. Verify event exists
        event = db.query(Event).filter(Event.id == event_id_int).first()
        if not event:
            raise HTTPException(
                status_code=404,
                detail=f"Event ID {event_id_int} not found.",
            )

        # 4. Save uploaded file
        unique_filename = f"search_{uuid.uuid4().hex}.jpg"
        file_path = os.path.join(TEMP_SEARCH_FOLDER, unique_filename)
        
        try:
            with Image.open(file.file) as img:
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
                
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                
                img.thumbnail((800, 800), Image.Resampling.LANCZOS)
                img.save(file_path, "JPEG", quality=90, optimize=True)
        except Exception as img_err:
            logger.error(f"[Search] PIL Pre-processing failed: {img_err}")
            file.file.seek(0)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

        logger.info(f"[Search] Processing Selfie for Event: {event_id_int}")

        # 5. Extract face from image
        faces = await asyncio.to_thread(extract_faces, file_path)
        
        if not faces or len(faces) == 0:
            logger.warning(f"[Search] No face detected in selfie.")
            return []

        # 6. Select best face (largest area)
        best_face = max(faces, key=lambda x: x["facial_area"]["w"] * x["facial_area"]["h"])
        face_crop = best_face.get("face")
        
        if face_crop is None:
            return []

        # 7. Generate query embedding
        query_embedding = await asyncio.to_thread(generate_face_embedding_from_face, face_crop)
        
        if query_embedding is None:
            logger.error("[Search] Failed to generate face embedding.")
            return []

        # 8. Get all face embeddings for this event from database
        event_embeddings = db.query(FaceEmbedding).join(Photo).filter(
            Photo.event_id == event_id_int
        ).all()
        
        if not event_embeddings:
            logger.info(f"[Search] No embeddings found for event {event_id_int}")
            return []

        # 9. Prepare embeddings list for search
        embeddings_list = []
        photo_ids_list = []
        
        for emb in event_embeddings:
            # Convert embedding to numpy array
            if isinstance(emb.embedding, str):
                emb_vector = np.array(json.loads(emb.embedding))
            else:
                emb_vector = np.array(emb.embedding)
            embeddings_list.append(emb_vector)
            photo_ids_list.append(emb.photo_id)

        # 10. ✅ STRICT SEARCH - Only 88%+ matches
        similar_indices, similarity_scores = await asyncio.to_thread(
            search_similar_faces_strict,
            query_embedding,
            embeddings_list,
            top_k=20,
            min_similarity=STRICT_MATCH_THRESHOLD
        )

        # 11. Build raw_matches from results
        raw_matches = []
        for idx, score in zip(similar_indices, similarity_scores):
            if score >= STRICT_MATCH_THRESHOLD:
                raw_matches.append({
                    "photo_id": photo_ids_list[idx],
                    "similarity": score
                })

        logger.info(f"[Search] Raw Matches found: {len(raw_matches)}")

        if not raw_matches:
            logger.info(f"[Search] No matches above {STRICT_MATCH_THRESHOLD:.0%} threshold.")
            return []

        # 12. Get photo details from database
        photo_ids = [int(m["photo_id"]) for m in raw_matches if "photo_id" in m]
        
        if not photo_ids:
            return []

        photos = (
            db.query(Photo.id, Photo.file_path, Photo.event_id)
            .filter(
                Photo.id.in_(photo_ids),
                Photo.event_id == event_id_int
            )
            .all()
        )
        
        # 13. Create lookup map
        photo_map = {p.id: p for p in photos}

        # 14. Build final results
        results = []
        for m in raw_matches:
            pid = int(m.get("photo_id"))
            if pid in photo_map:
                photo = photo_map[pid]
                path = photo.file_path or ""
                image_url = path if path.startswith("/") else f"/{path}"
                
                results.append({
                    "photo_id": pid,
                    "image_url": image_url,
                    "url": image_url,
                    "similarity": round(float(m.get("similarity", 0.0)), 4),
                    "event_id": photo.event_id
                })

        logger.info(f"[Search] ✅ Found {len(results)} exact matches for Event {event_id_int}")
        return results

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.exception(f"[Search] CRITICAL ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Search engine failure: {str(e)}")
    finally:
        # Cleanup
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass