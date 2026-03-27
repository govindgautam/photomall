import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database.db import SessionLocal
from app.models.event import Event
from app.models.photo import Photo
from sqlalchemy import func, case
from sqlalchemy.orm import Session

def test_query():
    db = SessionLocal()
    try:
        print("Testing DB Connection...")
        # Try the exact query used in event_routes.py
        processing_stats = db.query(
            Event.id,
            func.count(Photo.id).label('photo_count'),
            func.sum(case((Photo.is_processed == True, 1), else_=0)).label('processed_count')
        ).outerjoin(Photo).group_by(Event.id).all()
        
        print("Query 1 Success! Results:", processing_stats)
        
        events_query = (
            db.query(
                Event.id,
                Event.name,
                Event.location,
                Event.date,
                Event.photographer_id,
                Event.privacy_mode,
                func.count(Photo.id).label('photo_count'),
                func.sum(case((Photo.is_processed == True, 1), else_=0)).label('processed_count')
            )
            .outerjoin(Photo, Event.id == Photo.event_id)
            .filter(Event.photographer_id == 1)
            .group_by(Event.id)
            .all()
        )
        print("Query 2 Success! Results:", events_query)
        
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_query()
