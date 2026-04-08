"""
Senior Architect: Production-Grade Face Recognition Service
- Cloud mode support for deployment (disabled on Coolify)
- Optimized face detection with multiple backends (local only)
- Normalized embedding generation (L2 norm = 1.0)
- High-performance batch processing
- Comprehensive error handling and logging
"""

import os
import logging
import time
import numpy as np
from typing import List, Optional, Tuple, Dict

# ============================================================================
# PROFESSIONAL LOGGING CONFIGURATION
# ============================================================================
logger = logging.getLogger(__name__)

# ============================================================================
# CLOUD MODE DETECTION - DISABLE HEAVY FACE RECOGNITION ON COOLIFY
# ============================================================================
CLOUD_MODE = os.getenv("CLOUD_MODE", "true").lower() == "true"

# Try to import heavy dependencies only if NOT in cloud mode
DeepFace = None
cv2 = None
torch = None

if not CLOUD_MODE:
    try:
        from deepface import DeepFace
        import cv2
        import torch
        logger.info("✅ Face recognition enabled (local development mode)")
        
        if torch.cuda.is_available():
            os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")
            logger.info("🚀 GPU acceleration enabled (CUDA detected)")
        else:
            torch.set_num_threads(max(1, (os.cpu_count() or 4) // 2))
            logger.info(f"⚙️ CPU optimization: {torch.get_num_threads()} threads")
    except ImportError as e:
        logger.warning(f"⚠️ DeepFace/cv2 not available: {e}")
        logger.warning("⚠️ Falling back to cloud mode")
        CLOUD_MODE = True
else:
    logger.info("☁️ Running in CLOUD MODE (Coolify deployment) - Face recognition disabled")
    logger.info("⚠️ Face search will use basic image matching only")

# ============================================================================
# PRODUCTION CONFIGURATION
# ============================================================================
MODEL_NAME = "Facenet512"
DETECTOR_BACKEND = "mtcnn"
ALIGNMENT = True

# Production thresholds for different use cases
MATCH_THRESHOLD_EXACT = 0.63
MATCH_THRESHOLD_HIGH_PRECISION = 0.68
MATCH_THRESHOLD_DEFAULT = 0.60

# Face detection parameters
FACE_DETECTION_CONFIDENCE = 0.5
MAX_FACES_PER_IMAGE = 10
BATCH_PROCESSING_SIZE = 16

# Model state management
_MODEL_WARM = False
_MODEL_INSTANCE = None


# ============================================================================
# ADVANCED IMAGE ENHANCEMENT (Disabled in cloud mode)
# ============================================================================
def enhance_face(face_img: np.ndarray) -> Optional[np.ndarray]:
    """
    Multi-stage face enhancement pipeline.
    DISABLED in cloud mode.
    """
    if CLOUD_MODE:
        logger.debug("Enhance face disabled in cloud mode")
        return face_img if face_img is not None else None
    
    try:
        if face_img is None or face_img.size == 0:
            logger.warning("Empty face image provided for enhancement")
            return None

        if face_img.dtype != np.uint8:
            face_img = np.clip(face_img * 255, 0, 255).astype(np.uint8)

        lab = cv2.cvtColor(face_img, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_enhanced = clahe.apply(l)

        lab_enhanced = cv2.merge([l_enhanced, a, b])
        enhanced_img = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2RGB)

        denoised = cv2.fastNlMeansDenoisingColored(
            enhanced_img, None, h=3, hColor=3, templateWindowSize=7, searchWindowSize=21
        )

        kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
        sharpened = cv2.filter2D(denoised, -1, kernel * 0.1)

        return np.clip(sharpened, 0, 255).astype(np.uint8)

    except Exception as e:
        logger.error(f"Face enhancement failed: {e}")
        return face_img if face_img is not None and face_img.ndim == 3 else None


def preprocess_image_for_face_detection(image_path: str) -> Optional[np.ndarray]:
    """
    Enhanced preprocessing for face detection.
    DISABLED in cloud mode.
    """
    if CLOUD_MODE:
        logger.debug("Preprocessing disabled in cloud mode")
        return None
    
    try:
        if not os.path.exists(image_path):
            return None
            
        img = cv2.imread(image_path)
        if img is None:
            return None
            
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        gamma = 1.2
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        img_rgb = cv2.LUT(img_rgb, table)
        
        if len(img_rgb.shape) == 3:
            ycrcb = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2YCrCb)
            ycrcb[:, :, 0] = cv2.equalizeHist(ycrcb[:, :, 0])
            img_rgb = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2RGB)
        
        height, width = img_rgb.shape[:2]
        max_dimension = 1024
        
        if max(height, width) > max_dimension:
            scale = max_dimension / max(height, width)
            new_width = int(width * scale)
            new_height = int(height * scale)
            img_rgb = cv2.resize(img_rgb, (new_width, new_height), interpolation=cv2.INTER_AREA)
        
        return img_rgb

    except Exception as e:
        logger.error(f"Image preprocessing error: {e}")
        return None


