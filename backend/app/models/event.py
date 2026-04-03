# backend/app/models/event.py
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.db import Base

class Event(Base):
    """
    Senior Architect: Central Event Model with Guest Access Support.
    Handles strict relationships with Users (Photographers) and Photos.
    Enables cascading deletes to keep the database clean.
    Supports guest access via email/phone number whitelist.
    """
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, default="Standard Site")
    
    # 1. Timestamps - Essential for Admin Dashboard Analytics
    date = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 2. Assets Handling
    qr_code_path = Column(String, nullable=True)
    
    # 3. UI & Security Controls
    count = Column(Integer, default=0)  # Total Photos Cache
    privacy_mode = Column(Boolean, default=False)  # Privacy Toggle for Gallery
    
    # 4. ✅ NEW: Guest Access Control - Store allowed emails/phone numbers
    # Format: ["email@example.com", "+919876543210", "user@domain.com"]
    allowed_guests = Column(JSON, default=list, nullable=True)
    
    # 5. Foreign Keys
    photographer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))

    # --- Relationships (Bidirectional Sync) ---
    
    # Link to Photographer
    photographer = relationship("User", back_populates="events")
    
    # Link to Photos
    photos = relationship(
        "Photo", 
        back_populates="event", 
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    
    # Link to FaceEmbeddings
    face_embeddings = relationship(
        "FaceEmbedding",
        back_populates="event",
        cascade="all, delete-orphan"
    )

    # ==================== Helper Methods ====================
    
    def add_guest(self, identifier: str) -> bool:
        """
        Add a guest (email/phone) to allowed_guests list.
        Returns True if added, False if already exists.
        """
        if self.allowed_guests is None:
            self.allowed_guests = []
        
        if identifier not in self.allowed_guests:
            self.allowed_guests.append(identifier)
            return True
        return False
    
    def remove_guest(self, identifier: str) -> bool:
        """
        Remove a guest from allowed_guests list.
        Returns True if removed, False if not found.
        """
        if self.allowed_guests and identifier in self.allowed_guests:
            self.allowed_guests.remove(identifier)
            return True
        return False
    
    def has_guest_access(self, identifier: str) -> bool:
        """
        Check if a guest has access to this event.
        """
        if not identifier:
            return False
        
        # If privacy_mode is False, everyone has access
        if not self.privacy_mode:
            return True
        
        # Otherwise check whitelist
        if self.allowed_guests and identifier in self.allowed_guests:
            return True
        
        return False
    
    def get_guest_count(self) -> int:
        """
        Get number of guests with access.
        """
        return len(self.allowed_guests) if self.allowed_guests else 0
    
    def get_shareable_link(self, base_url: str = "") -> str:
        """
        Generate shareable link for this event.
        """
        return f"{base_url}/portal/event/{self.id}"

    def __repr__(self):
        return f"<Event(id={self.id}, name='{self.name}', photographer_id={self.photographer_id}, guests={self.get_guest_count()})>"