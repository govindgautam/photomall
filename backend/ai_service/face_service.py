# backend/ai_service/face_service.py
"""
Senior Architect: Production-Grade Face Recognition Service
- Optimized face detection with multiple backends
- Normalized embedding generation (L2 norm = 1.0)
- High-performance batch processing
- Comprehensive error handling and logging
"""

from deepface import DeepFace
import numpy as np
import cv2
import os
import logging
import time
from typing import List, Optional, Tuple, Dict

# ============================================================================
# PROFESSIONAL LOGGING CONFIGURATION
# ============================================================================
logger = logging.getLogger(__name__)

# ============================================================================
# RUNTIME OPTIMIZATION
# ============================================================================
try:
    import torch
    if torch.cuda.is_available():
        os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")
        logger.info("🚀 GPU acceleration enabled (CUDA detected)")
    else:
        # Optimize CPU threading for inference
        torch.set_num_threads(max(1, (os.cpu_count() or 4) // 2))
        logger.info(f"⚙️ CPU optimization: {torch.get_num_threads()} threads")
except ImportError:
    logger.warning("⚠️ PyTorch not available, using CPU fallback mode")
except Exception as e:
    logger.warning(f"⚠️ Runtime optimization warning: {e}")

# ============================================================================
# PRODUCTION CONFIGURATION
# ============================================================================
MODEL_NAME = "Facenet512"
DETECTOR_BACKEND = "mtcnn"  # MTCNN provides highest accuracy
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
# ADVANCED IMAGE ENHANCEMENT
# ============================================================================
def enhance_face(face_img: np.ndarray) -> Optional[np.ndarray]:
    """
    Senior Architect: Multi-stage face enhancement pipeline.
    Applies CLAHE, denoising, and sharpening for optimal recognition.
    
    Args:
        face_img: Input face image as numpy array (RGB)
        
    Returns:
        Enhanced face image or None if processing fails
    """
    try:
        if face_img is None or face_img.size == 0:
            logger.warning("Empty face image provided for enhancement")
            return None

        # Ensure uint8 format
        if face_img.dtype != np.uint8:
            face_img = np.clip(face_img * 255, 0, 255).astype(np.uint8)

        # Convert to LAB color space for better contrast control
        lab = cv2.cvtColor(face_img, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)

        # Apply CLAHE for lighting normalization
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_enhanced = clahe.apply(l)

        # Merge back and convert to RGB
        lab_enhanced = cv2.merge([l_enhanced, a, b])
        enhanced_img = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2RGB)

        # Apply gentle denoising
        denoised = cv2.fastNlMeansDenoisingColored(
            enhanced_img, None, h=3, hColor=3, templateWindowSize=7, searchWindowSize=21
        )

        # Apply subtle sharpening
        kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
        sharpened = cv2.filter2D(denoised, -1, kernel * 0.1)

        return np.clip(sharpened, 0, 255).astype(np.uint8)

    except Exception as e:
        logger.error(f"Face enhancement failed: {e}")
        # Fallback: return original image
        return face_img if face_img.ndim == 3 else None


def preprocess_image_for_face_detection(image_path: str) -> Optional[np.ndarray]:
    """
    Senior Architect: Enhanced preprocessing for face detection.
    """
    try:
        if not os.path.exists(image_path):
            return None
            
        img = cv2.imread(image_path)
        if img is None:
            return None
            
        # Convert to RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # ✅ Apply gamma correction for better contrast
        gamma = 1.2
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        img_rgb = cv2.LUT(img_rgb, table)
        
        # ✅ Apply histogram equalization for better lighting
        if len(img_rgb.shape) == 3:
            ycrcb = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2YCrCb)
            ycrcb[:, :, 0] = cv2.equalizeHist(ycrcb[:, :, 0])
            img_rgb = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2RGB)
        
        # Resize if too large
        height, width = img_rgb.shape[:2]
        max_dimension = 1024
        
        if max(height, width) > max_dimension:
            scale = max_dimension / max(height, width)
            new_width = int(width * scale)
            new_height = int(height * scale)
            img_rgb = cv2.resize(img_rgb, (new_width, new_height), interpolation=cv2.INTER_AREA)
            logger.debug(f"Resized image from {width}x{height} to {new_width}x{new_height}")
        
        return img_rgb

    except Exception as e:
        logger.error(f"Image preprocessing error: {e}")
        return None
