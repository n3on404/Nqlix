// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::time::Duration;
use tokio::time::timeout;
use reqwest::Client;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tauri::Manager;

// WebSocket relay state
static WS_SENDER: Lazy<Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Serialize, Deserialize)]
struct DiscoveredServer {
    ip: String,
    port: u16,
    url: String,
    response_time: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct NetworkDiscoveryResult {
    servers: Vec<DiscoveredServer>,
    total_scanned: u32,
    scan_duration_ms: u64,
}

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_app_name() -> String {
    env!("CARGO_PKG_NAME").to_string()
}

#[tauri::command]
async fn discover_local_servers() -> Result<NetworkDiscoveryResult, String> {
    let start_time = std::time::Instant::now();
    let mut discovered_servers = Vec::new();
    let mut total_scanned = 0u32;
    
    // Get local IP address
    let local_ip = get_local_ip().map_err(|e| format!("Failed to get local IP: {}", e))?;
    let network_prefix = get_network_prefix(&local_ip);
    
    println!("Starting network discovery on network: {}", network_prefix);
    
    // Create HTTP client with timeout
    let client = Client::builder()
        .timeout(Duration::from_millis(3000))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Define ports to scan (start with 3001, then 3002, 3003, etc.)
    let ports_to_scan = vec![3001, 3002, 3003, 3004, 3005, 3000, 3006, 3007, 3008, 3009];
    
    for port in ports_to_scan {
        println!("Scanning port {}...", port);
        
        // Scan the local network for this port
        let mut tasks = Vec::new();
        
        for i in 1..=254 {
            let ip = format!("{}.{}", network_prefix, i);
            let client_clone = client.clone();
            let port_clone = port;
            
            let task = tokio::spawn(async move {
                scan_ip(&ip, port_clone, &client_clone).await
            });
            
            tasks.push(task);
        }
        
        // Wait for all tasks to complete with a timeout
        let scan_timeout = Duration::from_secs(15); // Shorter timeout per port
        let results = timeout(scan_timeout, futures::future::join_all(tasks)).await
            .map_err(|_| format!("Network scan timed out for port {}", port))?;
        
        // Process results for this port
        for result in results {
            total_scanned += 1;
            if let Ok(inner) = result {
                if let Ok(Some(server)) = inner {
                    discovered_servers.push(server);
                }
            }
        }
        
        // If we found servers on this port, we can stop scanning additional ports
        if !discovered_servers.is_empty() {
            println!("Found {} servers on port {}, stopping scan", discovered_servers.len(), port);
            break;
        }
    }
    
    let scan_duration = start_time.elapsed().as_millis() as u64;
    
    // Sort by response time (fastest first)
    discovered_servers.sort_by(|a, b| a.response_time.cmp(&b.response_time));
    
    println!("Network discovery completed: found {} servers in {}ms", 
             discovered_servers.len(), scan_duration);
    
    Ok(NetworkDiscoveryResult {
        servers: discovered_servers,
        total_scanned,
        scan_duration_ms: scan_duration,
    })
}

#[tauri::command]
fn add_firewall_rule(exe_path: String, app_name: String) -> Result<(), String> {
    use std::process::Command;
    let rule_in = format!("netsh advfirewall firewall add rule name=\"{}\" dir=in action=allow program=\"{}\" enable=yes", app_name, exe_path);
    let rule_out = format!("netsh advfirewall firewall add rule name=\"{}\" dir=out action=allow program=\"{}\" enable=yes", app_name, exe_path);

    let status_in = Command::new("cmd")
        .args(&["/C", &rule_in])
        .status()
        .map_err(|e| e.to_string())?;
    let status_out = Command::new("cmd")
        .args(&["/C", &rule_out])
        .status()
        .map_err(|e| e.to_string())?;

    if status_in.success() && status_out.success() {
        Ok(())
    } else {
        Err("Failed to add firewall rule".to_string())
    }
}

#[tauri::command]
async fn proxy_localnode(
    method: String,
    endpoint: String,
    body: Option<String>,
    server_url: Option<String>,
    headers: Option<std::collections::HashMap<String, String>> // Accept headers from JS
) -> Result<String, String> {
    use reqwest::Client;
    use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
    
    let client = Client::new();
    
    // Use provided server URL or default to localhost
    let base_url = server_url.unwrap_or_else(|| "http://127.0.0.1:3001".to_string());
    let url = format!("{}{}", base_url, endpoint);

    let mut req = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "PATCH" => client.patch(&url),
        "DELETE" => client.delete(&url),
        _ => return Err("Unsupported method".to_string()),
    };

