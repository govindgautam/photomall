# backend/ai_index/faiss_index.py
import faiss
import numpy as np
import threading
import os
import logging
import time
import json
from typing import List, Tuple, Optional, Dict, Any

# Professional Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -------------------------
# Global State & Config
# -------------------------
INDEX_CACHE_PATH = "ai_index/faiss_data.index"
IDS_CACHE_PATH = "ai_index/photo_ids.npy"
METADATA_CACHE_PATH = "ai_index/metadata.json"
EMBEDDINGS_CACHE_PATH = "ai_index/embeddings.npy"

index = None
photo_ids_list = []
embeddings_list = []
index_lock = threading.RLock()
index_metadata = {}

_auto_save_counter = 0
_AUTO_SAVE_INTERVAL = 5

REQUIRED_DIM = 512

# ✅ FIXED: Correct thresholds for normalized scores (0-1 range)
SIMILARITY_THRESHOLD_EXACT = 0.85
SIMILARITY_THRESHOLD_HIGH = 0.80
SIMILARITY_THRESHOLD_DEFAULT = 0.75
SIMILARITY_THRESHOLD_STRICT = 0.90

BATCH_SIZE = 32
USE_IVF_INDEX = True
NLIST = 100

# ============================================================================
# SENIOR ENGINEER: STRICT FACE MATCHING FUNCTION - NEW ADDITION
# ============================================================================
def search_similar_faces_strict(
    query_embedding: np.ndarray, 
    embeddings_list: List[np.ndarray], 
    top_k: int = 10,
    min_similarity: float = 0.88
) -> Tuple[List[int], List[float]]:
    """
    SENIOR ENGINEER: Strict face matching with high confidence threshold.
    Returns only faces with cosine similarity >= min_similarity (default 88%).
    This is the primary function for exact face matching.
    
    Args:
        query_embedding: Face embedding to search for
        embeddings_list: List of embeddings to search against
        top_k: Maximum number of results to return
        min_similarity: Minimum similarity score (0-1) for a match
    
    Returns:
        Tuple of (indices, similarity_scores) for matching faces
    """
    try:
        # Normalize query embedding
        query_embedding = normalize_vector(query_embedding)
        if query_embedding is None:
            logger.error("Query embedding normalization failed")
            return [], []
        
        query_embedding = query_embedding.reshape(1, -1).astype('float32')
        
        if len(embeddings_list) == 0:
            return [], []
        
        embeddings_array = np.array(embeddings_list).astype('float32')
        
        # Use sklearn for accurate cosine similarity calculation
        from sklearn.metrics.pairwise import cosine_similarity
        
        # Calculate cosine similarities (range: -1 to 1)
        similarities = cosine_similarity(query_embedding, embeddings_array)[0]
        
        # Convert to 0-1 range
        similarities = (similarities + 1) / 2
        
        # Get indices above threshold
        valid_indices = np.where(similarities >= min_similarity)[0]
        valid_scores = similarities[valid_indices]
        
        if len(valid_indices) == 0:
            print(f"🎯 STRICT SEARCH: No faces found with {min_similarity:.0%}+ confidence")
            return [], []
        
        # Sort by score (highest first)
        sorted_idx = np.argsort(valid_scores)[::-1]
        valid_indices = valid_indices[sorted_idx]
        valid_scores = valid_scores[sorted_idx]
        
        # Limit results
        valid_indices = valid_indices[:top_k]
        valid_scores = valid_scores[:top_k]
        
        # Debug output
        print(f"🎯 STRICT SEARCH: Found {len(valid_indices)} face(s) with {min_similarity:.0%}+ confidence")
        for i, (idx, score) in enumerate(zip(valid_indices[:5], valid_scores[:5])):
            print(f"   Match {i+1}: index={idx}, confidence={score:.2%}")
        
        return valid_indices.tolist(), valid_scores.tolist()
        
    except Exception as e:
        logger.error(f"Strict face search error: {e}")
        return [], []


# ============================================================================
# ORIGINAL FUNCTIONS (Keep as is for compatibility)
# ============================================================================

# -------------------------
# Vector Normalization
# -------------------------
def normalize_vector(vec):
    try:
        vec = np.array(vec).astype("float32").flatten()
        if vec.shape[0] != REQUIRED_DIM:
            logger.warning(f"Vector dimension mismatch: expected {REQUIRED_DIM}, got {vec.shape[0]}")
            return None
        
        norm = np.linalg.norm(vec)
        if norm < 1e-8:
            logger.warning("Vector norm too small, returning zero vector")
            return np.zeros(REQUIRED_DIM, dtype="float32")
        return vec / norm
    except Exception as e:
        logger.error(f"Normalization Error: {e}")
        return None


