#!/usr/bin/env node

/**
 * Thermal Printer Connection Fix Tool for Nqlix
 * This script helps fix common thermal printer connection issues
 */

import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer';
import net from 'net';
import fs from 'fs';
import path from 'path';
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

class PrinterConnectionFixer {
  constructor() {
    this.config = {
      ip: '192.168.1.100',
      port: 9100,
      width: 48,
      timeout: 5000
    };
    this.workingConfig = null;
  }

  async runFix() {
    logSection('THERMAL PRINTER CONNECTION FIX TOOL');
    log('This tool will help fix your thermal printer connection issues.', 'bright');
    
    try {
      await this.detectPrinter();
      await this.testConnection();
      await this.updateNqlixConfig();
      await this.verifyFix();
    } catch (error) {
      logError(`Fix process failed: ${error.message}`);
    }
  }

  async detectPrinter() {
    logSection('DETECTING PRINTER');
    
    // Common printer IPs to test
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

    // Add local ranges to test list
    localRanges.forEach(range => {
      for (let i = 1; i <= 254; i++) {
        commonIPs.push(`${range}${i}`);
      }
    });

    logInfo('Scanning for thermal printers...');
    
    for (const ip of commonIPs) {
      const isReachable = await this.testPort(ip, 9100);
      if (isReachable) {
        logSuccess(`Found printer at ${ip}:9100`);
        this.workingConfig = { ip, port: 9100, width: 48, timeout: 5000 };
        return;
      }
    }

    // Try alternative ports
    logInfo('Trying alternative ports...');
    for (const ip of commonIPs.slice(0, 20)) { // Limit to first 20 IPs for performance
      for (const port of [9101, 9102, 9103, 23, 80]) {
        const isReachable = await this.testPort(ip, port);
        if (isReachable) {
          logSuccess(`Found printer at ${ip}:${port}`);
          this.workingConfig = { ip, port, width: 48, timeout: 5000 };
          return;
        }
      }
    }

    logError('No printer found on the network');
    logInfo('Please check:');
    logInfo('1. Printer is powered on');
    logInfo('2. Ethernet cable is connected');
    logInfo('3. Printer and computer are on the same network');
    logInfo('4. Printer IP configuration');
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

  async testConnection() {
    if (!this.workingConfig) {
      logError('No working printer configuration found');
      return;
    }

    logSection('TESTING CONNECTION');
    logInfo(`Testing connection to ${this.workingConfig.ip}:${this.workingConfig.port}`);

    try {
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        width: this.workingConfig.width,
        interface: `tcp://${this.workingConfig.ip}:${this.workingConfig.port}`,
        characterSet: CharacterSet.PC852_LATIN2,
        removeSpecialCharacters: false,
        lineCharacter: "=",
        breakLine: BreakLine.WORD,
        options: {
          timeout: this.workingConfig.timeout
        }
      });

      const isConnected = await printer.isPrinterConnected();
      if (isConnected) {
        logSuccess('Printer connection successful!');
        
        // Test basic printing
        logInfo('Testing basic printing...');
        printer.clear();
        printer.alignCenter();
        printer.bold(true);
        printer.println("CONNECTION TEST");
        printer.bold(false);
        printer.drawLine();
        printer.alignLeft();
        printer.println("Date: " + new Date().toLocaleString());
        printer.println("Status: Connection successful");
        printer.println(`IP: ${this.workingConfig.ip}`);
        printer.println(`Port: ${this.workingConfig.port}`);
        printer.drawLine();
        printer.alignCenter();
        printer.println("Test completed!");
        printer.cut();
        
        await printer.execute();
        logSuccess('Test print completed successfully!');
      } else {
        logError('Printer is not responding');
      }
    } catch (error) {
      logError(`Connection test failed: ${error.message}`);
    }
  }

  async updateNqlixConfig() {
    if (!this.workingConfig) {
      logWarning('No working configuration to update');
      return;
    }

    logSection('UPDATING NQLIX CONFIGURATION');
    
    try {
      // Update Rust configuration
      await this.updateRustConfig();
      
      // Update TypeScript configuration
      await this.updateTypeScriptConfig();
      
      // Create configuration file
      await this.createConfigFile();
      
      logSuccess('Nqlix configuration updated successfully!');
    } catch (error) {
      logError(`Failed to update configuration: ${error.message}`);
    }
  }

  async updateRustConfig() {
    logInfo('Updating Rust printer configuration...');
    
    const rustConfigPath = path.join(process.cwd(), 'src-tauri', 'src', 'printer.rs');
    
    if (fs.existsSync(rustConfigPath)) {
      let content = fs.readFileSync(rustConfigPath, 'utf8');
      
      // Update default IP
      content = content.replace(
        /ip: "[\d\.]+"/,
        `ip: "${this.workingConfig.ip}"`
      );
      
      // Update default port
      content = content.replace(
        /port: \d+/,
        `port: ${this.workingConfig.port}`
      );
      
      fs.writeFileSync(rustConfigPath, content);
      logSuccess('Rust configuration updated');
    } else {
      logWarning('Rust configuration file not found');
    }
  }

  async updateTypeScriptConfig() {
    logInfo('Updating TypeScript printer configuration...');
    
    const tsConfigPath = path.join(process.cwd(), 'src', 'services', 'thermalPrinterService.ts');
    
    if (fs.existsSync(tsConfigPath)) {
      let content = fs.readFileSync(tsConfigPath, 'utf8');
      
      // Update default IP
      content = content.replace(
        /ip: '[\d\.]+'/,
        `ip: '${this.workingConfig.ip}'`
      );
      
      // Update default port
      content = content.replace(
        /port: \d+/,
        `port: ${this.workingConfig.port}`
      );
      
      fs.writeFileSync(tsConfigPath, content);
      logSuccess('TypeScript configuration updated');
    } else {
      logWarning('TypeScript configuration file not found');
    }
  }

  async createConfigFile() {
    logInfo('Creating printer configuration file...');
    
    const config = {
      printer: {
        ip: this.workingConfig.ip,
        port: this.workingConfig.port,
        width: this.workingConfig.width,
        timeout: this.workingConfig.timeout,
        type: 'EPSON',
        characterSet: 'PC852_LATIN2'
      },
      lastUpdated: new Date().toISOString(),
      status: 'working'
    };
    
    logInfo('Printer configuration is now managed via environment variables');
    logInfo('Use the setup scripts to configure printer settings:');
    logInfo('- Windows: setup-printer-env-windows.bat or setup-printer-env-windows.ps1');
    logInfo('- Linux: setup-printer-env-linux.sh');
    logSuccess('Environment variable configuration approach enabled');
  }

  async verifyFix() {
    logSection('VERIFYING FIX');
    
    if (!this.workingConfig) {
      logError('No working configuration to verify');
      return;
    }

    logInfo('Verifying printer connection...');
    
    try {
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        width: this.workingConfig.width,
        interface: `tcp://${this.workingConfig.ip}:${this.workingConfig.port}`,
        characterSet: CharacterSet.PC852_LATIN2,
        removeSpecialCharacters: false,
        lineCharacter: "=",
        breakLine: BreakLine.WORD,
        options: {
          timeout: this.workingConfig.timeout
        }
      });

      const isConnected = await printer.isPrinterConnected();
      if (isConnected) {
        logSuccess('✅ Printer connection verified!');
        logInfo('Configuration summary:');
        logInfo(`  IP Address: ${this.workingConfig.ip}`);
        logInfo(`  Port: ${this.workingConfig.port}`);
        logInfo(`  Width: ${this.workingConfig.width} characters`);
        logInfo(`  Timeout: ${this.workingConfig.timeout}ms`);
        
        logInfo('\nNext steps:');
        logInfo('1. Restart the Nqlix application');
        logInfo('2. Test printing from the application');
        logInfo('3. Check the printer configuration in the app settings');
      } else {
        logError('❌ Printer connection verification failed');
      }
    } catch (error) {
      logError(`Verification failed: ${error.message}`);
    }
  }
}

// Run the fix
if (import.meta.url === `file://${process.argv[1]}`) {
  const fixer = new PrinterConnectionFixer();
  fixer.runFix().catch(console.error);
}

export default PrinterConnectionFixer;