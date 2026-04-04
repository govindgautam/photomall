import os
import httpx
from typing import Dict, List, Any
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

class TaggingCompleteTrigger:
    def __init__(self):
        self.completion_status: Dict[int, bool] = {}

    async def get_event_stats(self, event_id: int) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient() as client:
                event_resp = await client.get(
                    f"{SUPABASE_URL}/rest/v1/events?id=eq.{event_id}&select=name,photographer_id",
                    headers={"apikey": SUPABASE_ANON_KEY}
                )
                event_data = event_resp.json()
                if not event_data:
                    return {}
                
                admin_resp = await client.get(
                    f"{SUPABASE_URL}/rest/v1/users?id=eq.{event_data[0]['photographer_id']}&select=email",
                    headers={"apikey": SUPABASE_ANON_KEY}
                )
                admin_data = admin_resp.json()
                
                return {
                    "event_name": event_data[0]['name'],
                    "admin_email": admin_data[0]['email'] if admin_data else None
                }
        except Exception as e:
            print(f"Error getting event stats: {e}")
            return {}

    async def get_event_subscribers(self, event_id: int) -> List[str]:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{SUPABASE_URL}/rest/v1/event_subscribers?event_id=eq.{event_id}&is_active=eq.true&select=guest_email",
                    headers={"apikey": SUPABASE_ANON_KEY}
                )
                subscribers = response.json()
                return [s.get("guest_email") for s in subscribers]
        except Exception as e:
            print(f"Error getting subscribers: {e}")
            return []

    async def check_and_notify(self, event_id: int, total_photos: int, processed_photos: int):
        if self.completion_status.get(event_id, False):
            return
        
        if processed_photos >= total_photos and total_photos > 0:
            self.completion_status[event_id] = True
            
            # Import from app.services (app folder)
            from app.services.email_notification import email_notification_service
            
            stats = await self.get_event_stats(event_id)
            if stats and stats.get('admin_email'):
                await email_notification_service.notify_admin(
                    admin_email=stats['admin_email'],
                    event_name=stats['event_name'],
                    event_id=event_id,
                    photo_count=total_photos,
                    face_count=0
                )
                print(f"Admin notified for event {event_id}")
            
            subscribers = await self.get_event_subscribers(event_id)
            if subscribers and stats:
                await email_notification_service.notify_multiple_guests(
                    guest_emails=subscribers,
                    event_name=stats['event_name'],
                    event_id=event_id
                )
                print(f"Notified {len(subscribers)} guests for event {event_id}")


tagging_trigger = TaggingCompleteTrigger()

async def on_tagging_progress(event_id: int, total_photos: int, processed_photos: int):
    await tagging_trigger.check_and_notify(event_id, total_photos, processed_photos)