use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::{Arc, Mutex};
use reqwest::Client;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct PrinterConfig {
    pub ip: String,
    pub port: u16,
    pub width: u8,
    pub timeout: u64,
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
    config: Arc<Mutex<PrinterConfig>>,
    node_script_path: String,
    // Cache last printed payloads for reprint functionality
    last_booking_payload: Arc<Mutex<Option<String>>>,
    last_entry_payload: Arc<Mutex<Option<String>>>,
    last_exit_payload: Arc<Mutex<Option<String>>>,
    last_day_pass_payload: Arc<Mutex<Option<String>>>,
}

impl PrinterService {
    pub fn new() -> Self {
        Self {
            config: Arc::new(Mutex::new(PrinterConfig {
                ip: "192.168.192.168".to_string(), // Default IP for Epson TM-T20X
                port: 9100, // Default port for Epson printers
                width: 48,
                timeout: 5000,
            })),
            node_script_path: "scripts/printer.js".to_string(),
            last_booking_payload: Arc::new(Mutex::new(None)),
            last_entry_payload: Arc::new(Mutex::new(None)),
            last_exit_payload: Arc::new(Mutex::new(None)),
            last_day_pass_payload: Arc::new(Mutex::new(None)),
        }
    }

    pub fn update_config(&self, new_config: PrinterConfig) -> Result<(), String> {
        let mut config = self.config.lock().map_err(|e| e.to_string())?;
        *config = new_config;
        Ok(())
    }

    pub fn get_config(&self) -> Result<PrinterConfig, String> {
        let config = self.config.lock().map_err(|e| e.to_string())?;
        Ok(config.clone())
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
        // Test connection by trying to connect to the printer
        let test_result = self.execute_print_job(PrintJob {
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
        let config = self.get_config()?;
        
        // Create the Node.js script content
        let script_content = self.create_print_script(&config, &job)?;
        
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

    fn create_print_script(&self, config: &PrinterConfig, job: &PrintJob) -> Result<String, String> {
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
            config.width,
            config.ip,
            config.port,
            config.timeout,
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

    pub async fn print_barcode(&self, data: String, barcode_type: u8) -> Result<String, String> {
        let config = self.get_config()?;
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

async function printBarcode() {{
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
        printer.printBarcode("{}", {}, {{
            hriPos: 2,
            hriFont: 0,
            width: 3,
            height: 168
        }});
        printer.cut();
        
        await printer.execute();
        console.log('Barcode printed successfully');
        
    }} catch (error) {{
        console.error('Barcode print error:', error.message);
        process.exit(1);
    }}
}}

printBarcode();
"#,
            config.width,
            config.ip,
            config.port,
            config.timeout,
            data.replace('"', r#"\""#),
            barcode_type
        );

        let script_path = format!("temp_barcode_{}.js", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write barcode script: {}", e))?;

        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute barcode script: {}", e))?;

        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "Barcode print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_qr_code(&self, data: String) -> Result<String, String> {
        let config = self.get_config()?;
        
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
            config.width,
            config.ip,
            config.port,
            config.timeout,
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
        let config = self.get_config()?;
        
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
            config.width,
            config.ip,
            config.port,
            config.timeout,
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
        let config = self.get_config()?;
        
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
            config.width,
            config.ip,
            config.port,
            config.timeout,
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
        let config = self.get_config()?;
        
        // Use provided staff name or fallback
        let staff_footer = if let Some(name) = staff_name {
            format!("Émis par: {}", name)
        } else {
            "Émis par: Staff".to_string()
        };
        
        println!("👤 DEBUG: Staff information: {}", staff_footer);
        
        // Debug: Print printer configuration
        println!("🖨️ DEBUG: Printer configuration:");
        println!("  - IP: {}", config.ip);
        println!("  - Port: {}", config.port);
        println!("  - Width: {}", config.width);
        println!("  - Timeout: {}ms", config.timeout);
        
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

        // Barcode at bottom
        const bookingNumMatch = bookingContent.match(/N°\s*Ticket:\s*([\w-]+)/);
        const bookingTicketNumber = bookingNumMatch ? bookingNumMatch[1] : null;
        if (bookingTicketNumber) {{
            printer.alignCenter();
            printer.code128(bookingTicketNumber);
            printer.println(bookingTicketNumber);
        }}
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
        if (bookingTicketNumber) {{
            console.log('- Barcode: ' + bookingTicketNumber);
            console.log('- Ticket Number: ' + bookingTicketNumber);
        }}
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
            config.width,
            config.ip,
            config.port,
            config.timeout,
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

    pub async fn print_entry_ticket(&self, ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
        println!("🖨️ [RUST DEBUG] Starting entry ticket print...");
        println!("🖨️ [RUST DEBUG] Ticket data received: {}", ticket_data);
        println!("🖨️ [RUST DEBUG] Staff name: {:?}", staff_name);
        
        // cache latest
        if let Ok(mut cache) = self.last_entry_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let config = self.get_config()?;
        println!("🖨️ [RUST DEBUG] Printer config: IP={}, Port={}, Width={}, Timeout={}", 
                 config.ip, config.port, config.width, config.timeout);
        
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
            config.width,
            config.ip,
            config.port,
            config.timeout,
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
        let config = self.get_config()?;
        println!("🖨️ [RUST DEBUG] Printer config: IP={}, Port={}, Width={}, Timeout={}", 
                 config.ip, config.port, config.width, config.timeout);
        
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
            config.width,
            config.ip,
            config.port,
            config.timeout,
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
        let config = self.get_config()?;
        println!("🖨️ [RUST DEBUG] Printer config: IP={}, Port={}, Width={}, Timeout={}", 
                 config.ip, config.port, config.width, config.timeout);
        
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
            config.width,
            config.ip,
            config.port,
            config.timeout,
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
        
        let config = self.get_config()?;
        println!("🖨️ [RUST DEBUG] Printer config: IP={}, Port={}, Width={}, Timeout={}", 
                 config.ip, config.port, config.width, config.timeout);
        
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

        // Barcode at bottom
        console.log('🖨️ [NODE DEBUG] Extracting exit pass number for barcode...');
        const exitPassNumMatch = exitPassContent.match(/N°\s*Sortie:\s*([\w-]+)/);
        const exitPassNumber = exitPassNumMatch ? exitPassNumMatch[1] : null;
        console.log('🖨️ [NODE DEBUG] Exit pass number found:', exitPassNumber);
        if (exitPassNumber) {{
            console.log('🖨️ [NODE DEBUG] Printing barcode...');
            printer.alignCenter();
            printer.code128(exitPassNumber);
            printer.println(exitPassNumber);
        }} else {{
            console.log('🖨️ [NODE DEBUG] No exit pass number found, skipping barcode');
        }}
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
            config.width,
            config.ip,
            config.port,
            config.timeout,
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
}

impl Clone for PrinterConfig {
    fn clone(&self) -> Self {
        Self {
            ip: self.ip.clone(),
            port: self.port,
            width: self.width,
            timeout: self.timeout,
        }
    }
}