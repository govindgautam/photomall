import asyncio
import logging
import os
import time
from sqlalchemy.orm import Session
from database.db import SessionLocal
from app.models.photo import Photo
from app.models.face_embedding import FaceEmbedding
from ai_service.face_service import extract_faces, generate_face_embedding_from_face
from ai_index.faiss_index import save_index_to_disk, add_embeddings_to_index
from app.utils.websocket_manager import manager
from app.utils.image_processor import process_and_watermark

logger = logging.getLogger(__name__)

async def run_ingestion(event_id: int, event_path: str, files: list):
    """
    Async loop to process images, prevent hang, and keep WebSocket alive.
    """
    logger.info(f"Starting ingestion loop for event {event_id} with {len(files)} files.")
    db = SessionLocal()
    
    try:
        for index, file in enumerate(files):
            # Keep heartbeat alive
            await asyncio.sleep(0.01)

            file_path = os.path.join(event_path, file)
            photo = db.query(Photo).filter(Photo.file_path == file_path, Photo.event_id == event_id).first()
            
            if not photo:
                photo = Photo(file_path=file_path, event_id=event_id, is_processed=False)
                db.add(photo)
                db.commit()
                db.refresh(photo)
            
            if photo.is_processed:
                continue

            # Process and Watermark
            preview_filename = f"preview_{os.path.basename(file)}"
            preview_path = await asyncio.to_thread(process_and_watermark, file_path, preview_filename, "Event-Photo-Finder")
            photo.preview_path = preview_path

            # Extract Faces safely
            try:
                faces = await asyncio.to_thread(extract_faces, file_path, 10)
            except Exception as e:
                logger.error(f"Face extraction failed for {file}: {e}")
                faces = []

            face_detected = False
            embeddings_to_save = []

            if faces:
                for idx, face_data in enumerate((f.get("face") for f in faces if f.get("face") is not None)):
                    try:
                        embedding = await asyncio.to_thread(generate_face_embedding_from_face, face_data)
                        if embedding is not None:
                            face_detected = True
                            embeddings_to_save.append(
                                FaceEmbedding(photo_id=photo.id, embedding=embedding.tolist())
                            )
                    except Exception as e:
                        logger.error(f"Embedding failed for {file} face {idx}: {e}")
                        continue

            if embeddings_to_save:
                db.add_all(embeddings_to_save)
                # Commit embeddings immediately
                db.commit()
                # Update FAISS
                await asyncio.to_thread(add_embeddings_to_index, embeddings_to_save)

            photo.is_processed = True
            
            if not face_detected and not faces:
                photo.processing_status = 'failed'
            else:
                photo.processing_status = 'Face Detected' if face_detected else 'No Face Detected'

            db.add(photo)

            # --- Batch Commits Phase 2 ---
            # Perform db.commit() every 10 photos to ensure real-time UI progress update
            if (index + 1) % 10 == 0 or index == len(files) - 1:
                db.commit()
                # Auto-save FAISS index every batch
                await asyncio.to_thread(save_index_to_disk)


            # WebSocket progress update
            file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            if preview_path and os.path.exists(preview_path):
                file_size += os.path.getsize(preview_path)
                
            await manager.update_progress(
                str(event_id),
                file,
                face_count=len(embeddings_to_save),
                size_increment=file_size
            )

        # Final save at the end of ingestion
        await asyncio.to_thread(save_index_to_disk)
        logger.info(f"Ingestion loop completed for event {event_id}.")
        
    except Exception as e:
        logger.error(f"CRITICAL: Ingestion failed completely for event {event_id}: {e}")
    finally:
        db.close()
