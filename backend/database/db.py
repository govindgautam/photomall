from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

# ============================================================
# DATABASE CONNECTION STRING (Supports both Local & Supabase)
# ============================================================

# Try to get DATABASE_URL from environment first
DATABASE_URL = os.getenv("DATABASE_URL", "")

# If DATABASE_URL not set, try building from Supabase credentials
if not DATABASE_URL:
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_PASSWORD = os.getenv("SUPABASE_DATABASE_PASSWORD", "")
    
    if SUPABASE_URL and SUPABASE_PASSWORD:
        # Extract project ID from Supabase URL
        project_id = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "")
        # Use connection pooler (port 6543) instead of direct (5432)
        DATABASE_URL = f"postgresql://postgres:{SUPABASE_PASSWORD}@db.{project_id}.supabase.co:6543/postgres?sslmode=require"
        print(f"✅ Using Supabase connection pooler for: {project_id}")
    else:
        # Fallback to local PostgreSQL (your original config)
        DATABASE_URL = "postgresql://postgres:postgres123@localhost:5433/event_photo_db"
        print("⚠️ Using local PostgreSQL database")

# ============================================================
# CREATE ENGINE WITH OPTIMIZED SETTINGS FOR DEPLOYMENT
# ============================================================

# Check if we're connecting to Supabase (cloud)
is_supabase = "supabase.co" in DATABASE_URL or "pooler.supabase" in DATABASE_URL

if is_supabase:
    # Supabase specific engine settings
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,           # Check connection before using
        pool_size=5,                  # Limit connection pool size
        max_overflow=10,              # Allow extra connections if needed
        pool_recycle=3600,            # Recycle connections every hour
        connect_args={
            "connect_timeout": 10,    # 10 second timeout
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5
        }
    )
    print("✅ Supabase engine created with optimized settings")
else:
    # Local PostgreSQL engine (your original config preserved)
    engine = create_engine(DATABASE_URL)
    print("✅ Local PostgreSQL engine created")

# ============================================================
# SESSION LOCAL
# ============================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

# ============================================================
# TEST CONNECTION (Preserved from your original code)
# ============================================================

try:
    connection = engine.connect()
    print("✅ Database connected successfully")
    connection.close()
except Exception as e:
    print("❌ Database connection failed:", e)

# ============================================================
# GET DB SESSION (YOUR ORIGINAL FUNCTION - NO CHANGE)
# ============================================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()