# -------------------------
# Index Management
# -------------------------
def save_index_to_disk():
    global index, photo_ids_list, index_metadata, embeddings_list
    try:
        if index is not None:
            os.makedirs(os.path.dirname(INDEX_CACHE_PATH), exist_ok=True)
            
            faiss.write_index(index, INDEX_CACHE_PATH)
            np.save(IDS_CACHE_PATH, np.array(photo_ids_list))
            
            if embeddings_list:
                np.save(EMBEDDINGS_CACHE_PATH, np.array(embeddings_list))
            
            metadata = {
                "index_type": "IVFFlat" if USE_IVF_INDEX else "IndexFlatIP",
                "total_vectors": len(photo_ids_list),
                "dimension": REQUIRED_DIM,
                "nlist": NLIST if USE_IVF_INDEX else None,
                "last_updated": time.time()
            }
            with open(METADATA_CACHE_PATH, 'w') as f:
                json.dump(metadata, f)
            
            logger.info(f"💾 FAISS Index persisted: {len(photo_ids_list)} vectors")
    except Exception as e:
        logger.error(f"Failed to save index: {e}")

def load_index_from_disk():
    global index, photo_ids_list, index_metadata, embeddings_list
    try:
        if os.path.exists(INDEX_CACHE_PATH) and os.path.exists(IDS_CACHE_PATH):
            with index_lock:
                index = faiss.read_index(INDEX_CACHE_PATH)
                photo_ids_list = np.load(IDS_CACHE_PATH).tolist()
                
                if os.path.exists(EMBEDDINGS_CACHE_PATH):
                    embeddings_list = np.load(EMBEDDINGS_CACHE_PATH).tolist()
                
                if os.path.exists(METADATA_CACHE_PATH):
                    with open(METADATA_CACHE_PATH, 'r') as f:
                        index_metadata = json.load(f)
                
                if hasattr(index, 'nprobe') and index_metadata.get("index_type") == "IVFFlat":
                    index.nprobe = min(10, index.nlist)
                    
            logger.info(f"📁 Loaded FAISS index: {len(photo_ids_list)} entries")
            return True
    except Exception as e:
        logger.error(f"Load Error: {e}")
    return False


# -------------------------
# Index Construction
# -------------------------
def build_faiss_index(embeddings):
    global index, photo_ids_list, embeddings_list, index_metadata
    
    vectors = []
    temp_ids = []
    temp_embeddings = []
    
    for emb in embeddings:
        raw_vec = getattr(emb, "embedding", None)
        pid = getattr(emb, "photo_id", None)
        
        if raw_vec is not None and pid is not None:
            vec = normalize_vector(raw_vec)
            if vec is not None:
                vectors.append(vec)
                temp_ids.append(int(pid))
                temp_embeddings.append(vec)
    
    if not vectors:
        logger.warning("⚠️ No valid embeddings to build index")
        return
        
    vectors_np = np.array(vectors).astype('float32')
    n_vectors = len(vectors_np)
    
    if n_vectors > 10000 and USE_IVF_INDEX:
        logger.info(f"🚀 Building IVFFlat index for {n_vectors} vectors")
        quantizer = faiss.IndexFlatIP(REQUIRED_DIM)
        index = faiss.IndexIVFFlat(quantizer, REQUIRED_DIM, NLIST, faiss.METRIC_INNER_PRODUCT)
        logger.info("⏳ Training IVFFlat index...")
        index.train(vectors_np)
        index.nprobe = min(10, NLIST)
        index_metadata = {"index_type": "IVFFlat", "nlist": NLIST, "nprobe": index.nprobe}
    else:
        logger.info(f"🚀 Building IndexFlatIP for {n_vectors} vectors")
        index = faiss.IndexFlatIP(REQUIRED_DIM)
        index_metadata = {"index_type": "IndexFlatIP"}
    
    index.add(vectors_np)
    
    with index_lock:
        photo_ids_list = temp_ids
        embeddings_list = temp_embeddings
        
    save_index_to_disk()
    logger.info(f"✅ FAISS Index built: {n_vectors} vectors")