# ============================================================================
# FACE DETECTION ENGINE (Disabled in cloud mode)
# ============================================================================
def extract_faces(image_path: str, max_faces: int = MAX_FACES_PER_IMAGE) -> List[dict]:
    """
    High-accuracy face extraction with multiple detector fallback.
    RETURNS EMPTY LIST IN CLOUD MODE.
    """
    if CLOUD_MODE:
        logger.debug(f"Face detection disabled in cloud mode for: {image_path}")
        return []

    try:
        if not os.path.exists(image_path):
            logger.warning(f"Image not found: {image_path}")
            return []

        preprocessed_img = preprocess_image_for_face_detection(image_path)
        if preprocessed_img is None:
            return []

        detectors = ['mtcnn', 'opencv', 'retinaface', 'mediapipe']
        
        for detector in detectors:
            try:
                logger.debug(f"Trying detector: {detector}")
                faces = DeepFace.extract_faces(
                    img_path=preprocessed_img,
                    detector_backend=detector,
                    enforce_detection=False,
                    align=ALIGNMENT,
                    grayscale=False
                )
                
                if faces and len(faces) > 0:
                    logger.info(f"✅ Face detection successful with {detector} detector")
                    
                    valid_faces = []
                    for face in faces:
                        confidence = face.get('confidence', 0)
                        facial_area = face.get('facial_area', {})
                        width = facial_area.get('w', 0)
                        height = facial_area.get('h', 0)
                        area = width * height
                        
                        if area >= 500:
                            face['area'] = area
                            valid_faces.append(face)
                            logger.debug(f"Face detected: confidence={confidence:.2f}, area={area}")
                    
                    if valid_faces:
                        valid_faces.sort(key=lambda x: x['area'], reverse=True)
                        return valid_faces[:max_faces]
                        
            except Exception as e:
                logger.debug(f"Detector {detector} failed: {e}")
                continue
        
        logger.warning(f"No faces detected in {image_path} with any detector")
        return []

    except Exception as e:
        logger.error(f"Face extraction error for {image_path}: {e}")
        return []


def extract_faces_batch(image_paths: List[str], max_faces: int = MAX_FACES_PER_IMAGE) -> Dict[str, List[dict]]:
    """
    Batch face extraction for maximum throughput.
    RETURNS EMPTY DICT IN CLOUD MODE.
    """
    if CLOUD_MODE:
        logger.debug("Batch face extraction disabled in cloud mode")
        return {path: [] for path in image_paths}
    
    results = {}
    start_time = time.time()

    for image_path in image_paths:
        faces = extract_faces(image_path, max_faces)
        results[image_path] = faces

    elapsed = (time.time() - start_time) * 1000
    logger.info(f"📦 Batch face extraction: {len(image_paths)} images in {elapsed:.2f}ms")
    return results


