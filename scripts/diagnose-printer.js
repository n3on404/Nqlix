#!/usr/bin/env node

/**
 * Thermal Printer Diagnostic Tool for Nqlix
 * This script helps diagnose and fix thermal printer connection issues
 */

import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer';
import net from 'net';
import { exec } from 'child_process';
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

// Common printer IPs to test
const commonPrinterIPs = [
  '192.168.1.100',
  '192.168.0.100',
  '192.168.192.168',
  '192.168.1.200',
  '192.168.0.200',
  '10.0.0.100',
  '172.16.0.100'
];

const commonPorts = [9100, 9101, 9102, 9103, 23, 80];

class PrinterDiagnostic {
  constructor() {
    this.foundPrinters = [];
    this.networkInfo = {};
  }

  async runDiagnostic() {
    logSection('THERMAL PRINTER DIAGNOSTIC TOOL');
    log('This tool will help diagnose and fix your thermal printer connection issues.', 'bright');
    
    try {
      await this.checkSystemInfo();
      await this.scanNetwork();
      await this.testCommonPrinterIPs();
      await this.testPrinterConnection();
      await this.testPrinterFunctionality();
      await this.generateRecommendations();
    } catch (error) {
      logError(`Diagnostic failed: ${error.message}`);
    }
  }

  async checkSystemInfo() {
    logSection('SYSTEM INFORMATION');
    
    logInfo(`Operating System: ${os.platform()} ${os.release()}`);
    logInfo(`Architecture: ${os.arch()}`);
    logInfo(`Node.js Version: ${process.version}`);
    logInfo(`Network Interfaces:`);
    
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

  async scanNetwork() {
    logSection('NETWORK SCANNING');
    
    logInfo('Scanning for devices on common printer ports...');
    
    const promises = [];
    const interfaces = os.networkInterfaces();
    
    // Get local network ranges
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

    // Scan each range
    for (const range of localRanges) {
      for (let i = 1; i <= 254; i++) {
        const ip = `${range}${i}`;
        promises.push(this.scanIP(ip));
      }
    }

    const results = await Promise.allSettled(promises);
    const foundDevices = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === 'fulfilled' && result.value)
      .map(({ result }) => result.value);

    if (foundDevices.length > 0) {
      logSuccess(`Found ${foundDevices.length} devices with open printer ports:`);
      foundDevices.forEach(device => {
        logInfo(`  ${device.ip}:${device.port} - ${device.type}`);
      });
      this.foundPrinters = foundDevices;
    } else {
      logWarning('No devices found with open printer ports');
    }
  }

