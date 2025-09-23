    use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::{Arc, Mutex};
use reqwest::Client;
use std::time::Duration;

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
pub struct PrinterConfigFile {
    pub printers: Vec<PrinterConfig>,
    pub last_updated: String,
    pub status: String,
    pub auto_detect: bool,
    pub fallback_enabled: bool,
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
    config_file: Arc<Mutex<PrinterConfigFile>>,
    current_printer: Arc<Mutex<Option<String>>>, // ID of currently selected printer
    node_script_path: String,
    // Cache last printed payloads for reprint functionality
    last_booking_payload: Arc<Mutex<Option<String>>>,
    last_entry_payload: Arc<Mutex<Option<String>>>,
    last_exit_payload: Arc<Mutex<Option<String>>>,
    last_day_pass_payload: Arc<Mutex<Option<String>>>,
}

impl PrinterService {
    pub fn new() -> Self {
        // Try to load existing configuration first
        let config_file = match Self::load_config_from_file() {
            Ok(config) => config,
            Err(_) => {
                // If no config exists, create default with first printer as default
                PrinterConfigFile {
                    printers: vec![
                        PrinterConfig {
                            id: "printer1".to_string(),
                            name: "Imprimante 1".to_string(),
                            ip: "192.168.192.10".to_string(),
                            port: 9100,
                width: 48,
                timeout: 5000,
                            model: "TM-T20X".to_string(),
                            enabled: true,
                            is_default: true,
                        },
                        PrinterConfig {
                            id: "printer2".to_string(),
                            name: "Imprimante 2".to_string(),
                            ip: "192.168.192.11".to_string(),
                            port: 9100,
                            width: 48,
                            timeout: 5000,
                            model: "TM-T20X".to_string(),
                            enabled: true,
                            is_default: false,
                        },
                        PrinterConfig {
                            id: "printer3".to_string(),
                            name: "Imprimante 3".to_string(),
                            ip: "192.168.192.12".to_string(),
                            port: 9100,
                            width: 48,
                            timeout: 5000,
                            model: "TM-T20X".to_string(),
                            enabled: true,
                            is_default: false,
                        },
                    ],
                    last_updated: chrono::Utc::now().to_rfc3339(),
                    status: "working".to_string(),
                    auto_detect: true,
                    fallback_enabled: true,
                }
            }
        };

        // Find the default printer
        let default_printer_id = config_file.printers
            .iter()
            .find(|p| p.is_default)
            .map(|p| p.id.clone())
            .unwrap_or_else(|| {
                // If no default found, set first printer as default
                if let Some(first_printer) = config_file.printers.first() {
                    first_printer.id.clone()
                } else {
                    "printer1".to_string()
                }
            });

        Self {
            config_file: Arc::new(Mutex::new(config_file)),
            current_printer: Arc::new(Mutex::new(Some(default_printer_id))),
            node_script_path: "scripts/printer.js".to_string(),
            last_booking_payload: Arc::new(Mutex::new(None)),
            last_entry_payload: Arc::new(Mutex::new(None)),
            last_exit_payload: Arc::new(Mutex::new(None)),
            last_day_pass_payload: Arc::new(Mutex::new(None)),
        }
    }

    fn load_config_from_file() -> Result<PrinterConfigFile, String> {
        let config_path = "printer-config.json";
        if let Ok(content) = std::fs::read_to_string(config_path) {
            let config: PrinterConfigFile = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse config file: {}", e))?;
            Ok(config)
        } else {
            Err("Config file not found".to_string())
        }
    }

    pub fn reload_config_from_file(&self) -> Result<(), String> {
        let config_path = "printer-config.json";
        if let Ok(content) = std::fs::read_to_string(config_path) {
            let config: PrinterConfigFile = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse config file: {}", e))?;
            let mut config_file = self.config_file.lock().map_err(|e| e.to_string())?;
            *config_file = config;
        }
        Ok(())
    }

    pub fn save_config_to_file(&self) -> Result<(), String> {
        let config_file = self.config_file.lock().map_err(|e| e.to_string())?;
        let config_path = "printer-config.json";
        let content = serde_json::to_string_pretty(&*config_file)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
        // Check if the content has actually changed to avoid unnecessary file writes
        if let Ok(existing_content) = std::fs::read_to_string(config_path) {
            if existing_content == content {
                // Content is the same, no need to write
                return Ok(());
            }
        }
        
        std::fs::write(config_path, content)
            .map_err(|e| format!("Failed to write config file: {}", e))?;
        Ok(())
    }

