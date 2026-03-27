from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.db import Base

class Event(Base):
    """
    Senior Architect: Central Event Model.
    Handles strict relationships with Users (Photographers) and Photos.
    Enables cascading deletes to keep the database clean.
    """
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, default="Standard Site")
    
    # 1. Timestamps - Essential for Admin Dashboard Analytics
    # server_default=func.now() ensure karta hai ki DB level par hi time set ho jaye
    date = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 2. Assets Handling
    qr_code_path = Column(String, nullable=True)
    
    # 3. UI & Security Controls
    count = Column(Integer, default=0) # Total Photos Cache
    privacy_mode = Column(Boolean, default=False) # Privacy Toggle for Gallery

    # 4. Foreign Keys
    # Photographer ID refers to the User who created this event
    photographer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))

    # --- Relationships (Bidirectional Sync) ---
    
    # Link to Photographer (Taaki Dashboard par photographer ka naam dikh sake)
    photographer = relationship("User", back_populates="events")
    
    # Link to Photos (Isse Dashboard stats crash nahi honge)
    # cascade="all, delete-orphan" means event delete -> sari photos delete
    photos = relationship(
        "Photo", 
        back_populates="event", 
        cascade="all, delete-orphan",
        lazy="selectin" # Optimization: Faster data fetching for lists
    )

    def __repr__(self):
        return f"<Event(id={self.id}, name='{self.name}', photographer_id={self.photographer_id})>"