  async scanIP(ip) {
    return new Promise((resolve) => {
      const promises = commonPorts.map(port => this.testPort(ip, port));
      Promise.allSettled(promises).then(results => {
        const openPorts = results
          .map((result, index) => ({ result, port: commonPorts[index] }))
          .filter(({ result }) => result.status === 'fulfilled' && result.value)
          .map(({ result, port }) => port);

        if (openPorts.length > 0) {
          resolve({
            ip,
            ports: openPorts,
            type: this.detectPrinterType(ip, openPorts)
          });
        } else {
          resolve(null);
        }
      });
    });
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

  detectPrinterType(ip, ports) {
    if (ports.includes(9100)) return 'Epson Thermal (Port 9100)';
    if (ports.includes(9101)) return 'Epson Thermal (Port 9101)';
    if (ports.includes(23)) return 'Telnet/Serial';
    if (ports.includes(80)) return 'HTTP/Web Interface';
    return 'Unknown Printer Type';
  }

  async testCommonPrinterIPs() {
    logSection('TESTING COMMON PRINTER IPs');
    
    logInfo('Testing common thermal printer IP addresses...');
    
    for (const ip of commonPrinterIPs) {
      const isReachable = await this.testPort(ip, 9100);
      if (isReachable) {
        logSuccess(`Found printer at ${ip}:9100`);
        this.foundPrinters.push({
          ip,
          port: 9100,
          type: 'Epson Thermal (Common IP)'
        });
      } else {
        log(`  ${ip}:9100 - Not reachable`, 'red');
      }
    }
  }

  async testPrinterConnection() {
    logSection('PRINTER CONNECTION TEST');
    
    if (this.foundPrinters.length === 0) {
      logError('No printers found. Please check your network connection and printer setup.');
      return;
    }

    for (const printerConfig of this.foundPrinters) {
      logInfo(`Testing connection to ${printerConfig.ip}:${printerConfig.port}`);
      
      try {
        const printer = new ThermalPrinter({
          type: PrinterTypes.EPSON,
          width: 48,
          interface: `tcp://${printerConfig.ip}:${printerConfig.port}`,
          characterSet: CharacterSet.PC852_LATIN2,
          removeSpecialCharacters: false,
          lineCharacter: "=",
          breakLine: BreakLine.WORD,
          options: {
            timeout: 5000
          }
        });

        const isConnected = await printer.isPrinterConnected();
        if (isConnected) {
          logSuccess(`Printer ${printerConfig.ip}:${printerConfig.port} is connected and ready!`);
          this.workingPrinter = printer;
        } else {
          logError(`Printer ${printerConfig.ip}:${printerConfig.port} is not responding`);
        }
      } catch (error) {
        logError(`Connection test failed for ${printerConfig.ip}:${printerConfig.port}: ${error.message}`);
      }
    }
  }

  async testPrinterFunctionality() {
    logSection('PRINTER FUNCTIONALITY TEST');
    
    if (!this.workingPrinter) {
      logWarning('No working printer found. Skipping functionality test.');
      return;
    }

    try {
      logInfo('Testing basic printer functionality...');
      
      // Test basic text printing
      this.workingPrinter.clear();
      this.workingPrinter.alignCenter();
      this.workingPrinter.bold(true);
      this.workingPrinter.println("PRINTER TEST");
      this.workingPrinter.bold(false);
      this.workingPrinter.drawLine();
      this.workingPrinter.alignLeft();
      this.workingPrinter.println("Date: " + new Date().toLocaleString());
      this.workingPrinter.println("Status: Working correctly");
      this.workingPrinter.drawLine();
      this.workingPrinter.alignCenter();
      this.workingPrinter.println("Test completed successfully!");
      this.workingPrinter.cut();
      
      await this.workingPrinter.execute();
      logSuccess('Basic functionality test passed!');
      
      // Test barcode printing
      logInfo('Testing barcode functionality...');
      this.workingPrinter.clear();
      this.workingPrinter.alignCenter();
      this.workingPrinter.println("BARCODE TEST");
      this.workingPrinter.drawLine();
      this.workingPrinter.code128("TEST123456");
      this.workingPrinter.println("TEST123456");
      this.workingPrinter.cut();
      
      await this.workingPrinter.execute();
      logSuccess('Barcode test passed!');
      
    } catch (error) {
      logError(`Functionality test failed: ${error.message}`);
    }
  }

  async generateRecommendations() {
    logSection('RECOMMENDATIONS');
    
    if (this.foundPrinters.length === 0) {
      logError('No printers found on the network.');
      logInfo('Troubleshooting steps:');
      logInfo('1. Check if the printer is powered on');
      logInfo('2. Verify Ethernet cable connection');
      logInfo('3. Check printer IP configuration');
      logInfo('4. Ensure printer and computer are on the same network');
      logInfo('5. Try connecting printer via USB first to test functionality');
    } else if (!this.workingPrinter) {
      logWarning('Printers found but none are responding properly.');
      logInfo('Troubleshooting steps:');
      logInfo('1. Check printer power and paper');
      logInfo('2. Verify printer is not in error state');
      logInfo('3. Try different ports (9100, 9101, 9102)');
      logInfo('4. Check firewall settings');
      logInfo('5. Restart the printer');
    } else {
      logSuccess('Printer is working correctly!');
      logInfo('Configuration for Nqlix:');
      const printer = this.foundPrinters.find(p => p.ip);
      if (printer) {
        logInfo(`IP Address: ${printer.ip}`);
        logInfo(`Port: ${printer.port}`);
        logInfo(`Width: 48 characters`);
        logInfo(`Timeout: 5000ms`);
      }
    }

    logInfo('\nNext steps:');
    logInfo('1. Update printer configuration in Nqlix application');
    logInfo('2. Test printing from the application');
    logInfo('3. Check application logs for any errors');
  }
}

// Run the diagnostic
if (import.meta.url === `file://${process.argv[1]}`) {
  const diagnostic = new PrinterDiagnostic();
  diagnostic.runDiagnostic().catch(console.error);
}

export default PrinterDiagnostic;