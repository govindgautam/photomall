import os
import uuid
import shutil
import logging
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Tuple, Optional
from fastapi import APIRouter, UploadFile, File, Depends, BackgroundTasks, Form, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import queue
import threading

# --- Database & Models ---
from database.db import SessionLocal
from app.models.photo import Photo
from app.models.event import Event
from app.models.face_embedding import FaceEmbedding

# --- AI & Processing ---
from ai_service.face_service import (
    extract_faces, 
    generate_face_embedding_from_face,
    extract_faces_batch,
    generate_embeddings_batch,
    preprocess_image_for_face_detection
)
from ai_index.faiss_index import add_embeddings_to_index
from app.utils.image_processor import process_and_watermark
from app.utils.websocket_manager import manager
from app.utils.auth_utils import get_current_user_optional

# Router configuration
router = APIRouter(tags=["Photos Management"])

# Logging setup for production monitoring
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Directory setup for storage - Ensuring isolation of originals and processed previews
ORIGINALS_FOLDER = "uploads/originals/"
PREVIEWS_FOLDER = "uploads/previews/"
os.makedirs(ORIGINALS_FOLDER, exist_ok=True)
os.makedirs(PREVIEWS_FOLDER, exist_ok=True)

# Senior Architect: Enhanced thread pool configuration for optimal performance
# CPU ko saans lene do: Max 4 workers ya fir jitne cores hain
AI_MAX_WORKERS = min(4, os.cpu_count() or 2) # Dynamic worker count
IO_MAX_WORKERS = 4
ai_executor = ThreadPoolExecutor(max_workers=AI_MAX_WORKERS, thread_name_prefix="AI-Worker")
io_executor = ThreadPoolExecutor(max_workers=IO_MAX_WORKERS, thread_name_prefix="IO-Worker")

# Batch processing configuration
BATCH_SIZE = 16  # Process 16 photos at once for maximum throughput
PROGRESS_UPDATE_INTERVAL = 5  # Update WebSocket every 5 photos

# --- SENIOR ARCHITECT FIX: Concurrency Limits ---
# Limit concurrent AI processing to avoid CPU choking and socket hang-ups
# 2-4 concurrent is optimal for CPU inference to maintain responsive WebSockets
MAX_CONCURRENT_PHOTOS = min(3, os.cpu_count() or 2)
photo_processing_semaphore = asyncio.Semaphore(MAX_CONCURRENT_PHOTOS)


