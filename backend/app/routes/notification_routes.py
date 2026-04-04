from fastapi import APIRouter
from pydantic import BaseModel
import os
import httpx

router = APIRouter()

class SubscribeRequest(BaseModel):
    email: str

class UnsubscribeRequest(BaseModel):
    email: str

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

@router.post("/subscribe/{event_id}")
async def subscribe_to_event(event_id: int, request: SubscribeRequest):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SUPABASE_URL}/rest/v1/event_subscribers",
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "event_id": event_id,
                    "guest_email": request.email,
                    "is_active": True
                }
            )
            
            if response.status_code in [200, 201]:
                return {"success": True, "message": f"Subscribed to event {event_id}"}
            else:
                return {"success": False, "message": "Already subscribed or error"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.post("/unsubscribe/{event_id}")
async def unsubscribe_from_event(event_id: int, request: UnsubscribeRequest):
    try:
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/event_subscribers?event_id=eq.{event_id}&guest_email=eq.{request.email}",
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                    "Content-Type": "application/json"
                },
                json={"is_active": False}
            )
            return {"success": True, "message": f"Unsubscribed from event {event_id}"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.get("/subscribers/{event_id}")
async def get_event_subscribers(event_id: int):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/event_subscribers?event_id=eq.{event_id}&is_active=eq.true&select=guest_email",
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
                }
            )
            subscribers = response.json()
            return {"subscribers": [s.get("guest_email") for s in subscribers]}
    except Exception as e:
        return {"subscribers": []}

@router.post("/test/{event_id}")
async def test_notification(event_id: int):
    """Test endpoint - sends email directly to admin and guest"""
    from app.services.email_notification import email_notification_service
    
    print(f"📧 Sending test notification for event {event_id}")
    
    # Send test email to admin
    await email_notification_service.notify_admin(
        admin_email="govindgautam9079077974@gmail.com",
        event_name=f"Test Event {event_id}",
        event_id=event_id,
        photo_count=10,
        face_count=5
    )
    
    # Send test email to guest
    await email_notification_service.notify_guest(
        guest_email="govindgautam122004@gmail.com",
        event_name=f"Test Event {event_id}",
        event_id=event_id
    )
    
    print(f"✅ Test emails sent for event {event_id}")
    
    return {"success": True, "message": "Test emails sent"}