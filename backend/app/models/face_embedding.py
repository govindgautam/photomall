from sqlalchemy import Column, Integer, ForeignKey, Float, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from database.db import Base

class FaceEmbedding(Base):
    """
    Stores 512-dimensional vector embeddings for each detected face.
    Links back to the source photo and provides an ID for FAISS indexing.
    """
    __tablename__ = "face_embeddings"

    id = Column(Integer, primary_key=True, index=True)

    # Reference to the source photo in the 'photos' table
    photo_id = Column(Integer, ForeignKey("photos.id"), nullable=False)

    # 512-dimensional vector embedding stored as a PostgreSQL ARRAY
    # Crucial for high-accuracy face matching
    embedding = Column(ARRAY(Float), nullable=False)

    # Mapping ID for the FAISS vector index (Phase 3 Search logic)
    faiss_index_id = Column(Integer, nullable=True)
    
    # Audit column to track when the face was processed
    #created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship back to the Photo model
    # back_populates ensures consistency with the 'faces' field in Photo model
    photo = relationship("Photo", back_populates="faces")