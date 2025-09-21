// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::time::Duration;
use tokio::time::timeout;
use reqwest::Client;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
    WindowEvent, GlobalShortcutManager
};
use auto_launch::AutoLaunchBuilder;

mod printer;
use printer::{PrinterService, PrinterConfig, PrintJob, PrinterStatus};

// WebSocket relay state
static WS_SENDER: Lazy<Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>> = Lazy::new(|| Mutex::new(None));

// Printer service state
static PRINTER_SERVICE: Lazy<Arc<Mutex<PrinterService>>> = Lazy::new(|| Arc::new(Mutex::new(PrinterService::new())));

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
    
    let base_url = if let Some(url) = server_url {
        // Use provided server URL
        url
    } else {
        // Auto-discover the best server URL
        match discover_local_servers().await {
            Ok(discovery_result) => {
                if let Some(server) = discovery_result.servers.first() {
                    server.url.clone()
                } else {
                    "http://127.0.0.1:3001".to_string()
                }
            }
            Err(_) => {
                "http://127.0.0.1:3001".to_string()
            }
        }
    };
    
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
async fn start_ws_relay(window: tauri::Window, server_url: Option<String>) -> Result<(), String> {
    use tokio_tungstenite::connect_async;
    use futures::{StreamExt, SinkExt};
    use tokio::sync::mpsc;

    let base_url = if let Some(url) = server_url {
        // Use provided server URL
        url
    } else {
        // Auto-discover the best server URL
        println!("🔍 Auto-discovering local server...");
        match discover_local_servers().await {
            Ok(discovery_result) => {
                if let Some(server) = discovery_result.servers.first() {
                    println!("🎯 Found server at: {} ({}ms response time)", server.url, server.response_time);
                    server.url.clone()
                } else {
                    println!("⚠️ No servers discovered, falling back to localhost");
                    "http://127.0.0.1:3001".to_string()
                }
            }
            Err(e) => {
                println!("❌ Discovery failed: {}, falling back to localhost", e);
                "http://127.0.0.1:3001".to_string()
            }
        }
    };
    
    let ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://") + "/ws";
    
    println!("🔌 Connecting to WebSocket: {}", ws_url);
    let (ws_stream, _) = connect_async(&ws_url).await.map_err(|e| format!("WebSocket connect error: {}", e))?;
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
fn toggle_fullscreen(window: tauri::Window) -> Result<(), String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!is_fullscreen).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn minimize_to_tray(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn show_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn setup_auto_startup() -> Result<String, String> {
    let app_name = "Nqlix";
    let app_path = std::env::current_exe().map_err(|e| e.to_string())?;
    
    let auto = AutoLaunchBuilder::new()
        .set_app_name(app_name)
        .set_app_path(&app_path.to_string_lossy())
        .set_use_launch_agent(true)
        .build()
        .map_err(|e| e.to_string())?;
    
    if auto.is_enabled().map_err(|e| e.to_string())? {
        Ok("Auto-startup is already enabled".to_string())
    } else {
        auto.enable().map_err(|e| e.to_string())?;
        Ok("Auto-startup enabled successfully".to_string())
    }
}

#[tauri::command]
fn disable_auto_startup() -> Result<String, String> {
    let app_name = "Nqlix";
    let app_path = std::env::current_exe().map_err(|e| e.to_string())?;
    
    let auto = AutoLaunchBuilder::new()
        .set_app_name(app_name)
        .set_app_path(&app_path.to_string_lossy())
        .set_use_launch_agent(true)
        .build()
        .map_err(|e| e.to_string())?;
    
    if auto.is_enabled().map_err(|e| e.to_string())? {
        auto.disable().map_err(|e| e.to_string())?;
        Ok("Auto-startup disabled successfully".to_string())
    } else {
        Ok("Auto-startup was not enabled".to_string())
    }
}

#[tauri::command]
fn check_auto_startup() -> Result<bool, String> {
    let app_name = "Nqlix";
    let app_path = std::env::current_exe().map_err(|e| e.to_string())?;
    
    let auto = AutoLaunchBuilder::new()
        .set_app_name(app_name)
        .set_app_path(&app_path.to_string_lossy())
        .set_use_launch_agent(true)
        .build()
        .map_err(|e| e.to_string())?;
    
    auto.is_enabled().map_err(|e| e.to_string())
}

// Printer commands
#[tauri::command]
async fn get_printer_config() -> Result<PrinterConfig, String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    printer.get_config()
}

#[tauri::command]
async fn update_printer_config(config: PrinterConfig) -> Result<(), String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    printer.update_config(config)
}

#[tauri::command]
async fn test_printer_connection() -> Result<PrinterStatus, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.test_connection().await
}

#[tauri::command]
async fn print_ticket(content: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_ticket(content).await
}

#[tauri::command]
async fn print_receipt(content: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_receipt(content).await
}

#[tauri::command]
async fn print_barcode(data: String, barcode_type: u8) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_barcode(data, barcode_type).await
}

#[tauri::command]
async fn print_qr_code(data: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_qr_code(data).await
}

#[tauri::command]
async fn execute_print_job(job: PrintJob) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.execute_print_job(job).await
}

#[tauri::command]
async fn print_with_logo(content: String, logo_path: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_with_logo(content, logo_path).await
}

#[tauri::command]
async fn print_standard_ticket(content: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_standard_ticket(content).await
}

#[tauri::command]
async fn print_booking_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_booking_ticket(ticket_data, staff_name).await
}

