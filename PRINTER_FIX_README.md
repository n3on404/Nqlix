# Thermal Printer Fix Tools for Nqlix

This directory contains tools to diagnose and fix thermal printer connection issues with the Nqlix application.

## Quick Start

### For Windows Users (Easiest)
1. **Double-click** `fix-printer-windows.bat`
2. Choose option **4** (Run all diagnostics)
3. Follow the on-screen instructions

### For Command Line Users
```bash
# 1. Diagnose the issue
node scripts/diagnose-printer.js

# 2. Auto-fix the connection
node scripts/fix-printer-connection.js

# 3. Test all functions
node scripts/test-printer-windows.js
```

### For PowerShell Users (Advanced)
```powershell
# Run as Administrator for best results
.\scripts\printer-diagnostics.ps1 -All
```

## Tools Overview

### 1. `diagnose-printer.js`
**Purpose:** Comprehensive printer diagnostic tool
**What it does:**
- Scans your network for thermal printers
- Tests printer connectivity
- Identifies common issues
- Provides detailed recommendations

**Usage:**
```bash
node scripts/diagnose-printer.js
```

### 2. `fix-printer-connection.js`
**Purpose:** Automatically fixes printer connection issues
**What it does:**
- Detects your printer automatically
- Updates Nqlix configuration files
- Tests the connection
- Verifies the fix

**Usage:**
```bash
node scripts/fix-printer-connection.js
```

### 3. `test-printer-windows.js`
**Purpose:** Tests all printer functionality
**What it does:**
- Tests basic printing
- Tests all ticket types (booking, entry, exit, day pass)
- Tests barcode printing
- Verifies printer is working correctly

**Usage:**
```bash
node scripts/test-printer-windows.js
```

### 4. `fix-printer-windows.bat`
**Purpose:** Windows batch file for easy execution
**What it does:**
- Provides a menu interface
- Runs all diagnostic tools
- No command line knowledge required

**Usage:**
- Double-click the file
- Choose from the menu options

### 5. `printer-diagnostics.ps1`
**Purpose:** Advanced PowerShell diagnostic tool
**What it does:**
- Network scanning
- Advanced connectivity testing
- Configuration fixing
- Detailed reporting

**Usage:**
```powershell
# Run as Administrator
.\scripts\printer-diagnostics.ps1 -All
```

## Common Issues and Solutions

### Issue: "Printer not connected"
**Solution:**
1. Run `node scripts/diagnose-printer.js`
2. Check if your printer IP is correct
3. Update the IP in Nqlix settings

### Issue: "Connection timeout"
**Solution:**
1. Check if printer is powered on
2. Verify Ethernet cable connection
3. Check Windows firewall settings
4. Try increasing timeout in Nqlix settings

### Issue: "No printers found"
**Solution:**
1. Ensure printer is on the same network
2. Check printer IP configuration
3. Try connecting printer via USB first
4. Restart the printer

### Issue: "Print jobs not executing"
**Solution:**
1. Check if paper is loaded
2. Verify printer is not in error state
3. Test with `node scripts/test-printer-windows.js`
4. Check printer settings

## Configuration Files

The tools will create/update these files:
- Environment variables - Printer configuration (PRINTER_IP, PRINTER_PORT, etc.)
- `src-tauri/src/printer.rs` - Rust configuration
- `src/services/thermalPrinterService.ts` - TypeScript configuration

## Troubleshooting Steps

### Step 1: Basic Checks
1. ✅ Printer is powered on
2. ✅ Ethernet cable connected
3. ✅ Printer and computer on same network
4. ✅ No error lights on printer

### Step 2: Network Test
```bash
# Test if printer is reachable
ping 192.168.1.100

# Test printer port
telnet 192.168.1.100 9100
```

### Step 3: Run Diagnostics
```bash
# Run comprehensive diagnostic
node scripts/diagnose-printer.js
```

### Step 4: Auto-Fix
```bash
# Let the tool fix the configuration
node scripts/fix-printer-connection.js
```

### Step 5: Test Printing
```bash
# Test all printer functions
node scripts/test-printer-windows.js
```

## Advanced Configuration

### Manual IP Configuration
If you know your printer's IP address:
1. Open Nqlix application
2. Go to Settings > Printer Configuration
3. Update IP address and port
4. Test connection

### Firewall Configuration
```cmd
# Add firewall rule for printer port
netsh advfirewall firewall add rule name="Thermal Printer" dir=in action=allow protocol=TCP localport=9100
```

### Network Troubleshooting
```bash
# Check network configuration
ipconfig /all

# Flush DNS cache
ipconfig /flushdns

# Renew IP address
ipconfig /renew
```

## Support

If you're still having issues:

1. **Collect diagnostic information:**
   ```bash
   node scripts/diagnose-printer.js > printer-diagnostic.txt
   ```

2. **Check the detailed troubleshooting guide:**
   - `PRINTER_TROUBLESHOOTING.md`

3. **Include the following information:**
   - Operating system version
   - Printer model and IP address
   - Error messages from console
   - Diagnostic output

## File Structure

```
scripts/
├── diagnose-printer.js          # Main diagnostic tool
├── fix-printer-connection.js    # Auto-fix tool
├── test-printer-windows.js      # Functionality test
├── fix-printer-windows.bat      # Windows batch file
└── printer-diagnostics.ps1      # PowerShell tool

docs/
├── PRINTER_TROUBLESHOOTING.md   # Detailed troubleshooting guide
└── PRINTER_FIX_README.md        # This file
```

## Requirements

- Node.js 14+ installed
- Thermal printer connected via Ethernet
- Windows 10/11 (for batch and PowerShell scripts)
- Administrator privileges (for some operations)

---

**Note:** These tools are designed to work with Epson TM-T20X thermal printers, but should work with other Epson-compatible thermal printers as well.