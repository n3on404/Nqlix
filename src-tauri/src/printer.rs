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

    /// Helper function to create temporary script files in the proper temp directory
    fn create_temp_script_path(&self, prefix: &str) -> std::path::PathBuf {
        let temp_dir = std::env::temp_dir();
        temp_dir.join(format!("{}_{}.cjs", prefix, uuid::Uuid::new_v4()))
    }

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

    /// Helper function to get the require statement for node-thermal-printer
    fn get_thermal_printer_require(&self) -> Result<String, String> {
        // First try to find the module using our path resolution
        match self.get_node_modules_path() {
            Ok(node_modules_path) => {
                let module_path = node_modules_path.join("node-thermal-printer");
                println!("🔍 [DEBUG] Using module path: {:?}", module_path);
                Ok(format!("const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('{}');", module_path.to_string_lossy()))
            }
            Err(e) => {
                println!("⚠️ [DEBUG] Path resolution failed: {}", e);
                // Stronger fallback: try relative require from project root
                if let Ok(cwd) = std::env::current_dir() {
                    let rel_module = cwd.join("node_modules").join("node-thermal-printer");
                    println!("🔄 [DEBUG] Trying relative module at: {:?}", rel_module);
                    Ok(format!(
                        "const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('{}');",
                        rel_module.to_string_lossy()
                    ))
                } else {
                    println!("🔄 [DEBUG] Falling back to Node.js module resolution");
                    Ok("const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');".to_string())
                }
            }
        }
    }

    /// Helper function to execute Node.js scripts with proper environment setup
    fn execute_node_script(&self, script_path: &std::path::Path) -> Result<std::process::Output, String> {
        let mut cmd = Command::new("node");

        // Resolve node_modules and prefer running Node with CWD set to its parent (project root)
        if let Ok(node_modules_path) = self.get_node_modules_path() {
            println!("🔍 [DEBUG] Setting NODE_PATH to: {:?}", node_modules_path);
            cmd.env("NODE_PATH", &node_modules_path);

            if let Some(project_root) = node_modules_path.parent() {
                println!("🔍 [DEBUG] Setting working directory to project root: {:?}", project_root);
                cmd.current_dir(project_root);
            }
        } else if let Ok(cwd) = std::env::current_dir() {
            // Fallback: ensure current_dir has a node_modules sibling
            let cwd_node_modules = cwd.join("node_modules");
            if cwd_node_modules.exists() {
                println!("🔍 [DEBUG] Using CWD node_modules at: {:?}", cwd_node_modules);
                cmd.env("NODE_PATH", &cwd_node_modules);
                if let Some(project_root) = cwd_node_modules.parent() {
                    cmd.current_dir(project_root);
                }
            }
        }

        // Execute the script
        cmd.arg(script_path)
            .output()
            .map_err(|e| format!("Failed to execute script {:?}: {}", script_path, e))
    }

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
        
        // Get the node_modules path
        let require_statement = self.get_thermal_printer_require()?;
        
        // Create a compact test ticket script
        let script_content = format!(
            r#"
{}

async function printTestTicket() {{
    try {{
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {},
                connectionTimeout: 10000
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Testing printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            console.error('🖨️ [NODE DEBUG] Printer connection failed');
            throw new Error('Printer not connected');
        }}
        console.log('🖨️ [NODE DEBUG] Printer connection successful');

        // Simple test ticket
        printer.alignCenter();
        printer.bold(true);
        printer.println("TEST IMPRIMANTE");
        printer.bold(false);
        printer.drawLine();
        
        printer.alignLeft();
        printer.println("IP: {}");
        printer.println("Port: {}");
        printer.println("Status: OK");
        
        printer.cut();
        await printer.execute();
        
    }} catch (error) {{
        console.error('Test failed:', error.message);
        process.exit(1);
    }}
}}

printTestTicket();
"#,
            require_statement,
            test_printer.width,
            test_printer.ip,
            test_printer.port,
            test_printer.timeout,
            test_printer.ip,
            test_printer.port
        );

        // Write script to temporary file in proper temp directory
        let script_path = self.create_temp_script_path("temp_test");
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write test script to {:?}: {}", script_path, e))?;

        // Execute the script
        let output = self.execute_node_script(&script_path)?;

        // Clean up temporary file
        let _ = std::fs::remove_file(&script_path);

        match output.status.success() {
            true => Ok(PrinterStatus {
                connected: true,
                error: None,
            }),
            false => Ok(PrinterStatus {
                connected: false,
                error: Some(format!(
                    "Test failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                )),
            }),
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
        // Create the Node.js script content
        let script_content = self.create_print_script(printer, &job)?;
        
        // Write script to temporary file in proper temp directory
        let script_path = self.create_temp_script_path("temp_print");
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write script to {:?}: {}", script_path, e))?;

        // Execute the script
        let output = self.execute_node_script(&script_path)?;

        // Clean up temporary file
        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "Print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    fn create_print_script(&self, printer: &PrinterConfig, job: &PrintJob) -> Result<String, String> {
        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;
        
        let script = format!(
            r#"
{}

async function printTicket() {{
    try {{
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {}
            }}
        }});

        // Test connection
        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

        // Configure printer based on job settings
        {}
        
        // Print content
        printer.println("{}");
        
        {}
        
        // Execute print job
        await printer.execute();
        console.log('Print job completed successfully');
        
    }} catch (error) {{
        console.error('Print error:', error.message);
        process.exit(1);
    }}
}}

