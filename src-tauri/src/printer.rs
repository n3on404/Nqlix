use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::{Arc, Mutex};

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

    pub async fn print_booking_ticket(&self, ticket_data: String) -> Result<String, String> {
        // cache latest
        if let Ok(mut cache) = self.last_booking_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let config = self.get_config()?;
        
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
        printer.alignLeft();
        printer.println(bookingContent);
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Merci de votre confiance!");

        // Barcode at bottom
        const bookingNumMatch = bookingContent.match(/N°\s*Ticket:\s*([\w-]+)/);
        const bookingTicketNumber = bookingNumMatch ? bookingNumMatch[1] : null;
        if (bookingTicketNumber) {{
            printer.alignCenter();
            printer.code128(bookingTicketNumber);
            printer.println(bookingTicketNumber);
        }}
        printer.cut();
        
        await printer.execute();
        console.log('Booking ticket printed successfully');
        
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
            ticket_data.replace('`', r"\`").replace('$', r"\$")
        );

        let script_path = format!("temp_booking_{}.cjs", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write booking ticket script: {}", e))?;

        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute booking ticket script: {}", e))?;

        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "Booking ticket print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_entry_ticket(&self, ticket_data: String) -> Result<String, String> {
        // cache latest
        if let Ok(mut cache) = self.last_entry_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let config = self.get_config()?;
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

async function printEntryTicket() {{
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
        printer.println("TICKET D'ENTRÉE");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        const entryContent = `{}`;
        printer.alignLeft();
        printer.println(entryContent);
        
        // Footer (entry ticket: no date or messages)
        printer.drawLine();

        // Barcode at bottom
        const entryNumMatch = entryContent.match(/N°\s*Ticket:\s*([\w-]+)/);
        const entryTicketNumber = entryNumMatch ? entryNumMatch[1] : null;
        if (entryTicketNumber) {{
            printer.alignCenter();
            printer.code128(entryTicketNumber);
            printer.println(entryTicketNumber);
        }}
        printer.cut();
        
        await printer.execute();
        console.log('Entry ticket printed successfully');
        
    }} catch (error) {{
        console.error('Entry ticket print error:', error.message);
        process.exit(1);
    }}
}}

printEntryTicket();
"#,
            config.width,
            config.ip,
            config.port,
            config.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$")
        );

        let script_path = format!("temp_entry_{}.cjs", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write entry ticket script: {}", e))?;

        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute entry ticket script: {}", e))?;

        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "Entry ticket print failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub async fn print_exit_ticket(&self, ticket_data: String) -> Result<String, String> {
        // cache latest
        if let Ok(mut cache) = self.last_exit_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let config = self.get_config()?;
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

async function printExitTicket() {{
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
        printer.setTextDoubleHeight();
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        printer.drawLine();
        
        // Ticket type header
        printer.alignCenter();
        printer.bold(true);
        printer.println("TICKET DE SORTIE");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        const exitContent = `{}`;
        printer.alignLeft();
        printer.println(exitContent);
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Merci!");

        // Barcode at bottom
        const exitNumMatch = exitContent.match(/N°\s*Ticket:\s*([\w-]+)/);
        const exitTicketNumber = exitNumMatch ? exitNumMatch[1] : null;
        if (exitTicketNumber) {{
            printer.alignCenter();
            printer.code128(exitTicketNumber);
            printer.println(exitTicketNumber);
        }}
        printer.cut();
        
        await printer.execute();
        console.log('Exit ticket printed successfully');
        
    }} catch (error) {{
        console.error('Exit ticket print error:', error.message);
        process.exit(1);
    }}
}}

printExitTicket();
"#,
            config.width,
            config.ip,
            config.port,
            config.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$")
        );

        let script_path = format!("temp_exit_{}.cjs", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write exit ticket script: {}", e))?;

        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute exit ticket script: {}", e))?;

        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
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
            Some(payload) => self.print_booking_ticket(payload).await,
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
            Some(payload) => self.print_entry_ticket(payload).await,
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
            Some(payload) => self.print_exit_ticket(payload).await,
            None => Err("No previous exit ticket to reprint".to_string()),
        }
    }

    pub async fn print_day_pass_ticket(&self, ticket_data: String) -> Result<String, String> {
        // cache latest
        if let Ok(mut cache) = self.last_day_pass_payload.lock() {
            *cache = Some(ticket_data.clone());
        }
        let config = self.get_config()?;
        
        let script_content = format!(
            r#"
const {{ ThermalPrinter, PrinterTypes, CharacterSet, BreakLine }} = require('node-thermal-printer');

async function printDayPassTicket() {{
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
        printer.setTextDoubleHeight();
        printer.println("PASS JOURNALIER");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        const dayPassContent = `{}`;
        printer.alignLeft();
        printer.println(dayPassContent);
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Valide pour la journée");
        printer.println("Merci de votre confiance!");

        // Barcode at bottom
        const dayPassNumMatch = dayPassContent.match(/N°\s*Pass:\s*([\w-]+)/);
        const dayPassNumber = dayPassNumMatch ? dayPassNumMatch[1] : null;
        if (dayPassNumber) {{
            printer.alignCenter();
            printer.code128(dayPassNumber);
            printer.println(dayPassNumber);
        }}
        printer.cut();
        
        await printer.execute();
        console.log('Day pass ticket printed successfully');
        
    }} catch (error) {{
        console.error('Day pass ticket print error:', error.message);
        process.exit(1);
    }}
}}

printDayPassTicket();
"#,
            config.width,
            config.ip,
            config.port,
            config.timeout,
            ticket_data.replace('`', r"\`").replace('$', r"\$")
        );

        let script_path = format!("temp_daypass_{}.cjs", uuid::Uuid::new_v4());
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write day pass ticket script: {}", e))?;

        let output = Command::new("node")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Failed to execute day pass ticket script: {}", e))?;

        let _ = std::fs::remove_file(&script_path);

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "Day pass ticket print failed: {}",
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
            Some(payload) => self.print_day_pass_ticket(payload).await,
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