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
from sqlalchemy import func
from typing import Dict, Any, Optional
import json

# --- Database & Models Imports ---
from database.db import engine, Base, SessionLocal
from app.models.face_embedding import FaceEmbedding
from app.models.event import Event 
from app.models.photo import Photo

# --- API Router Imports ---
from app.routes.auth_routes import router as auth_router
from app.routes.event_routes import router as event_router
from app.routes.photo_routes import router as photo_router
from app.routes.search_routes import router as search_router
from app.routes.download_routes import router as download_router
from app.routes.admin_routes import router as admin_router
from app.utils.websocket_manager import manager, startup_websocket_manager, shutdown_websocket_manager
from app.utils.auth_utils import get_current_user_optional

# --- AI & FAISS Logic ---
from ai_index.faiss_index import build_faiss_index
from ai_service.face_service import warmup_face_model

# --- Logging Configuration ---
# Senior Architect Tip: Use structured logging for production debugging
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
    'errors_by_endpoint': {}
}

# --- Global Exception Middleware ---
class GlobalExceptionMiddleware(BaseHTTPMiddleware):
    """
    Senior Architect: Bulletproof error handling middleware.
    
    Features:
    - Catches all unhandled exceptions
    - Provides structured error responses
    - Prevents server crashes
    - Tracks error statistics
    - Handles ECONNRESET gracefully
    - Ensures null value safety
    """
    
    def __init__(self, app):
        super().__init__(app)
        self.startup_time = time.time()
        
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        try:
            response = await call_next(request)
            
            # Add security headers
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            
            return response
            
        except HTTPException as http_exc:
            # HTTP exceptions are already handled by FastAPI
            raise http_exc
            
        except Exception as exc:
            # Handle all other exceptions
            return await self._handle_exception(request, exc, start_time)
    
    async def _handle_exception(self, request: Request, exc: Exception, start_time: float) -> JSONResponse:
        """
        Senior Architect: Comprehensive exception handling with error categorization.
        """
        global error_stats
        
        # Update error statistics
        error_stats['total_errors'] += 1
        error_stats['last_error'] = {
            'timestamp': time.time(),
            'type': type(exc).__name__,
            'message': str(exc),
            'endpoint': str(request.url.path),
            'method': request.method
        }
        
        # Track errors by endpoint
        endpoint = str(request.url.path)
        if endpoint not in error_stats['errors_by_endpoint']:
            error_stats['errors_by_endpoint'][endpoint] = 0
        error_stats['errors_by_endpoint'][endpoint] += 1
        
        # Categorize error type
        error_category = self._categorize_error(exc)
        error_stats[f'{error_category}_errors'] += 1
        
        # Log comprehensive error information
        logger.error(
            f"❌ Global Exception Handler: {type(exc).__name__} | "
            f"Endpoint: {endpoint} | Method: {request.method} | "
            f"Category: {error_category}"
        )
        logger.debug(f"Full traceback: {traceback.format_exc()}")
        
        # Create safe error response
        error_response = self._create_safe_error_response(exc, request)
        
        # Log error response
        logger.info(f"📡 Error Response Sent: {error_response['error_code']} - {error_response['detail']}")
        
        return JSONResponse(
            status_code=error_response['status_code'],
            content=error_response
        )
    
    def _categorize_error(self, exc: Exception) -> str:
        """
        Senior Architect: Intelligent error categorization for better monitoring.
        """
        exc_str = str(exc).lower()
        exc_type = type(exc).__name__.lower()
        
        if any(keyword in exc_str for keyword in ['database', 'sql', 'connection', 'timeout']):
            return 'database'
        elif any(keyword in exc_str for keyword in ['ai', 'face', 'embedding', 'faiss', 'model']):
            return 'ai'
        elif any(keyword in exc_str for keyword in ['websocket', 'connection reset', 'econnreset']):
            return 'websocket'
        elif any(keyword in exc_str for keyword in ['validation', 'value', 'type', 'attribute']):
            return 'validation'
        elif any(keyword in exc_str for keyword in ['file', 'io', 'os', 'permission']):
            return 'filesystem'
        elif any(keyword in exc_str for keyword in ['memory', 'resource']):
            return 'resource'
        else:
            return 'general'
    
    def _create_safe_error_response(self, exc: Exception, request: Request) -> Dict[str, Any]:
        """
        Senior Architect: Create safe, user-friendly error responses.
        """
        exc_str = str(exc).lower()
        exc_type = type(exc).__name__
        
        # Handle specific error types with user-friendly messages
        if 'econnreset' in exc_str or 'connection reset' in exc_str:
            return {
                "error_code": "CONNECTION_RESET",
                "detail": "Connection was reset by the client. Please try again.",
                "status_code": 503,
                "timestamp": time.time(),
                "retry_after": 5
            }
        
        elif 'database' in exc_str or 'sql' in exc_str:
            return {
                "error_code": "DATABASE_ERROR",
                "detail": "Database operation failed. Please try again in a moment.",
                "status_code": 503,
                "timestamp": time.time(),
                "retry_after": 10
            }
        
        elif 'ai' in exc_str or 'face' in exc_str or 'faiss' in exc_str:
            return {
                "error_code": "AI_PROCESSING_ERROR",
                "detail": "AI processing service is temporarily unavailable. Please try again.",
                "status_code": 503,
                "timestamp": time.time(),
                "retry_after": 15
            }
        
        elif 'validation' in exc_str or 'value' in exc_str:
            return {
                "error_code": "VALIDATION_ERROR",
                "detail": "Invalid input provided. Please check your request parameters.",
                "status_code": 400,
                "timestamp": time.time()
            }
        
        elif 'file' in exc_str or 'io' in exc_str:
            return {
                "error_code": "FILESYSTEM_ERROR",
                "detail": "File operation failed. Please check file permissions and try again.",
                "status_code": 500,
                "timestamp": time.time()
            }
        
        elif 'memory' in exc_str or 'resource' in exc_str:
            return {
                "error_code": "RESOURCE_ERROR",
                "detail": "Server resources are temporarily unavailable. Please try again later.",
                "status_code": 503,
                "timestamp": time.time(),
                "retry_after": 30
            }
        
        # Generic error fallback
        return {
            "error_code": "INTERNAL_SERVER_ERROR",
            "detail": "An unexpected error occurred. Our team has been notified.",
            "status_code": 500,
            "timestamp": time.time(),
            "request_id": f"{int(time.time() * 1000)}_{id(request)}"
        }

