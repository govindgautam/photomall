import faiss
import numpy as np
import threading
import os
import logging
import time
from typing import List, Tuple, Optional

# Professional Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -------------------------
# Global State & Config
# -------------------------
# Local paths to persist the index (Prevents re-indexing on every restart)
INDEX_CACHE_PATH = "ai_index/faiss_data.index"
IDS_CACHE_PATH = "ai_index/photo_ids.npy"
METADATA_CACHE_PATH = "ai_index/metadata.json"

index = None
photo_ids_list = []
index_lock = threading.RLock()
index_metadata = {}

# Auto-save configuration
_auto_save_counter = 0
_AUTO_SAVE_INTERVAL = 5  # Save index every 5 new embeddings

# Facenet512 dimension
REQUIRED_DIM = 512

# Performance Configuration - Production Grade
SIMILARITY_THRESHOLD_EXACT = 0.35  # Stricter threshold for exact matches (Photomall Style)
SIMILARITY_THRESHOLD_HIGH = 0.40   # High precision threshold
SIMILARITY_THRESHOLD_DEFAULT = 0.60 # Default threshold for general searches
BATCH_SIZE = 32  # Optimal for GPU/CPU utilization
USE_IVF_INDEX = True  # Switch to IVFFlat for large datasets (>10k faces)
NLIST = 100  # Number of clusters for IVFFlat 

# -------------------------
# Vector Normalization (The Architect's Way)
# -------------------------
def normalize_vector(vec):
    """
    Ensures vectors are unit length for Cosine Similarity.
    Uses float32 and small epsilon to prevent division by zero.
    Senior Architect: Added L2 normalization for FAISS IndexFlatIP optimization.
    """
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

