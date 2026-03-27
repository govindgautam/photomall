import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import engine
from sqlalchemy import text

def add_column():
    try:
        print("Adding column processing_status...")
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE photos ADD COLUMN IF NOT EXISTS processing_status VARCHAR DEFAULT 'pending'"))
            conn.commit()
            print("Successfully added processing_status column!")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    add_column()
