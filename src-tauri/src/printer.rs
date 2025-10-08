    use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::{Arc, Mutex};
use reqwest::Client;
use std::time::Duration;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrinterConfig {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub width: u8,
    pub timeout: u64,
    pub model: String,
    pub enabled: bool,
    pub is_default: bool,
}


#[derive(Debug, Serialize, Deserialize)]
pub struct PrintJob {
    pub content: String,
    pub align: Option<String>, // "left", "center", "right"
    pub bold: Option<bool>,
    pub underline: Option<bool>,
    pub size: Option<String>, // "normal", "double_height", "double_width", "quad"
    pub cut: Option<bool>,
    pub open_cash_drawer: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrinterStatus {
    pub connected: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StaffInfo {
    pub id: String,
    pub cin: String,
    pub firstName: String,
    pub lastName: String,
    pub role: String,
    pub phoneNumber: Option<String>,
}

#[derive(Clone)]
pub struct PrinterService {
    printer_config: Arc<Mutex<PrinterConfig>>,
    node_script_path: String,
    // Cache last printed payloads for reprint functionality
    last_booking_payload: Arc<Mutex<Option<String>>>,
    last_entry_payload: Arc<Mutex<Option<String>>>,
    last_exit_payload: Arc<Mutex<Option<String>>>,
    last_day_pass_payload: Arc<Mutex<Option<String>>>,
}

impl PrinterService {
    /// Get the configuration file path
    fn get_config_path() -> PathBuf {
        // Try to get the executable directory first
        if let Ok(exe_path) = std::env::current_exe() {
            println!("🔍 [CONFIG] Executable path: {:?}", exe_path);
            if let Some(exe_dir) = exe_path.parent() {
                let config_path = exe_dir.join("printer_config.json");
                println!("🔍 [CONFIG] Config path (from exe): {:?}", config_path);
                return config_path;
            }
        }
        
        // Fallback to current directory
        let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let config_path = current_dir.join("printer_config.json");
        println!("🔍 [CONFIG] Current directory: {:?}", current_dir);
        println!("🔍 [CONFIG] Config path (from current dir): {:?}", config_path);
        config_path
    }

    /// Save printer configuration to file
    fn save_config_to_file(&self) -> Result<(), String> {
        let config = self.printer_config.lock().map_err(|e| e.to_string())?;
        let config_path = Self::get_config_path();
        
        println!("💾 [CONFIG] Saving printer config to: {:?}", config_path);
        
        let config_json = serde_json::to_string_pretty(&*config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
        fs::write(&config_path, config_json)
            .map_err(|e| format!("Failed to write config file {:?}: {}", config_path, e))?;
        
        println!("✅ [CONFIG] Printer configuration saved successfully");
        Ok(())
    }

    /// Load printer configuration from file
    fn load_config_from_file(&self) -> Result<(), String> {
        let config_path = Self::get_config_path();
        
        println!("📂 [CONFIG] Loading printer config from: {:?}", config_path);
        println!("📂 [CONFIG] File exists: {}", config_path.exists());
        
        if !config_path.exists() {
            println!("⚠️ [CONFIG] Config file does not exist, using default configuration");
            return Ok(());
        }
        
        let config_content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file {:?}: {}", config_path, e))?;
        
        println!("📂 [CONFIG] Config file content: {}", config_content);
        
        let loaded_config: PrinterConfig = serde_json::from_str(&config_content)
            .map_err(|e| format!("Failed to parse config file: {}", e))?;
        
        println!("📂 [CONFIG] Parsed config: IP={}, Port={}", loaded_config.ip, loaded_config.port);
        
        let mut config = self.printer_config.lock().map_err(|e| e.to_string())?;
        *config = loaded_config;
        
        println!("✅ [CONFIG] Printer configuration loaded successfully: {}:{}", config.ip, config.port);
        Ok(())
    }

    // Node-based temporary scripts no longer used

    /// Helper function to get the path to node_modules for the bundled application
    fn get_node_modules_path(&self) -> Result<std::path::PathBuf, String> {
        let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
        let exe_dir = exe_path.parent().ok_or("Failed to get executable directory")?;
        
        println!("🔍 [DEBUG] Executable path: {:?}", exe_path);
        println!("🔍 [DEBUG] Executable directory: {:?}", exe_dir);
        
        // Check multiple possible locations
        let possible_paths = vec![
            // Development paths
            exe_dir.join("resources").join("node_modules"),
            exe_dir.join("node_modules"),
            // Production paths
            exe_dir.join("..").join("node_modules"),
            exe_dir.join("..").join("resources").join("node_modules"),
            // Current working directory
            std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?.join("node_modules"),
            // Parent of current working directory
            std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?.join("..").join("node_modules"),
        ];
        
        for path in &possible_paths {
            println!("🔍 [DEBUG] Checking path: {:?} - exists: {}", path, path.exists());
            if path.exists() {
                println!("✅ [DEBUG] Found node_modules at: {:?}", path);
                return Ok(path.clone());
            }
        }
        
        // List contents of executable directory for debugging
        if let Ok(entries) = std::fs::read_dir(exe_dir) {
            println!("🔍 [DEBUG] Contents of executable directory:");
            for entry in entries.flatten() {
                println!("  - {:?}", entry.path());
            }
        }
        
        Err(format!("Could not find node_modules directory. Checked paths: {:?}", possible_paths))
    }

    // Node require no longer used (migrated to raw ESC/POS via TCP)

    // Node execution is no longer used

    fn read_env_from_system(key: &str) -> Option<String> {
        // Linux: read from system files first to reflect latest changes without restart
        #[cfg(target_os = "linux")]
        {
            if let Ok(content) = fs::read_to_string("/etc/environment") {
                for line in content.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') { continue; }
                    // Accept KEY="value" or KEY=value
                    if let Some((k, vraw)) = line.split_once('=') {
                        if k.trim() == key {
                            let mut v = vraw.trim().to_string();
                            if v.starts_with('"') && v.ends_with('"') && v.len() >= 2 {
                                v = v[1..v.len()-1].to_string();
                            }
                            if !v.is_empty() { return Some(v); }
                        }
                    }
                }
            }

            // Try profile.d script format: export KEY="value"
            if let Ok(content) = fs::read_to_string("/etc/profile.d/printer-env.sh") {
                for line in content.lines() {
                    let line = line.trim();
                    if !line.starts_with("export ") { continue; }
                    let rest = &line[7..];
                    if let Some((k, vraw)) = rest.split_once('=') {
                        if k.trim() == key {
                            let mut v = vraw.trim().to_string();
                            if v.starts_with('"') && v.ends_with('"') && v.len() >= 2 {
                                v = v[1..v.len()-1].to_string();
                            }
                            if !v.is_empty() { return Some(v); }
                        }
                    }
                }
            }
        }

        // Fallback: none
        None
    }

    fn read_u16_from_env(key: &str, default_val: u16) -> u16 {
        Self::read_env_from_system(key)
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(default_val)
    }

    fn read_u8_from_env(key: &str, default_val: u8) -> u8 {
        Self::read_env_from_system(key)
            .and_then(|s| s.parse::<u8>().ok())
            .unwrap_or(default_val)
    }

    fn read_u64_from_env(key: &str, default_val: u64) -> u64 {
        Self::read_env_from_system(key)
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(default_val)
    }

    pub fn debug_env_snapshot(&self) -> std::collections::HashMap<String, String> {
        let mut map = std::collections::HashMap::new();
        let keys = [
            "PRINTER_IP",
            "PRINTER_PORT",
            "PRINTER_NAME",
            "PRINTER_WIDTH",
            "PRINTER_TIMEOUT",
            "PRINTER_MODEL",
        ];
        for k in keys.iter() {
            if let Some(v) = Self::read_env_from_system(k) {
                map.insert((*k).to_string(), v);
            }
        }
        map
    }

    pub fn new() -> Self {
        println!("🚀 [CONFIG] PrinterService::new() called - initializing printer service");
        
        // Default printer configuration
        let printer_ip = "192.168.192.12".to_string(); // Default IP
        let printer_port = 9100; // Default port
        let printer_name = "Imprimante Thermique".to_string();
        let printer_width = 48;
        let printer_timeout = 10000; // Increased timeout for better reliability
        let printer_model = "TM-T20X".to_string();

        let printer_config = PrinterConfig {
            id: "printer1".to_string(),
            name: printer_name,
            ip: printer_ip,
            port: printer_port,
            width: printer_width,
            timeout: printer_timeout,
            model: printer_model,
            enabled: true,
            is_default: true,
        };

        println!("🔧 [CONFIG] Created default config: IP={}, Port={}", printer_config.ip, printer_config.port);

        let service = Self {
            printer_config: Arc::new(Mutex::new(printer_config)),
            node_script_path: "scripts/printer.js".to_string(),
            last_booking_payload: Arc::new(Mutex::new(None)),
            last_entry_payload: Arc::new(Mutex::new(None)),
            last_exit_payload: Arc::new(Mutex::new(None)),
            last_day_pass_payload: Arc::new(Mutex::new(None)),
        };

        // Try to load configuration from file
        println!("📂 [CONFIG] Attempting to load configuration from file...");
        if let Err(e) = service.load_config_from_file() {
            println!("⚠️ [CONFIG] Failed to load config from file: {}. Using default configuration.", e);
        } else {
            println!("✅ [CONFIG] Configuration loaded successfully from file");
        }

        service
    }

    pub fn reload_config_from_env(&self) -> Result<(), String> {
        // Reload configuration from system-level environment sources
        let printer_ip = Self::read_env_from_system("PRINTER_IP").unwrap_or_else(|| "192.168.192.10".to_string());
        let printer_port = Self::read_u16_from_env("PRINTER_PORT", 9100);
        let printer_name = Self::read_env_from_system("PRINTER_NAME").unwrap_or_else(|| "Imprimante Thermique".to_string());
        let printer_width = Self::read_u8_from_env("PRINTER_WIDTH", 48);
        let printer_timeout = Self::read_u64_from_env("PRINTER_TIMEOUT", 5000);
        let printer_model = Self::read_env_from_system("PRINTER_MODEL").unwrap_or_else(|| "TM-T20X".to_string());

        let new_config = PrinterConfig {
            id: "printer1".to_string(),
            name: printer_name,
            ip: printer_ip,
            port: printer_port,
            width: printer_width,
            timeout: printer_timeout,
            model: printer_model,
            enabled: true,
            is_default: true,
        };

        let mut config = self.printer_config.lock().map_err(|e| e.to_string())?;
        *config = new_config;
        Ok(())
    }

    pub fn get_all_printers(&self) -> Result<Vec<PrinterConfig>, String> {
        let config = self.printer_config.lock().map_err(|e| e.to_string())?;
        Ok(vec![config.clone()])
    }

    pub fn get_printer_by_id(&self, id: &str) -> Result<Option<PrinterConfig>, String> {
        let config = self.printer_config.lock().map_err(|e| e.to_string())?;
        if config.id == id {
            Ok(Some(config.clone()))
        } else {
            Ok(None)
        }
    }

    pub fn get_default_printer(&self) -> Result<Option<PrinterConfig>, String> {
        let config = self.printer_config.lock().map_err(|e| e.to_string())?;
        Ok(Some(config.clone()))
    }

    pub fn get_current_printer(&self) -> Result<Option<PrinterConfig>, String> {
        let config = self.printer_config.lock().map_err(|e| e.to_string())?;
        println!("🔍 [DEBUG] get_current_printer returning: IP={}, Port={}", config.ip, config.port);
        Ok(Some(config.clone()))
    }

    pub fn set_current_printer(&self, printer_id: &str) -> Result<(), String> {
        let config = self.printer_config.lock().map_err(|e| e.to_string())?;
        if config.id == printer_id {
            // Printer is already set as current
            Ok(())
        } else {
            Err(format!("Printer with ID '{}' not found. Only printer '{}' is available.", printer_id, config.id))
        }
    }

    pub fn update_printer_config(&self, printer_id: &str, new_config: PrinterConfig) -> Result<(), String> {
        let mut config = self.printer_config.lock().map_err(|e| e.to_string())?;
        if config.id == printer_id {
            *config = new_config;
            Ok(())
        } else {
            Err(format!("Printer with ID '{}' not found. Only printer '{}' is available.", printer_id, config.id))
        }
    }

    pub fn add_printer(&self, _printer: PrinterConfig) -> Result<(), String> {
        // Only one printer is supported with environment variables
        Err("Adding printers is not supported. Printer configuration is managed via environment variables.".to_string())
    }

    pub fn remove_printer(&self, _printer_id: &str) -> Result<(), String> {
        // Only one printer is supported with environment variables
        Err("Removing printers is not supported. Printer configuration is managed via environment variables.".to_string())
    }

    /// Test the printer connection and set as default if working
    pub async fn auto_set_default_printer(&self) -> Result<(), String> {
        // Clone the config to avoid holding the lock across await
        let config = {
            let config_guard = self.printer_config.lock().map_err(|e| e.to_string())?;
            config_guard.clone()
        };
        
        if !config.enabled {
            println!("⚠️ Printer is disabled, skipping auto-setup");
            return Ok(());
        }
        
        // Test the printer connection
        match self.test_printer_connection(&config.id).await {
                    Ok(status) => {
                        if status.connected {
                    println!("🎯 Printer connection test successful: {} ({})", config.name, config.ip);
                    Ok(())
                } else {
                    println!("⚠️ Printer connection test failed: {} ({})", config.name, config.ip);
                    Ok(())
                }
            }
            Err(e) => {
                println!("⚠️ Printer connection test error: {}", e);
                Ok(())
            }
        }
    }

    /// Fetch current staff information from the local node API
    pub async fn get_current_staff(&self) -> Result<Option<StaffInfo>, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        // Try to get staff from local node API
        // First, we need to get the current staff from the session
        // Since we can't access localStorage directly from Rust, we'll try to get it from the API
        let base_url = "http://192.168.192.100:3001"; // Default local node URL
        
        // Try to get current staff from the API
        let response = client
            .get(&format!("{}/api/staff/current", base_url))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch staff: {}", e))?;

        if response.status().is_success() {
            let staff: StaffInfo = response.json().await
                .map_err(|e| format!("Failed to parse staff response: {}", e))?;
            Ok(Some(staff))
        } else {
            // If API call fails, return None (staff info will be omitted from ticket)
            println!("⚠️ Could not fetch current staff: HTTP {}", response.status());
            Ok(None)
        }
    }

    pub async fn test_connection(&self) -> Result<PrinterStatus, String> {
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        
        // Test connection by trying to connect to the printer
        let test_result = self.execute_print_job_with_printer(&printer, PrintJob {
            content: "CONNECTION TEST".to_string(),
            align: Some("center".to_string()),
            bold: Some(true),
            underline: None,
            size: Some("normal".to_string()),
            cut: Some(false),
            open_cash_drawer: Some(false),
        }).await;

        match test_result {
            Ok(_) => Ok(PrinterStatus {
                connected: true,
                error: None,
            }),
            Err(e) => Ok(PrinterStatus {
                connected: false,
                error: Some(e),
            }),
        }
    }

    pub async fn test_printer_connection(&self, printer_id: &str) -> Result<PrinterStatus, String> {
        let printer = self.get_printer_by_id(printer_id)?;
        let printer = printer.ok_or(format!("Printer with ID '{}' not found", printer_id))?;
        
        // Test connection by trying to connect to the printer
        let test_result = self.execute_print_job_with_printer(&printer, PrintJob {
            content: "CONNECTION TEST".to_string(),
            align: Some("center".to_string()),
            bold: Some(true),
            underline: None,
            size: Some("normal".to_string()),
            cut: Some(false),
            open_cash_drawer: Some(false),
        }).await;

        match test_result {
            Ok(_) => Ok(PrinterStatus {
                connected: true,
                error: None,
            }),
            Err(e) => Ok(PrinterStatus {
                connected: false,
                error: Some(e),
            }),
        }
    }

    pub async fn test_connection_manual(&self, ip: &str, port: u16) -> Result<PrinterStatus, String> {
        // Create a temporary printer config for testing
        let test_printer = PrinterConfig {
            id: "test_printer".to_string(),
            name: "Test Printer".to_string(),
            ip: ip.to_string(),
            port,
            width: 48,
            timeout: 5000,
            model: "TM-T20X".to_string(),
            enabled: true,
            is_default: false,
        };
        
        // Build a small ESC/POS test and send via TCP
        let mut data: Vec<u8> = Vec::new();
        data.extend_from_slice(&[0x1B, 0x40]); // init
        data.extend_from_slice(&[0x1B, 0x61, 0x01]); // center
        data.extend_from_slice(&[0x1B, 0x45, 0x01]); // bold
        data.extend_from_slice(b"TEST IMPRIMANTE\n");
        data.extend_from_slice(&[0x1B, 0x45, 0x00]); // bold off
        data.extend_from_slice(&[0x1B, 0x61, 0x00]); // left
        data.extend_from_slice(format!("IP: {}\n", test_printer.ip).as_bytes());
        data.extend_from_slice(format!("Port: {}\nStatus: OK\n", test_printer.port).as_bytes());
        data.extend_from_slice(b"\n\n\n"); // Feed paper before cut
        data.extend_from_slice(&[0x1D, 0x56, 0x00]); // cut

        match self.send_tcp_bytes(&test_printer, &data).await {
            Ok(_) => Ok(PrinterStatus { connected: true, error: None }),
            Err(e) => Ok(PrinterStatus { connected: false, error: Some(e) }),
        }
    }

    pub fn update_config_manual(&self, ip: &str, port: u16, enabled: bool) -> Result<(), String> {
        println!("🔧 [CONFIG] update_config_manual called with: IP={}, Port={}, Enabled={}", ip, port, enabled);

        // Basic IPv4 validation
        let ip_trimmed = ip.trim();
        let octets: Vec<&str> = ip_trimmed.split('.').collect();
        if octets.len() != 4 {
            return Err("Invalid IP address format".to_string());
        }
        for part in octets {
            if part.is_empty() { return Err("Invalid IP address format".to_string()); }
            let parsed = part.parse::<u8>().map_err(|_| "Invalid IP address octet".to_string())?;
            // parsed used to ensure 0-255 range
            let _ = parsed;
        }

        // Port validation
        if port == 0 {
            return Err("Invalid port (must be between 1 and 65535)".to_string());
        }

        let mut config = self.printer_config.lock().map_err(|e| e.to_string())?;
        config.ip = ip_trimmed.to_string();
        config.port = port;
        config.enabled = enabled;

        println!("🔧 [CONFIG] Updated config in memory: IP={}, Port={}", config.ip, config.port);

        // Save the updated configuration to file
        drop(config); // Release the lock before calling save_config_to_file
        self.save_config_to_file()?;

        println!("✅ [CONFIG] Configuration updated and saved successfully");
        Ok(())
    }

    /// Update printer configuration with full config object
    pub fn update_printer_config_full(&self, new_config: PrinterConfig) -> Result<(), String> {
        let mut config = self.printer_config.lock().map_err(|e| e.to_string())?;
        *config = new_config;
        
        // Save the updated configuration to file
        drop(config); // Release the lock before calling save_config_to_file
        self.save_config_to_file()?;
        
        Ok(())
    }

    /// Save current configuration to file (public method)
    pub fn save_config(&self) -> Result<(), String> {
        self.save_config_to_file()
    }

    pub async fn execute_print_job(&self, job: PrintJob) -> Result<String, String> {
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        self.execute_print_job_with_printer(&printer, job).await
    }
        
    pub async fn execute_print_job_with_printer(&self, printer: &PrinterConfig, job: PrintJob) -> Result<String, String> {
        let bytes = Self::build_escpos_from_job(&job);
        self.send_tcp_bytes(printer, &bytes).await
    }

    // Build minimal ESC/POS bytes for a simple text job
    fn build_escpos_from_job(job: &PrintJob) -> Vec<u8> {
        let mut data: Vec<u8> = Vec::new();
        // Initialize
        data.extend_from_slice(&[0x1B, 0x40]); // ESC @

        // Alignment
        if let Some(align) = &job.align {
            let v = match align.as_str() {
                "center" => 1,
                "right" => 2,
                _ => 0,
            };
            data.extend_from_slice(&[0x1B, 0x61, v]); // ESC a n
        }

        // Bold
        if let Some(bold) = job.bold {
            data.extend_from_slice(&[0x1B, 0x45, if bold { 1 } else { 0 }]); // ESC E n
        }

        // Underline
        if let Some(underline) = job.underline {
            data.extend_from_slice(&[0x1B, 0x2D, if underline { 1 } else { 0 }]); // ESC - n
        }

        // Size
        if let Some(size) = &job.size {
            let n = match size.as_str() {
                "double_height" => 16, // GS ! n (bit 4)
                "double_width" => 32,  // GS ! n (bit 5)
                "quad" => 48,          // both bits
                _ => 0,
            };
            data.extend_from_slice(&[0x1D, 0x21, n]); // GS ! n
        }

        // Content
        data.extend_from_slice(job.content.as_bytes());
        data.extend_from_slice(b"\n");

        // Finalize
        if let Some(cut) = job.cut {
            if cut {
                // Feed and cut
                data.extend_from_slice(b"\n\n\n");
                data.extend_from_slice(&[0x1D, 0x56, 0x00]); // GS V 0 (full cut)
            }
        }

        if let Some(open) = job.open_cash_drawer {
            if open {
                // Kick cash drawer: ESC p m t1 t2
                data.extend_from_slice(&[0x1B, 0x70, 0x00, 0x50, 0x50]);
            }
        }

        data
    }

    /// Send raw ESC/POS bytes over TCP to the configured printer
    async fn send_tcp_bytes(&self, printer: &PrinterConfig, bytes: &[u8]) -> Result<String, String> {
        use tokio::net::TcpStream;
        use tokio::io::AsyncWriteExt;
        let addr = format!("{}:{}", printer.ip, printer.port);
        let mut stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Failed to connect to printer at {}: {}", addr, e))?;
        stream.write_all(bytes)
            .await
            .map_err(|e| format!("Failed to send print data: {}", e))?;
        Ok("Print job completed successfully".to_string())
    }

    // Removed JS command generators; printing uses raw ESC/POS bytes

    pub async fn print_ticket(&self, content: String) -> Result<String, String> {
        let job = PrintJob {
            content,
            align: Some("center".to_string()),
            bold: Some(false),
            underline: Some(false),
            size: Some("normal".to_string()),
            cut: Some(true),
            open_cash_drawer: Some(false),
        };

        self.execute_print_job(job).await
    }

    pub async fn print_receipt(&self, content: String) -> Result<String, String> {
        let job = PrintJob {
            content,
            align: Some("left".to_string()),
            bold: Some(false),
            underline: Some(false),
            size: Some("normal".to_string()),
            cut: Some(true),
            open_cash_drawer: Some(false),
        };

        self.execute_print_job(job).await
    }


    pub async fn print_qr_code(&self, data: String) -> Result<String, String> {
        // Text fallback for QR: print the data as text
        let content = format!("QR DATA:\n{}", data);
        let job = PrintJob {
            content,
            align: Some("center".to_string()),
            bold: Some(true),
            underline: Some(false),
            size: Some("normal".to_string()),
            cut: Some(true),
            open_cash_drawer: Some(false),
        };
        self.execute_print_job(job).await
    }

    pub async fn print_with_logo(&self, content: String, _logo_path: String) -> Result<String, String> {
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        let mut data: Vec<u8> = Vec::new();
        data.extend_from_slice(&[0x1B, 0x40]);
        data.extend_from_slice(&[0x1B, 0x61, 0x01]);
        data.extend_from_slice(&[0x1B, 0x45, 0x01]);
        data.extend_from_slice(b"STE Dhraiff Services Transport\n");
        data.extend_from_slice(&[0x1B, 0x45, 0x00]);
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x00]);
        data.extend_from_slice(content.as_bytes());
        data.extend_from_slice(b"\n");
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x01]);
        let date = chrono::Local::now().format("%d/%m/%Y %H:%M:%S");
        data.extend_from_slice(format!("Date: {}\n", date).as_bytes());
        data.extend_from_slice(b"\n\n\n"); // Feed paper before cut
        data.extend_from_slice(&[0x1D, 0x56, 0x00]);
        self.send_tcp_bytes(&printer, &data).await
    }

    pub async fn print_standard_ticket(&self, content: String) -> Result<String, String> {
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        let mut data: Vec<u8> = Vec::new();
        // Init
        data.extend_from_slice(&[0x1B, 0x40]);
        // Header
        data.extend_from_slice(&[0x1B, 0x61, 0x01]); // center
        data.extend_from_slice(&[0x1B, 0x45, 0x01]); // bold on
        data.extend_from_slice(b"STE Dhraiff Services Transport\n");
        data.extend_from_slice(&[0x1B, 0x45, 0x00]); // bold off
        data.extend_from_slice(b"================================\n");
        // Content
        data.extend_from_slice(&[0x1B, 0x61, 0x00]); // left
        data.extend_from_slice(content.as_bytes());
        data.extend_from_slice(b"\n");
        // Footer
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x01]); // center
        let date = chrono::Local::now().format("%d/%m/%Y %H:%M:%S");
        data.extend_from_slice(format!("Date: {}\nMerci de votre confiance!\n", date).as_bytes());
        data.extend_from_slice(b"\n\n\n"); // Feed paper before cut
        data.extend_from_slice(&[0x1D, 0x56, 0x00]); // cut
        self.send_tcp_bytes(&printer, &data).await
    }

    pub async fn print_booking_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        // cache latest
        if let Ok(mut cache) = self.last_booking_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        // Use provided staff name or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            "Émis par: Staff".to_string()
        };
        let mut data: Vec<u8> = Vec::new();
        // Init & header
        data.extend_from_slice(&[0x1B, 0x40]);
        data.extend_from_slice(&[0x1B, 0x61, 0x01]); // center
        data.extend_from_slice(&[0x1B, 0x45, 0x01]); // bold
        data.extend_from_slice(b"STE Dhraiff Services Transport\n");
        data.extend_from_slice(&[0x1B, 0x45, 0x00]);
        data.extend_from_slice(b"RESERVATION\n");
        data.extend_from_slice(b"================================\n");
        // Content
        data.extend_from_slice(&[0x1B, 0x61, 0x00]); // left
        data.extend_from_slice(ticket_data.as_bytes());
        data.extend_from_slice(b"\n");
        // Footer with staff and date
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x02]); // right
        data.extend_from_slice(format!("{}\n", staff_footer).as_bytes());
        data.extend_from_slice(&[0x1B, 0x61, 0x01]); // center
        let date = chrono::Local::now().format("%d/%m/%Y %H:%M:%S");
        data.extend_from_slice(format!("Date: {}\n", date).as_bytes());
        data.extend_from_slice(b"\n\n\n"); // Feed paper before cut
        data.extend_from_slice(&[0x1D, 0x56, 0x00]);
        self.send_tcp_bytes(&printer, &data).await
    }

    pub async fn print_talon(&self, talon_data: String, _staff_name: Option<String>) -> Result<String, String> {
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        let mut data: Vec<u8> = Vec::new();
        data.extend_from_slice(&[0x1B, 0x40]); // init
        data.extend_from_slice(&[0x1B, 0x61, 0x00]); // left
        data.extend_from_slice(talon_data.as_bytes());
        data.extend_from_slice(b"\n\n\n"); // Feed paper before cut
        data.extend_from_slice(&[0x1D, 0x56, 0x00]); // cut
        self.send_tcp_bytes(&printer, &data).await
    }

    pub async fn print_entry_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        // cache latest
        if let Ok(mut cache) = self.last_entry_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        // Use provided staff name or extract from ticket data or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            if let Ok(parsed_data) = serde_json::from_str::<serde_json::Value>(&ticket_data) {
                if let Some(staff_name_from_data) = parsed_data.get("staffName").and_then(|v| v.as_str()) {
                    format!("Émis par: {}", staff_name_from_data)
                } else { "Émis par: Staff".to_string() }
            } else { "Émis par: Staff".to_string() }
        };
        // Parse json
        let v: serde_json::Value = serde_json::from_str(&ticket_data).unwrap_or(serde_json::json!({}));
        let license_plate = v.get("licensePlate").and_then(|x| x.as_str()).unwrap_or("-");
        let queue_position = v.get("queuePosition").and_then(|x| x.as_i64()).unwrap_or(0);
        let destination_name = v.get("destinationName").and_then(|x| x.as_str()).unwrap_or("-");
        let entry_time = v.get("entryTime").and_then(|x| x.as_str()).unwrap_or("-");
        let day_pass_status = v.get("dayPassStatus").and_then(|x| x.as_str()).unwrap_or("NONE");
        let day_pass_purchase = v.get("dayPassPurchaseDate").and_then(|x| x.as_str()).unwrap_or("-");
        let ticket_number = v.get("ticketNumber").and_then(|x| x.as_str()).unwrap_or("");

        let mut data: Vec<u8> = Vec::new();
        data.extend_from_slice(&[0x1B, 0x40]);
        data.extend_from_slice(&[0x1B, 0x61, 0x01]); // center
        data.extend_from_slice(&[0x1B, 0x45, 0x01]);
        data.extend_from_slice(b"STE Dhraiff Services Transport\n");
        data.extend_from_slice(&[0x1B, 0x45, 0x00]);
        data.extend_from_slice(b"TICKET D'ENTREE\n");
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x00]); // left
        data.extend_from_slice(b"VEHICULE:\n");
        data.extend_from_slice(format!("Plaque: {}\n", license_plate).as_bytes());
        data.extend_from_slice(format!("Position: {}\n\n", queue_position).as_bytes());
        data.extend_from_slice(b"DESTINATION:\n");
        data.extend_from_slice(format!("Station: {}\n\n", destination_name).as_bytes());
        data.extend_from_slice(b"HEURE D'ENTREE:\n");
        data.extend_from_slice(format!("{}\n\n", entry_time).as_bytes());
        data.extend_from_slice(b"TARIFICATION:\n");
        match day_pass_status {
            "VALID" => {
                data.extend_from_slice(b"Pass journalier: VALIDE\n");
                data.extend_from_slice(format!("Achat le: {}\nMONTANT: 0.00 TND\n\n", day_pass_purchase).as_bytes());
            }
            "PURCHASED" => {
                data.extend_from_slice(b"Pass journalier: ACHETE\n");
                data.extend_from_slice(format!("Achat le: {}\nMONTANT: 2.00 TND\n\n", day_pass_purchase).as_bytes());
            }
            _ => {
                data.extend_from_slice(b"Pass journalier: NON VALIDE\nMONTANT: 2.00 TND\n\n");
            }
        }
        if !ticket_number.is_empty() {
            data.extend_from_slice(format!("N° Ticket: {}\n", ticket_number).as_bytes());
        }
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x02]); // right
        data.extend_from_slice(format!("{}\n", staff_footer).as_bytes());
        data.extend_from_slice(b"\n\n\n"); // Feed paper before cut
        data.extend_from_slice(&[0x1D, 0x56, 0x00]); // cut
        self.send_tcp_bytes(&printer, &data).await
    }

    pub async fn print_exit_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        // cache latest
        if let Ok(mut cache) = self.last_exit_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        // Use provided staff name or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            "Émis par: Staff".to_string()
        };
        let mut data: Vec<u8> = Vec::new();
        data.extend_from_slice(&[0x1B, 0x40]);
        data.extend_from_slice(&[0x1B, 0x61, 0x01]);
        data.extend_from_slice(&[0x1B, 0x45, 0x01]);
        data.extend_from_slice(b"STE Dhraiff Services Transport\n");
        data.extend_from_slice(&[0x1B, 0x45, 0x00]);
        data.extend_from_slice(b"TICKET DE SORTIE\n");
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x00]);
        data.extend_from_slice(ticket_data.as_bytes());
        data.extend_from_slice(b"\n");
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x01]);
        let date = chrono::Local::now().format("%d/%m/%Y %H:%M:%S");
        data.extend_from_slice(format!("Date: {}\nMerci!\n", date).as_bytes());
        data.extend_from_slice(&[0x1B, 0x61, 0x02]);
        data.extend_from_slice(format!("{}\n", staff_footer).as_bytes());
        data.extend_from_slice(b"\n\n\n"); // Feed paper before cut
        data.extend_from_slice(&[0x1D, 0x56, 0x00]);
        self.send_tcp_bytes(&printer, &data).await
    }

    // Reprint functions using cached payloads
    pub async fn reprint_booking_ticket(&self) -> Result<String, String> {
        let payload_opt = self
            .last_booking_payload
            .lock()
            .map_err(|e| e.to_string())?
            .clone();
        match payload_opt {
            Some(payload) => self.print_booking_ticket(payload, None).await,
            None => Err("No previous booking ticket to reprint".to_string()),
        }
    }

    pub async fn reprint_entry_ticket(&self) -> Result<String, String> {
        let payload_opt = self
            .last_entry_payload
            .lock()
            .map_err(|e| e.to_string())?
            .clone();
        match payload_opt {
            Some(payload) => self.print_entry_ticket(payload, None).await,
            None => Err("No previous entry ticket to reprint".to_string()),
        }
    }

    pub async fn reprint_exit_ticket(&self) -> Result<String, String> {
        let payload_opt = self
            .last_exit_payload
            .lock()
            .map_err(|e| e.to_string())?
            .clone();
        match payload_opt {
            Some(payload) => self.print_exit_ticket(payload, None).await,
            None => Err("No previous exit ticket to reprint".to_string()),
        }
    }

    pub async fn print_day_pass_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        // cache latest
        if let Ok(mut cache) = self.last_day_pass_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        // Use provided staff name or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            "Émis par: Staff".to_string()
        };
        // parse
        let v: serde_json::Value = serde_json::from_str(&ticket_data).unwrap_or(serde_json::json!({}));
        let license_plate = v.get("licensePlate").and_then(|x| x.as_str()).unwrap_or("-");
        let amount = v.get("amount").and_then(|x| x.as_f64()).unwrap_or(0.0);
        let purchase_date = v.get("purchaseDate").and_then(|x| x.as_str()).unwrap_or("-");
        let valid_for = v.get("validFor").and_then(|x| x.as_str()).unwrap_or("-");
        let destination = v.get("destinationName").and_then(|x| x.as_str()).unwrap_or("-");
        let mut data: Vec<u8> = Vec::new();
        data.extend_from_slice(&[0x1B, 0x40]);
        data.extend_from_slice(&[0x1B, 0x61, 0x01]);
        data.extend_from_slice(&[0x1B, 0x45, 0x01]);
        data.extend_from_slice(b"STE Dhraiff Services Transport\n");
        data.extend_from_slice(&[0x1B, 0x45, 0x00]);
        data.extend_from_slice(b"PASS JOURNALIER\n");
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x00]);
        data.extend_from_slice(format!("Plaque: {}\n", license_plate).as_bytes());
        data.extend_from_slice(b"Pass journalier: ACHETE\n");
        data.extend_from_slice(format!("Montant: 2.00 TND\nDate d'achat: {}\n", purchase_date).as_bytes());
        data.extend_from_slice(format!("Valide pour: {}\nDestination: {}\n", valid_for, destination).as_bytes());
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x02]);
        data.extend_from_slice(format!("{}\n", staff_footer).as_bytes());
        data.extend_from_slice(b"\n\n\n"); // Feed paper before cut
        data.extend_from_slice(&[0x1D, 0x56, 0x00]);
        self.send_tcp_bytes(&printer, &data).await
    }

    pub async fn print_exit_pass_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        // Use provided staff name or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            "Émis par: Staff".to_string()
        };
        // parse
        let v: serde_json::Value = serde_json::from_str(&ticket_data).unwrap_or(serde_json::json!({}));
        let license_plate = v.get("licensePlate").and_then(|x| x.as_str()).unwrap_or("N/A");
        let vehicle_capacity = v.get("vehicleCapacity").and_then(|x| x.as_i64()).unwrap_or(8);
        let exit_time = v.get("exitTime").and_then(|x| x.as_str()).unwrap_or("");
        let station_name = v.get("stationName").and_then(|x| x.as_str()).unwrap_or("N/A");
        let base_price = v.get("basePrice").and_then(|x| x.as_f64()).unwrap_or(0.0);
        let total_price = v.get("totalPrice").and_then(|x| x.as_f64()).unwrap_or(0.0);
        let prev_plate = v.get("previousVehicle").and_then(|pv| pv.get("licensePlate")).and_then(|x| x.as_str());
        let prev_exit = v.get("previousVehicle").and_then(|pv| pv.get("exitTime")).and_then(|x| x.as_str());

        let mut data: Vec<u8> = Vec::new();
        data.extend_from_slice(&[0x1B, 0x40]);
        data.extend_from_slice(&[0x1B, 0x61, 0x01]);
        data.extend_from_slice(&[0x1B, 0x45, 0x01]);
        data.extend_from_slice(b"STE Dhraiff Services Transport\n");
        data.extend_from_slice(&[0x1B, 0x45, 0x00]);
        data.extend_from_slice(b"PASS DE SORTIE\n");
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x00]);
        data.extend_from_slice(b"VEHICULE ACTUEL:\n");
        data.extend_from_slice(format!("Plaque: {}\n", license_plate).as_bytes());
        data.extend_from_slice(format!("Capacite: {} places\n", vehicle_capacity).as_bytes());
        if !exit_time.is_empty() { data.extend_from_slice(format!("Heure de sortie: {}\n", exit_time).as_bytes()); }
        data.extend_from_slice(b"\n");
        data.extend_from_slice(b"VEHICULE PRECEDENT:\n");
        if let (Some(pp), Some(pe)) = (prev_plate, prev_exit) {
            data.extend_from_slice(format!("Plaque: {}\nHeure de sortie: {}\n", pp, pe).as_bytes());
        } else {
            data.extend_from_slice(b"Aucun vehicule precedent aujourd'hui\n");
        }
        data.extend_from_slice(b"\nDESTINATION:\n");
        data.extend_from_slice(format!("Station: {}\n\n", station_name).as_bytes());
        data.extend_from_slice(b"TARIFICATION:\n");
        data.extend_from_slice(format!("Prix par place: {:.2} TND\n", base_price).as_bytes());
        data.extend_from_slice(format!("Capacite vehicule: {} places\n", vehicle_capacity).as_bytes());
        data.extend_from_slice(format!("TOTAL A RECEVOIR: {:.2} TND\n", total_price).as_bytes());
        data.extend_from_slice(b"================================\n");
        data.extend_from_slice(&[0x1B, 0x61, 0x01]);
        let date = chrono::Local::now().format("%d/%m/%Y %H:%M:%S");
        data.extend_from_slice(format!("Date: {}\n", date).as_bytes());
        data.extend_from_slice(&[0x1B, 0x61, 0x02]);
        data.extend_from_slice(format!("{}\n", staff_footer).as_bytes());
        data.extend_from_slice(b"\n\n\n"); // Feed paper before cut
        data.extend_from_slice(&[0x1D, 0x56, 0x00]);
        self.send_tcp_bytes(&printer, &data).await
    }

    pub async fn reprint_day_pass_ticket(&self) -> Result<String, String> {
        let payload_opt = self
            .last_day_pass_payload
            .lock()
            .map_err(|e| e.to_string())?
            .clone();
        match payload_opt {
            Some(payload) => self.print_day_pass_ticket(payload, None).await,
            None => Err("No previous day pass ticket to reprint".to_string()),
        }
    }

    // Direct TCP printing method for Windows (using PowerShell script)
    pub async fn print_direct_tcp(&self, printer_id: &str, content: &str) -> Result<String, String> {
        let config = self.get_printer_by_id(printer_id)?
            .ok_or_else(|| format!("Printer with ID {} not found", printer_id))?;

        println!("🖨️ [DIRECT TCP] Printing to {} ({}:{})", config.name, config.ip, config.port);
        println!("🖨️ [DIRECT TCP] Content: {}", content);

        // Use PowerShell script for reliable printing
        let script_path = "scripts/simple-print.ps1";
        let output = Command::new("powershell")
            .args(&[
                "-ExecutionPolicy", "Bypass",
                "-File", script_path,
                "-PrinterIP", &config.ip,
                "-PrinterPort", &config.port.to_string(),
                "-Content", content
            ])
            .output()
            .map_err(|e| format!("Failed to execute PowerShell script: {}", e))?;

        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout);
            println!("🖨️ [DIRECT TCP] Print successful: {}", result);
            Ok(result.to_string())
        } else {
            let error = String::from_utf8_lossy(&output.stderr);
            println!("🖨️ [DIRECT TCP] Print failed: {}", error);
            Err(format!("PowerShell print failed: {}", error))
        }
    }

    async fn send_tcp_print(&self, printer: &PrinterConfig, content: &str) -> Result<String, String> {
        use tokio::net::TcpStream;
        use tokio::io::AsyncWriteExt;

        // Connect to printer
        let addr = format!("{}:{}", printer.ip, printer.port);
        let mut stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Failed to connect to printer: {}", e))?;

        println!("🖨️ [DIRECT TCP] Connected to printer at {}", addr);

        // Prepare content with ESC/POS commands
        let mut print_data = Vec::new();
        
        // ESC/POS initialization
        print_data.extend_from_slice(&[0x1B, 0x40]); // ESC @ - Initialize printer
        
        // Add content
        print_data.extend_from_slice(content.as_bytes());
        
        // Add line feeds and cut
        print_data.extend_from_slice(b"\n\n\n\n\n"); // Feed paper
        print_data.extend_from_slice(&[0x1D, 0x56, 0x00]); // Cut paper

        // Send data
        stream.write_all(&print_data)
            .await
            .map_err(|e| format!("Failed to send print data: {}", e))?;

        println!("🖨️ [DIRECT TCP] Data sent successfully");
        Ok("Print job completed successfully".to_string())
    }

    // Test direct TCP connection using PowerShell
    pub async fn test_direct_tcp_connection(&self, printer_id: &str) -> Result<String, String> {
        let config = self.get_printer_by_id(printer_id)?
            .ok_or_else(|| format!("Printer with ID {} not found", printer_id))?;

        println!("🔍 [DIRECT TCP] Testing connection to {} ({}:{})", config.name, config.ip, config.port);

        // Use PowerShell to test connection
        let test_script = format!(
            r#"
try {{
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect('{}', {})
    if ($tcp.Connected) {{
        Write-Host "✅ Connection successful to {}:{}" -ForegroundColor Green
        $tcp.Close()
        exit 0
    }} else {{
        Write-Host "❌ Connection failed to {}:{}" -ForegroundColor Red
        exit 1
    }}
}} catch {{
    Write-Host "❌ Connection error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}}
"#,
            config.ip, config.port, config.ip, config.port, config.ip, config.port
        );

        let output = Command::new("powershell")
            .args(&["-ExecutionPolicy", "Bypass", "-Command", &test_script])
            .output()
            .map_err(|e| format!("Failed to execute PowerShell test: {}", e))?;

        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout);
            println!("🔍 [DIRECT TCP] Test successful: {}", result);
            Ok(format!("Connection successful to {}:{}", config.ip, config.port))
        } else {
            let error = String::from_utf8_lossy(&output.stderr);
            println!("🔍 [DIRECT TCP] Test failed: {}", error);
            Err(format!("Connection test failed: {}", error))
        }
    }
}

// Clone implementation is now derived automatically
// Clone implementation is now derived automatically