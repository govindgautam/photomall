from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.routes.event_routes import get_enhanced_admin_stats, DashboardStats
from database.db import SessionLocal
from app.utils.auth_utils import get_current_user_optional

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/stats", response_model=DashboardStats)
def get_admin_dashboard_stats(
    db: Session = Depends(get_db),
    use_cache: bool = Query(True),
    _current_user: str = Depends(get_current_user_optional)
):
    """
    Delegates to the highly optimized enhanced admin stats function.
    """
    return get_enhanced_admin_stats(db, use_cache, _current_user)
