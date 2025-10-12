use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::sync::{broadcast, RwLock};
use tokio_postgres::NoTls;
use deadpool_postgres::{Pool, Runtime};
use std::env as stdenv;
use dotenvy::dotenv;
use once_cell::sync::Lazy;
use tauri::Manager;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio_tungstenite::accept_async;
use tokio::net::{TcpListener, TcpStream};
use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use uuid::Uuid;

// Global WebSocket server state
static WEBSOCKET_SERVER: Lazy<Arc<WebSocketRealtimeServer>> = Lazy::new(|| {
    Arc::new(WebSocketRealtimeServer::new())
});

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RealtimeEvent {
    pub event_type: String,
    pub table: String,
    pub id: String,
    pub timestamp: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookingUpdateEvent {
    pub event_type: String,
    pub destination_id: String,
    pub destination_name: String,
    pub available_seats: i32,
    pub total_seats: i32,
    pub vehicle_count: i32,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueueUpdateEvent {
    pub event_type: String,
    pub destination_id: String,
    pub destination_name: String,
    pub queue_changes: Vec<QueueChange>,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueueChange {
    pub license_plate: String,
    pub status: String,
    pub available_seats: i32,
    pub queue_position: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebSocketMessage {
    pub message_type: String,
    pub data: serde_json::Value,
    pub timestamp: String,
}

#[derive(Debug, Clone)]
pub struct ClientConnection {
    pub id: String,
    pub app_name: String,
    pub last_seen: std::time::Instant,
}

// Custom serialization for ClientConnection
impl Serialize for ClientConnection {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("ClientConnection", 3)?;
        state.serialize_field("id", &self.id)?;
        state.serialize_field("app_name", &self.app_name)?;
        state.serialize_field("last_seen", &self.last_seen.elapsed().as_secs())?;
        state.end()
    }
}

impl<'de> Deserialize<'de> for ClientConnection {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::{self, MapAccess, Visitor};
        use std::fmt;

        struct ClientConnectionVisitor;

        impl<'de> Visitor<'de> for ClientConnectionVisitor {
            type Value = ClientConnection;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("struct ClientConnection")
            }

            fn visit_map<V>(self, mut map: V) -> Result<ClientConnection, V::Error>
            where
                V: MapAccess<'de>,
            {
                let mut id = None;
                let mut app_name = None;
                let mut last_seen_secs = None;

                while let Some(key) = map.next_key()? {
                    match key {
                        "id" => {
                            if id.is_some() {
                                return Err(de::Error::duplicate_field("id"));
                            }
                            id = Some(map.next_value()?);
                        }
                        "app_name" => {
                            if app_name.is_some() {
                                return Err(de::Error::duplicate_field("app_name"));
                            }
                            app_name = Some(map.next_value()?);
                        }
                        "last_seen" => {
                            if last_seen_secs.is_some() {
                                return Err(de::Error::duplicate_field("last_seen"));
                            }
                            last_seen_secs = Some(map.next_value()?);
                        }
                        _ => {
                            let _ = map.next_value::<de::IgnoredAny>()?;
                        }
                    }
                }

                let id = id.ok_or_else(|| de::Error::missing_field("id"))?;
                let app_name = app_name.ok_or_else(|| de::Error::missing_field("app_name"))?;
                let last_seen_secs = last_seen_secs.unwrap_or(0);

                Ok(ClientConnection {
                    id,
                    app_name,
                    last_seen: std::time::Instant::now() - std::time::Duration::from_secs(last_seen_secs),
                })
            }
        }

        const FIELDS: &'static [&'static str] = &["id", "app_name", "last_seen"];
        deserializer.deserialize_struct("ClientConnection", FIELDS, ClientConnectionVisitor)
    }
}

pub struct WebSocketRealtimeServer {
    pub is_running: AtomicBool,
    pub clients: Arc<RwLock<HashMap<String, ClientConnection>>>,
    pub event_sender: Arc<Mutex<Option<broadcast::Sender<RealtimeEvent>>>>,
    pub db_pool: Pool,
    pub server_port: u16,
}