    pub fn get_all_printers(&self) -> Result<Vec<PrinterConfig>, String> {
        let config_file = self.config_file.lock().map_err(|e| e.to_string())?;
        Ok(config_file.printers.clone())
    }

    pub fn get_printer_by_id(&self, id: &str) -> Result<Option<PrinterConfig>, String> {
        let config_file = self.config_file.lock().map_err(|e| e.to_string())?;
        Ok(config_file.printers.iter().find(|p| p.id == id).cloned())
    }

    pub fn get_default_printer(&self) -> Result<Option<PrinterConfig>, String> {
        let config_file = self.config_file.lock().map_err(|e| e.to_string())?;
        Ok(config_file.printers.iter().find(|p| p.is_default).cloned())
    }

    pub fn get_current_printer(&self) -> Result<Option<PrinterConfig>, String> {
        let current_id = self.current_printer.lock().map_err(|e| e.to_string())?;
        if let Some(id) = current_id.as_ref() {
            self.get_printer_by_id(id)
        } else {
            self.get_default_printer()
        }
    }

    pub fn set_current_printer(&self, printer_id: &str) -> Result<(), String> {
        let mut config_file = self.config_file.lock().map_err(|e| e.to_string())?;
        if config_file.printers.iter().any(|p| p.id == printer_id) {
            // Set all printers as non-default first
            for printer in config_file.printers.iter_mut() {
                printer.is_default = false;
            }
            
            // Set the selected printer as default
            if let Some(printer) = config_file.printers.iter_mut().find(|p| p.id == printer_id) {
                printer.is_default = true;
            }
            
            // Update current printer
            let mut current = self.current_printer.lock().map_err(|e| e.to_string())?;
            *current = Some(printer_id.to_string());
            
            // Save configuration to persist the default printer
            config_file.last_updated = chrono::Utc::now().to_rfc3339();
            drop(config_file); // Release the lock before calling save_config_to_file
            self.save_config_to_file()?;
            
            Ok(())
        } else {
            Err(format!("Printer with ID '{}' not found", printer_id))
        }
    }

    pub fn update_printer_config(&self, printer_id: &str, new_config: PrinterConfig) -> Result<(), String> {
        let mut config_file = self.config_file.lock().map_err(|e| e.to_string())?;
        if let Some(printer) = config_file.printers.iter_mut().find(|p| p.id == printer_id) {
            *printer = new_config;
            config_file.last_updated = chrono::Utc::now().to_rfc3339();
            self.save_config_to_file()?;
            Ok(())
        } else {
            Err(format!("Printer with ID '{}' not found", printer_id))
        }
    }

    pub fn add_printer(&self, printer: PrinterConfig) -> Result<(), String> {
        let mut config_file = self.config_file.lock().map_err(|e| e.to_string())?;
        config_file.printers.push(printer);
        config_file.last_updated = chrono::Utc::now().to_rfc3339();
        self.save_config_to_file()?;
        Ok(())
    }

    pub fn remove_printer(&self, printer_id: &str) -> Result<(), String> {
        let mut config_file = self.config_file.lock().map_err(|e| e.to_string())?;
        config_file.printers.retain(|p| p.id != printer_id);
        config_file.last_updated = chrono::Utc::now().to_rfc3339();
        self.save_config_to_file()?;
        Ok(())
    }

