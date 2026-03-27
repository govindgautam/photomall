import qrcode
import os

# QR codes static folder mein jayenge taaki frontend par dikh sakein
QR_DIRECTORY = "static/qrcodes/"
os.makedirs(QR_DIRECTORY, exist_ok=True)

def generate_event_qr(event_id: int):
    """
    Generates a QR code for a specific event landing page.
    """
    # ⚡ IMPORTANT: Is URL ko apne Frontend (React/Next.js) ke hisaab se rakhein.
    # Agar phone se test kar rahe ho, toh 'localhost' ki jagah apna IP (e.g. 192.168.x.x) daalein.
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
    event_url = f"{FRONTEND_URL}/event/{event_id}"
    
    # Create QR instance with Medium error correction (Logo wagera ke liye space bachti hai)
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(event_url)
    qr.make(fit=True)

    # Professional Black & White QR
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Save path logic
    file_name = f"event_{event_id}_qr.png"
    file_path = os.path.join(QR_DIRECTORY, file_name)
    img.save(file_path)
    
    print(f"✅ QR Code generated for Event {event_id} -> {event_url}")
    return file_path