# Thermal Printer Troubleshooting Guide for Nqlix

## Quick Fix Commands

### 1. Run Diagnostic Tool
```bash
node scripts/diagnose-printer.js
```

### 2. Auto-Fix Connection
```bash
node scripts/fix-printer-connection.js
```

### 3. Test All Printer Functions
```bash
node scripts/test-printer-windows.js
```

## Common Issues and Solutions

### Issue 1: Printer Not Found
**Symptoms:**
- "Printer not connected" error
- No response from printer
- Connection timeout

**Solutions:**
1. **Check Physical Connection:**
   - Ensure printer is powered on
   - Verify Ethernet cable is connected
   - Check if printer shows network activity (LEDs)

2. **Check Network Configuration:**
   ```bash
   # Test if printer is reachable
   ping 192.168.1.100
   
   # Test specific port
   telnet 192.168.1.100 9100
   ```

3. **Find Printer IP:**
   ```bash
   # Run diagnostic to find printer
   node scripts/diagnose-printer.js
   ```

4. **Update Printer IP in Nqlix:**
   - Open Nqlix application
   - Go to Settings > Printer Configuration
   - Update IP address to match your printer

### Issue 2: Connection Timeout
**Symptoms:**
- "Connection timeout" error
- Printer responds to ping but not to print commands
- Intermittent connection issues

**Solutions:**
1. **Check Firewall Settings:**
   ```bash
   # Windows: Check if port 9100 is blocked
   netsh advfirewall firewall show rule name="Printer Port 9100"
   
   # Add firewall rule if needed
   netsh advfirewall firewall add rule name="Printer Port 9100" dir=in action=allow protocol=TCP localport=9100
   ```

2. **Increase Timeout:**
   - In Nqlix settings, increase timeout to 10000ms
   - Check if printer is busy with other print jobs

3. **Check Printer Status:**
   - Ensure printer is not in error state
   - Check if paper is loaded
   - Verify printer is not in sleep mode

### Issue 3: Print Jobs Not Executing
**Symptoms:**
- Connection successful but no printing
- Print job sent but nothing comes out
- Printer makes noise but no paper output

**Solutions:**
1. **Check Paper and Ribbon:**
   - Ensure thermal paper is loaded correctly
   - Check if paper is jammed
   - Verify paper is not upside down

2. **Test Basic Printing:**
   ```bash
   # Run basic print test
   node scripts/test-printer-windows.js
   ```

3. **Check Printer Settings:**
   - Verify printer is set to thermal mode
   - Check paper size settings
   - Ensure printer is not in test mode

### Issue 4: Incorrect Print Format
**Symptoms:**
- Text appears garbled
- Wrong character encoding
- Text cut off or misaligned

**Solutions:**
1. **Check Character Encoding:**
   - Ensure printer is set to PC852_LATIN2
   - Try different character sets if needed

2. **Check Paper Width:**
   - Verify width setting matches your paper (usually 48 characters)
   - Adjust width in printer configuration

3. **Test Different Formats:**
   ```bash
   # Test all ticket types
   node scripts/test-printer-windows.js
   ```

### Issue 5: Barcode Issues
**Symptoms:**
- Barcodes not printing
- Barcodes appear as text
- Barcode scanner can't read printed codes

**Solutions:**
1. **Check Barcode Format:**
   - Ensure barcode data is valid
   - Use Code128 format for best compatibility
   - Avoid special characters in barcode data

2. **Test Barcode Printing:**
   ```bash
   # Test barcode functionality
   node scripts/test-printer-windows.js
   ```

3. **Check Printer Capabilities:**
   - Verify printer supports barcode printing
   - Check if barcode module is enabled

## Windows-Specific Issues

### Issue 6: Windows Firewall Blocking
**Symptoms:**
- Connection works on some computers but not others
- Intermittent connection issues
- "Access denied" errors

**Solutions:**
1. **Add Firewall Exception:**
   ```cmd
   netsh advfirewall firewall add rule name="Thermal Printer" dir=in action=allow protocol=TCP localport=9100
   ```

2. **Check Windows Defender:**
   - Add Nqlix application to exclusions
   - Disable real-time protection temporarily for testing

3. **Check Antivirus Software:**
   - Add printer IP to trusted devices
   - Disable network protection temporarily

### Issue 7: Network Configuration Issues
**Symptoms:**
- Printer works with some devices but not others
- IP address changes frequently
- Connection lost after network changes

**Solutions:**
1. **Set Static IP for Printer:**
   - Configure printer with static IP address
   - Use IP outside DHCP range (e.g., 192.168.1.200)

2. **Check Network Subnet:**
   - Ensure printer and computer are on same subnet
   - Check subnet mask settings

3. **Update Network Configuration:**
   ```bash
   # Flush DNS cache
   ipconfig /flushdns
   
   # Renew IP address
   ipconfig /renew
   ```

## Advanced Troubleshooting

### Network Scanning
```bash
# Scan for all devices on network
nmap -p 9100 192.168.1.0/24

# Scan specific IP range
nmap -p 9100,9101,9102 192.168.1.100-200
```

### Printer Configuration Reset
```bash
# Reset printer to factory defaults
# (Check printer manual for specific procedure)
```

### Test Different Ports
```bash
# Test common printer ports
telnet 192.168.1.100 9100
telnet 192.168.1.100 9101
telnet 192.168.1.100 9102
telnet 192.168.1.100 23
```

## Configuration Files

### Printer Configuration
Location: Environment variables (PRINTER_IP, PRINTER_PORT, etc.)
```json
{
  "printer": {
    "ip": "192.168.1.100",
    "port": 9100,
    "width": 48,
    "timeout": 5000,
    "type": "EPSON",
    "characterSet": "PC852_LATIN2"
  },
  "lastUpdated": "2024-01-01T00:00:00.000Z",
  "status": "working"
}
```

### Environment Variables
```bash
# Set printer IP
set PRINTER_IP=192.168.1.100
set PRINTER_PORT=9100
set PRINTER_TIMEOUT=5000
```

## Log Files

### Application Logs
- Check browser console for errors
- Look for printer-related error messages
- Check network connection logs

### System Logs
```bash
# Windows Event Viewer
eventvwr.msc

# Check for printer-related events
# Windows Logs > System
# Look for printer service events
```

## Contact Support

If you're still experiencing issues:

1. **Collect Diagnostic Information:**
   ```bash
   node scripts/diagnose-printer.js > printer-diagnostic.txt
   ```

2. **Include the following information:**
   - Operating system version
   - Printer model and IP address
   - Error messages from console
   - Network configuration details
   - Diagnostic output

3. **Test with Different Printer:**
   - Try with another thermal printer if available
   - Test with USB connection if possible

## Prevention

### Regular Maintenance
1. **Keep Printer Firmware Updated:**
   - Check manufacturer website for updates
   - Update printer firmware regularly

2. **Monitor Network Stability:**
   - Use static IP addresses for printers
   - Monitor network connectivity
   - Keep network equipment updated

3. **Regular Testing:**
   ```bash
   # Run monthly printer tests
   node scripts/test-printer-windows.js
   ```

### Best Practices
1. **Use Static IP Addresses:**
   - Configure printer with static IP
   - Use IP outside DHCP range
   - Document IP addresses

2. **Network Segmentation:**
   - Use dedicated network for printers
   - Implement VLAN for printer traffic
   - Monitor network traffic

3. **Backup Configuration:**
   - Save printer configuration files
   - Document network settings
   - Keep configuration backups

---

**Note:** This guide covers the most common thermal printer issues with Nqlix. For specific printer models, consult the manufacturer's documentation.