# ============================================================================
# FACE DETECTION ENGINE
# ============================================================================
def extract_faces(image_path: str, max_faces: int = MAX_FACES_PER_IMAGE) -> List[dict]:
    """
    Senior Architect: High-accuracy face extraction with multiple detector fallback.
    """
    try:
        if not os.path.exists(image_path):
            logger.warning(f"Image not found: {image_path}")
            return []

        preprocessed_img = preprocess_image_for_face_detection(image_path)
        if preprocessed_img is None:
            return []

        # ✅ Try multiple detector backends
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
                    
                    # Process faces
                    valid_faces = []
                    for face in faces:
                        confidence = face.get('confidence', 0)
                        facial_area = face.get('facial_area', {})
                        width = facial_area.get('w', 0)
                        height = facial_area.get('h', 0)
                        area = width * height
                        
                        # Lower area threshold for better detection
                        if area >= 500:  # Reduced from 1000
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
    Senior Architect: Batch face extraction for maximum throughput.
    
    Args:
        image_paths: List of image paths to process
        max_faces: Maximum faces per image
        
    Returns:
        Dictionary mapping image path to list of detected faces
    """
    results = {}
    start_time = time.time()

    for image_path in image_paths:
        faces = extract_faces(image_path, max_faces)
        results[image_path] = faces

    elapsed = (time.time() - start_time) * 1000
    logger.info(f"📦 Batch face extraction: {len(image_paths)} images in {elapsed:.2f}ms")
    return results


# ============================================================================
# EMBEDDING GENERATION ENGINE (CRITICAL: NORMALIZED OUTPUT)
# ============================================================================
def generate_face_embedding_from_face(face_img: np.ndarray, enhance: bool = True) -> Optional[np.ndarray]:
    """
    Senior Architect: Generates L2-normalized face embeddings.
    """
    try:
        if face_img is None or face_img.size == 0:
            logger.warning("Empty face image provided")
            return None
        
        # ✅ Ensure image is in correct format
        if face_img.dtype != np.uint8:
            face_img = np.clip(face_img * 255, 0, 255).astype(np.uint8)
        
        # ✅ Resize if too small
        h, w = face_img.shape[:2]
        if h < 80 or w < 80:
            scale = 112 / min(h, w)
            new_w = int(w * scale)
            new_h = int(h * scale)
            face_img = cv2.resize(face_img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
            logger.debug(f"Resized face from {w}x{h} to {new_w}x{new_h}")

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
            
            # L2 Normalization
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
    Senior Architect: Batch embedding generation with normalization.
    
    Args:
        faces_data: List of (face_image, identifier) tuples
        
    Returns:
        List of (identifier, embedding_list) tuples, embeddings are normalized
    """
    results = []
    start_time = time.time()

    for face_img, identifier in faces_data:
        embedding = generate_face_embedding_from_face(face_img)
        if embedding is not None:
            # Convert to list for JSON serialization, already normalized
            results.append((identifier, embedding.tolist()))
            logger.debug(f"Embedding generated for {identifier}, norm: {np.linalg.norm(embedding):.6f}")
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
    Senior Architect: Extract normalized face embedding from image file.
    
    Args:
        image_path: Path to the input image
        enhance: Apply image enhancement before embedding generation
        
    Returns:
        Normalized embedding vector (norm = 1.0) or None
    """
    try:
        faces = extract_faces(image_path, max_faces=5)

        if not faces:
            logger.warning(f"No face detected in {image_path}")
            return None

        # Use the largest face for best quality
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
    Senior Architect: Extract normalized face embedding from numpy array.
    
    Args:
        image_array: RGB image as numpy array
        enhance: Apply image enhancement
        
    Returns:
        Normalized embedding vector (norm = 1.0) or None
    """
    temp_path = None
    try:
        if image_array is None or image_array.size == 0:
            logger.warning("Empty image array provided")
            return None

        # Save temporarily for face detection
        temp_path = "temp_face_array.jpg"
        cv2.imwrite(temp_path, cv2.cvtColor(image_array, cv2.COLOR_RGB2BGR))

        embedding = extract_face_embedding(temp_path, enhance)

        return embedding

    except Exception as e:
        logger.error(f"Error extracting embedding from array: {e}")
        return None

    finally:
        # Clean up temporary file
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.warning(f"Failed to clean up temp file: {e}")


