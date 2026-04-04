import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from typing import List
import asyncio
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=2)

class EmailNotificationService:
    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", 587))
        self.sender_email = os.getenv("SENDER_EMAIL")
        self.sender_password = os.getenv("SENDER_PASSWORD")
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        self.enabled = bool(self.sender_email and self.sender_password)

    def _send_email_sync(self, to_email: str, subject: str, body: str):
        if not self.enabled:
            print(f"Email not configured. Would send to {to_email}: {subject}")
            return False
        
        try:
            msg = MIMEMultipart()
            msg['From'] = self.sender_email
            msg['To'] = to_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
            
            print(f"Email sent to {to_email}")
            return True
        except Exception as e:
            print(f"Failed to send email to {to_email}: {e}")
            return False

    async def send_email(self, to_email: str, subject: str, body: str):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, self._send_email_sync, to_email, subject, body)

    async def notify_admin(self, admin_email: str, event_name: str, event_id: int, photo_count: int, face_count: int):
        subject = f"Tagging Complete - {event_name}"
        body = f"""
Dear Admin,

AI face tagging is now 100% complete for event "{event_name}".

Summary:
- Total Photos: {photo_count}
- Faces Detected: {face_count}
- Event ID: {event_id}

View results: {self.frontend_url}/admin/events/{event_id}

Best regards,
PhotoMall AI Team
"""
        await self.send_email(admin_email, subject, body)

    async def notify_guest(self, guest_email: str, event_name: str, event_id: int):
        subject = f"New photos of you are ready - {event_name}"
        body = f"""
Dear Guest,

New photos have been added to event "{event_name}" and AI tagging is complete!

View your photos: {self.frontend_url}/portal/{event_id}

Login with your email and OTP to see all photos where you appear.

Best regards,
PhotoMall AI Team
"""
        await self.send_email(guest_email, subject, body)

    async def notify_multiple_guests(self, guest_emails: List[str], event_name: str, event_id: int):
        tasks = [self.notify_guest(email, event_name, event_id) for email in guest_emails]
        await asyncio.gather(*tasks)


email_notification_service = EmailNotificationService()