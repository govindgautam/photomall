import asyncio
import logging
import time
import json
from typing import List, Dict, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect
from dataclasses import dataclass
from enum import Enum
import weakref

# Logging setup for monitoring connection health
logger = logging.getLogger(__name__)

class WebSocketState(Enum):
    """Senior Architect: WebSocket connection states for robust tracking"""
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTING = "disconnecting"
    DISCONNECTED = "disconnected"
    ERROR = "error"

@dataclass
class WebSocketConnection:
    """Senior Architect: Enhanced connection metadata for robust management"""
    websocket: WebSocket
    event_id: str
    client_id: str
    state: WebSocketState
    connected_at: float
    last_heartbeat: float
    last_activity: float
    sent_messages: int
    received_messages: int
    error_count: int
    
    def update_activity(self):
        """Update activity timestamp"""
        self.last_activity = time.time()
        self.last_heartbeat = time.time()

class ConnectionManager:
    """
    Senior Architect: Bulletproof WebSocket Manager with:
    - Robust heartbeat mechanism
    - Automatic error recovery
    - Memory leak prevention
    - Connection pooling with limits
    - Graceful shutdown handling
    """
    
    def __init__(self):
        # Enhanced connection tracking
        self.active_connections: Dict[str, List[WebSocketConnection]] = {}
        self.connection_registry: Dict[str, WebSocketConnection] = {}  # client_id -> connection
        
        # Progress state with enhanced metadata
        self.progress_state: Dict[str, Dict] = {}
        
        # Thread-safe locks
        self._connection_lock = asyncio.Lock()
        self._progress_lock = asyncio.Lock()
        
        # Configuration
        self.HEARTBEAT_INTERVAL = 30  # seconds
        self.CONNECTION_TIMEOUT = 120  # seconds
        self.MAX_CONNECTIONS_PER_EVENT = 50
        self.MAX_TOTAL_CONNECTIONS = 200
        self.BUFFER_SYNC_INTERVAL = 0.5  # seconds
        self.ERROR_THRESHOLD = 5  # max errors before disconnect
        
        # Background tasks
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Statistics
        self.stats = {
            'total_connections': 0,
            'active_connections': 0,
            'disconnections': 0,
            'errors': 0,
            'messages_sent': 0,
            'messages_received': 0
        }
        
        logger.info("🚀 Bulletproof WebSocket Manager initialized")
    
    async def start_background_tasks(self):
        """Start background maintenance tasks"""
        if not self._running:
            self._running = True
            self._heartbeat_task = asyncio.create_task(self._heartbeat_worker())
            self._cleanup_task = asyncio.create_task(self._cleanup_worker())
            logger.info("🔄 Background tasks started")
    
    async def stop_background_tasks(self):
        """Stop background tasks gracefully"""
        self._running = False
        
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
                
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
                
        logger.info("🛑 Background tasks stopped")
    
    def _generate_client_id(self) -> str:
        """Generate unique client identifier"""
        return f"client_{int(time.time() * 1000)}_{id(object())}"
    
    async def connect(self, websocket: WebSocket, event_id: str) -> str:
        """
        Senior Architect: Enhanced connection with comprehensive error handling.
        Returns client_id for connection tracking.
        """
        async with self._connection_lock:
            try:
                # Check connection limits
                if len(self.active_connections.get(event_id, [])) >= self.MAX_CONNECTIONS_PER_EVENT:
                    await websocket.close(code=1008, reason="Too many connections for this event")
                    raise ValueError("Connection limit exceeded")
                
                total_connections = sum(len(conns) for conns in self.active_connections.values())
                if total_connections >= self.MAX_TOTAL_CONNECTIONS:
                    await websocket.close(code=1008, reason="Server at capacity")
                    raise ValueError("Server capacity exceeded")
                
                # Create enhanced connection record
                client_id = self._generate_client_id()
                connection = WebSocketConnection(
                    websocket=websocket,
                    event_id=event_id,
                    client_id=client_id,
                    state=WebSocketState.CONNECTED,
                    connected_at=time.time(),
                    last_heartbeat=time.time(),
                    last_activity=time.time(),
                    sent_messages=0,
                    received_messages=0,
                    error_count=0
                )
                
                # Register connection
                if event_id not in self.active_connections:
                    self.active_connections[event_id] = []
                    
                self.active_connections[event_id].append(connection)
                self.connection_registry[client_id] = connection
                
                # Update statistics
                self.stats['total_connections'] += 1
                self.stats['active_connections'] += 1
                
                logger.info(f"🔌 Client Connected: {client_id} for Event {event_id} | Total: {self.stats['active_connections']}")
                
                # Send welcome message
                await self._send_safe(connection, {
                    "type": "WS_CONNECTED",
                    "client_id": client_id,
                    "event_id": event_id,
                    "server_time": time.time(),
                    "heartbeat_interval": self.HEARTBEAT_INTERVAL
                })
                
                # Start background tasks if not running
                if not self._running:
                    await self.start_background_tasks()
                
                return client_id
                
            except Exception as e:
                logger.error(f"❌ Connection failed for event {event_id}: {e}")
                self.stats['errors'] += 1
                
                # Ensure websocket is closed on error
                try:
                    await websocket.close(code=1011, reason="Connection failed")
                except:
                    pass
                    
                raise
    
    def disconnect(self, websocket: WebSocket, event_id: str, client_id: Optional[str] = None):
        """
        Senior Architect: Graceful disconnection with comprehensive cleanup.
        """
        try:
            # Find connection by client_id if provided
            connection_to_remove = None
            
            if client_id and client_id in self.connection_registry:
                connection_to_remove = self.connection_registry[client_id]
            else:
                # Find by websocket reference
                for event_conns in self.active_connections.values():
                    for conn in event_conns:
                        if conn.websocket == websocket:
                            connection_to_remove = conn
                            break
                    if connection_to_remove:
                        break
            
            if connection_to_remove:
                # Remove from event connections
                event_id = connection_to_remove.event_id
                if event_id in self.active_connections:
                    try:
                        self.active_connections[event_id].remove(connection_to_remove)
                        if not self.active_connections[event_id]:
                            del self.active_connections[event_id]
                    except ValueError:
                        pass  # Already removed
                
                # Remove from registry
                client_id = connection_to_remove.client_id
                if client_id in self.connection_registry:
                    del self.connection_registry[client_id]
                
                # Update statistics
                self.stats['active_connections'] -= 1
                self.stats['disconnections'] += 1
                
                logger.info(f"🔌 Client Disconnected: {client_id} from Event {event_id} | Active: {self.stats['active_connections']}")
            
        except Exception as e:
            logger.error(f"❌ Disconnection error: {e}")
            self.stats['errors'] += 1
    
    async def _send_safe(self, connection: WebSocketConnection, message: dict) -> bool:
        """
        Senior Architect: Safe message sending with error handling.
        Returns True if successful, False otherwise.
        """
        try:
            await connection.websocket.send_json(message)
            connection.sent_messages += 1
            connection.update_activity()
            self.stats['messages_sent'] += 1
            return True
        except Exception as e:
            logger.warning(f"⚠️ Send failed for {connection.client_id}, removing connection: {e}")
            connection.error_count += 1
            self.stats['errors'] += 1
            
            # Mark connection as error state
            connection.state = WebSocketState.ERROR
            
            # If a client disconnects, remove them gracefully immediately
            logger.warning(f"🔌 Gracefully removing disconnected client {connection.client_id}")
            self.disconnect(connection.websocket, connection.event_id, connection.client_id)
            
            return False
    
    async def _force_disconnect(self, connection: WebSocketConnection):
        """Force disconnect a connection"""
        try:
            connection.state = WebSocketState.DISCONNECTING
            await connection.websocket.close(code=1011, reason="Too many errors")
        except:
            pass
        finally:
            self.disconnect(connection.websocket, connection.event_id, connection.client_id)
    
    async def broadcast_to_event(self, event_id: str, message: dict):
        """
        Senior Architect: Enhanced broadcasting with connection validation.
        """
        async with self._connection_lock:
            if event_id not in self.active_connections:
                return
            
            # Create list of connections to broadcast to
            connections_to_broadcast = list(self.active_connections[event_id])
            
            if not connections_to_broadcast:
                return
            
            # Broadcast to all connections concurrently
            tasks = []
            for connection in connections_to_broadcast:
                # Skip connections in error state or disconnecting
                if connection.state not in [WebSocketState.ERROR, WebSocketState.DISCONNECTING]:
                    tasks.append(self._send_safe(connection, message))
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _heartbeat_worker(self):
        """
        Senior Architect: Robust heartbeat mechanism with connection validation.
        """
        while self._running:
            try:
                await asyncio.sleep(self.HEARTBEAT_INTERVAL)
                
                current_time = time.time()
                connections_to_check = []
                
                # Collect all active connections
                async with self._connection_lock:
                    for event_connections in self.active_connections.values():
                        connections_to_check.extend(event_connections)
                
                # Check each connection
                for connection in connections_to_check:
                    if connection.state in [WebSocketState.DISCONNECTING, WebSocketState.DISCONNECTED]:
                        continue
                    
                    # Check for timeout
                    if current_time - connection.last_heartbeat > self.CONNECTION_TIMEOUT:
                        logger.warning(f"⏰ Connection timeout: {connection.client_id}")
                        await self._force_disconnect(connection)
                        continue
                    
                    # Send heartbeat
                    heartbeat_message = {
                        "type": "HEARTBEAT",
                        "timestamp": current_time,
                        "server_time": current_time
                    }
                    
                    await self._send_safe(connection, heartbeat_message)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"❌ Heartbeat worker error: {e}")
                await asyncio.sleep(5)  # Brief pause before retry
    
    async def _cleanup_worker(self):
        """
        Senior Architect: Background cleanup of stale connections and progress states.
        """
        while self._running:
            try:
                await asyncio.sleep(60)  # Run cleanup every minute
                
                current_time = time.time()
                
                # Cleanup stale progress states
                async with self._progress_lock:
                    stale_events = []
                    for event_id, state in self.progress_state.items():
                        if state.get("is_complete") and (current_time - state.get("last_updated", 0)) > 300:  # 5 minutes
                            stale_events.append(event_id)
                    
                    for event_id in stale_events:
                        del self.progress_state[event_id]
                        logger.info(f"🧹 Cleaned up stale progress state for event {event_id}")
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"❌ Cleanup worker error: {e}")
    
    def init_batch(self, event_id: str, total: int):
        """
        Senior Architect: Enhanced batch initialization with metadata.
        """
        try:
            self.progress_state[event_id] = {
                "total": total,
                "processed": 0,
                "current_file": "",
                "is_complete": False,
                "face_count_total": 0,
                "started_at": time.time(),
                "last_updated": time.time(),
                "errors": [],
                "processing_speed": 0.0
            }
            logger.info(f"🚀 Batch Initialized: Event {event_id} | Total Files: {total}")
        except Exception as e:
            logger.error(f"❌ Batch initialization failed: {e}")
    
    async def update_progress(self, event_id: str, filename: str, face_count: int = 0, size_increment: int = 0):
        """
        Senior Architect: Enhanced progress updates with error handling and throttling.
        """
        async with self._progress_lock:
            if event_id not in self.progress_state:
                logger.warning(f"⚠️ Progress update for uninitialized event: {event_id}")
                return
            
            try:
                state = self.progress_state[event_id]
                state["processed"] += 1
                state["current_file"] = filename
                state["face_count_total"] += face_count
                state["last_updated"] = time.time()
                
                # Calculate processing speed
                elapsed_time = time.time() - state["started_at"]
                if elapsed_time > 0:
                    state["processing_speed"] = state["processed"] / elapsed_time
                
                processed = state["processed"]
                total = state["total"]
                is_complete = processed >= total
                state["is_complete"] = is_complete
                
                percentage = round((processed / total) * 100, 2) if total > 0 else 0.0
                
                # Enhanced progress payload
                payload = {
                    "type": "PROGRESS_UPDATE",
                    "status": "completed" if is_complete else "processing",
                    "current": processed,
                    "processed": processed,
                    "total": total,
                    "percentage": percentage,
                    "filename": filename,
                    "face_count": face_count,
                    "total_faces_detected": state["face_count_total"],
                    "size_increment": size_increment,
                    "is_complete": is_complete,
                    "processing_speed": round(state["processing_speed"], 2),
                    "elapsed_time": round(elapsed_time, 2),
                    "estimated_remaining": round((total - processed) / max(state["processing_speed"], 0.1), 2) if state["processing_speed"] > 0 else None
                }
                
                # Broadcast to all clients
                await self.broadcast_to_event(event_id, payload)
                
                if is_complete:
                    logger.info(f"✅ Batch Completed: Event {event_id} in {elapsed_time:.2f}s")
                    
            except Exception as e:
                logger.error(f"❌ Progress update error for event {event_id}: {e}")
                
                # Add error to state
                if event_id in self.progress_state:
                    self.progress_state[event_id]["errors"].append({
                        "timestamp": time.time(),
                        "error": str(e),
                        "filename": filename
                    })
    
    async def send_custom_message(self, event_id: str, message_type: str, data: dict):
        """
        Senior Architect: Send custom messages to event clients.
        """
        payload = {
            "type": message_type,
            "timestamp": time.time(),
            **data
        }
        
        await self.broadcast_to_event(event_id, payload)
    
    async def get_connection_stats(self) -> dict:
        """
        Senior Architect Fix: Proper indentation and async lock handling.
        """
        async with self._connection_lock:
            event_stats = {}
            for event_id, connections in self.active_connections.items():
                event_stats[event_id] = {
                    'connections': len(connections),
                    'states': {state.value: sum(1 for c in connections if c.state == state) for state in WebSocketState}
                }
            
            return {
                'stats': self.stats.copy(),
                'events': event_stats,
                'active_connections': len(self.connection_registry),
                'progress_states': len(self.progress_state)
            }
    async def cleanup_event(self, event_id: str):
        """
        Senior Architect: Clean up all resources for a specific event.
        """
        try:
            # Disconnect all connections for this event
            if event_id in self.active_connections:
                connections_to_disconnect = list(self.active_connections[event_id])
                for connection in connections_to_disconnect:
                    await self._force_disconnect(connection)
            
            # Clean up progress state
            async with self._progress_lock:
                if event_id in self.progress_state:
                    del self.progress_state[event_id]
            
            logger.info(f"🧹 Cleaned up all resources for event {event_id}")
            
        except Exception as e:
            logger.error(f"❌ Event cleanup error for {event_id}: {e}")

# Singleton instance for global access
manager = ConnectionManager()

# Startup hook for background tasks
async def startup_websocket_manager():
    """Initialize WebSocket manager background tasks"""
    await manager.start_background_tasks()

# Shutdown hook for graceful cleanup
async def shutdown_websocket_manager():
    """Cleanup WebSocket manager resources"""
    await manager.stop_background_tasks()