from sqlalchemy.orm import Session
import numpy as np
from app.models.face_embedding import FaceEmbedding
from app.models.photo import Photo
from ai_service.face_service import generate_embedding_from_selfie, calculate_similarity

# Professional Settings
SIMILARITY_THRESHOLD = 0.65  # Facenet512 ke liye 0.6 - 0.7 best hai
MAX_RESULTS = 20

def search_faces(image_path: str, db: Session):
    """
    User ki selfie se matching photos dhundne ka logic.
    """
    
    # -------------------------
    # Step 1 — Generate Embedding from Selfie
    # -------------------------
    query_embedding = generate_embedding_from_selfie(image_path)

    if query_embedding is None:
        print("DEBUG: Selfie mein koi face nahi mila.")
        return []

    # -------------------------
    # Step 2 — Fetch All Embeddings with Photo Data (JOIN)
    # -------------------------
    # Hum database se embedding aur photo details dono ek saath le rahe hain
    results = (
        db.query(FaceEmbedding, Photo)
        .join(Photo, FaceEmbedding.photo_id == Photo.id)
        .all()
    )

    if not results:
        return []

    matches = []
    
    # Optimization: Numpy use karke search fast karenge
    query_vec = np.array(query_embedding).astype("float32")

    # -------------------------
    # Step 3 — Similarity Calculation
    # -------------------------
    for emb_record, photo_record in results:
        # DB se aaye embedding ko numpy array mein badlein
        db_vec = np.array(emb_record.embedding).astype("float32")

        # Similarity calculate karein (face_service ka function use karke)
        score = calculate_similarity(query_vec, db_vec)

        if score > SIMILARITY_THRESHOLD:
            matches.append({
                "photo_id": photo_record.id,
                "file_path": photo_record.file_path,
                "similarity": float(score)
            })

    # -------------------------
    # Step 4 — Sort & Return (Highest Similarity First)
    # -------------------------
    matches.sort(key=lambda x: x["similarity"], reverse=True)

    return matches[:MAX_RESULTS]