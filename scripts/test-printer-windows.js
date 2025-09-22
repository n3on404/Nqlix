#!/usr/bin/env node

/**
 * Windows Thermal Printer Test Tool for Nqlix
 * This script tests thermal printer functionality on Windows
 */

import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer';
import net from 'net';
import os from 'os';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`  ${title}`, 'bright');
  log(`${'='.repeat(60)}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

class WindowsPrinterTester {
  constructor() {
    this.config = {
      ip: '192.168.1.100',
      port: 9100,
      width: 48,
      timeout: 5000
    };
  }

  async runTest() {
    logSection('WINDOWS THERMAL PRINTER TEST');
    log('Testing thermal printer functionality on Windows', 'bright');
    
    try {
      await this.checkWindowsEnvironment();
      await this.scanForPrinters();
      await this.testPrinterConnection();
      await this.testPrinting();
      await this.testAllTicketTypes();
    } catch (error) {
      logError(`Test failed: ${error.message}`);
    }
  }

  async checkWindowsEnvironment() {
    logSection('WINDOWS ENVIRONMENT CHECK');
    
    logInfo(`Operating System: ${os.platform()} ${os.release()}`);
    logInfo(`Architecture: ${os.arch()}`);
    logInfo(`Node.js Version: ${process.version}`);
    
    // Check if running on Windows
    if (os.platform() !== 'win32') {
      logWarning('This script is designed for Windows. Some features may not work on other platforms.');
    }
    
    // Check network interfaces
    logInfo('Network Interfaces:');
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(name => {
      const iface = interfaces[name];
      iface.forEach(addr => {
        if (addr.family === 'IPv4' && !addr.internal) {
          logInfo(`  ${name}: ${addr.address} (${addr.netmask})`);
        }
      });
    });
  }

  async scanForPrinters() {
    logSection('SCANNING FOR PRINTERS');
    
    // Common printer IPs
    const commonIPs = [
      '192.168.1.100',
      '192.168.0.100',
      '192.168.192.168',
      '192.168.1.200',
      '192.168.0.200',
      '10.0.0.100',
      '172.16.0.100'
    ];

    // Get local network ranges
    const interfaces = os.networkInterfaces();
    const localRanges = [];
    Object.keys(interfaces).forEach(name => {
      const iface = interfaces[name];
      iface.forEach(addr => {
        if (addr.family === 'IPv4' && !addr.internal) {
          const ip = addr.address.split('.').slice(0, 3).join('.');
          localRanges.push(`${ip}.`);
        }
      });
    });

    // Add local ranges
    localRanges.forEach(range => {
      for (let i = 1; i <= 50; i++) { // Limit to first 50 IPs for performance
        commonIPs.push(`${range}${i}`);
      }
    });

    logInfo('Scanning for thermal printers...');
    
    const foundPrinters = [];
    for (const ip of commonIPs) {
      const isReachable = await this.testPort(ip, 9100);
      if (isReachable) {
        logSuccess(`Found printer at ${ip}:9100`);
        foundPrinters.push({ ip, port: 9100 });
      }
    }

    // Try alternative ports
    if (foundPrinters.length === 0) {
      logInfo('Trying alternative ports...');
      for (const ip of commonIPs.slice(0, 20)) {
        for (const port of [9101, 9102, 9103, 23, 80]) {
          const isReachable = await this.testPort(ip, port);
          if (isReachable) {
            logSuccess(`Found printer at ${ip}:${port}`);
            foundPrinters.push({ ip, port });
          }
        }
      }
    }

    if (foundPrinters.length > 0) {
      this.config = { ...this.config, ...foundPrinters[0] };
      logSuccess(`Using printer at ${this.config.ip}:${this.config.port}`);
    } else {
      logError('No printers found. Please check your network connection.');
      logInfo('Make sure the printer is:');
      logInfo('1. Powered on');
      logInfo('2. Connected via Ethernet');
      logInfo('3. On the same network as your computer');
      logInfo('4. Configured with a static IP address');
    }
  }

  async testPort(ip, port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 1000;

      socket.setTimeout(timeout);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        resolve(false);
      });

      socket.connect(port, ip);
    });
  }

  async testPrinterConnection() {
    logSection('TESTING PRINTER CONNECTION');
    
    if (!this.config.ip) {
      logError('No printer configuration available');
      return;
    }

    logInfo(`Testing connection to ${this.config.ip}:${this.config.port}`);

    try {
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        width: this.config.width,
        interface: `tcp://${this.config.ip}:${this.config.port}`,
        characterSet: CharacterSet.PC852_LATIN2,
        removeSpecialCharacters: false,
        lineCharacter: "=",
        breakLine: BreakLine.WORD,
        options: {
          timeout: this.config.timeout
        }
      });

      const isConnected = await printer.isPrinterConnected();
      if (isConnected) {
        logSuccess('Printer connection successful!');
        this.printer = printer;
      } else {
        logError('Printer is not responding');
      }
    } catch (error) {
      logError(`Connection test failed: ${error.message}`);
    }
  }

  async testPrinting() {
    logSection('TESTING BASIC PRINTING');
    
    if (!this.printer) {
      logError('No printer available for testing');
      return;
    }

    try {
      logInfo('Testing basic text printing...');
      
      this.printer.clear();
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.setTextDoubleHeight();
      this.printer.println("WINDOWS PRINTER TEST");
      this.printer.setTextNormal();
      this.printer.bold(false);
      this.printer.drawLine();
      
      this.printer.alignLeft();
      this.printer.println("Date: " + new Date().toLocaleString());
      this.printer.println("Platform: Windows");
      this.printer.println("Node.js: " + process.version);
      this.printer.println("Printer IP: " + this.config.ip);
      this.printer.println("Port: " + this.config.port);
      
      this.printer.drawLine();
      this.printer.alignCenter();
      this.printer.println("Test completed successfully!");
      this.printer.cut();
      
      await this.printer.execute();
      logSuccess('Basic printing test passed!');
      
    } catch (error) {
      logError(`Printing test failed: ${error.message}`);
    }
  }

  async testAllTicketTypes() {
    logSection('TESTING ALL TICKET TYPES');
    
    if (!this.printer) {
      logError('No printer available for testing');
      return;
    }

    try {
      // Test booking ticket
      await this.testBookingTicket();
      
      // Test entry ticket
      await this.testEntryTicket();
      
      // Test exit ticket
      await this.testExitTicket();
      
      // Test day pass ticket
      await this.testDayPassTicket();
      
      logSuccess('All ticket types tested successfully!');
      
    } catch (error) {
      logError(`Ticket testing failed: ${error.message}`);
    }
  }

  async testBookingTicket() {
    logInfo('Testing booking ticket...');
    
    try {
      this.printer.clear();
      
      // Logo (if available)
      this.printer.alignCenter();
      try {
        await this.printer.printImage("./icons/ste_260.png");
      } catch (logoError) {
        logWarning('Logo not found, continuing without logo');
      }

      // Company header
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.setTextNormal();
      this.printer.println("STE Dhraiff Services Transport");
      this.printer.bold(false);
      this.printer.drawLine();
      
      // Ticket type header
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.println("TICKET DE RÉSERVATION");
      this.printer.bold(false);
      this.printer.drawLine();
      
      // Content
      const bookingContent = `N° Ticket: BK-${Date.now()}
Passager: Test User
Route: Tunis - Sfax
Départ: 08:00
Arrivée: 12:00
Siège: 15A
Prix: 25.000 DT
Frais de service: 0.200 DT
Total: 25.200 DT`;
      
      this.printer.alignLeft();
      this.printer.println(bookingContent);
      
      // Footer
      this.printer.drawLine();
      this.printer.alignCenter();
      this.printer.println("Date: " + new Date().toLocaleString('fr-FR'));
      this.printer.println("Merci de votre confiance!");
      
      // Staff information
      this.printer.alignRight();
      this.printer.println("Staff: Test Staff");

      // Barcode
      const ticketNumber = `BK-${Date.now()}`;
      this.printer.alignCenter();
      this.printer.code128(ticketNumber);
      this.printer.println(ticketNumber);
      this.printer.cut();
      
      await this.printer.execute();
      logSuccess('Booking ticket test passed!');
      
    } catch (error) {
      logError(`Booking ticket test failed: ${error.message}`);
    }
  }

  async testEntryTicket() {
    logInfo('Testing entry ticket...');
    
    try {
      this.printer.clear();
      
      // Company header
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.setTextNormal();
      this.printer.println("STE Dhraiff Services Transport");
      this.printer.bold(false);
      this.printer.drawLine();
      
      // Ticket type header
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.println("TICKET D'ENTRÉE");
      this.printer.bold(false);
      this.printer.drawLine();
      
      // Content
      const entryContent = `N° Ticket: EN-${Date.now()}
Véhicule: 123-TUN-456
Chauffeur: Ahmed Ben Ali
Route: Tunis - Sfax
Heure: ${new Date().toLocaleTimeString('fr-FR')}`;
      
      this.printer.alignLeft();
      this.printer.println(entryContent);
      
      // Footer
      this.printer.drawLine();
      this.printer.alignRight();
      this.printer.println("Staff: Test Staff");

      // Barcode
      const ticketNumber = `EN-${Date.now()}`;
      this.printer.alignCenter();
      this.printer.code128(ticketNumber);
      this.printer.println(ticketNumber);
      this.printer.cut();
      
      await this.printer.execute();
      logSuccess('Entry ticket test passed!');
      
    } catch (error) {
      logError(`Entry ticket test failed: ${error.message}`);
    }
  }

  async testExitTicket() {
    logInfo('Testing exit ticket...');
    
    try {
      this.printer.clear();
      
      // Company header
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.setTextDoubleHeight();
      this.printer.println("STE Dhraiff Services Transport");
      this.printer.bold(false);
      this.printer.drawLine();
      
      // Ticket type header
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.println("TICKET DE SORTIE");
      this.printer.bold(false);
      this.printer.drawLine();
      
      // Content
      const exitContent = `N° Ticket: EX-${Date.now()}
Véhicule: 123-TUN-456
Chauffeur: Ahmed Ben Ali
Route: Tunis - Sfax
Heure: ${new Date().toLocaleTimeString('fr-FR')}`;
      
      this.printer.alignLeft();
      this.printer.println(exitContent);
      
      // Footer
      this.printer.drawLine();
      this.printer.alignCenter();
      this.printer.println("Date: " + new Date().toLocaleString('fr-FR'));
      this.printer.println("Merci!");
      this.printer.alignRight();
      this.printer.println("Staff: Test Staff");

      // Barcode
      const ticketNumber = `EX-${Date.now()}`;
      this.printer.alignCenter();
      this.printer.code128(ticketNumber);
      this.printer.println(ticketNumber);
      this.printer.cut();
      
      await this.printer.execute();
      logSuccess('Exit ticket test passed!');
      
    } catch (error) {
      logError(`Exit ticket test failed: ${error.message}`);
    }
  }

  async testDayPassTicket() {
    logInfo('Testing day pass ticket...');
    
    try {
      this.printer.clear();
      
      // Company header
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.setTextNormal();
      this.printer.println("STE Dhraiff Services Transport");
      this.printer.bold(false);
      this.printer.drawLine();
      
      // Ticket type header
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.setTextDoubleHeight();
      this.printer.println("PASS JOURNALIER");
      this.printer.bold(false);
      this.printer.drawLine();
      
      // Content
      const dayPassContent = `N° Pass: DP-${Date.now()}
Passager: Test User
Date: ${new Date().toLocaleDateString('fr-FR')}
Valide pour: Toute la journée
Prix: 50.000 DT`;
      
      this.printer.alignLeft();
      this.printer.println(dayPassContent);
      
      // Footer
      this.printer.drawLine();
      this.printer.alignCenter();
      this.printer.println("Date: " + new Date().toLocaleString('fr-FR'));
      this.printer.println("Valide pour la journée");
      this.printer.println("Merci de votre confiance!");
      this.printer.alignRight();
      this.printer.println("Staff: Test Staff");

      // Barcode
      const ticketNumber = `DP-${Date.now()}`;
      this.printer.alignCenter();
      this.printer.code128(ticketNumber);
      this.printer.println(ticketNumber);
      this.printer.cut();
      
      await this.printer.execute();
      logSuccess('Day pass ticket test passed!');
      
    } catch (error) {
      logError(`Day pass ticket test failed: ${error.message}`);
    }
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new WindowsPrinterTester();
  tester.runTest().catch(console.error);
}

export default WindowsPrinterTester;