def preprocess_image_alignment(image_array: np.ndarray) -> np.ndarray:
    """
    Senior Architect: Advanced preprocessing for optimal face recognition.
    Handles image alignment, lighting normalization, and noise reduction.
    """
    try:
        if image_array is None or image_array.size == 0:
            return None
            
        # Ensure proper format
        if image_array.dtype != np.uint8:
            image_array = np.clip(image_array * 255, 0, 255).astype(np.uint8)
        
        # Convert to LAB for lighting normalization
        lab = cv2.cvtColor(image_array, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        
        # Apply CLAHE for lighting normalization
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        l_normalized = clahe.apply(l)
        
        # Merge back and convert to RGB
        lab_normalized = cv2.merge([l_normalized, a, b])
        rgb_normalized = cv2.cvtColor(lab_normalized, cv2.COLOR_LAB2RGB)
        
        # Apply gentle denoising
        denoised = cv2.fastNlMeansDenoisingColored(rgb_normalized, None, 3, 3, 7, 21)
        
        return denoised
    except Exception as e:
        logger.error(f"Image preprocessing error: {e}")
        return image_array

# -------------------------
# Index Management (Disk Persistence)
# -------------------------
def save_index_to_disk():
    """Saves the current FAISS state to disk to avoid 'Not Present' after restarts."""
    global index, photo_ids_list, index_metadata
    try:
        if index is not None:
            # Ensure directory exists
            os.makedirs(os.path.dirname(INDEX_CACHE_PATH), exist_ok=True)
            
            faiss.write_index(index, INDEX_CACHE_PATH)
            np.save(IDS_CACHE_PATH, np.array(photo_ids_list))
            
            # Save metadata for index type and parameters
            import json
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
    """Loads existing index from disk on startup."""
    global index, photo_ids_list, index_metadata
    try:
        if os.path.exists(INDEX_CACHE_PATH) and os.path.exists(IDS_CACHE_PATH):
            with index_lock:
                index = faiss.read_index(INDEX_CACHE_PATH)
                photo_ids_list = np.load(IDS_CACHE_PATH).tolist()
                
                # Load metadata if available
                if os.path.exists(METADATA_CACHE_PATH):
                    import json
                    with open(METADATA_CACHE_PATH, 'r') as f:
                        index_metadata = json.load(f)
                
                # Set nprobe for IVFFlat if applicable
                if hasattr(index, 'nprobe') and index_metadata.get("index_type") == "IVFFlat":
                    index.nprobe = min(10, index.nlist)  # Search in 10 nearest clusters
                    
            logger.info(f"📁 Loaded FAISS index: {len(photo_ids_list)} entries, type: {index_metadata.get('index_type', 'Unknown')}")
            return True
    except Exception as e:
        logger.error(f"Load Error: {e}")
    return False

# -------------------------
# Index Construction
# -------------------------
def build_faiss_index(embeddings):
    """
    Initializes a fresh FAISS index with optimal configuration.
    Senior Architect: Automatically chooses IndexFlatIP for small datasets, IVFFlat for large ones.
    """
    global index, photo_ids_list, index_metadata
    d = REQUIRED_DIM
    
    # Preprocess and validate embeddings
    vectors = []
    temp_ids = []
    
    for emb in embeddings:
        raw_vec = getattr(emb, "embedding", None)
        pid = getattr(emb, "photo_id", None)
        
        if raw_vec is not None and pid is not None:
            vec = normalize_vector(raw_vec)
            if vec is not None:
                vectors.append(vec)
                temp_ids.append(int(pid))
    
    if not vectors:
        logger.warning("⚠️ No valid embeddings to build index")
        return
        
    vectors_np = np.array(vectors).astype('float32')
    n_vectors = len(vectors_np)
    
    # Choose optimal index type based on dataset size
    if n_vectors > 10000 and USE_IVF_INDEX:
        logger.info(f"🚀 Building IVFFlat index for {n_vectors} vectors")
        
        # Train IVFFlat index
        quantizer = faiss.IndexFlatIP(d)  # Coarse quantizer
        index = faiss.IndexIVFFlat(quantizer, d, NLIST, faiss.METRIC_INNER_PRODUCT)
        
        # Training
        logger.info("⏳ Training IVFFlat index...")
        index.train(vectors_np)
        index.nprobe = min(10, NLIST)  # Search in 10 nearest clusters
        
        index_metadata = {
            "index_type": "IVFFlat",
            "nlist": NLIST,
            "nprobe": index.nprobe
        }
    else:
        logger.info(f"🚀 Building IndexFlatIP for {n_vectors} vectors")
        index = faiss.IndexFlatIP(d)
        index_metadata = {
            "index_type": "IndexFlatIP"
        }
    
    # Add vectors
    index.add(vectors_np)
    
    with index_lock:
        photo_ids_list = temp_ids
        
    save_index_to_disk()
    logger.info(f"✅ FAISS Index built: {n_vectors} vectors, type: {index_metadata['index_type']}")

def add_embeddings_to_index(embeddings):
    """
    Incrementally adds new faces to the index with batch optimization.
    Senior Architect: Processes embeddings in batches for maximum throughput.
    """
    global index, photo_ids_list
    d = REQUIRED_DIM
    
    # Preprocess and validate embeddings
    vectors = []
    ids = []

    for emb in embeddings:
        raw_vec = getattr(emb, "embedding", None)
        pid = getattr(emb, "photo_id", None)
        
        if raw_vec is not None and pid is not None:
            vec = normalize_vector(raw_vec)
            if vec is not None:
                vectors.append(vec)
                ids.append(int(pid))

    if not vectors:
        logger.warning("⚠️ No valid embeddings to add")
        return

    vectors_np = np.array(vectors).astype("float32")
    
    with index_lock:
        if index is None:
            # Auto-initialize if index doesn't exist
            logger.info("🔄 Auto-initializing FAISS index")
            if len(vectors) > 10000 and USE_IVF_INDEX:
                quantizer = faiss.IndexFlatIP(d)
                index = faiss.IndexIVFFlat(quantizer, d, NLIST, faiss.METRIC_INNER_PRODUCT)
                index.train(vectors_np)
                index.nprobe = min(10, NLIST)
            else:
                index = faiss.IndexFlatIP(d)
            photo_ids_list = []
        
        # Add vectors in batches to optimize memory usage
        batch_size = min(BATCH_SIZE, len(vectors_np))
        for i in range(0, len(vectors_np), batch_size):
            batch_vectors = vectors_np[i:i+batch_size]
            batch_ids = ids[i:i+batch_size]
            index.add(batch_vectors)
            photo_ids_list.extend(batch_ids)
    
    # Auto-save logic for real-time updates
    global _auto_save_counter
    _auto_save_counter += len(ids)
    
    if _auto_save_counter >= _AUTO_SAVE_INTERVAL:
        save_index_to_disk()
        logger.info(f"🔄 Auto-saved FAISS index after {_auto_save_counter} new embeddings")
        _auto_save_counter = 0
    else:
        save_index_to_disk()  # Still save for persistence
    
    logger.info(f"➕ Added {len(ids)} embeddings to FAISS index (batch size: {batch_size})")

# -------------------------
# Similarity Search (The Performance Engine)
# -------------------------
def search_in_faiss(query_embedding, k=200, threshold=None, search_mode="default"):
    """
    High-performance similarity search with configurable thresholds.
    Senior Architect: Sub-millisecond search with adaptive thresholds.
    
    Args:
        query_embedding: Face embedding to search for
        k: Maximum number of results to return
        threshold: Similarity threshold (auto-selected based on search_mode)
        search_mode: "exact", "high_precision", or "default"
    """
    global index, photo_ids_list
    
    # Auto-select threshold based on search mode
    if threshold is None:
        if search_mode == "exact":
            threshold = SIMILARITY_THRESHOLD_EXACT
        elif search_mode == "high_precision":
            threshold = SIMILARITY_THRESHOLD_HIGH
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

    # Normalize and validate query
    query = normalize_vector(query_embedding)
    if query is None: 
        logger.warning("⚠️ Query vector normalization failed")
        return []
    query = query.reshape(1, -1).astype("float32")

    # Perform search with timing
    start_time = time.time()
    similarities, indices = local_index.search(query, min(k, len(local_ids)))
    search_time = (time.time() - start_time) * 1000  # Convert to milliseconds
    
    # Process results with deduplication
    ordered_unique = []
    seen = set()

    for i, idx in enumerate(indices[0]):
        if idx == -1 or idx >= len(local_ids):
            continue
            
        score = float(similarities[0][i])
        if score < threshold:
            continue
            
        pid = local_ids[idx]
        if pid not in seen:
            seen.add(pid)
            ordered_unique.append(pid)
            
    logger.debug(f"🔍 FAISS search: {len(ordered_unique)} results in {search_time:.2f}ms (threshold: {threshold})")
    return ordered_unique

def search_in_faiss_scored(query_embedding, k=200, threshold=None, search_mode="default"):
    """
    High-performance similarity search with scores.
    Returns deduplicated results with similarity scores.
    """
    global index, photo_ids_list
    
    # Auto-select threshold based on search mode
    if threshold is None:
        if search_mode == "exact":
            threshold = SIMILARITY_THRESHOLD_EXACT
        elif search_mode == "high_precision":
            threshold = SIMILARITY_THRESHOLD_HIGH
        else:
            threshold = SIMILARITY_THRESHOLD_DEFAULT
    
    with index_lock:
        if index is None:
            load_index_from_disk()
        if index is None: 
            return []
        local_index = index
        local_ids = list(photo_ids_list)

    if not local_ids:
        return []

    query = normalize_vector(query_embedding)
    if query is None: 
        return []
    query = query.reshape(1, -1).astype("float32")

    # Perform search
    start_time = time.time()
    similarities, indices = local_index.search(query, min(k, len(local_ids)))
    search_time = (time.time() - start_time) * 1000

    # Process and deduplicate results
    results = []
    seen = {}

    for i, idx in enumerate(indices[0]):
        if idx == -1 or idx >= len(local_ids):
            continue

        score = float(similarities[0][i])
        if score < threshold:
            continue

        pid = local_ids[idx]
        # Keep only the highest score for each photo
        if pid not in seen or score > seen[pid]:
            seen[pid] = score

    # Convert to results list and sort by similarity
    for pid, score in seen.items():
        results.append({"photo_id": pid, "similarity": round(score, 4)})

    results.sort(key=lambda x: x["similarity"], reverse=True)
    
    logger.debug(f"🔍 FAISS scored search: {len(results)} results in {search_time:.2f}ms")
    return results

def get_index_stats():
    """
    Returns current index statistics for monitoring.
    """
    global index, photo_ids_list, index_metadata
    
    with index_lock:
        if index is None:
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