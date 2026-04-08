# backend/app/main.py
import os
import logging
import asyncio
import traceback
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any, Optional
import json

# --- Database & Models Imports ---
from database.db import engine, Base, SessionLocal
from app.models.face_embedding import FaceEmbedding
from app.models.event import Event 
from app.models.photo import Photo
from app.models.user import User  # ✅ Added User import
from app.routes.portal_routes import router as portal_router

# --- API Router Imports ---
from app.routes.auth_routes import router as auth_router
from app.routes.event_routes import router as event_router
from app.routes.photo_routes import router as photo_router
from app.routes.search_routes import router as search_router
from app.routes.download_routes import router as download_router
from app.routes.admin_routes import router as admin_router
from app.routes.user_routes import router as user_router
from app.routes.email_routes import router as email_router
from app.routes import notification_routes
from app.utils.websocket_manager import manager, startup_websocket_manager, shutdown_websocket_manager
from app.utils.auth_utils import get_current_user_optional, get_current_user

# --- AI & FAISS Logic ---
from ai_index.faiss_index import build_faiss_index, get_index_stats
from ai_service.face_service import warmup_face_model

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --- Global Error Statistics ---
error_stats = {
    'total_errors': 0,
    'database_errors': 0,
    'ai_errors': 0,
    'websocket_errors': 0,
    'validation_errors': 0,
    'last_error': None,
    'errors_by_endpoint': {},
    'startup_time': None
}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ai-photomall-backend"}

# --- Global Exception Middleware ---
class GlobalExceptionMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.startup_time = time.time()
        
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            return response
        except HTTPException as http_exc:
            raise http_exc
        except Exception as exc:
            return await self._handle_exception(request, exc)
    
    async def _handle_exception(self, request: Request, exc: Exception) -> JSONResponse:
        global error_stats
        
        error_stats['total_errors'] += 1
        error_stats['last_error'] = {
            'timestamp': time.time(),
            'type': type(exc).__name__,
            'message': str(exc),
            'endpoint': str(request.url.path),
            'method': request.method
        }
        
        endpoint = str(request.url.path)
        if endpoint not in error_stats['errors_by_endpoint']:
            error_stats['errors_by_endpoint'][endpoint] = 0
        error_stats['errors_by_endpoint'][endpoint] += 1
        
        error_category = self._categorize_error(exc)
        error_stats[f'{error_category}_errors'] += 1
        
        logger.error(f"❌ Error: {type(exc).__name__} | {endpoint} | Category: {error_category}")
        logger.debug(f"Traceback: {traceback.format_exc()}")
        
        error_response = self._create_safe_error_response(exc)
        
        return JSONResponse(
            status_code=error_response['status_code'],
            content=error_response
        )
    
    def _categorize_error(self, exc: Exception) -> str:
        exc_str = str(exc).lower()
        if any(keyword in exc_str for keyword in ['database', 'sql', 'connection']):
            return 'database'
        elif any(keyword in exc_str for keyword in ['ai', 'face', 'embedding', 'faiss']):
            return 'ai'
        elif any(keyword in exc_str for keyword in ['websocket', 'connection reset']):
            return 'websocket'
        elif any(keyword in exc_str for keyword in ['validation', 'value']):
            return 'validation'
        else:
            return 'general'
    
    def _create_safe_error_response(self, exc: Exception) -> Dict[str, Any]:
        exc_str = str(exc).lower()
        
        if 'database' in exc_str:
            return {
                "error_code": "DATABASE_ERROR",
                "detail": "Database operation failed. Please try again.",
                "status_code": 503,
                "timestamp": time.time()
            }
        elif 'face' in exc_str or 'embedding' in exc_str:
            return {
                "error_code": "AI_PROCESSING_ERROR",
                "detail": "Face processing failed. Please try with a clearer image.",
                "status_code": 400,
                "timestamp": time.time()
            }
        else:
            return {
                "error_code": "INTERNAL_SERVER_ERROR",
                "detail": "An unexpected error occurred.",
                "status_code": 500,
                "timestamp": time.time()
            }

class NullValueSafetyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Middleware error: {e}")
            return await call_next(request)

class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # ✅ FIXED: Correct path with /api/py prefix
        if request.url.path in ["/api/py/photos/upload-bulk", "/api/photos/upload-bulk"]:
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    body_size = int(content_length)
                    if body_size > 1024 * 1024 * 1024:  # 1GB
                        return JSONResponse(
                            status_code=413,
                            content={"detail": "Bulk upload payload is too large."},
                        )
                except ValueError:
                    pass
        return await call_next(request)

# --- Database Dependency ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        try:
            db.close()
        except Exception as e:
            logger.error(f"Database close error: {e}")

# --- Application Lifespan Management ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global error_stats
    logger.info("🚀 Initializing AI Event Photo Finder Engine...")
    
    error_stats['startup_time'] = time.time()
    
    try:
        # 1. Create required directories
        required_dirs = [
            "storage", "storage/events", "storage/qr_codes",
            "uploads/originals", "uploads/previews", "uploads/events",
            "static/qrcodes", "temp_search", "logs"
        ]
        
        for directory in required_dirs:
            if not os.path.exists(directory):
                os.makedirs(directory, exist_ok=True)
                logger.info(f"📁 Created: {directory}")
        
        # 2. Database synchronization
        logger.info("🗄️ Synchronizing Database Schema...")
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("✅ Database schema synchronized")
        except Exception as e:
            logger.error(f"❌ Database sync failed: {e}")
            raise
        
        # 3. Schema updates
        try:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE events ADD COLUMN IF NOT EXISTS privacy_mode BOOLEAN DEFAULT FALSE"))
                conn.execute(text("ALTER TABLE photos ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_password VARCHAR(255)"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_server VARCHAR(255) DEFAULT 'smtp.gmail.com'"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587"))
                conn.commit()
                logger.info("✅ Schema verified")
        except Exception as se:
            logger.warning(f"Schema update warning: {se}")
        
        # 4. FAISS Index sync
        logger.info("🧠 Syncing FAISS Vector Index...")
        db = SessionLocal()
        try:
            all_embeddings = db.query(FaceEmbedding).all()
            if all_embeddings:
                logger.info(f"Found {len(all_embeddings)} face vectors")
                await asyncio.to_thread(build_faiss_index, all_embeddings)
                logger.info("✅ FAISS Index initialized")
            else:
                logger.warning("⚠️ No face embeddings found")
        except Exception as e:
            logger.error(f"FAISS error: {e}")
        finally:
            db.close()
        
        # 5. Warmup AI model
        logger.info("⏳ Warming up AI model...")
        try:
            await asyncio.to_thread(warmup_face_model)
            logger.info("✅ Model warmup complete")
        except Exception as e:
            logger.warning(f"Model warmup warning: {e}")
        
        # 6. WebSocket manager
        logger.info("🔌 Initializing WebSocket Manager...")
        try:
            await startup_websocket_manager()
            logger.info("✅ WebSocket Manager initialized")
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        
        duration = time.time() - error_stats['startup_time']
        logger.info(f"🎉 Startup completed in {duration:.2f}s")
        
        yield
        
        # Shutdown
        logger.info("🛑 Shutting down...")
        try:
            await shutdown_websocket_manager()
        except Exception as e:
            logger.error(f"Shutdown error: {e}")
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
        raise

