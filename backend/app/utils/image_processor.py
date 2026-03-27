import os
import logging
from PIL import Image, ImageDraw, ImageFont

# Logging setup
logger = logging.getLogger(__name__)

# Define directory paths
ORIGINALS_DIR = "uploads/originals/"
PREVIEWS_DIR = "uploads/previews/"

os.makedirs(ORIGINALS_DIR, exist_ok=True)
os.makedirs(PREVIEWS_DIR, exist_ok=True)

def process_and_watermark(file_path: str, filename: str, watermark_text: str = "GOVIND PHOTOGRAPHY"):
    """
    Creates a high-quality watermarked preview.
    Uses an Alpha Layer for professional semi-transparent watermarks.
    """
    try:
        if not os.path.exists(file_path):
            logger.error(f"❌ File not found: {file_path}")
            return None

        # 1. Open the original image
        with Image.open(file_path) as img:
            # Handle EXIF orientation (Important for mobile uploads)
            try:
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
            except: pass

            # 2. CREATE A COPY & RESIZE
            # Standard 1280px (720p/1080p category) for optimal preview speed vs quality
            max_size = (1280, 1280)
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Convert to RGBA to support transparency in watermark
            preview_img = img.convert("RGBA")
            width, height = preview_img.size

            # 3. Initialize Watermark Layer (The Overlay)
            # Hum ek transparent image banayenge overlay ke liye
            txt_layer = Image.new("RGBA", preview_img.size, (255, 255, 255, 0))
            draw = ImageDraw.Draw(txt_layer)

            # 4. Load Font Logic
            try:
                # Dynamic font size based on image width
                font_size = int(width / 18)
                # Ensure you have this font in your root or static folder
                font = ImageFont.truetype("arial.ttf", font_size)
            except Exception:
                logger.warning("⚠️ arial.ttf not found, using default font.")
                font = ImageFont.load_default()

            # 5. Calculate Text Position
            # Center-aligned diagonal watermark is harder to remove
            left, top, right, bottom = draw.textbbox((0, 0), watermark_text, font=font)
            text_width = right - left
            text_height = bottom - top
            
            # Position: Bottom Right corner with padding
            margin = 30
            x = width - text_width - margin
            y = height - text_height - margin

            # 6. Draw Watermark with Alpha (Opacity)
            # (255, 255, 255, 128) -> White color with 50% transparency
            draw.text((x, y), watermark_text, fill=(255, 255, 255, 140), font=font)

            # 7. Alpha Composite (Merge main image with watermark layer)
            out = Image.alpha_composite(preview_img, txt_layer)
            
            # Convert back to RGB for JPEG saving
            final_preview = out.convert("RGB")

            # 8. Save the Preview
            preview_filename = f"preview_{filename}"
            preview_path = os.path.join(PREVIEWS_DIR, preview_filename)
            
            # Optimization: 75-80 quality is enough for previews and saves bandwidth
            final_preview.save(preview_path, "JPEG", quality=80, optimize=True)

            logger.info(f"✅ Preview Generated: {preview_filename}")
            return preview_path

    except Exception as e:
        logger.error(f"❌ Watermark Error {filename}: {str(e)}")
        return None

def get_preview_url(filename: str):
    """
    Returns the corrected API path for serving the preview image.
    """
    return f"/uploads/previews/preview_{filename}"