printTicket();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            self.generate_printer_commands(job),
            job.content.replace('"', r#"\""#),
            self.generate_final_commands(job)
        );

        Ok(script)
    }

    fn generate_printer_commands(&self, job: &PrintJob) -> String {
        let mut commands = String::new();

        // Alignment
        if let Some(align) = &job.align {
            match align.as_str() {
                "center" => commands.push_str("printer.alignCenter();\n        "),
                "right" => commands.push_str("printer.alignRight();\n        "),
                "left" | _ => commands.push_str("printer.alignLeft();\n        "),
            }
        }

        // Bold
        if let Some(bold) = job.bold {
            if bold {
                commands.push_str("printer.bold(true);\n        ");
            }
        }

        // Underline
        if let Some(underline) = job.underline {
            if underline {
                commands.push_str("printer.underline(true);\n        ");
            }
        }

        // Size
        if let Some(size) = &job.size {
            match size.as_str() {
                "double_height" => commands.push_str("printer.setTextDoubleHeight();\n        "),
                "double_width" => commands.push_str("printer.setTextDoubleWidth();\n        "),
                "quad" => commands.push_str("printer.setTextQuadArea();\n        "),
                "normal" | _ => commands.push_str("printer.setTextNormal();\n        "),
            }
        }

        commands
    }

    fn generate_final_commands(&self, job: &PrintJob) -> String {
        let mut commands = String::new();

        // Cut paper
        if let Some(cut) = job.cut {
            if cut {
                commands.push_str("printer.cut();\n        ");
            }
        }

        // Open cash drawer
        if let Some(open_drawer) = job.open_cash_drawer {
            if open_drawer {
                commands.push_str("printer.openCashDrawer();\n        ");
            }
        }

        commands
    }

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
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        
        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;
        
        let script_content = format!(
            r#"
{}

async function printQR() {{
    try {{
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {},
                connectionTimeout: 10000
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Testing printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            console.error('🖨️ [NODE DEBUG] Printer connection failed');
            throw new Error('Printer not connected');
        }}
        console.log('🖨️ [NODE DEBUG] Printer connection successful');

        printer.alignCenter();
        printer.printQR("{}", {{
            cellSize: 3,
            correction: 'M',
            model: 2
        }});
        printer.cut();
        
        await printer.execute();
        console.log('QR code printed successfully');
        
    }} catch (error) {{
        console.error('QR print error:', error.message);
        process.exit(1);
    }}
}}

printQR();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            data.replace('"', r#"\""#)
        );

        let script_path = self.create_temp_script_path("temp_qr");
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write QR script to {:?}: {}", script_path, e))?;

        let output = self.execute_node_script(&script_path)?;

        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "QR print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_with_logo(&self, content: String, logo_path: String) -> Result<String, String> {
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        
        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;
        
        let script_content = format!(
            r#"
{}

async function printWithLogo() {{
    try {{
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {},
                connectionTimeout: 10000
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Testing printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            console.error('🖨️ [NODE DEBUG] Printer connection failed');
            throw new Error('Printer not connected');
        }}
        console.log('🖨️ [NODE DEBUG] Printer connection successful');

        // Print logo centered at the top if path is provided
        if ("{}") {{
            printer.alignCenter();
            try {{
                await printer.printImage("{}");
            }} catch (logoError) {{
                console.log('Logo not found, continuing without logo');
            }}
        }}

        // Print content
        printer.alignCenter();
        printer.bold(true);
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        printer.drawLine();
        printer.alignLeft();
        printer.println("{}");
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.cut();
        
        await printer.execute();
        console.log('Print with logo completed successfully');
        
    }} catch (error) {{
        console.error('Print with logo error:', error.message);
        process.exit(1);
    }}
}}

