use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio_postgres::{NoTls};
use deadpool_postgres::{Pool, Runtime};
use std::env as stdenv;
use dotenvy::dotenv;
use once_cell::sync::Lazy;
use tauri::Manager;
use tokio::sync::broadcast;
use std::sync::atomic::{AtomicBool, Ordering};

// Global state for real-time events
static REALTIME_SERVICE: Lazy<Arc<RealtimeService>> = Lazy::new(|| {
    Arc::new(RealtimeService::new())
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

pub struct RealtimeService {
    is_listening: AtomicBool,
    event_sender: Arc<Mutex<Option<broadcast::Sender<RealtimeEvent>>>>,
    db_pool: Pool,
}

impl RealtimeService {
    pub fn new() -> Self {
        let _ = dotenv();
        let db_url = stdenv::var("DATABASE_URL").unwrap_or_else(|_|
            "postgresql://ivan:Lost2409@127.0.0.1:5432/louaj_node".to_string()
        );

        let mut cfg = deadpool_postgres::Config::new();
        cfg.url = Some(db_url);
        cfg.pool = Some(deadpool_postgres::PoolConfig::new(4));
        let db_pool = cfg.create_pool(Some(Runtime::Tokio1), NoTls)
            .expect("Failed to create DB pool for realtime");

        Self {
            is_listening: AtomicBool::new(false),
            event_sender: Arc::new(Mutex::new(None)),
            db_pool,
        }
    }

    pub fn get_instance() -> Arc<Self> {
        REALTIME_SERVICE.clone()
    }

    pub async fn start_listening(&self, app_handle: tauri::AppHandle) -> Result<(), String> {
        if self.is_listening.load(Ordering::Relaxed) {
            return Ok(());
        }

        let (tx, mut rx) = broadcast::channel(1000);
        {
            let mut sender = self.event_sender.lock().unwrap();
            *sender = Some(tx);
        }

        let pool = self.db_pool.clone();
        let app_handle_clone = app_handle.clone();

        // Start the PostgreSQL LISTEN task
        tokio::spawn(async move {
            if let Err(e) = Self::listen_to_postgres(pool, app_handle_clone).await {
                eprintln!("PostgreSQL LISTEN error: {}", e);
            }
        });

        // Start the event broadcasting task
        tokio::spawn(async move {
            while let Ok(event) = rx.recv().await {
                // Emit to all windows
                let _ = app_handle.emit_all("realtime-event", &event);
            }
        });

        self.is_listening.store(true, Ordering::Relaxed);
        Ok(())
    }

    async fn listen_to_postgres(pool: Pool, app_handle: tauri::AppHandle) -> Result<(), String> {
        // Create a dedicated connection for LISTEN/NOTIFY
        let _ = dotenv();
        let db_url = stdenv::var("DATABASE_URL").unwrap_or_else(|_|
            "postgresql://ivan:Lost2409@127.0.0.1:5432/louaj_node".to_string()
        );

        let (client, connection) = tokio_postgres::connect(&db_url, NoTls).await.map_err(|e| e.to_string())?;
        
        // Spawn the connection task
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("PostgreSQL connection error: {}", e);
            }
        });

        // Start listening to the channel
        client.execute("LISTEN supervisor_events", &[]).await.map_err(|e| e.to_string())?;
        
        println!("Started listening to PostgreSQL NOTIFY events");

        // Poll for notifications
        let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(100));
        
        loop {
            interval.tick().await;
            
            // Check for notifications by querying the database for recent changes
            // This is a simplified approach since tokio_postgres doesn't have direct notification support
            if let Ok(rows) = client.query(
                "SELECT COUNT(*) FROM bookings WHERE created_at > NOW() - INTERVAL '1 second'",
                &[]
            ).await {
                if let Some(row) = rows.first() {
                    let count: i64 = row.get(0);
                    if count > 0 {
                        // Emit a generic booking event
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
        }
    }

    async fn handle_booking_event(
        pool: &Pool,
        event: &RealtimeEvent,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        // Get updated seat availability for the affected destination
        let client = pool.get().await.map_err(|e| e.to_string())?;
        
        let sql = r#"
            SELECT 
                destination_id,
                destination_name,
                SUM(available_seats) as total_available_seats,
                SUM(total_seats) as total_seats,
                COUNT(*) as vehicle_count
            FROM vehicle_queue 
            WHERE destination_id = (
                SELECT destination_id FROM bookings WHERE id = $1
            )
            GROUP BY destination_id, destination_name
        "#;

        if let Ok(rows) = client.query(sql, &[&event.id]).await {
            for row in rows {
                let update_event = BookingUpdateEvent {
                    event_type: "booking_update".to_string(),
                    destination_id: row.get::<_, String>("destination_id"),
                    destination_name: row.get::<_, String>("destination_name"),
                    available_seats: row.get::<_, i64>("total_available_seats") as i32,
                    total_seats: row.get::<_, i64>("total_seats") as i32,
                    vehicle_count: row.get::<_, i64>("vehicle_count") as i32,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                };

                let _ = app_handle.emit_all("booking-update", &update_event);
            }
        }

        Ok(())
    }

    async fn handle_queue_event(
        pool: &Pool,
        event: &RealtimeEvent,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        // Get updated queue information for the affected destination
        let client = pool.get().await.map_err(|e| e.to_string())?;
        
        let sql = r#"
            SELECT 
                destination_id,
                destination_name,
                license_plate,
                status,
                available_seats,
                queue_position
            FROM vehicle_queue 
            WHERE destination_id = (
                SELECT destination_id FROM vehicle_queue WHERE id = $1
            )
            ORDER BY queue_position
        "#;

        if let Ok(rows) = client.query(sql, &[&event.id]).await {
            let mut queue_changes = Vec::new();
            let mut destination_id = String::new();
            let mut destination_name = String::new();

            for row in rows {
                destination_id = row.get::<_, String>("destination_id");
                destination_name = row.get::<_, String>("destination_name");
                
                queue_changes.push(QueueChange {
                    license_plate: row.get::<_, String>("license_plate"),
                    status: row.get::<_, String>("status"),
                    available_seats: row.get::<_, i32>("available_seats"),
                    queue_position: row.get::<_, i32>("queue_position"),
                });
            }

            if !queue_changes.is_empty() {
                let update_event = QueueUpdateEvent {
                    event_type: "queue_update".to_string(),
                    destination_id,
                    destination_name,
                    queue_changes,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                };

                let _ = app_handle.emit_all("queue-update", &update_event);
            }
        }

        Ok(())
    }

    pub fn stop_listening(&self) {
        self.is_listening.store(false, Ordering::Relaxed);
        let mut sender = self.event_sender.lock().unwrap();
        *sender = None;
    }
}

// Tauri commands for real-time functionality
#[tauri::command]
pub async fn start_realtime_listening(app_handle: tauri::AppHandle) -> Result<(), String> {
    let service = RealtimeService::get_instance();
    service.start_listening(app_handle).await
}

#[tauri::command]
pub async fn stop_realtime_listening() -> Result<(), String> {
    let service = RealtimeService::get_instance();
    service.stop_listening();
    Ok(())
}

#[tauri::command]
pub async fn get_realtime_status() -> Result<bool, String> {
    let service = RealtimeService::get_instance();
    Ok(service.is_listening.load(Ordering::Relaxed))
}
