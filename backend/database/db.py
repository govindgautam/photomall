from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

# ============================================================
# DATABASE CONNECTION - NEON POSTGRESQL
# ============================================================

DATABASE_URL = "postgresql://neondb_owner:npg_NChJsc2yM9Df@ep-frosty-lab-a15dl73a-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Override from environment if provided
if os.getenv("DATABASE_URL"):
    DATABASE_URL = os.getenv("DATABASE_URL")

print("✅ Using Neon PostgreSQL database")

# ============================================================
# CREATE ENGINE
# ============================================================

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,
    connect_args={
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5
    }
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Test connection
try:
    connection = engine.connect()
    print("✅ Database connected successfully")
    connection.close()
except Exception as e:
    print("❌ Database connection failed:", e)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create all tables if they don't exist
Base.metadata.create_all(bind=engine)
print("✅ Database tables ensured")