impl WebSocketRealtimeServer {
    pub fn new() -> Self {
        let _ = dotenv();
        let db_url = stdenv::var("DATABASE_URL").unwrap_or_else(|_|
            "postgresql://ivan:Lost2409@192.168.192.100:5432/louaj_node".to_string()
        );

        let mut cfg = deadpool_postgres::Config::new();
        cfg.url = Some(db_url);
        cfg.pool = Some(deadpool_postgres::PoolConfig::new(4));
        let db_pool = cfg.create_pool(Some(Runtime::Tokio1), NoTls)
            .expect("Failed to create DB pool for realtime");

        Self {
            is_running: AtomicBool::new(false),
            clients: Arc::new(RwLock::new(HashMap::new())),
            event_sender: Arc::new(Mutex::new(None)),
            db_pool,
            server_port: 8765, // Default WebSocket port
        }
    }

    pub fn get_instance() -> Arc<Self> {
        WEBSOCKET_SERVER.clone()
    }

    pub async fn start_server(&self, app_handle: tauri::AppHandle) -> Result<(), String> {
        if self.is_running.load(Ordering::Relaxed) {
            return Ok(());
        }

        let (tx, mut rx) = broadcast::channel(1000);
        {
            let mut sender = self.event_sender.lock().unwrap();
            *sender = Some(tx);
        }

        // Start PostgreSQL LISTEN task
        let pool = self.db_pool.clone();
        let app_handle_clone = app_handle.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::listen_to_postgres(pool, app_handle_clone).await {
                eprintln!("PostgreSQL LISTEN error: {}", e);
            }
        });

        // Start WebSocket server
        let addr = format!("0.0.0.0:{}", self.server_port);
        let listener = TcpListener::bind(&addr).await.map_err(|e| e.to_string())?;
        
        println!("🌐 WebSocket server started on {}", addr);
        self.is_running.store(true, Ordering::Relaxed);

        // Start event broadcasting task
        let clients = self.clients.clone();
        let _event_sender = self.event_sender.clone();
        tokio::spawn(async move {
            while let Ok(event) = rx.recv().await {
                // Broadcast to all connected clients
                Self::broadcast_to_clients(&clients, &event).await;
                
                // Also emit to local Tauri windows
                let _ = app_handle.emit_all("realtime-event", &event);
            }
        });

        // Accept WebSocket connections
        while let Ok((stream, addr)) = listener.accept().await {
            let clients = self.clients.clone();
            let event_sender = self.event_sender.clone();
            tokio::spawn(async move {
                if let Err(e) = Self::handle_websocket_connection(stream, addr, clients, event_sender).await {
                    eprintln!("WebSocket connection error: {}", e);
                }
            });
        }

        Ok(())
    }

    async fn handle_websocket_connection(
        stream: TcpStream,
        addr: SocketAddr,
        clients: Arc<RwLock<HashMap<String, ClientConnection>>>,
        event_sender: Arc<Mutex<Option<broadcast::Sender<RealtimeEvent>>>>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let ws_stream = accept_async(stream).await?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();
        
        let client_id = Uuid::new_v4().to_string();
        let mut app_name = "Unknown".to_string();
        
        println!("🔌 New WebSocket connection from {} (ID: {})", addr, client_id);

        // Add client to registry
        {
            let mut clients_guard = clients.write().await;
            clients_guard.insert(client_id.clone(), ClientConnection {
                id: client_id.clone(),
                app_name: app_name.clone(),
                last_seen: std::time::Instant::now(),
            });
        }

        // Subscribe to events
        let mut event_receiver = {
            let sender_guard = event_sender.lock().unwrap();
            if let Some(sender) = sender_guard.as_ref() {
                sender.subscribe()
            } else {
                return Err("Event sender not available".into());
            }
        };

        // Handle incoming messages and broadcast events
        loop {
            tokio::select! {
                // Handle incoming WebSocket messages
                msg = ws_receiver.next() => {
                    match msg {
                        Some(Ok(msg)) => {
                            if let Ok(text) = msg.to_text() {
                                if let Ok(ws_msg) = serde_json::from_str::<WebSocketMessage>(text) {
                                    match ws_msg.message_type.as_str() {
                                        "register" => {
                                            if let Some(name) = ws_msg.data.get("app_name").and_then(|v| v.as_str()) {
                                                app_name = name.to_string();
                                                let mut clients_guard = clients.write().await;
                                                if let Some(client) = clients_guard.get_mut(&client_id) {
                                                    client.app_name = app_name.clone();
                                                    client.last_seen = std::time::Instant::now();
                                                }
                                                println!("📱 Client {} registered as: {}", client_id, app_name);
                                            }
                                        }
                                        "ping" => {
                                            // Update last seen
                                            let mut clients_guard = clients.write().await;
                                            if let Some(client) = clients_guard.get_mut(&client_id) {
                                                client.last_seen = std::time::Instant::now();
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                        Some(Err(e)) => {
                            eprintln!("WebSocket error: {}", e);
                            break;
                        }
                        None => break,
                    }
                }
                
                // Handle broadcast events
                event = event_receiver.recv() => {
                    match event {
                        Ok(event) => {
                            let ws_msg = WebSocketMessage {
                                message_type: "realtime_event".to_string(),
                                data: serde_json::to_value(&event).unwrap(),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            };
                            
                            if let Ok(json) = serde_json::to_string(&ws_msg) {
                                if ws_sender.send(tokio_tungstenite::tungstenite::Message::Text(json)).await.is_err() {
                                    break;
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
        }

        // Remove client from registry
        {
            let mut clients_guard = clients.write().await;
            clients_guard.remove(&client_id);
        }
        
        println!("🔌 WebSocket connection closed: {} ({})", client_id, app_name);
        Ok(())
    }

    async fn broadcast_to_clients(
        clients: &Arc<RwLock<HashMap<String, ClientConnection>>>,
        event: &RealtimeEvent,
    ) {
        let clients_guard = clients.read().await;
        println!("📡 Broadcasting event to {} clients: {}", clients_guard.len(), event.event_type);
        
        // In a real implementation, you would send the event to all connected clients
        // For now, we'll just log the broadcast
        for (client_id, client) in clients_guard.iter() {
            println!("  → {} ({})", client.app_name, client_id);
        }
    }

    async fn listen_to_postgres(pool: Pool, app_handle: tauri::AppHandle) -> Result<(), String> {
        // Create a dedicated connection for LISTEN/NOTIFY
        let _ = dotenv();
        let db_url = stdenv::var("DATABASE_URL").unwrap_or_else(|_|
            "postgresql://ivan:Lost2409@192.168.192.100:5432/louaj_node".to_string()
        );

        let (client, connection) = tokio_postgres::connect(&db_url, NoTls).await.map_err(|e| e.to_string())?;
        
        // Spawn the connection task
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("PostgreSQL connection error: {}", e);
            }
        });

        // Start listening to channels
        client.execute("LISTEN booking_events", &[]).await.map_err(|e| e.to_string())?;
        client.execute("LISTEN queue_events", &[]).await.map_err(|e| e.to_string())?;
        client.execute("LISTEN vehicle_events", &[]).await.map_err(|e| e.to_string())?;
        client.execute("LISTEN day_passes_events", &[]).await.map_err(|e| e.to_string())?;
        client.execute("LISTEN exit_passes_events", &[]).await.map_err(|e| e.to_string())?;
        
        println!("🎧 Started listening to PostgreSQL NOTIFY events");

        // Poll for notifications by querying the database for recent changes
        let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(100));
        
        loop {
            interval.tick().await;
            
            // Check for booking changes
            if let Ok(rows) = client.query(
                "SELECT COUNT(*) FROM bookings WHERE created_at > NOW() - INTERVAL '1 second'",
                &[]
            ).await {
                if let Some(row) = rows.first() {
                    let count: i64 = row.get(0);
                    if count > 0 {
                        // Emit a booking event
                        let event = RealtimeEvent {
                            event_type: "booking_created".to_string(),
                            table: "bookings".to_string(),
                            id: "polling".to_string(),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            data: Some(serde_json::json!({"count": count})),
                        };

                        let _ = app_handle.emit_all("realtime-event", &event);
                    }
                }
            }

            // Check for queue changes
            if let Ok(rows) = client.query(
                "SELECT COUNT(*) FROM vehicle_queue WHERE updated_at > NOW() - INTERVAL '1 second'",
                &[]
            ).await {
                if let Some(row) = rows.first() {
                    let count: i64 = row.get(0);
                    if count > 0 {
                        // Emit a queue event
                        let event = RealtimeEvent {
                            event_type: "queue_updated".to_string(),
                            table: "vehicle_queue".to_string(),
                            id: "polling".to_string(),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            data: Some(serde_json::json!({"count": count})),
                        };

                        let _ = app_handle.emit_all("realtime-event", &event);
                    }
                }
            }
        }
    }

    fn parse_booking_event(payload: &serde_json::Value) -> Result<BookingUpdateEvent, String> {
        Ok(BookingUpdateEvent {
            event_type: payload.get("operation")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            destination_id: payload.get("destination_id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            destination_name: "Unknown".to_string(), // Will be filled by the frontend
            available_seats: 0, // Will be calculated by the frontend
            total_seats: 0, // Will be calculated by the frontend
            vehicle_count: 0, // Will be calculated by the frontend
            timestamp: payload.get("timestamp")
                .and_then(|v| v.as_str())
                .unwrap_or(&chrono::Utc::now().to_rfc3339())
                .to_string(),
        })
    }

    fn parse_queue_event(payload: &serde_json::Value) -> Result<QueueUpdateEvent, String> {
        Ok(QueueUpdateEvent {
            event_type: payload.get("operation")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            destination_id: payload.get("destination_id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            destination_name: "Unknown".to_string(), // Will be filled by the frontend
            queue_changes: vec![], // Will be populated by the frontend
            timestamp: payload.get("timestamp")
                .and_then(|v| v.as_str())
                .unwrap_or(&chrono::Utc::now().to_rfc3339())
                .to_string(),
        })
    }

    fn parse_vehicle_event(payload: &serde_json::Value) -> Result<RealtimeEvent, String> {
        Ok(RealtimeEvent {
            event_type: payload.get("operation")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            table: payload.get("table")
                .and_then(|v| v.as_str())
                .unwrap_or("vehicle_queue")
                .to_string(),
            id: payload.get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            timestamp: payload.get("timestamp")
                .and_then(|v| v.as_str())
                .unwrap_or(&chrono::Utc::now().to_rfc3339())
                .to_string(),
            data: Some(payload.clone()),
        })
    }

    pub async fn get_connected_clients(&self) -> Vec<ClientConnection> {
        let clients_guard = self.clients.read().await;
        clients_guard.values().cloned().collect()
    }

    pub async fn broadcast_event(&self, event: RealtimeEvent) -> Result<(), String> {
        let sender_guard = self.event_sender.lock().unwrap();
        if let Some(sender) = sender_guard.as_ref() {
            sender.send(event).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn stop_server(&self) {
        self.is_running.store(false, Ordering::Relaxed);
        let mut sender = self.event_sender.lock().unwrap();
        *sender = None;
    }
}

// Tauri commands for WebSocket real-time functionality
#[tauri::command]
pub async fn start_websocket_realtime_listening(app_handle: tauri::AppHandle) -> Result<(), String> {
    let server = WebSocketRealtimeServer::get_instance();
    server.start_server(app_handle).await
}

#[tauri::command]
pub async fn stop_websocket_realtime_listening() -> Result<(), String> {
    let server = WebSocketRealtimeServer::get_instance();
    server.stop_server();
    Ok(())
}

#[tauri::command]
pub async fn get_websocket_realtime_status() -> Result<bool, String> {
    let server = WebSocketRealtimeServer::get_instance();
    Ok(server.is_running.load(Ordering::Relaxed))
}

#[tauri::command]
pub async fn get_connected_clients() -> Result<Vec<ClientConnection>, String> {
    let server = WebSocketRealtimeServer::get_instance();
    Ok(server.get_connected_clients().await)
}

#[tauri::command]
pub async fn broadcast_custom_event(event_type: String, table: String, id: String, data: Option<serde_json::Value>) -> Result<(), String> {
    let server = WebSocketRealtimeServer::get_instance();
    let event = RealtimeEvent {
        event_type,
        table,
        id,
        timestamp: chrono::Utc::now().to_rfc3339(),
        data,
    };
    server.broadcast_event(event).await
}