printWithLogo();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            logo_path,
            logo_path,
            content.replace('"', r#"\""#)
        );

        let script_path = self.create_temp_script_path("temp_logo");
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write logo script: {}", e))?;

        let output = self.execute_node_script(&script_path)?;

        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "Print with logo failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_standard_ticket(&self, content: String) -> Result<String, String> {
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        
        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;
        
        let script_content = format!(
            r#"
{}

async function printStandardTicket() {{
    try {{
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {},
                connectionTimeout: 10000
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Testing printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            console.error('🖨️ [NODE DEBUG] Printer connection failed');
            throw new Error('Printer not connected');
        }}
        console.log('🖨️ [NODE DEBUG] Printer connection successful');

        // Print logo centered at the top
        printer.alignCenter();
        try {{
            await printer.printImage("./icons/ste_260.png");
        }} catch (logoError) {{
            console.log('Logo not found, continuing without logo');
        }}

        // Company header
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        printer.alignLeft();
        printer.println("{}");
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Merci de votre confiance!");
        printer.cut();
        
        await printer.execute();
        console.log('Standard ticket printed successfully');
        
    }} catch (error) {{
        console.error('Standard ticket print error:', error.message);
        process.exit(1);
    }}
}}

printStandardTicket();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            content.replace('"', r#"\""#)
        );

        let script_path = self.create_temp_script_path("temp_standard");
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write standard ticket script: {}", e))?;

        let output = self.execute_node_script(&script_path)?;

        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "Standard ticket print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_booking_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        // Debug: Print ticket data to console
        println!("🎫 DEBUG: Booking ticket data received:");
        println!("{}", "=".repeat(80));
        println!("{}", ticket_data);
        println!("{}", "=".repeat(80));
        
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
        
        println!("👤 DEBUG: Staff information: {}", staff_footer);
        
        // Debug: Print printer configuration
        println!("🖨️ DEBUG: Printer configuration:");
        println!("  - Name: {}", printer.name);
        println!("  - IP: {}", printer.ip);
        println!("  - Port: {}", printer.port);
        println!("  - Width: {}", printer.width);
        println!("  - Timeout: {}ms", printer.timeout);
        
        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;
        
        let script_content = format!(
            r#"
{}

async function printBookingTicket() {{
    try {{
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {},
                connectionTimeout: 10000
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Testing printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            console.error('🖨️ [NODE DEBUG] Printer connection failed');
            throw new Error('Printer not connected');
        }}
        console.log('🖨️ [NODE DEBUG] Printer connection successful');

        // Compact header: Logo centered above company name
        console.log('🖨️ [NODE DEBUG] Printing compact header...');
        printer.alignCenter();
        try {{
            await printer.printImage("./icons/ste_260.png");
        }} catch (logoError) {{
            console.log('Logo not found, continuing without logo');
        }}
        
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        
        // Compact ticket type
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        printer.println("RÉSERVATION");
        printer.bold(false);
        
        // Content
        const bookingContent = `{}`;
        
        // Debug: Log what will be printed
        console.log('🎫 DEBUG: Ticket content that will be printed:');
        console.log('='.repeat(80));
        console.log(bookingContent);
        console.log('='.repeat(80));
        
        printer.alignLeft();
        printer.println(bookingContent);
        
        // Minimal footer
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        
        // Staff information in bottom right corner
        printer.alignRight();
        printer.println("{}");

        printer.cut();
        
        // Debug: Show complete ticket structure
        console.log('🎫 DEBUG: Complete ticket structure:');
        console.log('='.repeat(80));
        console.log('HEADER:');
        console.log('- Logo: STE 260 image');
        console.log('- Company: STE Dhraiff Services Transport');
        console.log('- Title: TICKET DE RÉSERVATION');
        console.log('- Separator line');
        console.log('');
        console.log('CONTENT:');
        console.log(bookingContent);
        console.log('');
        console.log('PRICE BREAKDOWN:');
        console.log('- Base Price: [Shown in ticket content]');
        console.log('- Service Fee: [Shown in ticket content]');
        console.log('- Total: [Shown in ticket content]');
        console.log('');
        console.log('FOOTER:');
        console.log('- Separator line');
        console.log('- Date: ' + new Date().toLocaleString('fr-FR'));
        console.log('- Message: Merci de votre confiance!');
        console.log('- Staff: {}');
        console.log('- Paper cut');
        console.log('='.repeat(80));
        
        await printer.execute();
        console.log('✅ Booking ticket printed successfully');
        
    }} catch (error) {{
        console.error('Booking ticket print error:', error.message);
        process.exit(1);
    }}
}}