    /// Automatically set the first working printer as default
    pub async fn auto_set_default_printer(&self) -> Result<(), String> {
        let printers = self.get_all_printers()?;
        
        // Check if there's already a default printer set (without holding the lock across await)
        let has_current_printer = {
            let current_printer = self.current_printer.lock().map_err(|e| e.to_string())?;
            current_printer.is_some()
        };
        
        if has_current_printer {
            // Already have a default printer, no need to change
            println!("🎯 Default printer already set, skipping auto-setup");
            return Ok(());
        }
        
        // Check if there are any enabled printers
        if !printers.iter().any(|p| p.enabled) {
            println!("⚠️ No enabled printers found, skipping auto-setup");
            return Ok(());
        }
        
        // Try to find a working printer
        for printer in &printers {
            if printer.enabled {
                match self.test_printer_connection(&printer.id).await {
                    Ok(status) => {
                        if status.connected {
                            // Found a working printer, set it as default
                            self.set_current_printer(&printer.id)?;
                            println!("🎯 Auto-set default printer: {} ({})", printer.name, printer.ip);
                            return Ok(());
                        }
                    }
                    Err(_) => {
                        // Continue to next printer
                        continue;
                    }
                }
            }
        }
        
        // If no working printer found, just set the first enabled printer as default
        if let Some(first_printer) = printers.iter().find(|p| p.enabled) {
            self.set_current_printer(&first_printer.id)?;
            println!("🎯 Auto-set first available printer as default: {} ({})", first_printer.name, first_printer.ip);
        }
        
        Ok(())
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
        let base_url = "http://127.0.0.1:3001"; // Default local node URL
        
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

    pub async fn execute_print_job(&self, job: PrintJob) -> Result<String, String> {
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        self.execute_print_job_with_printer(&printer, job).await
    }
        
    pub async fn execute_print_job_with_printer(&self, printer: &PrinterConfig, job: PrintJob) -> Result<String, String> {
        // Create the Node.js script content
        let script_content = self.create_print_script(printer, &job)?;
        
        // Write script to temporary file
        let script_path = format!("temp_print_{}.js", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write script: {}", e))?;

        // Execute the script
        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute print script: {}", e))?;

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
        let script = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
                timeout: {}
            }}
        }});

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

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
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            data.replace('"', r#"\""#)
        );

        let script_path = format!("temp_qr_{}.js", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write QR script: {}", e))?;

        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute QR script: {}", e))?;

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
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
                timeout: {}
            }}
        }});

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

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
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            logo_path,
            logo_path,
            content.replace('"', r#"\""#)
        );

        let script_path = format!("temp_logo_{}.js", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write logo script: {}", e))?;

        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute logo script: {}", e))?;

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
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
                timeout: {}
            }}
        }});

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

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
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            content.replace('"', r#"\""#)
        );

        let script_path = format!("temp_standard_{}.js", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write standard ticket script: {}", e))?;

        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute standard ticket script: {}", e))?;

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
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
                timeout: {}
            }}
        }});

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

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
        
        // Ticket type header
        printer.alignCenter();
        printer.bold(true);
        printer.println("TICKET DE RÉSERVATION");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        const bookingContent = `{}`;
        
        // Debug: Log what will be printed
        console.log('🎫 DEBUG: Ticket content that will be printed:');
        console.log('='.repeat(80));
        console.log(bookingContent);
        console.log('='.repeat(80));
        
        printer.alignLeft();
        printer.println(bookingContent);
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Merci de votre confiance!");
        
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
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer,
            staff_footer
        );

        let script_path = format!("temp_booking_{}.cjs", uuid::Uuid::new_v4());
        
        // Debug: Show the script that will be executed
        println!("📜 DEBUG: Node.js script that will be executed:");
        println!("{}", "=".repeat(80));
        println!("{}", script_content);
        println!("{}", "=".repeat(80));
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write booking ticket script: {}", e))?;

        println!("🚀 DEBUG: Executing Node.js script: {}", script_path);
        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute booking ticket script: {}", e))?;

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
        let printer = self.get_current_printer()?;
        let printer = printer.ok_or("No printer selected")?;
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
                timeout: {}
            }}
        }});

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {{
            throw new Error('Printer not connected');
        }}

        // Talon content
        printer.alignLeft();
        printer.println("{}");

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
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            talon_data.replace('"', r#"\""#)
        );

        let script_path = format!("temp_talon_{}.js", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write talon script: {}", e))?;

        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute talon script: {}", e))?;

        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
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
        
        // Use provided staff name or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            "Émis par: Staff".to_string()
        };
        println!("🖨️ [RUST DEBUG] Staff footer: {}", staff_footer);
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
        
        // Content
        console.log('🖨️ [NODE DEBUG] Printing entry ticket content...');
        const entryContent = `{}`;
        printer.alignLeft();
        printer.println(entryContent);
        
        // Footer (entry ticket: no date or messages)
        console.log('🖨️ [NODE DEBUG] Printing footer...');
        printer.drawLine();
        
        // Staff information in bottom right corner
        console.log('🖨️ [NODE DEBUG] Printing staff footer...');
        printer.alignRight();
        printer.println("{}");

        // Barcode at bottom
        console.log('🖨️ [NODE DEBUG] Extracting entry ticket number for barcode...');
        const entryNumMatch = entryContent.match(/N°\s*Ticket:\s*([\w-]+)/);
        const entryTicketNumber = entryNumMatch ? entryNumMatch[1] : null;
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
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer
        );

        let script_path = format!("temp_entry_{}.cjs", uuid::Uuid::new_v4());
        println!("🖨️ [RUST DEBUG] Writing script to: {}", script_path);
        
        println!("🖨️ [RUST DEBUG] Script content preview (first 500 chars):");
        println!("🖨️ [RUST DEBUG] {}", &script_content[..std::cmp::min(500, script_content.len())]);
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write entry ticket script: {}", e))?;
        println!("🖨️ [RUST DEBUG] Executing Node.js script...");
        
        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute entry ticket script: {}", e))?;

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
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer
        );

        let script_path = format!("temp_exit_{}.cjs", uuid::Uuid::new_v4());
        println!("🖨️ [RUST DEBUG] Writing script to: {}", script_path);
        
        println!("🖨️ [RUST DEBUG] Script content preview (first 500 chars):");
        println!("🖨️ [RUST DEBUG] {}", &script_content[..std::cmp::min(500, script_content.len())]);
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write exit ticket script: {}", e))?;
        println!("🖨️ [RUST DEBUG] Executing Node.js script...");
        
        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute exit ticket script: {}", e))?;

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
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
        printer.setTextDoubleHeight();
        printer.println("PASS JOURNALIER");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        const dayPassContent = `{}`;
        console.log('🖨️ [NODE DEBUG] Printing day pass content:', dayPassContent);
        printer.alignLeft();
        printer.println(dayPassContent);
        
        // Footer
        console.log('🖨️ [NODE DEBUG] Printing footer...');
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Valide pour la journée");
        printer.println("Merci de votre confiance!");
        
        // Staff information in bottom right corner
        console.log('🖨️ [NODE DEBUG] Printing staff footer...');
        printer.alignRight();
        printer.println("{}");

        // Barcode at bottom
        console.log('🖨️ [NODE DEBUG] Extracting day pass number for barcode...');
        const dayPassNumMatch = dayPassContent.match(/N°\s*Pass:\s*([\w-]+)/);
        const dayPassNumber = dayPassNumMatch ? dayPassNumMatch[1] : null;
        console.log('🖨️ [NODE DEBUG] Day pass number found:', dayPassNumber);
        if (dayPassNumber) {{
            console.log('🖨️ [NODE DEBUG] Printing barcode...');
            printer.alignCenter();
            printer.code128(dayPassNumber);
            printer.println(dayPassNumber);
        }} else {{
            console.log('🖨️ [NODE DEBUG] No day pass number found, skipping barcode');
        }}
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
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer
        );

        let script_path = format!("temp_daypass_{}.cjs", uuid::Uuid::new_v4());
        println!("🖨️ [RUST DEBUG] Writing script to: {}", script_path);
        
        println!("🖨️ [RUST DEBUG] Script content preview (first 500 chars):");
        println!("🖨️ [RUST DEBUG] {}", &script_content[..std::cmp::min(500, script_content.len())]);
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write day pass ticket script: {}", e))?;
        println!("🖨️ [RUST DEBUG] Executing Node.js script...");
        
        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute day pass ticket script: {}", e))?;

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
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

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
        printer.setTextDoubleHeight();
        printer.println("PASS DE SORTIE");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        const exitPassContent = `{}`;
        console.log('🖨️ [NODE DEBUG] Printing exit pass content:', exitPassContent);
        printer.alignLeft();
        printer.println(exitPassContent);
        
        // Footer
        console.log('🖨️ [NODE DEBUG] Printing footer...');
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Véhicule autorisé à partir");
        printer.println("Merci de votre confiance!");
        
        // Staff information in bottom right corner
        console.log('🖨️ [NODE DEBUG] Printing staff footer...');
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
            printer.width,
            printer.ip,
            printer.port,
            printer.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$"),
            staff_footer
        );

        let script_path = format!("temp_exitpass_{}.cjs", uuid::Uuid::new_v4());
        println!("🖨️ [RUST DEBUG] Writing script to: {}", script_path);
        
        println!("🖨️ [RUST DEBUG] Script content preview (first 500 chars):");
        println!("🖨️ [RUST DEBUG] {}", &script_content[..std::cmp::min(500, script_content.len())]);
        
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write exit pass ticket script: {}", e))?;
        println!("🖨️ [RUST DEBUG] Executing Node.js script...");
        
        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute exit pass ticket script: {}", e))?;

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