    // Build headers
    let mut header_map = HeaderMap::new();
    header_map.insert(CONTENT_TYPE, "application/json".parse().unwrap());
    if let Some(hs) = headers {
        for (k, v) in hs.iter() {
            if let (Ok(name), Ok(value)) = (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v)) {
                header_map.insert(name, value);
            }
        }
    }
    req = req.headers(header_map);

    let resp = if let Some(body) = body {
        req.body(body).send().await
    } else {
        req.send().await
    };

    match resp {
        Ok(r) => {
            let text = r.text().await.map_err(|e| e.to_string())?;
            Ok(text)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn start_ws_relay(window: tauri::Window) -> Result<(), String> {
    use tokio_tungstenite::connect_async;
    use futures::{StreamExt, SinkExt};
    use tokio::sync::mpsc;

    let url = "ws://127.0.0.1:3001/ws";
    let (ws_stream, _) = connect_async(url).await.map_err(|e| format!("WebSocket connect error: {}", e))?;
    let (mut write, mut read) = ws_stream.split();

    // Channel for sending messages from frontend to backend
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    {
        let mut sender_guard = WS_SENDER.lock().unwrap();
        *sender_guard = Some(tx);
    }

    // Spawn task to forward messages from backend to frontend
    let win_clone = window.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(Ok(msg)) = read.next().await {
            if let Ok(text) = msg.into_text() {
                let _ = win_clone.emit("ws-relay-message", text);
            }
        }
        // Connection closed
        let _ = win_clone.emit("ws-relay-closed", ());
    });

    // Spawn task to forward messages from frontend to backend
    tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let _ = write.send(tokio_tungstenite::tungstenite::Message::Text(msg)).await;
        }
    });

    Ok(())
}

#[tauri::command]
fn ws_relay_send(message: String) -> Result<(), String> {
    let sender_guard = WS_SENDER.lock().unwrap();
    if let Some(sender) = &*sender_guard {
        sender.send(message).map_err(|e| format!("Send error: {}", e))
    } else {
        Err("WebSocket relay not started".to_string())
    }
}

#[tauri::command]
fn check_for_updates() -> Result<(), String> {
    // This will trigger the updater to check for updates
    // The actual update checking is handled by Tauri's built-in updater
    Ok(())
}

#[tauri::command]
async fn install_update() -> Result<(), String> {
    use tauri::api::process::Command;
    
    // Get the current executable path
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable: {}", e))?;
    
    // Launch the updater
    Command::new_sidecar("updater")
        .map_err(|e| format!("Failed to create updater command: {}", e))?
        .args(&[current_exe.to_string_lossy().to_string()])
        .spawn()
        .map_err(|e| format!("Failed to spawn updater: {}", e))?;
    
    Ok(())
}

async fn scan_ip(ip: &str, port: u16, client: &Client) -> Result<Option<DiscoveredServer>, Box<dyn std::error::Error + Send + Sync>> {
    let url = format!("http://{}:{}/health", ip, port);
    
    let start_time = std::time::Instant::now();
    
    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                let response_time = start_time.elapsed().as_millis() as u64;
                
                // Try to parse response to verify it's our local node server
                if let Ok(body) = response.text().await {
                                    // Check if the response contains indicators of our local node server
                if body.contains("local-node") || 
                   body.contains("Louaj") || 
                   body.contains("status") ||
                   body.contains("database") ||
                   body.contains("uptime") ||
                   body.contains("health") ||
                   body.contains("express") ||
                   body.contains("node") {
                        return Ok(Some(DiscoveredServer {
                            ip: ip.to_string(),
                            port,
                            url: format!("http://{}:{}", ip, port),
                            response_time,
                        }));
                    }
                }
            }
        }
        Err(_) => {
            // Connection failed, which is expected for most IPs
        }
    }
    
    Ok(None)
}

fn get_local_ip() -> Result<IpAddr, Box<dyn std::error::Error>> {
    // Try to get local IP by connecting to a known address
    let socket = std::net::UdpSocket::bind("0.0.0.0:0")?;
    socket.connect("8.8.8.8:80")?;
    let local_addr = socket.local_addr()?;
    Ok(local_addr.ip())
}

fn get_network_prefix(ip: &IpAddr) -> String {
    match ip {
        IpAddr::V4(ipv4) => {
            let octets = ipv4.octets();
            format!("{}.{}.{}", octets[0], octets[1], octets[2])
        }
        IpAddr::V6(_) => {
            // For IPv6, we'll use a default local network
            "192.168.1".to_string()
        }
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_version,
            get_app_name,
            discover_local_servers,
            add_firewall_rule,
            proxy_localnode,
            start_ws_relay,
            ws_relay_send,
            check_for_updates,
            install_update
        ])
        .setup(|app| {
            // Handle updater events
            let app_handle1 = app.handle();
            app_handle1.clone().listen_global("tauri://update-available", move |event| {
                println!("Update available: {:?}", event.payload());
                // Emit to frontend
                let _ = app_handle1.emit_all("update-available", event.payload());
            });
            
            let app_handle2 = app.handle();
            app_handle2.clone().listen_global("tauri://update-download-progress", move |event| {
                println!("Update download progress: {:?}", event.payload());
                // Emit to frontend
                let _ = app_handle2.emit_all("update-download-progress", event.payload());
            });
            
            let app_handle3 = app.handle();
            app_handle3.clone().listen_global("tauri://update-download-finished", move |event| {
                println!("Update download finished: {:?}", event.payload());
                // Emit to frontend
                let _ = app_handle3.emit_all("update-download-finished", event.payload());
            });
            
            let app_handle4 = app.handle();
            app_handle4.clone().listen_global("tauri://update-install", move |event| {
                println!("Update install: {:?}", event.payload());
                // Emit to frontend
                let _ = app_handle4.emit_all("update-install", event.payload());
            });
            
            let app_handle5 = app.handle();
            app_handle5.clone().listen_global("tauri://update-error", move |event| {
                println!("Update error: {:?}", event.payload());
                // Emit to frontend
                let _ = app_handle5.emit_all("update-error", event.payload());
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