printBookingTicket();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer,
            staff_footer
        );

        let script_path = self.create_temp_script_path("temp_booking");
        
        // Debug: Show the script that will be executed
        println!("📜 DEBUG: Node.js script that will be executed:");
        println!("{}", "=".repeat(80));
        println!("{}", script_content);
        println!("{}", "=".repeat(80));
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write booking ticket script: {}", e))?;

        println!("🚀 DEBUG: Executing Node.js script: {:?}", script_path);
        let output = self.execute_node_script(&script_path)?;

        let _ = std::fs::remove_file(&script_path);

        // Debug: Show script output
        println!("📤 DEBUG: Node.js script output:");
        println!("  - Status: {}", if output.status.success() { "SUCCESS" } else { "FAILED" });
        println!("  - Exit code: {:?}", output.status.code());
        println!("  - Stdout: {}", String::from_utf8_lossy(&output.stdout));
        if !output.stderr.is_empty() {
            println!("  - Stderr: {}", String::from_utf8_lossy(&output.stderr));
        }

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "Booking ticket print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_talon(&self, talon_data: String, _staff_name: Option<String>) -> Result<String, String> {
        println!("🖨️ [RUST DEBUG] Starting talon print...");
        println!("🖨️ [RUST DEBUG] Talon data received: {}", talon_data);
        println!("🖨️ [RUST DEBUG] Staff name: {:?}", _staff_name);
        
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        println!("🖨️ [RUST DEBUG] Printer config: IP={}, Port={}, Width={}, Timeout={}", 
                 printer.ip, printer.port, printer.width, printer.timeout);
        
        // Properly escape the talon data for JavaScript
        let escaped_talon_data = talon_data
            .replace('\\', r"\\")
            .replace('"', r#"\""#)
            .replace('\n', r"\n")
            .replace('\r', r"\r")
            .replace('\t', r"\t");

        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;

        let script_content = format!(
            r#"
{}

async function printTalon() {{
    try {{
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {},
                connectionTimeout: 10000
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Testing printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            console.error('🖨️ [NODE DEBUG] Printer connection failed');
            throw new Error('Printer not connected');
        }}
        console.log('🖨️ [NODE DEBUG] Printer connection successful');

        // Talon content
        printer.alignLeft();
        printer.println(`{}`);

        // Cut the paper to separate the talon
        printer.cut();
        
        await printer.execute();
        console.log('✅ Talon printed successfully');
        
    }} catch (error) {{
        console.error('Talon print error:', error.message);
        process.exit(1);
    }}
}}