def add_embeddings_to_index(embeddings):
    global index, photo_ids_list, embeddings_list
    
    vectors = []
    ids = []
    emb_vectors = []

    for emb in embeddings:
        raw_vec = getattr(emb, "embedding", None)
        pid = getattr(emb, "photo_id", None)
        
        if raw_vec is not None and pid is not None:
            vec = normalize_vector(raw_vec)
            if vec is not None:
                vectors.append(vec)
                ids.append(int(pid))
                emb_vectors.append(vec)

    if not vectors:
        logger.warning("⚠️ No valid embeddings to add")
        return

    vectors_np = np.array(vectors).astype("float32")
    
    with index_lock:
        if index is None:
            logger.info("🔄 Auto-initializing FAISS index")
            if len(vectors) > 10000 and USE_IVF_INDEX:
                quantizer = faiss.IndexFlatIP(REQUIRED_DIM)
                index = faiss.IndexIVFFlat(quantizer, REQUIRED_DIM, NLIST, faiss.METRIC_INNER_PRODUCT)
                index.train(vectors_np)
                index.nprobe = min(10, NLIST)
            else:
                index = faiss.IndexFlatIP(REQUIRED_DIM)
            photo_ids_list = []
            embeddings_list = []
        
        batch_size = min(BATCH_SIZE, len(vectors_np))
        for i in range(0, len(vectors_np), batch_size):
            batch_vectors = vectors_np[i:i+batch_size]
            batch_ids = ids[i:i+batch_size]
            batch_embeddings = emb_vectors[i:i+batch_size]
            index.add(batch_vectors)
            photo_ids_list.extend(batch_ids)
            embeddings_list.extend(batch_embeddings)
    
    global _auto_save_counter
    _auto_save_counter += len(ids)
    
    if _auto_save_counter >= _AUTO_SAVE_INTERVAL:
        save_index_to_disk()
        logger.info(f"🔄 Auto-saved FAISS index after {_auto_save_counter} new embeddings")
        _auto_save_counter = 0
    else:
        save_index_to_disk()
    
    logger.info(f"➕ Added {len(ids)} embeddings to FAISS index")


# -------------------------
# Core Search Functions (Legacy - Keep for compatibility)
# -------------------------
def search_similar_faces(query_embedding: np.ndarray, embeddings_list: List[np.ndarray], top_k: int = 50) -> Tuple[List[int], List[float]]:
    """Legacy search function - kept for backward compatibility"""
    try:
        query_embedding = normalize_vector(query_embedding)
        if query_embedding is None:
            return [], []
        
        query_embedding = query_embedding.reshape(1, -1).astype('float32')
        
        if len(embeddings_list) == 0:
            return [], []
        
        embeddings_array = np.array(embeddings_list).astype('float32')
        
        try:
            dimension = embeddings_array.shape[1]
            index = faiss.IndexFlatIP(dimension)
            index.add(embeddings_array)
            
            k = min(top_k, len(embeddings_array))
            similarities, indices = index.search(query_embedding, k)
            
            raw_scores = similarities[0].tolist()
            normalized_scores = []
            
            for score in raw_scores:
                normalized = (float(score) + 1.0) / 2.0
                normalized = max(0.0, min(1.0, normalized))
                normalized_scores.append(normalized)
            
            indices_list = indices[0].tolist()
            valid_results = [(idx, score) for idx, score in zip(indices_list, normalized_scores) if idx != -1]
            
            if valid_results:
                indices_list, scores_list = zip(*valid_results)
                return list(indices_list), list(scores_list)
            else:
                return [], []
                
        except Exception as faiss_error:
            logger.warning(f"FAISS search failed: {faiss_error}")
            return brute_force_search(query_embedding.flatten(), embeddings_list, top_k)
            
    except Exception as e:
        logger.error(f"Error in search_similar_faces: {e}")
        return [], []

def brute_force_search(query_embedding: np.ndarray, embeddings_list: List[np.ndarray], top_k: int = 50) -> Tuple[List[int], List[float]]:
    try:
        from sklearn.metrics.pairwise import cosine_similarity
        
        query_embedding = query_embedding.reshape(1, -1)
        embeddings_array = np.array(embeddings_list)
        
        if len(embeddings_array) == 0:
            return [], []
        
        similarities = cosine_similarity(query_embedding, embeddings_array)[0]
        normalized_scores = [(float(s) + 1.0) / 2.0 for s in similarities]
        
        k = min(top_k, len(normalized_scores))
        top_indices = np.argsort(normalized_scores)[-k:][::-1].tolist()
        top_scores = [normalized_scores[i] for i in top_indices]
        
        return top_indices, top_scores
        
    except Exception as e:
        logger.error(f"Brute force search error: {e}")
        return [], []

