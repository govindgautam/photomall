from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class EventBase(BaseModel):
    name: str
    location: str
    photographer_id: int

class EventCreate(EventBase):
    event_date: Optional[str] = None 

# Dashboard ke liye ye schema zaroori hai
class DashboardStats(BaseModel):
    total_events: int
    total_photos: int
    total_faces: int
    storage_used: str  # String rakha hai "15.20 MB" format ke liye
    recent_events: List[dict]
    processing_events: int
    completed_events: int
    average_photos_per_event: float
    model_config = ConfigDict(from_attributes=True)

class EventDetailResponse(BaseModel):
    id: int
    name: str
    location: str
    date: Optional[str] = None
    photo_count: int
    total_size: str
    status: str
    qr_code_path: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class EventResponse(EventBase):
    id: int
    qr_code_path: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)