from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.db import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    role = Column(String, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # SMTP Settings
    smtp_password = Column(String, nullable=True)
    smtp_server = Column(String, default="smtp.gmail.com")
    smtp_port = Column(Integer, default=587)
    
    # ✅ ADD THIS RELATIONSHIP - Links to Event model
    events = relationship("Event", back_populates="photographer", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"