def search_in_faiss_scored(query_embedding, k=200, threshold=None, search_mode="default"):
    global index, photo_ids_list
    
    if threshold is None:
        if search_mode == "exact":
            threshold = SIMILARITY_THRESHOLD_EXACT
        elif search_mode == "high_precision":
            threshold = SIMILARITY_THRESHOLD_HIGH
        elif search_mode == "strict":
            threshold = SIMILARITY_THRESHOLD_STRICT
        else:
            threshold = SIMILARITY_THRESHOLD_DEFAULT
    
    with index_lock:
        if index is None:
            if not load_index_from_disk():
                logger.warning("⚠️ FAISS index not available")
                return []
        local_index = index
        local_ids = list(photo_ids_list)

    if not local_ids:
        return []

    query = normalize_vector(query_embedding)
    if query is None: 
        return []
    query = query.reshape(1, -1).astype("float32")

    similarities, indices = local_index.search(query, min(k, len(local_ids)))

    results = []
    seen = {}

    for i, idx in enumerate(indices[0]):
        if idx == -1 or idx >= len(local_ids):
            continue

        raw_score = float(similarities[0][i])
        normalized_score = (raw_score + 1.0) / 2.0
        normalized_score = max(0.0, min(1.0, normalized_score))
        
        if normalized_score < threshold:
            continue

        pid = local_ids[idx]
        if pid not in seen or normalized_score > seen[pid]:
            seen[pid] = normalized_score

    for pid, score in seen.items():
        results.append({"photo_id": pid, "similarity": round(score, 4)})

    results.sort(key=lambda x: x["similarity"], reverse=True)
    
    return results

def search_in_faiss(query_embedding, k=200, threshold=None, search_mode="default"):
    global index, photo_ids_list
    
    if threshold is None:
        if search_mode == "exact":
            threshold = SIMILARITY_THRESHOLD_EXACT
        elif search_mode == "high_precision":
            threshold = SIMILARITY_THRESHOLD_HIGH
        elif search_mode == "strict":
            threshold = SIMILARITY_THRESHOLD_STRICT
        else:
            threshold = SIMILARITY_THRESHOLD_DEFAULT
    
    with index_lock:
        if index is None:
            if not load_index_from_disk():
                logger.warning("⚠️ FAISS index not available")
                return []
        local_index = index
        local_ids = list(photo_ids_list)

    if not local_ids:
        return []

    query = normalize_vector(query_embedding)
    if query is None: 
        return []
    query = query.reshape(1, -1).astype("float32")

    similarities, indices = local_index.search(query, min(k, len(local_ids)))
    
    ordered_unique = []
    seen = set()

    for i, idx in enumerate(indices[0]):
        if idx == -1 or idx >= len(local_ids):
            continue
            
        raw_score = float(similarities[0][i])
        normalized_score = (raw_score + 1.0) / 2.0
        normalized_score = max(0.0, min(1.0, normalized_score))
        
        if normalized_score < threshold:
            continue
            
        pid = local_ids[idx]
        if pid not in seen:
            seen.add(pid)
            ordered_unique.append(pid)
            
    return ordered_unique


# -------------------------
# Index Statistics
# -------------------------
def get_index_stats() -> Dict[str, Any]:
    global index, photo_ids_list, index_metadata
    
    with index_lock:
        if index is None:
            if load_index_from_disk():
                return {
                    "status": "loaded_from_disk",
                    "vectors": len(photo_ids_list),
                    "index_type": index_metadata.get("index_type", "Unknown"),
                    "dimension": REQUIRED_DIM
                }
            return {"status": "not_initialized", "vectors": 0}
            
        return {
            "status": "ready",
            "vectors": len(photo_ids_list),
            "index_type": index_metadata.get("index_type", "Unknown"),
            "dimension": REQUIRED_DIM,
            "is_trained": getattr(index, 'is_trained', True),
            "nlist": index_metadata.get("nlist"),
            "nprobe": index_metadata.get("nprobe")
        }

def clear_index():
    global index, photo_ids_list, embeddings_list, index_metadata
    
    with index_lock:
        index = None
        photo_ids_list = []
        embeddings_list = []
        index_metadata = {}
        
        try:
            if os.path.exists(INDEX_CACHE_PATH):
                os.remove(INDEX_CACHE_PATH)
            if os.path.exists(IDS_CACHE_PATH):
                os.remove(IDS_CACHE_PATH)
            if os.path.exists(EMBEDDINGS_CACHE_PATH):
                os.remove(EMBEDDINGS_CACHE_PATH)
            if os.path.exists(METADATA_CACHE_PATH):
                os.remove(METADATA_CACHE_PATH)
            logger.info("🧹 FAISS index cleared")
        except Exception as e:
            logger.error(f"Error clearing index files: {e}")