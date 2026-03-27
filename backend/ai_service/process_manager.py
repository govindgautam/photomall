import os
from database.db import SessionLocal
from app.models.photo import Photo
from app.models.face_embedding import FaceEmbedding

# AI Services
from ai_service.face_service import extract_faces, generate_face_embedding_from_face
from ai_index.faiss_index import add_embeddings_to_index

# Image Processing (Watermark)
from app.utils.image_processor import process_and_watermark

def process_photo_task(photo_id: int, original_path: str, event_id: int):
    """
    ULTIMATE BACKGROUND WORKER:
    1. AI Face Extraction (Original Photo se taaki accuracy 100% rahe).
    2. Watermarked Preview generation (Guest ko dikhane ke liye).
    3. Database and FAISS Index Update.
    """
    db = SessionLocal()
    try:
        print(f"⚙️ Processing Photo ID: {photo_id} for Event: {event_id}...")

        # --- STEP A: AI Face Extraction (PEHLE YE KAREIN) ---
        # Original path use kar rahe hain taaki pixels pure rahein
        faces = extract_faces(original_path)
        
        face_count = 0
        new_embeddings_list = []
        for face_data in faces:
            embedding = generate_face_embedding_from_face(face_data["face"])
            if embedding is not None:
                new_embedding = FaceEmbedding(
                    photo_id=photo_id,
                    embedding=embedding.tolist()
                )
                db.add(new_embedding)
                new_embeddings_list.append(new_embedding)
                face_count += 1

        # --- STEP B: Watermark & Preview Logic ---
        # Isse 'preview_filename' aur 'uploads/previews/...' path generate hoga
        filename = os.path.basename(original_path)
        preview_path = process_and_watermark(
            file_path=original_path, 
            filename=filename, 
            watermark_text="GOVIND PHOTOGRAPHY"
        )

        # --- STEP C: Database Update ---
        photo = db.query(Photo).filter(Photo.id == photo_id).first()
        if photo:
            photo.preview_path = preview_path
            photo.is_processed = True
            
        db.commit()
        print(f"✅ DB Updated: Found {face_count} faces.")

        # --- STEP D: FAISS Refresh ---
        if new_embeddings_list:
            add_embeddings_to_index(new_embeddings_list)
        
        print(f"🚀 Photo {photo_id} processing complete!")

    except Exception as e:
        db.rollback()
        print(f"❌ Critical Error in process_manager for photo {photo_id}: {e}")
    finally:
        db.close()