#[tauri::command]
async fn print_entry_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_entry_ticket(ticket_data, staff_name).await
}

#[tauri::command]
async fn print_exit_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_exit_ticket(ticket_data, staff_name).await
}

// Reprint last tickets
#[tauri::command]
async fn reprint_booking_ticket() -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.reprint_booking_ticket().await
}

#[tauri::command]
async fn reprint_entry_ticket() -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.reprint_entry_ticket().await
}

#[tauri::command]
async fn reprint_exit_ticket() -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.reprint_exit_ticket().await
}

#[tauri::command]
async fn print_day_pass_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_day_pass_ticket(ticket_data, staff_name).await
}

#[tauri::command]
async fn reprint_day_pass_ticket() -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.reprint_day_pass_ticket().await
}

#[tauri::command]
async fn print_exit_pass_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_exit_pass_ticket(ticket_data, staff_name).await
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

fn create_system_tray() -> SystemTray {
    let show = CustomMenuItem::new("show".to_string(), "Afficher");
    let hide = CustomMenuItem::new("hide".to_string(), "Masquer");
    let fullscreen = CustomMenuItem::new("fullscreen".to_string(), "Basculer plein écran");
    let startup = CustomMenuItem::new("startup".to_string(), "Démarrage automatique");
    let quit = CustomMenuItem::new("quit".to_string(), "Quitter");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(fullscreen)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(startup)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);
    
    SystemTray::new().with_menu(tray_menu)
}

fn handle_system_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick {
            position: _,
            size: _,
            ..
        } => {
            let window = app.get_window("main").unwrap();
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
            } else {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        SystemTrayEvent::MenuItemClick { id, .. } => {
            let window = app.get_window("main").unwrap();
            match id.as_str() {
                "show" => {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                "hide" => {
                    let _ = window.hide();
                }
                "fullscreen" => {
                    if let Ok(is_fullscreen) = window.is_fullscreen() {
                        let _ = window.set_fullscreen(!is_fullscreen);
                    }
                }
                "startup" => {
                    // Toggle auto-startup
                    if let Ok(is_enabled) = check_auto_startup() {
                        if is_enabled {
                            let _ = disable_auto_startup();
                        } else {
                            let _ = setup_auto_startup();
                        }
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            }
        }
        _ => {}
    }
}

fn main() {
    let system_tray = create_system_tray();
    
    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(handle_system_tray_event)
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_version,
            get_app_name,
            discover_local_servers,
            add_firewall_rule,
            proxy_localnode,
            start_ws_relay,
            ws_relay_send,
            toggle_fullscreen,
            minimize_to_tray,
            show_window,
            setup_auto_startup,
            disable_auto_startup,
            check_auto_startup,
            get_printer_config,
            update_printer_config,
            test_printer_connection,
            print_ticket,
            print_receipt,
            print_barcode,
            print_qr_code,
            execute_print_job,
            print_with_logo,
            print_standard_ticket,
            print_booking_ticket,
            print_entry_ticket,
            print_exit_ticket,
            print_day_pass_ticket,
            print_exit_pass_ticket,
            reprint_booking_ticket,
            reprint_entry_ticket,
            reprint_exit_ticket,
            reprint_day_pass_ticket
        ])
        .setup(|app| {
            let app_handle = app.handle();
            
            // Auto-enable startup on first run
            if let Ok(false) = check_auto_startup() {
                if let Ok(message) = setup_auto_startup() {
                    println!("🚀 {}", message);
                }
            }
            
            // Set up global shortcuts
            let mut shortcut_manager = app.global_shortcut_manager();
            
            // F11 to toggle fullscreen
            let app_handle_f11 = app_handle.clone();
            shortcut_manager
                .register("F11", move || {
                    if let Some(window) = app_handle_f11.get_window("main") {
                        if let Ok(is_fullscreen) = window.is_fullscreen() {
                            let _ = window.set_fullscreen(!is_fullscreen);
                        }
                    }
                })
                .unwrap_or_else(|err| println!("Failed to register F11 shortcut: {}", err));
            
            // Ctrl+Shift+H to hide/show window
            let app_handle_hide = app_handle.clone();
            shortcut_manager
                .register("CommandOrControl+Shift+H", move || {
                    if let Some(window) = app_handle_hide.get_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .unwrap_or_else(|err| println!("Failed to register hide/show shortcut: {}", err));
            
            // Handle window events
            let window = app.get_window("main").unwrap();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        // Prevent close, hide to tray instead
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                    _ => {}
                }
            });
            
            // Force fullscreen on startup
            let _ = window.set_fullscreen(true);
            let _ = window.set_focus();
            
            // Handle updater events
            app_handle.listen_global("tauri://update-available", move |event| {
                println!("Update available: {:?}", event.payload());
            });
            
            app_handle.listen_global("tauri://update-download-progress", move |event| {
                println!("Update download progress: {:?}", event.payload());
            });
            
            app_handle.listen_global("tauri://update-download-finished", move |event| {
                println!("Update download finished: {:?}", event.payload());
            });
            
            app_handle.listen_global("tauri://update-install", move |event| {
                println!("Update install: {:?}", event.payload());
            });
            
            app_handle.listen_global("tauri://update-error", move |event| {
                println!("Update error: {:?}", event.payload());
            });
            
            println!("🎯 Nqlix started in fullscreen mode with system tray support");
            println!("📋 System tray controls: Left-click to show/hide, Right-click for menu");
            println!("⌨️  Shortcuts: F11 (fullscreen), Ctrl+Shift+H (hide/show)");
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
