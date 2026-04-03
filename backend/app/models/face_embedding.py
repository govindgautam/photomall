# backend/app/models/face_embedding.py
from sqlalchemy import Column, Integer, ForeignKey, JSON, Index
from sqlalchemy.dialects.postgresql import ARRAY, DOUBLE_PRECISION
from sqlalchemy.orm import relationship
from database.db import Base

class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"
    
    id = Column(Integer, primary_key=True, index=True)
    photo_id = Column(Integer, ForeignKey("photos.id"), nullable=False)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    # ✅ FIX: Use ARRAY(DOUBLE_PRECISION) to match database schema
    embedding = Column(ARRAY(DOUBLE_PRECISION), nullable=False)
    faiss_index_id = Column(Integer, nullable=True)
    
    # Relationships
    photo = relationship("Photo", back_populates="face_embeddings")
    event = relationship("Event", back_populates="face_embeddings")
    
    __table_args__ = (
        Index('ix_face_embeddings_photo_id', 'photo_id'),
        Index('ix_face_embeddings_event_id', 'event_id'),
    )