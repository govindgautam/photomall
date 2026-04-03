# backend/test_face_detection.py
import os
import sys
sys.path.append(os.path.dirname(__file__))

from ai_service.face_service import extract_faces, generate_face_embedding_from_face
import cv2

def test_face_detection(image_path):
    print(f"\n🔍 Testing face detection on: {image_path}")
    
    # Check if file exists
    if not os.path.exists(image_path):
        print(f"❌ File not found: {image_path}")
        return
    
    # Test 1: Extract faces
    faces = extract_faces(image_path)
    print(f"📸 Faces detected: {len(faces)}")
    
    if faces:
        for i, face in enumerate(faces):
            confidence = face.get('confidence', 0)
            area = face.get('area', 0)
            print(f"   Face {i+1}: confidence={confidence:.2f}, area={area}")
        
        # Test 2: Generate embedding
        embedding = generate_face_embedding_from_face(faces[0]['face'])
        if embedding is not None:
            print(f"✅ Embedding generated successfully (shape: {embedding.shape})")
        else:
            print("❌ Failed to generate embedding")
    else:
        print("❌ No faces detected")
        
        # Try with different detector
        print("\n🔄 Trying with different detector...")
        from deepface import DeepFace
        try:
            result = DeepFace.verify(img1_path=image_path, img2_path=image_path, 
                                     model_name='Facenet512', detector_backend='opencv')
            print(f"DeepFace verification result: {result}")
        except Exception as e:
            print(f"DeepFace error: {e}")

if __name__ == "__main__":
    # Test with a sample image from uploads
    uploads_dir = "uploads/originals"
    if os.path.exists(uploads_dir):
        images = [f for f in os.listdir(uploads_dir) if f.endswith(('.jpg', '.png', '.jpeg'))]
        if images:
            test_image = os.path.join(uploads_dir, images[0])
            test_face_detection(test_image)
        else:
            print("No images found in uploads/originals/")
    else:
        print("Uploads directory not found")