# --- DATABASE DEPENDENCY ---
def get_db():
    """
    Yields a database session for request lifecycle management.
    Ensures thread safety by closing session after task completion.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- ENHANCED BACKGROUND AI PROCESSING TASK ---
async def process_photo_full_task_optimized(photo_id: int, original_path: str, filename: str, event_id: int, original_size: int = 0):
    """
    Senior Architect: Optimized single photo processing with parallel operations.
    """
    print(f"🔥🔥🔥 PROCESSING STARTED for Photo {photo_id} 🔥🔥🔥")
    print(f"   Path: {original_path}")
    print(f"   Event: {event_id}")
    async with photo_processing_semaphore:
        db = SessionLocal()
        embeddings_to_save = []
        preview_size = 0
        preview_path = None

    try:
        logger.info(f"🚀 Starting processing for Photo ID {photo_id}, path: {original_path}")
        
        # Check if file exists
        if not os.path.exists(original_path):
            logger.error(f"❌ File not found: {original_path}")
            return
        
        # Step 1: Watermark
        logger.info(f"📸 Step 1: Watermarking for Photo ID {photo_id}")
        watermark_task = asyncio.to_thread(
            process_and_watermark, original_path, filename, watermark_text="Govind Photography"
        )
        
        # Step 2: Face detection with error handling
        logger.info(f"👤 Step 2: Face detection for Photo ID {photo_id}")
        
        try:
            # Direct face extraction
            faces = await asyncio.to_thread(extract_faces, original_path, max_faces=10)
            logger.info(f"👤 Face detection result: {len(faces)} face(s) found")
            
            if faces:
                for i, face in enumerate(faces):
                    logger.info(f"   Face {i+1}: confidence={face.get('confidence', 0)}, area={face.get('area', 0)}")
        except Exception as face_error:
            logger.error(f"❌ Face detection error: {face_error}")
            faces = []
        
        # Step 3: Wait for watermark
        preview_path = await watermark_task
        if preview_path and os.path.exists(preview_path):
            preview_size = os.path.getsize(preview_path)
            logger.info(f"✅ Watermark complete: {preview_path}")
        
        # Step 4: Generate embeddings
        # In process_photo_full_task_optimized function, around line 150-170:

# Step 4: Generate embeddings
        if faces:
            logger.info(f"🧠 Step 4: Generating embeddings for {len(faces)} faces")
            face_crops = [face.get("face") for face in faces if face.get("face") is not None]
        
        if face_crops:
            try:
                embedding_results = await asyncio.to_thread(
                    generate_embeddings_batch,
                    [(face, f"photo_{photo_id}_face_{i}") for i, face in enumerate(face_crops)]
                )
                
                for identifier, embedding in embedding_results:
                    if embedding is not None:
                        # ✅ FIX: embedding is already a list from generate_embeddings_batch
                        embeddings_to_save.append(
                            FaceEmbedding(photo_id=photo_id, embedding=embedding, event_id=event_id)
                        )
                        logger.info(f"✅ Embedding generated for {identifier}")
                    else:
                        logger.warning(f"⚠️ Failed to generate embedding for {identifier}")
            except Exception as emb_e:
                logger.error(f"❌ Embedding batch error: {emb_e}")
        # Step 5: Save to database
        if embeddings_to_save:
            db.add_all(embeddings_to_save)
            db.commit()
            logger.info(f"💾 Saved {len(embeddings_to_save)} face embeddings to DB")
        else:
            logger.warning(f"⚠️ No embeddings to save for Photo ID {photo_id}")
        
        # Step 6: Update photo record
        photo = db.query(Photo).filter(Photo.id == photo_id).first()
        if photo:
            photo.preview_path = preview_path
            photo.is_processed = True
            
            if not faces:
                photo.processing_status = "No Face Detected"
            else:
                photo.processing_status = f"{len(embeddings_to_save)} Face(s) Detected"
                
            db.add(photo)
            db.commit()
            logger.info(f"✅ Photo {photo_id} updated: {photo.processing_status}")
        
        # Step 7: Update FAISS index
        if embeddings_to_save:
            await asyncio.to_thread(add_embeddings_to_index, embeddings_to_save)
            logger.info(f"🧠 FAISS index updated with {len(embeddings_to_save)} embeddings")
        
    except Exception as e:
        logger.error(f"❌ CRITICAL TASK FAILURE for Photo {photo_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()
        # WebSocket update
        try:
            await manager.update_progress(
                str(event_id), 
                filename, 
                face_count=len(embeddings_to_save),
                size_increment=original_size + preview_size
            )
        except Exception as ws_err:
            logger.error(f"WebSocket update failed: {ws_err}")
# --- LEGACY PROCESSING TASK (for compatibility) ---
async def process_photo_full_task(photo_id: int, original_path: str, filename: str, event_id: int, original_size: int = 0):
    """
    Legacy compatibility wrapper.
    """
    await process_photo_full_task_optimized(photo_id, original_path, filename, event_id, original_size)

# --- API ENDPOINTS ---

@router.get("/event/{event_id}/face-clusters")
def get_event_face_clusters(event_id: int, db: Session = Depends(get_db)):
    """
    Returns unique face clusters for the event gallery filtering.
    """
    rows = (
        db.query(FaceEmbedding, Photo)
        .join(Photo, FaceEmbedding.photo_id == Photo.id)
        .filter(Photo.event_id == event_id)
        .order_by(FaceEmbedding.id.asc())
        .all()
    )
    return [
        {
            "id": fe.id,
            "photo_id": photo.id,
            "thumbnail_path": photo.preview_path or photo.file_path,
            "preview_path": photo.preview_path,
            "original_path": photo.file_path,
        }
        for fe, photo in rows
    ]

@router.get("/event/{event_id}")
def get_event_photos(event_id: int, db: Session = Depends(get_db)):
    """
    Retrieves all photos for a specific event.
    """
    photos = db.query(Photo).filter(Photo.event_id == event_id).all()
    return photos if photos else []

@router.post("/upload-bulk")
async def upload_bulk_optimized(
    background_tasks: BackgroundTasks,
    event_id: int = Form(...), 
    files: List[UploadFile] = File(...), 
    db: Session = Depends(get_db),
    _current_user: str = Depends(get_current_user_optional),
    use_batch_processing: bool = Form(default=True),
):
    """
    Senior Architect: Turbo Bulk Ingester with dual processing modes.
    
    Mode 1: Batch Processing (Default) - Maximum throughput for large uploads
    Mode 2: Individual Processing - Better for small uploads or debugging
    
    Features:
    - Non-blocking file I/O
    - Parallel face detection and embedding generation
    - Optimized database batch operations
    - Real-time WebSocket progress updates
    - Automatic fallback on errors
    """
    start_time = time.time()
    
    try:
        # Validate event exists
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
            
        # Initialize progress tracking
        manager.init_batch(str(event_id), len(files))
        logger.info(f"🚀 Initializing bulk upload: {len(files)} files for event {event_id}")
        
        # Step 1: Parallel file saving with optimized I/O
        uploaded_photos = []
        file_save_tasks = []
        
        for file in files:
            # Generate unique filename
            unique_filename = f"{uuid.uuid4()}_{file.filename}"
            original_path = os.path.join(ORIGINALS_FOLDER, unique_filename)
            
            # Create file save task
            async def save_file_task(file_obj, path):
                try:
                    with open(path, "wb") as buffer:
                        shutil.copyfileobj(file_obj.file, buffer)
                    return path, os.path.getsize(path)
                except Exception as e:
                    logger.error(f"❌ File save error for {file_obj.filename}: {e}")
                    return None, 0
                finally:
                    file_obj.file.close()
                    
            file_save_tasks.append(save_file_task(file, original_path))
            
        # Execute file saves in parallel
        file_results = await asyncio.gather(*file_save_tasks, return_exceptions=True)
        
        # Process file save results and create database records
        for i, result in enumerate(file_results):
            if isinstance(result, Exception):
                logger.error(f"❌ File save failed for file {i}: {result}")
                continue
                
            saved_path, file_size = result
            if saved_path:
                # Create photo record
                photo = Photo(
                    file_path=saved_path,
                    event_id=event_id,
                    is_processed=False
                )
                db.add(photo)
                uploaded_photos.append({
                    'photo_obj': photo,
                    'original_path': saved_path,
                    'filename': files[i].filename,
                    'file_size': file_size
                })
                
        # Commit all photo records
        db.commit()
        
        # Refresh objects to get IDs
        for photo_data in uploaded_photos:
            db.refresh(photo_data['photo_obj'])
            photo_data['id'] = photo_data['photo_obj'].id
            
        uploaded_count = len(uploaded_photos)
        logger.info(f"✅ Successfully saved {uploaded_count} photos to database")
        
        if uploaded_count == 0:
            return {
                "success": False,
                "error": "No files were successfully uploaded",
                "uploaded_count": 0
            }
            
        # Step 2: Use individual processing mode globally to respect Semaphores
        logger.info(f"🚀 Processing queued for {uploaded_count} photos safely")
        
        for photo_data in uploaded_photos:
           background_tasks.add_task(
    process_photo_full_task_optimized,
    photo_data['id'],
    photo_data['original_path'],
    photo_data['filename'],
    event_id,
    photo_data['file_size']
)
        
        # Step 3: Update event metadata
        event.count = db.query(func.count(Photo.id)).filter(Photo.event_id == event_id).scalar()
        db.commit()
        
        processing_time = time.time() - start_time
        
        return {
            "success": True,
            "uploaded_count": uploaded_count,
            "processing_mode": "batch" if use_batch_processing and uploaded_count >= BATCH_SIZE else "individual",
            "batch_size": BATCH_SIZE if use_batch_processing and uploaded_count >= BATCH_SIZE else 1,
            "message": f"Successfully queued {uploaded_count} images for AI processing.",
            "photo_ids": [p['id'] for p in uploaded_photos],
            "processing_time_seconds": round(processing_time, 2),
            "event_id": event_id
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Bulk Upload Crash: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Neural Ingester failed: {str(e)}"
        )

# Legacy endpoint for compatibility
@router.post("/upload-bulk-legacy")
async def upload_bulk(
    background_tasks: BackgroundTasks,
    event_id: int = Form(...), 
    files: List[UploadFile] = File(...), 
    db: Session = Depends(get_db),
    _current_user: str = Depends(get_current_user_optional),
):
    """
    Legacy compatibility endpoint.
    """
    return await upload_bulk_optimized(
        background_tasks, event_id, files, db, _current_user, use_batch_processing=False
    )

@router.get("/manual-upload-page", response_class=HTMLResponse)
def manual_page():
    """
    Senior Architect Diagnostic Tool: Simple UI for testing bulk ingestion.
    """
    return """
    <html>
        <head>
            <title>PhotoMall AI - Neural Node Ingester</title>
            <style>
                body { font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white; margin: 0; }
                .card { background: #1e293b; padding: 40px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); width: 400px; text-align: center; border: 1px solid #334155; }
                input, button { width: 100%; margin: 12px 0; padding: 14px; border-radius: 12px; border: 1px solid #334155; background: #0f172a; color: white; box-sizing: border-box; }
                button { background: #3b82f6; border: none; font-size: 16px; font-weight: 800; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 1px; }
                button:hover { background: #2563eb; transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(59,130,246,0.4); }
                #status { margin-top: 20px; font-size: 14px; font-family: monospace; color: #94a3b8; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2 style="margin-bottom: 8px;">Neural Ingester 🚀</h2>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 24px;">Inject photos into the AI Vector Space</p>
                <input type="number" id="eid" placeholder="Enter Event ID (e.g. 1)">
                <input type="file" id="fls" multiple accept="image/*">
                <button onclick="startUpload()">Initialize Upload</button>
                <div id="status">System Online - Ready for Data</div>
            </div>
            <script>
                async function startUpload() {
                    const status = document.getElementById('status');
                    const eid = document.getElementById('eid').value;
                    const files = document.getElementById('fls').files;
                    
                    if(!eid || files.length === 0) { 
                        alert("Please provide a valid Event ID and select photos."); 
                        return; 
                    }

                    const formData = new FormData();
                    formData.append('event_id', eid);
                    for(let f of files) formData.append('files', f);
                    
                    status.innerText = "⏳ Transferring Data to Server...";
                    status.style.color = "#3b82f6";

                    try {
                        const res = await fetch('/api/photos/upload-bulk', { 
                            method: 'POST', 
                            body: formData 
                        });
                        
                        const result = await res.json();
                        if(res.ok) {
                            status.innerText = "✅ Queued: AI is indexing in background.";
                            status.style.color = "#10b981";
                        } else {
                            status.innerText = "❌ Error: " + (result.detail || "Upload failed");
                            status.style.color = "#ef4444";
                        }
                    } catch (e) { 
                        status.innerText = "❌ Connection Refused: Check Backend Logs"; 
                        status.style.color = "#ef4444";
                    }
                }
            </script>
        </body>
    </html>
    """