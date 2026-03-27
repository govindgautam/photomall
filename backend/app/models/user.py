from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.db import Base

class User(Base):
    """
    Senior Architect: Central User & Photographer Model.
    Handles authentication, roles, and bidirectional event ownership.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    
    # 1. Profile Information
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False) # Hashed Password
    
    # 2. Access Control
    # Roles: "admin" (Photographer), "user" (Guest/Client)
    role = Column(String, default="user")
    
    # 3. Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # --- Relationships (The Final Piece) ---
    
    # Ek user (Photographer) ke multiple events ho sakte hain.
    # cascade="all, delete-orphan" ensure karta hai ki user delete hone par 
    # uske banaye saare events aur unki photos bhi clean ho jayein.
    events = relationship(
        "Event", 
        back_populates="photographer", 
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<User(id={self.id}, name='{self.name}', role='{self.role}')>"