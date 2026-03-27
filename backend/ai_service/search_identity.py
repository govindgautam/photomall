# backend/ai_service/search_identity.py

import logging
import os
from typing import List, Optional, Dict, Any
import numpy as np
from ai_index.faiss_index import search_in_faiss, search_in_faiss_scored

logger = logging.getLogger(__name__)

# Facenet512 ke liye 0.60-0.62 perfect balance hai recall aur accuracy mein.
DEFAULT_FACE_MATCH_THRESHOLD = 0.60 

def get_match_threshold() -> float:
    raw = os.environ.get("FACE_MATCH_THRESHOLD", str(DEFAULT_FACE_MATCH_THRESHOLD)).strip()
    try:
        t = float(raw)
        return t if (0.0 < t <= 1.0) else DEFAULT_FACE_MATCH_THRESHOLD
    except ValueError:
        return DEFAULT_FACE_MATCH_THRESHOLD

def search_matching_photo_ids(query_embedding: Optional[np.ndarray], *, k: int = 200, threshold: Optional[float] = None) -> List[int]:
    if query_embedding is None: return []

    try:
        processed_embedding = np.ascontiguousarray(query_embedding, dtype=np.float32).flatten()
        thr = threshold if threshold is not None else get_match_threshold()
        
        # CORE SEARCH
        results = search_in_faiss(processed_embedding, k=k, threshold=thr)
        
        # FIX: Agar results nahi mile, toh threshold 0.05 kam karke ek baar aur try karein (Recovery Logic)
        if not results and thr > 0.55:
            logger.info(f"[Search] No results at {thr}, trying recovery at {thr-0.05}")
            results = search_in_faiss(processed_embedding, k=k, threshold=thr-0.05)

        return results if results else []

    except Exception as e:
        logger.error(f"[Search] ❌ Vector Lookup Failure: {e}")
        return []

def search_matching_photos_with_scores(query_embedding: Optional[np.ndarray], *, k: int = 200, threshold: Optional[float] = None) -> List[Dict[str, Any]]:
    if query_embedding is None: return []

    try:
        processed_embedding = np.ascontiguousarray(query_embedding, dtype=np.float32).flatten()
        
        thr = threshold if threshold is not None else get_match_threshold()

        # FAISS search
        scored_results = search_in_faiss_scored(processed_embedding, k=k, threshold=thr)

        # Basic recovery to slightly lower threshold just in case
        if not scored_results:
            logger.info(f"[Search] No results at {thr}, trying recovery at {thr-0.05}")
            scored_results = search_in_faiss_scored(processed_embedding, k=k, threshold=thr-0.05)

        validated_results = []
        for res in scored_results:
            pid = res.get("photo_id")
            score = float(res.get("similarity", 0.0))
            if score > 1.0: score = 1.0
            
            if score >= (thr - 0.05):
                validated_results.append({
                    "photo_id": int(pid),
                    "similarity": round(score, 4)
                })

        validated_results.sort(key=lambda x: x["similarity"], reverse=True)
        return validated_results
    except Exception as e:
        logger.error(f"[Search] ❌ Vector Lookup Failure (Scored): {e}")
        return []