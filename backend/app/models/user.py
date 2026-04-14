from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.db import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    clerk_id = Column(String, unique=True, nullable=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    role = Column(String, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    events = relationship("Event", back_populates="photographer", cascade="all, delete-orphan")