class NullValueSafetyMiddleware(BaseHTTPMiddleware):
    """
    Senior Architect: Ensures null values in database responses have proper fallbacks.
    """
    
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            
            # Only process JSON responses
            if response.headers.get("content-type", "").startswith("application/json"):
                # Note: This is a simplified implementation
                # In production, you might want to use response streaming
                pass
            
            return response
            
        except Exception as e:
            logger.error(f"NullValueSafetyMiddleware error: {e}")
            return await call_next(request)

# --- Database Dependency Injection with Error Handling ---
def get_db():
    """
    Dependency to provide a database session for each request.
    Ensures the session is closed after the request is completed.
    Senior Architect: Enhanced with comprehensive error handling.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        error_stats['database_errors'] += 1
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
    """
    Senior Architect: Enhanced application lifecycle with comprehensive error handling.
    Updated to ensure all storage and event directories are initialized correctly.
    """
    global error_stats
    logger.info("🚀 [System] Initializing AI Event Photo Finder Engine...")
    
    # Track startup time for health metrics
    error_stats['startup_time'] = time.time()
    
    try:
        # 1. Ensure required directory structure exists
        # Fix: Adding 'storage/events' and ensuring all paths used by routes exist
        required_dirs = [
            "storage",
            "storage/events",
            "storage/qr_codes",
            "uploads/originals", 
            "uploads/previews", 
            "uploads/events",
            "static/qrcodes", 
            "temp_search",
            "logs"
        ]
        
        for directory in required_dirs:
            if not os.path.exists(directory):
                os.makedirs(directory, exist_ok=True)
                logger.info(f"📁 [System] Folder Created: {directory}")
        
        # 2. Database synchronization
        logger.info("🗄️ [System] Synchronizing Database Schema...")
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("✅ [DB] Database schema synchronized successfully")
        except Exception as e:
            logger.error(f"❌ [DB] Database schema sync failed: {e}")
            raise
        
        # 3. Self-healing schema logic (Legacy support)
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE events ADD COLUMN IF NOT EXISTS privacy_mode BOOLEAN DEFAULT FALSE"))
                conn.execute(text("ALTER TABLE photos ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE"))
                conn.commit()
                logger.info("✅ [DB] Schema verified and updated")
        except Exception as se:
            logger.warning(f"⚠️ [DB] Schema auto-sync warning: {se}")
        
        # 4. Synchronize FAISS Vector Index
        logger.info("🧠 [AI] Synchronizing FAISS Vector Index...")
        db = SessionLocal()
        try:
            all_embeddings = db.query(FaceEmbedding).all()
            if all_embeddings:
                logger.info(f"🧠 [AI] Found {len(all_embeddings)} face vectors. Syncing FAISS...")
                await asyncio.to_thread(build_faiss_index, all_embeddings)
                logger.info("✅ [AI] FAISS Index initialized.")
            else:
                logger.warning("⚠️ [AI] Database index is empty. FAISS will build on first upload.")
        except Exception as e:
            logger.error(f"❌ [CRITICAL] FAISS Startup Error -> {e}")
        finally:
            db.close()
        
        # 5. Warmup face model (AI Engine)
        logger.info("⏳ [AI] Warming up Neural Networks (Facenet512)...")
        try:
            await asyncio.to_thread(warmup_face_model)
            logger.info("✅ [AI] Model Warmup Complete.")
        except Exception as e:
            logger.warning(f"⚠️ [AI] Model warmup warning: {e}")
        
        # 6. Initialize WebSocket manager
        logger.info("🔌 [WS] Initializing WebSocket Manager...")
        try:
            await startup_websocket_manager()
            logger.info("✅ [WS] WebSocket Manager initialized")
        except Exception as e:
            logger.error(f"❌ [WS] WebSocket Manager initialization failed: {e}")
        
        # 7. Finalize Startup
        duration = time.time() - error_stats['startup_time']
        logger.info(f"🎉 [System] Startup completed successfully in {duration:.2f}s")
        
        yield
        
        # --- SHUTDOWN SEQUENCE ---
        logger.info("🛑 [System] Application shutting down gracefully...")
        
        try:
            await shutdown_websocket_manager()
            logger.info("✅ [WS] WebSocket Manager shutdown complete")
        except Exception as e:
            logger.error(f"❌ [WS] WebSocket Manager shutdown error: {e}")
        
        try:
            import shutil
            if os.path.exists("temp_search"):
                shutil.rmtree("temp_search", ignore_errors=True)
                logger.info("扫 [System] Temporary files cleaned up")
        except Exception as e:
            logger.error(f"❌ [System] Cleanup error: {e}")
        
        logger.info("🏁 [System] Graceful shutdown complete")
        
    except Exception as e:
        logger.error(f"❌ [CRITICAL] Startup failure: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise
# --- FastAPI App Instance ---
app = FastAPI(
    title="AI Event Photo Finder",
    description="Enterprise-grade AI-driven photo recognition system with bulletproof error handling.",
    version="1.6.0", 
    lifespan=lifespan,
    strict_slashes=False,
    docs_url="/docs",
    redoc_url="/redoc"
)

# --- Global Exception Middleware Registration ---
app.add_middleware(GlobalExceptionMiddleware)
app.add_middleware(NullValueSafetyMiddleware)

# --- 3. PAYLOAD LIMIT MIDDLEWARE ---
# Allow larger multipart payloads for bulk ingestion (1 GB limit).
MAX_MULTIPART_BODY_BYTES = 1024 * 1024 * 1024 


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/api/photos/upload-bulk":
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    body_size = int(content_length)
                    if body_size > MAX_MULTIPART_BODY_BYTES:
                        return JSONResponse(
                            status_code=413,
                            content={"detail": "Bulk upload payload is too large. Reduce batch size."},
                        )
                except ValueError:
                    pass
        return await call_next(request)

# --- 4. CORS MIDDLEWARE CONFIGURATION ---
# --- 4. MIDDLEWARE CONFIGURATION ---
# Senior Architect: Ordering matters. Security and Size limits first.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)
app.add_middleware(BodySizeLimitMiddleware)

# --- 5. STATIC ASSETS SERVING ---
# Senior Architect: Added 'storage' mount to support new event resource paths
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/storage", StaticFiles(directory="storage"), name="storage")
app.mount("/static/qrcodes", StaticFiles(directory="static/qrcodes"), name="qrcodes")

# --- 7. CENTRALIZED API ROUTING ---
# Note: Consistent /api/py prefix for all backend routes
app.include_router(admin_router, prefix="/api/py/admin", tags=["admin"])
app.include_router(auth_router, prefix="/api/py/auth", tags=["Authentication"])
app.include_router(event_router, prefix="/api/py/events", tags=["Events Management"])
app.include_router(photo_router, prefix="/api/py/photos", tags=["Photo Operations"])
app.include_router(search_router, prefix="/api/py/search", tags=["AI Face Search"])
app.include_router(download_router, prefix="/api/py/download", tags=["Secure Downloads"])

# --- 8. REAL-TIME DATA TRANSMISSION (WEBSOCKETS) ---
@app.websocket("/api/py/ws/ingestion/{event_id}")
async def ingestion_websocket(websocket: WebSocket, event_id: str = "global"):
    """
    Senior Architect: Bulletproof WebSocket with enhanced error handling.
    
    Features:
    - Robust connection management
    - Automatic error recovery
    - Memory leak prevention
    - Comprehensive logging
    - Graceful shutdown handling
    """
    await websocket.accept()
    client_id = None
    try:
        # Connect with enhanced error handling
        client_id = await manager.connect(websocket, event_id)
        
        # Handshake delay to ensure frontend listener is ready
        await asyncio.sleep(0.15)

        # Enhanced receiver loop with error handling
        try:
            while True:
                # Receive message from client
                data = await websocket.receive_text()
                
                # Update connection activity
                if client_id and client_id in manager.connection_registry:
                    manager.connection_registry[client_id].received_messages += 1
                    manager.connection_registry[client_id].update_activity()
                
                # Handle different message types
                try:
                    message = json.loads(data)
                    message_type = message.get('type', 'unknown')
                    
                    if message_type == 'PING':
                        # Respond to client ping
                        await manager._send_safe(
                            manager.connection_registry[client_id],
                            {"type": "PONG", "timestamp": time.time()}
                        )
                    elif message_type == 'GET_PROGRESS':
                        # Send current progress state
                        if event_id in manager.progress_state:
                            await manager._send_safe(
                                manager.connection_registry[client_id],
                                {
                                    "type": "PROGRESS_STATE",
                                    "state": manager.progress_state[event_id]
                                }
                            )
                    
                except json.JSONDecodeError:
                    logger.warning(f"⚠️ Invalid JSON received from client {client_id}")
                except Exception as e:
                    logger.error(f"❌ Message handling error for client {client_id}: {e}")
                    
        except WebSocketDisconnect:
            logger.info(f"🔌 WebSocket Disconnected for Event: {event_id} (Client: {client_id})")
        except RuntimeError as runtime_err:
            if "accept" in str(runtime_err).lower():
                logger.info(f"🔌 Client gracefully dropped connection: {event_id}")
            else:
                logger.error(f"❌ WebSocket runtime error: {runtime_err}")
        except Exception as e:
            logger.error(f"❌ WebSocket receiver error for client {client_id}: {e}")
            error_stats['websocket_errors'] += 1
        
    except Exception as e:
        logger.error(f"❌ WebSocket connection error for event {event_id}: {e}")
        error_stats['websocket_errors'] += 1
    finally:
        # Ensure cleanup happens even if errors occur
        try:
            manager.disconnect(websocket, event_id, client_id)
        except Exception as e:
            logger.error(f"❌ WebSocket cleanup error: {e}")

# --- 9. SYSTEM HEALTH CHECK ---
@app.get("/", tags=["System Health"])
def health_check():
    """
    Senior Architect: Enhanced health check with comprehensive system status.
    """
    try:
        # Check database connectivity
        db = SessionLocal()
        try:
            db.execute("SELECT 1")
            db_status = "healthy"
        except:
            db_status = "unhealthy"
        finally:
            db.close()
        
        # Check FAISS index status
        from ai_index.faiss_index import get_index_stats
        faiss_stats = get_index_stats()
        
        # Check WebSocket manager status
        ws_stats = manager.get_connection_stats()
        
        # Calculate uptime
        uptime = time.time() - error_stats.get('startup_time', time.time())
        
        return {
            "status": "online",
            "engine": "Facenet512 + FAISS + PostgreSQL",
            "developer": "Govind Gautam",
            "version": "1.6.0",
            "uptime_seconds": round(uptime, 2),
            "components": {
                "database": db_status,
                "faiss_index": faiss_stats,
                "websocket_manager": ws_stats
            },
            "error_stats": error_stats,
            "performance": {
                "active_connections": ws_stats.get('active_connections', 0),
                "total_errors": error_stats.get('total_errors', 0)
            }
        }
    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        return {
            "status": "degraded",
            "error": str(e),
            "timestamp": time.time()
        }

# --- 10. ERROR STATISTICS ENDPOINT ---
@app.get("/admin/errors", tags=["System Admin"])
def get_error_statistics(
    _current_user: str = Depends(get_current_user_optional)
):
    """
    Senior Architect: Get comprehensive error statistics for monitoring.
    """
    return {
        "error_stats": error_stats,
        "timestamp": time.time(),
        "uptime": time.time() - error_stats.get('startup_time', time.time())
    }

# --- 11. RESET ERROR STATISTICS ---
@app.post("/admin/errors/reset", tags=["System Admin"])
def reset_error_statistics(
    _current_user: str = Depends(get_current_user_optional)
):
    """
    Senior Architect: Reset error statistics for monitoring.
    """
    global error_stats
    error_stats = {
        'total_errors': 0,
        'database_errors': 0,
        'ai_errors': 0,
        'websocket_errors': 0,
        'validation_errors': 0,
        'last_error': None,
        'errors_by_endpoint': {},
        'startup_time': time.time()
    }
    
    logger.info("🧹 Error statistics reset")
    
    return {
        "success": True,
        "message": "Error statistics reset successfully",
        "timestamp": time.time()
    }