import logging
import uvicorn

# Professional Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn.error")

if __name__ == "__main__":
    logger.info("Starting PhotoMall AI Backend Server...")
    
    # Phase 4 Uvicorn Optimization Configurations
    # - Increased timeout_keep_alive to 120s to prevent ECONNRESET during heavy AI work
    # - Increased limit_concurrency to 1000 for robust handling
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        timeout_keep_alive=120,
        limit_concurrency=1000,
        ws_ping_interval=20,
        ws_ping_timeout=20,
    )