# ============================================================================
# EMBEDDING GENERATION ENGINE (Disabled in cloud mode)
# ============================================================================
def generate_face_embedding_from_face(face_img: np.ndarray, enhance: bool = True) -> Optional[np.ndarray]:
    """
    Generates L2-normalized face embeddings.
    RETURNS None IN CLOUD MODE.
    """
    if CLOUD_MODE:
        logger.debug("Embedding generation disabled in cloud mode")
        return None
    
    try:
        if face_img is None or face_img.size == 0:
            logger.warning("Empty face image provided")
            return None
        
        if face_img.dtype != np.uint8:
            face_img = np.clip(face_img * 255, 0, 255).astype(np.uint8)
        
        h, w = face_img.shape[:2]
        if h < 80 or w < 80:
            scale = 112 / min(h, w)
            new_w = int(w * scale)
            new_h = int(h * scale)
            face_img = cv2.resize(face_img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        if enhance:
            enhanced_face = enhance_face(face_img)
            if enhanced_face is not None:
                face_img = enhanced_face

        start_time = time.time()

        results = DeepFace.represent(
            img_path=face_img,
            model_name=MODEL_NAME,
            detector_backend='skip',
            align=False,
            normalization='Facenet',
            enforce_detection=False
        )

        processing_time = (time.time() - start_time) * 1000

        if results and len(results) > 0:
            embedding = np.array(results[0]["embedding"]).astype("float32")
            
            norm = np.linalg.norm(embedding)
            if norm > 1e-10:
                embedding = embedding / norm
                logger.debug(f"Embedding generated in {processing_time:.2f}ms, norm: {norm:.4f} -> 1.0")
            else:
                logger.warning("Zero norm embedding detected")
                embedding = np.zeros(512, dtype="float32")
            
            return embedding

        logger.warning("No embedding results returned")
        return None

    except Exception as e:
        logger.error(f"Embedding generation error: {e}")
        return None


def generate_embeddings_batch(faces_data: List[Tuple[np.ndarray, str]]) -> List[Tuple[str, Optional[list]]]:
    """
    Batch embedding generation with normalization.
    RETURNS ALL NONE IN CLOUD MODE.
    """
    if CLOUD_MODE:
        logger.debug("Batch embedding generation disabled in cloud mode")
        return [(identifier, None) for _, identifier in faces_data]
    
    results = []
    start_time = time.time()

    for face_img, identifier in faces_data:
        embedding = generate_face_embedding_from_face(face_img)
        if embedding is not None:
            results.append((identifier, embedding.tolist()))
            logger.debug(f"Embedding generated for {identifier}")
        else:
            results.append((identifier, None))
            logger.warning(f"Failed to generate embedding for {identifier}")

    elapsed = (time.time() - start_time) * 1000
    successful = sum(1 for _, emb in results if emb is not None)
    logger.info(f"📦 Batch embedding: {successful}/{len(results)} successful in {elapsed:.2f}ms")

    return results


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================
def extract_face_embedding(image_path: str, enhance: bool = True) -> Optional[np.ndarray]:
    """
    Extract normalized face embedding from image file.
    RETURNS None IN CLOUD MODE.
    """
    if CLOUD_MODE:
        logger.debug(f"Face embedding extraction disabled in cloud mode for: {image_path}")
        return None
    
    try:
        faces = extract_faces(image_path, max_faces=5)

        if not faces:
            logger.warning(f"No face detected in {image_path}")
            return None

        best_face = max(faces, key=lambda x: x.get('area', 0))
        face_img = best_face.get('face')

        if face_img is None:
            logger.warning(f"Could not extract face image from {image_path}")
            return None

        embedding = generate_face_embedding_from_face(face_img, enhance)

        if embedding is not None:
            logger.info(f"✅ Extracted embedding from {os.path.basename(image_path)}")
        else:
            logger.warning(f"Failed to generate embedding from {image_path}")

        return embedding

    except Exception as e:
        logger.error(f"Error extracting face embedding from {image_path}: {e}")
        return None


def extract_face_embedding_from_array(image_array: np.ndarray, enhance: bool = True) -> Optional[np.ndarray]:
    """
    Extract normalized face embedding from numpy array.
    RETURNS None IN CLOUD MODE.
    """
    if CLOUD_MODE:
        logger.debug("Face embedding from array disabled in cloud mode")
        return None
    
    temp_path = None
    try:
        if image_array is None or image_array.size == 0:
            logger.warning("Empty image array provided")
            return None

        temp_path = "temp_face_array.jpg"
        cv2.imwrite(temp_path, cv2.cvtColor(image_array, cv2.COLOR_RGB2BGR))

        embedding = extract_face_embedding(temp_path, enhance)

        return embedding

    except Exception as e:
        logger.error(f"Error extracting embedding from array: {e}")
        return None

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.warning(f"Failed to clean up temp file: {e}")


def generate_embedding_from_selfie(image_path: str, enhance: bool = True) -> Optional[np.ndarray]:
    """
    Optimized selfie processing for portal search.
    RETURNS None IN CLOUD MODE.
    """
    if CLOUD_MODE:
        logger.debug(f"Selfie embedding disabled in cloud mode for: {image_path}")
        return None
    
    try:
        faces = extract_faces(image_path, max_faces=5)
        if not faces:
            logger.warning(f"No face detected in selfie: {image_path}")
            return None

        best_face = max(faces, key=lambda x: x.get('area', 0))
        face_img = best_face.get('face')

        if face_img is None:
            logger.warning(f"Could not extract face from selfie: {image_path}")
            return None

        embedding = generate_face_embedding_from_face(face_img, enhance)

        if embedding is not None:
            logger.info(f"✅ Selfie embedding generated")

        return embedding

    except Exception as e:
        logger.error(f"Selfie processing error: {e}")
        return None


# ============================================================================
# MODEL MANAGEMENT
# ============================================================================
def warmup_face_model():
    """
    Pre-warm the model to eliminate first-request latency.
    DISABLED IN CLOUD MODE.
    """
    global _MODEL_WARM, _MODEL_INSTANCE

    if CLOUD_MODE:
        logger.info("Model warmup disabled in cloud mode")
        _MODEL_WARM = True
        return

    if _MODEL_WARM:
        logger.debug("Model already warmed up")
        return

    try:
        logger.info("⏳ Warming up Facenet512 model...")
        start_time = time.time()

        _MODEL_INSTANCE = DeepFace.build_model(MODEL_NAME)

        dummy_img = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        DeepFace.extract_faces(dummy_img, detector_backend=DETECTOR_BACKEND, enforce_detection=False)

        dummy_face = np.random.randint(0, 255, (112, 112, 3), dtype=np.uint8)
        DeepFace.represent(
            img_path=dummy_face,
            model_name=MODEL_NAME,
            detector_backend='skip'
        )

        warmup_time = time.time() - start_time
        _MODEL_WARM = True

        logger.info(f"✅ Model warmup complete in {warmup_time:.2f}s")

    except Exception as e:
        logger.error(f"Model warmup failed: {e}")


def get_model_info() -> dict:
    """
    Return current model configuration and status.
    """
    return {
        "model_name": MODEL_NAME,
        "detector_backend": DETECTOR_BACKEND,
        "alignment_enabled": ALIGNMENT,
        "model_warm": _MODEL_WARM,
        "thresholds": {
            "exact": MATCH_THRESHOLD_EXACT,
            "high_precision": MATCH_THRESHOLD_HIGH_PRECISION,
            "default": MATCH_THRESHOLD_DEFAULT
        },
        "gpu_available": False,
        "cloud_mode": CLOUD_MODE
    }


# ============================================================================
# SIMILARITY CALCULATION (Works even in cloud mode - no heavy deps)
# ============================================================================
def calculate_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """
    Calculate normalized cosine similarity (0-1 range).
    Assumes embeddings are L2 normalized.
    Works in both cloud and local mode.
    """
    try:
        if embedding1 is None or embedding2 is None:
            logger.debug("One or both embeddings are None")
            return 0.0
            
        emb1 = np.array(embedding1).flatten().astype("float32")
        emb2 = np.array(embedding2).flatten().astype("float32")

        if emb1.shape[0] != 512 or emb2.shape[0] != 512:
            logger.error(f"Dimension mismatch: expected 512, got {emb1.shape[0]}")
            return 0.0

        dot_product = np.dot(emb1, emb2)
        similarity = (dot_product + 1.0) / 2.0
        similarity = max(0.0, min(1.0, similarity))

        return similarity

    except Exception as e:
        logger.error(f"Similarity calculation error: {e}")
        return 0.0


def calculate_similarity_batch(embedding_pairs: List[Tuple[np.ndarray, np.ndarray]]) -> List[float]:
    """
    Batch similarity calculation.
    """
    similarities = []
    for emb1, emb2 in embedding_pairs:
        similarity = calculate_similarity(emb1, emb2)
        similarities.append(similarity)
    return similarities


def match_face_with_threshold(embedding1: np.ndarray, embedding2: np.ndarray, threshold_type: str = "default") -> bool:
    """
    Threshold-based face matching.
    """
    if embedding1 is None or embedding2 is None:
        logger.debug("One or both embeddings are None, cannot match")
        return False
        
    similarity = calculate_similarity(embedding1, embedding2)

    if threshold_type == "exact":
        threshold = MATCH_THRESHOLD_EXACT
    elif threshold_type == "high_precision":
        threshold = MATCH_THRESHOLD_HIGH_PRECISION
    else:
        threshold = MATCH_THRESHOLD_DEFAULT

    return similarity >= threshold