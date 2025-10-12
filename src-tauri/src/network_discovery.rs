use serde::{Deserialize, Serialize};
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::time::{interval, sleep};
use tokio::sync::RwLock;
use once_cell::sync::Lazy;

// Global network discovery service
static NETWORK_DISCOVERY: Lazy<Arc<NetworkDiscoveryService>> = Lazy::new(|| {
    Arc::new(NetworkDiscoveryService::new())
});

#[derive(Debug, Clone)]
pub struct WaslaAppInfo {
    pub app_id: String,
    pub app_name: String,
    pub ip_address: String,
    pub websocket_port: u16,
    pub last_seen: Instant,
    pub capabilities: Vec<String>,
}

// Custom serialization for WaslaAppInfo
impl Serialize for WaslaAppInfo {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("WaslaAppInfo", 6)?;
        state.serialize_field("app_id", &self.app_id)?;
        state.serialize_field("app_name", &self.app_name)?;
        state.serialize_field("ip_address", &self.ip_address)?;
        state.serialize_field("websocket_port", &self.websocket_port)?;
        state.serialize_field("last_seen", &self.last_seen.elapsed().as_secs())?;
        state.serialize_field("capabilities", &self.capabilities)?;
        state.end()
    }
}

impl<'de> Deserialize<'de> for WaslaAppInfo {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::{self, MapAccess, Visitor};
        use std::fmt;

        struct WaslaAppInfoVisitor;

        impl<'de> Visitor<'de> for WaslaAppInfoVisitor {
            type Value = WaslaAppInfo;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("struct WaslaAppInfo")
            }

            fn visit_map<V>(self, mut map: V) -> Result<WaslaAppInfo, V::Error>
            where
                V: MapAccess<'de>,
            {
                let mut app_id = None;
                let mut app_name = None;
                let mut ip_address = None;
                let mut websocket_port = None;
                let mut last_seen_secs = None;
                let mut capabilities = None;

                while let Some(key) = map.next_key()? {
                    match key {
                        "app_id" => {
                            if app_id.is_some() {
                                return Err(de::Error::duplicate_field("app_id"));
                            }
                            app_id = Some(map.next_value()?);
                        }
                        "app_name" => {
                            if app_name.is_some() {
                                return Err(de::Error::duplicate_field("app_name"));
                            }
                            app_name = Some(map.next_value()?);
                        }
                        "ip_address" => {
                            if ip_address.is_some() {
                                return Err(de::Error::duplicate_field("ip_address"));
                            }
                            ip_address = Some(map.next_value()?);
                        }
                        "websocket_port" => {
                            if websocket_port.is_some() {
                                return Err(de::Error::duplicate_field("websocket_port"));
                            }
                            websocket_port = Some(map.next_value()?);
                        }
                        "last_seen" => {
                            if last_seen_secs.is_some() {
                                return Err(de::Error::duplicate_field("last_seen"));
                            }
                            last_seen_secs = Some(map.next_value()?);
                        }
                        "capabilities" => {
                            if capabilities.is_some() {
                                return Err(de::Error::duplicate_field("capabilities"));
                            }
                            capabilities = Some(map.next_value()?);
                        }
                        _ => {
                            let _ = map.next_value::<de::IgnoredAny>()?;
                        }
                    }
                }

                let app_id = app_id.ok_or_else(|| de::Error::missing_field("app_id"))?;
                let app_name = app_name.ok_or_else(|| de::Error::missing_field("app_name"))?;
                let ip_address = ip_address.ok_or_else(|| de::Error::missing_field("ip_address"))?;
                let websocket_port = websocket_port.ok_or_else(|| de::Error::missing_field("websocket_port"))?;
                let last_seen_secs = last_seen_secs.unwrap_or(0);
                let capabilities = capabilities.ok_or_else(|| de::Error::missing_field("capabilities"))?;

                Ok(WaslaAppInfo {
                    app_id,
                    app_name,
                    ip_address,
                    websocket_port,
                    last_seen: Instant::now() - Duration::from_secs(last_seen_secs),
                    capabilities,
                })
            }
        }

        const FIELDS: &'static [&'static str] = &["app_id", "app_name", "ip_address", "websocket_port", "last_seen", "capabilities"];
        deserializer.deserialize_struct("WaslaAppInfo", FIELDS, WaslaAppInfoVisitor)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveryMessage {
    pub message_type: String, // "announce", "request", "response"
    pub app_info: WaslaAppInfo,
    pub timestamp: String,
}

pub struct NetworkDiscoveryService {
    pub is_running: Arc<Mutex<bool>>,
    pub discovered_apps: Arc<RwLock<HashMap<String, WaslaAppInfo>>>,
    pub local_app_info: Arc<Mutex<Option<WaslaAppInfo>>>,
    pub discovery_port: u16,
    pub broadcast_interval: Duration,
    pub app_timeout: Duration,
}

impl NetworkDiscoveryService {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(Mutex::new(false)),
            discovered_apps: Arc::new(RwLock::new(HashMap::new())),
            local_app_info: Arc::new(Mutex::new(None)),
            discovery_port: 8766, // UDP discovery port
            broadcast_interval: Duration::from_secs(5), // Broadcast every 5 seconds
            app_timeout: Duration::from_secs(30), // Remove apps not seen for 30 seconds
        }
    }

    pub fn get_instance() -> Arc<Self> {
        NETWORK_DISCOVERY.clone()
    }

    pub async fn start_discovery(&self, app_name: String, websocket_port: u16) -> Result<(), String> {
        {
            let mut is_running = self.is_running.lock().unwrap();
            if *is_running {
                return Ok(());
            }
            *is_running = true;
        }

        // Get local IP address
        let local_ip = self.get_local_ip_address().await?;
        
        // Create local app info
        let app_id = format!("{}-{}", app_name, local_ip);
        let local_app_info = WaslaAppInfo {
            app_id: app_id.clone(),
            app_name: app_name.clone(),
            ip_address: local_ip.clone(),
            websocket_port,
            last_seen: Instant::now(),
            capabilities: vec!["websocket_server".to_string(), "booking".to_string()],
        };

        // Store local app info
        {
            let mut local_info = self.local_app_info.lock().unwrap();
            *local_info = Some(local_app_info.clone());
        }

        println!("🔍 Starting network discovery for {} at {}", app_name, local_ip);

        // Start UDP listener
        let discovery_service = self.clone();
        tokio::spawn(async move {
            if let Err(e) = discovery_service.udp_listener().await {
                eprintln!("❌ UDP listener error: {}", e);
            }
        });

        // Start UDP broadcaster
        let discovery_service = self.clone();
        tokio::spawn(async move {
            if let Err(e) = discovery_service.udp_broadcaster().await {
                eprintln!("❌ UDP broadcaster error: {}", e);
            }
        });

        // Start cleanup task
        let discovery_service = self.clone();
        tokio::spawn(async move {
            discovery_service.cleanup_task().await;
        });

        // Send initial discovery request
        self.send_discovery_request().await?;

        Ok(())
    }

    async fn get_local_ip_address(&self) -> Result<String, String> {
        // Try to get local IP by connecting to a remote address
        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
        socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
        let local_addr = socket.local_addr().map_err(|e| e.to_string())?;
        
        match local_addr.ip() {
            IpAddr::V4(ipv4) => Ok(ipv4.to_string()),
            IpAddr::V6(_) => Err("IPv6 not supported".to_string()),
        }
    }

    async fn udp_listener(&self) -> Result<(), String> {
        let socket = UdpSocket::bind(format!("0.0.0.0:{}", self.discovery_port))
            .map_err(|e| e.to_string())?;
        
        println!("🎧 UDP discovery listener started on port {}", self.discovery_port);

        let mut buffer = [0; 1024];
        loop {
            match socket.recv_from(&mut buffer) {
                Ok((len, addr)) => {
                    if let Ok(message_str) = std::str::from_utf8(&buffer[..len]) {
                        if let Ok(discovery_msg) = serde_json::from_str::<DiscoveryMessage>(message_str) {
                            self.handle_discovery_message(discovery_msg, addr).await;
                        }
                    }
                }
                Err(e) => {
                    eprintln!("❌ UDP receive error: {}", e);
                    sleep(Duration::from_millis(100)).await;
                }
            }
        }
    }

    async fn udp_broadcaster(&self) -> Result<(), String> {
        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
        socket.set_broadcast(true).map_err(|e| e.to_string())?;

        let mut interval = interval(self.broadcast_interval);
        
        loop {
            interval.tick().await;
            
            // Check if we should still be running
            {
                let is_running = self.is_running.lock().unwrap();
                if !*is_running {
                    break;
                }
            }

            // Get local app info
            let local_app_info = {
                let local_info = self.local_app_info.lock().unwrap();
                local_info.clone()
            };

            if let Some(app_info) = local_app_info {
                let discovery_msg = DiscoveryMessage {
                    message_type: "announce".to_string(),
                    app_info: app_info.clone(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                };

                if let Ok(message_json) = serde_json::to_string(&discovery_msg) {
                    let broadcast_addr = format!("255.255.255.255:{}", self.discovery_port);
                    if let Err(e) = socket.send_to(message_json.as_bytes(), &broadcast_addr) {
                        eprintln!("❌ UDP broadcast error: {}", e);
                    } else {
                        println!("📡 Broadcasted discovery message: {}", app_info.app_name);
                    }
                }
            }
        }

        Ok(())
    }

    async fn handle_discovery_message(&self, message: DiscoveryMessage, sender_addr: SocketAddr) {
        let app_info = message.app_info;
        
        // Don't process our own messages
        {
            let local_info = self.local_app_info.lock().unwrap();
            if let Some(ref local) = *local_info {
                if local.app_id == app_info.app_id {
                    return;
                }
            }
        }

        match message.message_type.as_str() {
            "announce" => {
                println!("📢 Received announcement from {} at {}", app_info.app_name, app_info.ip_address);
                
                let mut apps = self.discovered_apps.write().await;
                apps.insert(app_info.app_id.clone(), app_info);
            }
            "request" => {
                println!("❓ Received discovery request from {}", app_info.app_name);
                
                // Respond with our info
                self.send_discovery_response(sender_addr).await;
            }
            "response" => {
                println!("📨 Received discovery response from {}", app_info.app_name);
                
                let mut apps = self.discovered_apps.write().await;
                apps.insert(app_info.app_id.clone(), app_info);
            }
            _ => {
                println!("❓ Unknown discovery message type: {}", message.message_type);
            }
        }
    }

    async fn send_discovery_request(&self) -> Result<(), String> {
        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
        socket.set_broadcast(true).map_err(|e| e.to_string())?;

        let local_app_info = {
            let local_info = self.local_app_info.lock().unwrap();
            local_info.clone()
        };

        if let Some(app_info) = local_app_info {
            let discovery_msg = DiscoveryMessage {
                message_type: "request".to_string(),
                app_info: app_info.clone(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };

            if let Ok(message_json) = serde_json::to_string(&discovery_msg) {
                let broadcast_addr = format!("255.255.255.255:{}", self.discovery_port);
                socket.send_to(message_json.as_bytes(), &broadcast_addr).map_err(|e| e.to_string())?;
                println!("📤 Sent discovery request");
            }
        }

        Ok(())
    }

    async fn send_discovery_response(&self, target_addr: SocketAddr) {
        let socket = UdpSocket::bind("0.0.0.0:0").ok();
        if let Some(socket) = socket {
            let local_app_info = {
                let local_info = self.local_app_info.lock().unwrap();
                local_info.clone()
            };

            if let Some(app_info) = local_app_info {
                let discovery_msg = DiscoveryMessage {
                    message_type: "response".to_string(),
                    app_info: app_info.clone(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                };

                if let Ok(message_json) = serde_json::to_string(&discovery_msg) {
                    let _ = socket.send_to(message_json.as_bytes(), target_addr);
                }
            }
        }
    }

    async fn cleanup_task(&self) {
        let mut interval = interval(Duration::from_secs(10));
        
        loop {
            interval.tick().await;
            
            // Check if we should still be running
            {
                let is_running = self.is_running.lock().unwrap();
                if !*is_running {
                    break;
                }
            }

            let now = Instant::now();
            let mut apps = self.discovered_apps.write().await;
            let mut to_remove = Vec::new();

            for (app_id, app_info) in apps.iter() {
                if now.duration_since(app_info.last_seen) > self.app_timeout {
                    to_remove.push(app_id.clone());
                }
            }

            for app_id in to_remove {
                if let Some(app_info) = apps.remove(&app_id) {
                    println!("🧹 Removed stale app: {} ({})", app_info.app_name, app_info.ip_address);
                }
            }
        }
    }

    pub async fn get_discovered_apps(&self) -> Vec<WaslaAppInfo> {
        let apps = self.discovered_apps.read().await;
        apps.values().cloned().collect()
    }

    pub async fn get_best_server(&self) -> Option<WaslaAppInfo> {
        let apps = self.discovered_apps.read().await;
        
        // Find apps that can serve as WebSocket servers
        let mut servers: Vec<_> = apps.values()
            .filter(|app| app.capabilities.contains(&"websocket_server".to_string()))
            .collect();
        
        if servers.is_empty() {
            return None;
        }

        // Sort by IP address (lowest IP wins)
        servers.sort_by(|a, b| a.ip_address.cmp(&b.ip_address));
        
        Some(servers[0].clone())
    }

    pub async fn get_websocket_server_url(&self) -> Option<String> {
        if let Some(server) = self.get_best_server().await {
            Some(format!("ws://{}:{}", server.ip_address, server.websocket_port))
        } else {
            None
        }
    }

    pub fn stop_discovery(&self) {
        let mut is_running = self.is_running.lock().unwrap();
        *is_running = false;
    }
}

impl Clone for NetworkDiscoveryService {
    fn clone(&self) -> Self {
        Self {
            is_running: Arc::clone(&self.is_running),
            discovered_apps: Arc::clone(&self.discovered_apps),
            local_app_info: Arc::clone(&self.local_app_info),
            discovery_port: self.discovery_port,
            broadcast_interval: self.broadcast_interval,
            app_timeout: self.app_timeout,
        }
    }
}

// Tauri commands for network discovery
#[tauri::command]
pub async fn start_network_discovery(app_name: String, websocket_port: u16) -> Result<(), String> {
    let discovery = NetworkDiscoveryService::get_instance();
    discovery.start_discovery(app_name, websocket_port).await
}

#[tauri::command]
pub async fn stop_network_discovery() -> Result<(), String> {
    let discovery = NetworkDiscoveryService::get_instance();
    discovery.stop_discovery();
    Ok(())
}

#[tauri::command]
pub async fn get_discovered_apps() -> Result<Vec<WaslaAppInfo>, String> {
    let discovery = NetworkDiscoveryService::get_instance();
    Ok(discovery.get_discovered_apps().await)
}

#[tauri::command]
pub async fn get_best_websocket_server() -> Result<Option<String>, String> {
    let discovery = NetworkDiscoveryService::get_instance();
    Ok(discovery.get_websocket_server_url().await)
}