# --- FastAPI App Instance ---
app = FastAPI(
    title="AI Event Photo Finder",
    description="Enterprise-grade AI-driven photo recognition system",
    version="1.6.0", 
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# --- Middleware Registration (Order matters!) ---
app.add_middleware(GlobalExceptionMiddleware)
app.add_middleware(NullValueSafetyMiddleware)
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# --- Static Assets ---
# Ensure uploads directory exists
uploads_path = os.path.join(os.getcwd(), "uploads")
if not os.path.exists(uploads_path):
    os.makedirs(uploads_path, exist_ok=True)

storage_path = os.path.join(os.getcwd(), "storage")
if not os.path.exists(storage_path):
    os.makedirs(storage_path, exist_ok=True)

static_qr_path = os.path.join(os.getcwd(), "static/qrcodes")
if not os.path.exists(static_qr_path):
    os.makedirs(static_qr_path, exist_ok=True)

# Mount static directories
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/storage", StaticFiles(directory="storage"), name="storage")
app.mount("/static/qrcodes", StaticFiles(directory="static/qrcodes"), name="qrcodes")

# --- API Routes ---
app.include_router(admin_router, prefix="/api/py/admin", tags=["Admin"])
app.include_router(auth_router, prefix="/api/py/auth", tags=["Authentication"])
app.include_router(event_router, prefix="/api/py/events", tags=["Events"])
app.include_router(photo_router, prefix="/api/py/photos", tags=["Photos"])
app.include_router(search_router, prefix="/api/py/search", tags=["Search"])
app.include_router(download_router, prefix="/api/py/download", tags=["Download"])
app.include_router(portal_router, prefix="/api/py/portal", tags=["Portal"])
app.include_router(email_router, prefix="/api/py/email", tags=["Email Access"])
app.include_router(user_router, prefix="/api/py/user", tags=["User Settings"])
app.include_router(notification_routes.router, prefix="/api/py/notifications", tags=["Notifications"])

# --- WebSocket ---
@app.websocket("/api/py/ws/ingestion/{event_id}")
async def ingestion_websocket(websocket: WebSocket, event_id: str = "global"):
    await websocket.accept()
    client_id = None
    try:
        client_id = await manager.connect(websocket, event_id)
        await asyncio.sleep(0.15)
        
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get('type') == 'PING':
                    if client_id and client_id in manager.connection_registry:
                        await manager._send_safe(
                            manager.connection_registry[client_id],
                            {"type": "PONG", "timestamp": time.time()}
                        )
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {event_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        try:
            manager.disconnect(websocket, event_id, client_id)
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

# --- Health Check ---
@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    try:
        # Database check
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            db_status = "healthy"
        except:
            db_status = "unhealthy"
        finally:
            db.close()
        
        # FAISS stats
        try:
            faiss_stats = get_index_stats()
        except:
            faiss_stats = {"status": "unavailable"}
        
        uptime = time.time() - error_stats.get('startup_time', time.time())
        
        return {
            "status": "online",
            "version": "1.6.0",
            "uptime_seconds": round(uptime, 2),
            "database": db_status,
            "faiss_index": faiss_stats,
            "timestamp": time.time()
        }
    except Exception as e:
        return {"status": "degraded", "error": str(e)}

# --- Portal Health Check (Specific) ---
@app.get("/api/py/portal/health")
def portal_health():
    return {
        "status": "healthy",
        "portal_routes": "active",
        "timestamp": time.time()
    }

# --- Error Stats Endpoints ---
@app.get("/admin/errors", tags=["Admin"])
def get_error_statistics(current_user: Optional[str] = Depends(get_current_user_optional)):
    return {
        "error_stats": error_stats,
        "timestamp": time.time(),
        "uptime": time.time() - error_stats.get('startup_time', time.time())
    }

@app.post("/admin/errors/reset", tags=["Admin"])
def reset_error_statistics(current_user: Optional[str] = Depends(get_current_user_optional)):
    global error_stats
    error_stats = {
        'total_errors': 0,
        'database_errors': 0,
        'ai_errors': 0,
        'websocket_errors': 0,
        'validation_errors': 0,
        'last_error': None,
        'errors_by_endpoint': {},
        'startup_time': error_stats.get('startup_time', time.time())
    }
    return {"success": True, "message": "Error statistics reset"}

# --- Protected Route Example (with current user) ---
@app.get("/api/py/user/me", tags=["User"])
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current logged-in user info"""
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role
    }

# --- Main Entry Point ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )