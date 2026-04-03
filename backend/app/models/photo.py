from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, BigInteger
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.db import Base

class Photo(Base):
    """
    Senior Architect: Optimized Photo Model for High-Speed Face Recognition.
    Handles storage paths, processing states, and bidirectional relationships.
    """
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, index=True)
    
    # 1. Paths
    file_path = Column(String, nullable=False) # Original High-Res
    preview_path = Column(String, nullable=True) # Watermarked/Compressed
    
    # 2. Stats
    original_size = Column(BigInteger, default=0) 
    
    # 3. AI Processing Logic
    is_processed = Column(Boolean, default=False)
    processing_status = Column(String, default="pending") # pending, processing, completed, failed
    
    # 4. Foreign Keys
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    
    # 5. Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # --- Relationships ---
    
    # Bidirectional link to Event
    event = relationship("Event", back_populates="photos")

    # ✅ FIXED - Link to extracted faces (use "FaceEmbedding" string, not variable)
    face_embeddings = relationship(
        "FaceEmbedding", 
        back_populates="photo", 
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Photo(id={self.id}, event_id={self.event_id}, status='{self.processing_status}')>"