printTalon();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            escaped_talon_data
        );

        let script_path = self.create_temp_script_path("temp_talon");
        println!("🖨️ [RUST DEBUG] Writing talon script to: {:?}", script_path);
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write talon script: {}", e))?;

        println!("🖨️ [RUST DEBUG] Executing Node.js talon script...");
        let output = self.execute_node_script(&script_path)?;

        let _ = std::fs::remove_file(&script_path);

        println!("🖨️ [RUST DEBUG] Talon script execution completed");
        println!("🖨️ [RUST DEBUG] Exit status: {:?}", output.status);
        println!("🖨️ [RUST DEBUG] Stdout: {}", String::from_utf8_lossy(&output.stdout));
        println!("🖨️ [RUST DEBUG] Stderr: {}", String::from_utf8_lossy(&output.stderr));

        if output.status.success() {
            println!("✅ Talon printed successfully");
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            println!("❌ Talon print failed!");
            Err(format!(
                "Talon print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_entry_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        println!("🖨️ [RUST DEBUG] Starting entry ticket print...");
        println!("🖨️ [RUST DEBUG] Ticket data received: {}", ticket_data);
        println!("🖨️ [RUST DEBUG] Staff name: {:?}", staff_name);
        
        // cache latest
        if let Ok(mut cache) = self.last_entry_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        println!("🖨️ [RUST DEBUG] Printer config: IP={}, Port={}, Width={}, Timeout={}", 
                 printer.ip, printer.port, printer.width, printer.timeout);
        
        // Use provided staff name or extract from ticket data or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            // Try to extract staff name from ticket data
            if let Ok(parsed_data) = serde_json::from_str::<serde_json::Value>(&ticket_data) {
                if let Some(staff_name_from_data) = parsed_data.get("staffName").and_then(|v| v.as_str()) {
                    format!("Émis par: {}", staff_name_from_data)
                } else {
                    "Émis par: Staff".to_string()
                }
            } else {
                "Émis par: Staff".to_string()
            }
        };
        println!("🖨️ [RUST DEBUG] Staff footer: {}", staff_footer);
        
        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;

        let script_content = format!(
            r#"
{}

async function printEntryTicket() {{
    try {{
        console.log('🖨️ [NODE DEBUG] Starting entry ticket print...');
        
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {}
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Checking printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

        // Print logo centered at the top
        console.log('🖨️ [NODE DEBUG] Printing logo...');
        printer.alignCenter();
        try {{
            await printer.printImage("./icons/ste_260.png");
            console.log('🖨️ [NODE DEBUG] Logo printed successfully');
        }} catch (logoError) {{
            console.log('🖨️ [NODE DEBUG] Logo not found, continuing without logo:', logoError.message);
        }}

        // Company header
        console.log('🖨️ [NODE DEBUG] Printing company header...');
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        printer.drawLine();
        
        // Ticket type header
        console.log('🖨️ [NODE DEBUG] Printing ticket type header...');
        printer.alignCenter();
        printer.bold(true);
        printer.println("TICKET D'ENTRÉE");
        printer.bold(false);
        printer.drawLine();
        
        // Content - Parse JSON and format properly
        console.log('🖨️ [NODE DEBUG] Printing entry ticket content...');
        const entryData = JSON.parse(`{}`);
        console.log('🖨️ [NODE DEBUG] Entry ticket data:', entryData);
        
        printer.alignLeft();
        
        // Vehicle information
        printer.println("VÉHICULE:");
        printer.println("Plaque: " + entryData.licensePlate);
        printer.println("Position: " + entryData.queuePosition);
        printer.println("");
        
        // Destination
        printer.println("DESTINATION:");
        printer.println("Station: " + entryData.destinationName);
        printer.println("");
        
        // Entry time
        printer.println("HEURE D'ENTRÉE:");
        printer.println(entryData.entryTime);
        printer.println("");
        
        // Day pass status and pricing
        printer.println("TARIFICATION:");
        if (entryData.dayPassStatus === "VALID") {{
            printer.println("Pass journalier: VALIDE");
            printer.println("Achat le: " + entryData.dayPassPurchaseDate);
            printer.println("MONTANT: 0.00 TND");
        }} else if (entryData.dayPassStatus === "PURCHASED") {{
            printer.println("Pass journalier: ACHETÉ");
            printer.println("Achat le: " + entryData.dayPassPurchaseDate);
            printer.println("MONTANT: 2.00 TND");
        }} else {{
            printer.println("Pass journalier: NON VALIDE");
            printer.println("MONTANT: 2.00 TND");
        }}
        printer.println("");
        
        // Ticket number
        printer.println("N° Ticket: " + entryData.ticketNumber);
        
        // Footer (entry ticket: no date or messages)
        console.log('🖨️ [NODE DEBUG] Printing footer...');
        printer.drawLine();
        
        // Staff information in bottom right corner
        console.log('🖨️ [NODE DEBUG] Printing staff footer...');
        printer.alignRight();
        printer.println("{}");

        // Barcode at bottom
        console.log('🖨️ [NODE DEBUG] Extracting entry ticket number for barcode...');
        const entryTicketNumber = entryData.ticketNumber;
        console.log('🖨️ [NODE DEBUG] Entry ticket number found:', entryTicketNumber);
        if (entryTicketNumber) {{
            console.log('🖨️ [NODE DEBUG] Printing barcode...');
            printer.alignCenter();
            printer.code128(entryTicketNumber);
            printer.println(entryTicketNumber);
        }} else {{
            console.log('🖨️ [NODE DEBUG] No entry ticket number found, skipping barcode');
        }}
        printer.cut();
        
        console.log('🖨️ [NODE DEBUG] Executing print job...');
        await printer.execute();
        console.log('🖨️ [NODE DEBUG] Entry ticket printed successfully!');
        
    }} catch (error) {{
        console.error('🖨️ [NODE DEBUG] Entry ticket print error:', error.message);
        console.error('🖨️ [NODE DEBUG] Error stack:', error.stack);
        process.exit(1);
    }}
}}

printEntryTicket();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer
        );

        let script_path = self.create_temp_script_path("temp_entry");
        println!("🖨️ [RUST DEBUG] Writing script to: {:?}", script_path);
        
        println!("🖨️ [RUST DEBUG] Script content preview (first 500 chars):");
        println!("🖨️ [RUST DEBUG] {}", &script_content[..std::cmp::min(500, script_content.len())]);
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write entry ticket script: {}", e))?;
        println!("🖨️ [RUST DEBUG] Executing Node.js script...");
        
        let output = self.execute_node_script(&script_path)?;

        let _ = std::fs::remove_file(&script_path);

        println!("🖨️ [RUST DEBUG] Script execution completed");
        println!("🖨️ [RUST DEBUG] Exit status: {:?}", output.status);
        println!("🖨️ [RUST DEBUG] Stdout: {}", String::from_utf8_lossy(&output.stdout));
        println!("🖨️ [RUST DEBUG] Stderr: {}", String::from_utf8_lossy(&output.stderr));

        if output.status.success() {
            println!("🖨️ [RUST DEBUG] Entry ticket printed successfully!");
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            println!("🖨️ [RUST DEBUG] Entry ticket print failed!");
            Err(format!(
                "Entry ticket print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_exit_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        println!("🖨️ [RUST DEBUG] Starting exit ticket print...");
        println!("🖨️ [RUST DEBUG] Ticket data received: {}", ticket_data);
        println!("🖨️ [RUST DEBUG] Staff name: {:?}", staff_name);
        
        // cache latest
        if let Ok(mut cache) = self.last_exit_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        println!("🖨️ [RUST DEBUG] Printer config: IP={}, Port={}, Width={}, Timeout={}", 
                 printer.ip, printer.port, printer.width, printer.timeout);
        
        // Use provided staff name or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            "Émis par: Staff".to_string()
        };
        println!("🖨️ [RUST DEBUG] Staff footer: {}", staff_footer);
        
        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;

        let script_content = format!(
            r#"
{}

async function printExitTicket() {{
    try {{
        console.log('🖨️ [NODE DEBUG] Starting exit ticket print...');
        
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {}
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Checking printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

        // Print logo centered at the top
        console.log('🖨️ [NODE DEBUG] Printing logo...');
        printer.alignCenter();
        try {{
            await printer.printImage("./icons/ste_260.png");
            console.log('🖨️ [NODE DEBUG] Logo printed successfully');
        }} catch (logoError) {{
            console.log('🖨️ [NODE DEBUG] Logo not found, continuing without logo:', logoError.message);
        }}

        // Company header
        console.log('🖨️ [NODE DEBUG] Printing company header...');
        printer.alignCenter();
        printer.bold(true);
        printer.setTextDoubleHeight();
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        printer.drawLine();
        
        // Ticket type header
        console.log('🖨️ [NODE DEBUG] Printing ticket type header...');
        printer.alignCenter();
        printer.bold(true);
        printer.println("TICKET DE SORTIE");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        console.log('🖨️ [NODE DEBUG] Printing exit ticket content...');
        const exitContent = `{}`;
        printer.alignLeft();
        printer.println(exitContent);
        
        // Footer
        console.log('🖨️ [NODE DEBUG] Printing footer...');
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Merci!");
        
        // Staff information in bottom right corner
        console.log('🖨️ [NODE DEBUG] Printing staff footer...');
        printer.alignRight();
        printer.println("{}");

        // Barcode at bottom
        console.log('🖨️ [NODE DEBUG] Extracting exit ticket number for barcode...');
        const exitNumMatch = exitContent.match(/N°\s*Ticket:\s*([\w-]+)/);
        const exitTicketNumber = exitNumMatch ? exitNumMatch[1] : null;
        console.log('🖨️ [NODE DEBUG] Exit ticket number found:', exitTicketNumber);
        if (exitTicketNumber) {{
            console.log('🖨️ [NODE DEBUG] Printing barcode...');
            printer.alignCenter();
            printer.code128(exitTicketNumber);
            printer.println(exitTicketNumber);
        }} else {{
            console.log('🖨️ [NODE DEBUG] No exit ticket number found, skipping barcode');
        }}
        printer.cut();
        
        console.log('🖨️ [NODE DEBUG] Executing print job...');
        await printer.execute();
        console.log('🖨️ [NODE DEBUG] Exit ticket printed successfully!');
        
    }} catch (error) {{
        console.error('🖨️ [NODE DEBUG] Exit ticket print error:', error.message);
        console.error('🖨️ [NODE DEBUG] Error stack:', error.stack);
        process.exit(1);
    }}
}}

printExitTicket();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer
        );

        let script_path = self.create_temp_script_path("temp_exit");
        println!("🖨️ [RUST DEBUG] Writing script to: {:?}", script_path);
        
        println!("🖨️ [RUST DEBUG] Script content preview (first 500 chars):");
        println!("🖨️ [RUST DEBUG] {}", &script_content[..std::cmp::min(500, script_content.len())]);
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write exit ticket script: {}", e))?;
        println!("🖨️ [RUST DEBUG] Executing Node.js script...");
        
        let output = self.execute_node_script(&script_path)?;

        let _ = std::fs::remove_file(&script_path);

        println!("🖨️ [RUST DEBUG] Script execution completed");
        println!("🖨️ [RUST DEBUG] Exit status: {:?}", output.status);
        println!("🖨️ [RUST DEBUG] Stdout: {}", String::from_utf8_lossy(&output.stdout));
        println!("🖨️ [RUST DEBUG] Stderr: {}", String::from_utf8_lossy(&output.stderr));

        if output.status.success() {
            println!("🖨️ [RUST DEBUG] Exit ticket printed successfully!");
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            println!("🖨️ [RUST DEBUG] Exit ticket print failed!");
            Err(format!(
                "Exit ticket print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
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
        println!("🖨️ [RUST DEBUG] Starting day pass ticket print...");
        println!("🖨️ [RUST DEBUG] Ticket data received: {}", ticket_data);
        println!("🖨️ [RUST DEBUG] Staff name: {:?}", staff_name);
        
        // cache latest
        if let Ok(mut cache) = self.last_day_pass_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        println!("🖨️ [RUST DEBUG] Printer config: IP={}, Port={}, Width={}, Timeout={}", 
                 printer.ip, printer.port, printer.width, printer.timeout);
        
        // Use provided staff name or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            "Émis par: Staff".to_string()
        };
        println!("🖨️ [RUST DEBUG] Staff footer: {}", staff_footer);
        
        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;
        
        let script_content = format!(
            r#"
{}

async function printDayPassTicket() {{
    try {{
        console.log('🖨️ [NODE DEBUG] Starting day pass ticket print...');
        
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {}
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Checking printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

        // Compact header: Logo centered above company name
        console.log('🖨️ [NODE DEBUG] Printing compact header...');
        printer.alignCenter();
        try {{
            await printer.printImage("./icons/ste_260.png");
        }} catch (logoError) {{
            console.log('Logo not found, continuing without logo');
        }}
        
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        
        // Compact ticket type
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        printer.println("PASS JOURNALIER");
        printer.bold(false);
        
        // Content - Parse JSON and format properly
        const dayPassData = JSON.parse(`{}`);
        console.log('🖨️ [NODE DEBUG] Printing day pass content:', dayPassData);
        
        printer.alignLeft();
        printer.println("Plaque: " + dayPassData.licensePlate);
        
        // Show correct pricing based on day pass status
        if (dayPassData.amount === 0) {{
            printer.println("Pass journalier: VALIDE");
            printer.println("Montant: 0.00 TND");
            printer.println("Achat précédent: " + dayPassData.purchaseDate);
        }} else {{
            printer.println("Pass journalier: ACHETÉ");
            printer.println("Montant: 2.00 TND");
            printer.println("Date d'achat: " + dayPassData.purchaseDate);
        }}
        
        printer.println("Valide pour: " + dayPassData.validFor);
        printer.println("Destination: " + dayPassData.destinationName);

        
        // Minimal footer
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        
        // Staff information in bottom right corner
        printer.alignRight();
        printer.println("{}");

        printer.cut();
        
        console.log('🖨️ [NODE DEBUG] Executing print job...');
        await printer.execute();
        console.log('🖨️ [NODE DEBUG] Day pass ticket printed successfully!');
        
    }} catch (error) {{
        console.error('🖨️ [NODE DEBUG] Day pass ticket print error:', error.message);
        console.error('🖨️ [NODE DEBUG] Error stack:', error.stack);
        process.exit(1);
    }}
}}

printDayPassTicket();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer
        );

        let script_path = self.create_temp_script_path("temp_daypass");
        println!("🖨️ [RUST DEBUG] Writing script to: {:?}", script_path);
        
        println!("🖨️ [RUST DEBUG] Script content preview (first 500 chars):");
        println!("🖨️ [RUST DEBUG] {}", &script_content[..std::cmp::min(500, script_content.len())]);
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write day pass ticket script: {}", e))?;
        println!("🖨️ [RUST DEBUG] Executing Node.js script...");
        
        let output = self.execute_node_script(&script_path)?;

        let _ = std::fs::remove_file(&script_path);

        println!("🖨️ [RUST DEBUG] Script execution completed");
        println!("🖨️ [RUST DEBUG] Exit status: {:?}", output.status);
        println!("🖨️ [RUST DEBUG] Stdout: {}", String::from_utf8_lossy(&output.stdout));
        println!("🖨️ [RUST DEBUG] Stderr: {}", String::from_utf8_lossy(&output.stderr));

        if output.status.success() {
            println!("🖨️ [RUST DEBUG] Day pass ticket printed successfully!");
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            println!("🖨️ [RUST DEBUG] Day pass ticket print failed!");
            Err(format!(
                "Day pass ticket print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_exit_pass_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        println!("🖨️ [RUST DEBUG] Starting exit pass ticket print...");
        println!("🖨️ [RUST DEBUG] Ticket data received: {}", ticket_data);
        println!("🖨️ [RUST DEBUG] Staff name: {:?}", staff_name);
        
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        println!("🖨️ [RUST DEBUG] Printer config: IP={}, Port={}, Width={}, Timeout={}", 
                 printer.ip, printer.port, printer.width, printer.timeout);
        
        // Use provided staff name or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            "Émis par: Staff".to_string()
        };
        println!("🖨️ [RUST DEBUG] Staff footer: {}", staff_footer);
        
        // Get the require statement
        let require_statement = self.get_thermal_printer_require()?;
        
        let script_content = format!(
            r#"
{}

async function printExitPassTicket() {{
    try {{
        console.log('🖨️ [NODE DEBUG] Starting exit pass ticket print...');
        
        const printer = new ThermalPrinter({{
            type: PrinterTypes.EPSON,
            width: {},
            interface: 'tcp://{}:{}',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {{
                timeout: {}
            }}
        }});

        console.log('🖨️ [NODE DEBUG] Checking printer connection...');
        const isConnected = await printer.isPrinterConnected();
        console.log('🖨️ [NODE DEBUG] Printer connected:', isConnected);
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

        // Compact header: Logo centered above company name
        console.log('🖨️ [NODE DEBUG] Printing compact header...');
        printer.alignCenter();
        try {{
            await printer.printImage("./icons/ste_260.png");
        }} catch (logoError) {{
            console.log('Logo not found, continuing without logo');
        }}
        
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        
        // Compact ticket type
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        printer.println("PASS DE SORTIE");
        printer.bold(false);
        
        // Content - Parse JSON and format properly
        const exitPassData = JSON.parse(`{}`);
        console.log('🖨️ [NODE DEBUG] Exit pass data:', exitPassData);
        
        printer.alignLeft();
        
        // Current vehicle info
        printer.println("VÉHICULE ACTUEL:");
        printer.println("Plaque: " + (exitPassData.licensePlate || 'N/A'));
        printer.println("Capacité: " + (exitPassData.vehicleCapacity || 8) + " places");
        printer.println("Heure de sortie: " + new Date(exitPassData.exitTime || new Date()).toLocaleString('fr-FR'));
        printer.println("");
        
        // Previous vehicle info (if exists)
        if (exitPassData.previousVehicle) {{
            printer.println("VÉHICULE PRÉCÉDENT:");
            printer.println("Plaque: " + exitPassData.previousVehicle.licensePlate);
            printer.println("Heure de sortie: " + new Date(exitPassData.previousVehicle.exitTime).toLocaleString('fr-FR'));
        }} else {{
            printer.println("VÉHICULE PRÉCÉDENT:");
            printer.println("Aucun véhicule précédent aujourd'hui");
        }}
        printer.println("");
        
        // Destination and pricing
        printer.println("DESTINATION:");
        printer.println("Station: " + (exitPassData.stationName || 'N/A'));
        printer.println("");
        
        printer.println("TARIFICATION:");
        printer.println("Prix par place: " + (exitPassData.basePrice || 0).toFixed(2) + " TND");
        printer.println("Capacité véhicule: " + (exitPassData.vehicleCapacity || 8) + " places");
        printer.println("TOTAL À RECEVOIR: " + (exitPassData.totalPrice || 0).toFixed(2) + " TND");
        
        // Minimal footer
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        
        // Staff information in bottom right corner
        printer.alignRight();
        printer.println("{}");

        // Cut the paper
        printer.cut();
        
        console.log('🖨️ [NODE DEBUG] Executing print job...');
        await printer.execute();
        console.log('🖨️ [NODE DEBUG] Exit pass ticket printed successfully!');
        
    }} catch (error) {{
        console.error('🖨️ [NODE DEBUG] Exit pass ticket print error:', error.message);
        console.error('🖨️ [NODE DEBUG] Error stack:', error.stack);
        process.exit(1);
    }}
}}

printExitPassTicket();
"#,
            require_statement,
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer
        );

        let script_path = self.create_temp_script_path("temp_exitpass");
        println!("🖨️ [RUST DEBUG] Writing script to: {:?}", script_path);
        
        println!("🖨️ [RUST DEBUG] Script content preview (first 500 chars):");
        println!("🖨️ [RUST DEBUG] {}", &script_content[..std::cmp::min(500, script_content.len())]);
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write exit pass ticket script: {}", e))?;
        println!("🖨️ [RUST DEBUG] Executing Node.js script...");
        
        let output = self.execute_node_script(&script_path)?;

        let _ = std::fs::remove_file(&script_path);

        println!("🖨️ [RUST DEBUG] Script execution completed");
        println!("🖨️ [RUST DEBUG] Exit status: {:?}", output.status);
        println!("🖨️ [RUST DEBUG] Stdout: {}", String::from_utf8_lossy(&output.stdout));
        println!("🖨️ [RUST DEBUG] Stderr: {}", String::from_utf8_lossy(&output.stderr));

        if output.status.success() {
            println!("🖨️ [RUST DEBUG] Exit pass ticket printed successfully!");
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            println!("🖨️ [RUST DEBUG] Exit pass ticket print failed!");
            Err(format!(
                "Exit pass ticket print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
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