def generate_embedding_from_selfie(image_path: str, enhance: bool = True) -> Optional[np.ndarray]:
    """
    Senior Architect: Optimized selfie processing for portal search.
    
    Args:
        image_path: Path to selfie image
        enhance: Apply image enhancement
        
    Returns:
        Normalized embedding vector (norm = 1.0) or None
    """
    try:
        faces = extract_faces(image_path, max_faces=5)
        if not faces:
            logger.warning(f"No face detected in selfie: {image_path}")
            return None

        # Use largest face for best match quality
        best_face = max(faces, key=lambda x: x.get('area', 0))
        face_img = best_face.get('face')

        if face_img is None:
            logger.warning(f"Could not extract face from selfie: {image_path}")
            return None

        embedding = generate_face_embedding_from_face(face_img, enhance)

        if embedding is not None:
            logger.info(f"✅ Selfie embedding generated, norm: {np.linalg.norm(embedding):.6f}")

        return embedding

    except Exception as e:
        logger.error(f"Selfie processing error: {e}")
        return None


# ============================================================================
# MODEL MANAGEMENT
# ============================================================================
def warmup_face_model():
    """
    Senior Architect: Pre-warm the model to eliminate first-request latency.
    """
    global _MODEL_WARM, _MODEL_INSTANCE

    if _MODEL_WARM:
        logger.debug("Model already warmed up")
        return

    try:
        logger.info("⏳ Warming up Facenet512 model...")
        start_time = time.time()

        # Build and cache the model
        _MODEL_INSTANCE = DeepFace.build_model(MODEL_NAME)

        # Test with dummy data
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
        # Don't raise, allow fallback


def get_model_info() -> dict:
    """
    Senior Architect: Return current model configuration and status.
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
        "gpu_available": torch.cuda.is_available() if 'torch' in globals() else False
    }


# ============================================================================
# SIMILARITY CALCULATION (0-1 RANGE)
# ============================================================================
def calculate_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """
    Senior Architect: Calculate normalized cosine similarity (0-1 range).
    Assumes embeddings are L2 normalized.
    
    Args:
        embedding1: First embedding vector
        embedding2: Second embedding vector
        
    Returns:
        Similarity score between 0 and 1, where 1 = identical
    """
    try:
        emb1 = np.array(embedding1).flatten().astype("float32")
        emb2 = np.array(embedding2).flatten().astype("float32")

        if emb1.shape[0] != 512 or emb2.shape[0] != 512:
            logger.error(f"Dimension mismatch: expected 512, got {emb1.shape[0]}")
            return 0.0

        # Cosine similarity = dot product (since vectors are normalized)
        # Range: -1 to 1
        dot_product = np.dot(emb1, emb2)

        # Normalize to 0-1 range for UI display
        similarity = (dot_product + 1.0) / 2.0
        similarity = max(0.0, min(1.0, similarity))

        return similarity

    except Exception as e:
        logger.error(f"Similarity calculation error: {e}")
        return 0.0


def calculate_similarity_batch(embedding_pairs: List[Tuple[np.ndarray, np.ndarray]]) -> List[float]:
    """
    Senior Architect: Batch similarity calculation.
    
    Args:
        embedding_pairs: List of (embedding1, embedding2) tuples
        
    Returns:
        List of similarity scores (0-1 range)
    """
    similarities = []
    for emb1, emb2 in embedding_pairs:
        similarity = calculate_similarity(emb1, emb2)
        similarities.append(similarity)
    return similarities


def match_face_with_threshold(embedding1: np.ndarray, embedding2: np.ndarray, threshold_type: str = "default") -> bool:
    """
    Senior Architect: Threshold-based face matching.
    
    Args:
        embedding1: First embedding
        embedding2: Second embedding
        threshold_type: 'exact', 'high_precision', or 'default'
        
    Returns:
        True if similarity >= threshold
    """
    similarity = calculate_similarity(embedding1, embedding2)

    if threshold_type == "exact":
        threshold = MATCH_THRESHOLD_EXACT
    elif threshold_type == "high_precision":
        threshold = MATCH_THRESHOLD_HIGH_PRECISION
    else:
        threshold = MATCH_THRESHOLD_DEFAULT

    return similarity >= threshold