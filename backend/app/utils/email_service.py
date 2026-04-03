# backend/app/utils/email_service.py
import smtplib
import random
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", 587))
        self.sender_email = os.getenv("SENDER_EMAIL", "")
        self.sender_password = os.getenv("SENDER_PASSWORD", "")
        self.enabled = bool(self.sender_email and self.sender_password)
    
    def generate_otp(self) -> str:
        """Generate 6-digit OTP"""
        return f"{random.randint(100000, 999999)}"
    
    def send_otp_email(self, to_email: str, event_name: str, otp: str, event_id: int) -> bool:
        """Send OTP email to guest"""
        if not self.enabled:
            logger.warning("Email service not configured. OTP would be: {}".format(otp))
            return False
        
        try:
            subject = f"📸 Your Photos for {event_name} are Ready!"
            
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">📸 PhotoMall</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Your Photos Are Ready!</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <h2 style="color: #333; margin-top: 0;">Hello! 👋</h2>
                        <p style="color: #666; line-height: 1.6;">Your photos from <strong>{event_name}</strong> are now available.</p>
                        
                        <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 8px;">
                            <p style="margin: 0; color: #1e40af; font-size: 14px;">Your One-Time Password (OTP)</p>
                            <p style="margin: 10px 0 0; font-size: 32px; font-weight: bold; color: #3b82f6; letter-spacing: 4px;">{otp}</p>
                            <p style="margin: 10px 0 0; color: #666; font-size: 12px;">Valid for 10 minutes</p>
                        </div>
                        
                        <p style="color: #666; line-height: 1.6;">Click the button below to access your photos:</p>
                        
                        <a href="http://localhost:3000/portal/verify-otp?email={to_email}&event_id={event_id}" 
                           style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin: 20px 0; font-weight: bold;">
                           Access Your Photos
                        </a>
                        
                        <p style="color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px;">
                            This OTP is valid for 10 minutes. If you didn't request this, please ignore this email.<br>
                            For any issues, contact your photographer.
                        </p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.sender_email
            msg["To"] = to_email
            
            msg.attach(MIMEText(html_content, "html"))
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
            
            logger.info(f"✅ OTP email sent to {to_email} for event {event_name}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to send email: {e}")
            return False

# Singleton instance
email_service = EmailService()