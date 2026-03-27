import os
import requests
import time
import subprocess
import sys

try:
    from bing_image_downloader import downloader
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "bing-image-downloader", "pillow"])
    from bing_image_downloader import downloader

from PIL import Image

API_BASE = "http://127.0.0.1:8000/api/py"
CELEBS = [
    "Shahrukh Khan face close up",
    "Virat Kohli face close up",
    "MS Dhoni face close up",
    "Rohit Sharma face close up",
    "Salman Khan face close up"
]
PHOTOS_PER_CELEB = 10
TEMP_DIR = "temp_celebs"

os.makedirs(TEMP_DIR, exist_ok=True)

def create_event():
    print("Creating testing event...")
    resp = requests.post(f"{API_BASE}/events/", json={
        "name": "Celebrity Test Gala",
        "date": "2026-03-26",
        "location": "Mumbai",
        "privacy_mode": "public",
        "photographer_id": 1
    })
    if resp.status_code in [200, 201]:
        evt_id = resp.json().get("id")
        print(f"Event created with ID: {evt_id}")
        return evt_id
    else:
        print("Failed to create event, using fallback Event ID 1...")
        return 1

def download_images():
    files_to_upload = []
    
    for celeb in CELEBS:
        print(f"Searching for {celeb}...")
        try:
            downloader.download(celeb, limit=PHOTOS_PER_CELEB, output_dir=TEMP_DIR, adult_filter_off=False, force_replace=False, timeout=10)
            celeb_dir = os.path.join(TEMP_DIR, celeb)
            if os.path.exists(celeb_dir):
                for f in os.listdir(celeb_dir):
                    path = os.path.join(celeb_dir, f)
                    try:
                        with Image.open(path) as im:
                            im.verify()
                        files_to_upload.append(path)
                    except Exception:
                        os.remove(path)
        except Exception as e:
            print(f"Failed to download {celeb}: {e}")
            
    return files_to_upload

def upload_bulk(event_id, file_paths):
    print(f"Uploading {len(file_paths)} photos to Event ID {event_id}...")
    
    # Upload in chunks of 50 to avoid payload limits
    chunk_size = 50
    for i in range(0, len(file_paths), chunk_size):
        chunk = file_paths[i:i + chunk_size]
        files = []
        for fp in chunk:
            files.append(('files', (f"{i}_{os.path.basename(fp)}", open(fp, 'rb'), 'image/jpeg')))
        
        data = {'event_id': str(event_id), 'use_batch_processing': 'true'}
        resp = requests.post(f"{API_BASE}/photos/upload-bulk", data=data, files=files)
        
        for _, f_tuple in files:
            f_tuple[1].close()
            
        if resp.ok:
            res_json = resp.json()
            print(f"Success Chunk! {res_json['message']} Time: ~{res_json.get('processing_time_seconds', 0)}s")
        else:
            print(f"Chunk failed: {resp.text}")

if __name__ == "__main__":
    evt_id = create_event()
    paths = download_images()
    # Add previously downloaded ducks to paths if they exist
    for f in os.listdir(TEMP_DIR):
        if f.endswith('.jpg') and os.path.isfile(os.path.join(TEMP_DIR, f)):
            paths.append(os.path.join(TEMP_DIR, f))
            
    if paths:
        upload_bulk(evt_id, list(set(paths)))
        print("Done injecting. Verify via UI.")
    else:
        print("No images found.")
