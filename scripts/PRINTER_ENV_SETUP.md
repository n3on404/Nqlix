# Printer Environment Variables Setup

This directory contains scripts to set up printer environment variables for the Nqlix application. The printer configuration is now managed through environment variables instead of a configuration file.

## Environment Variables

The following environment variables are used to configure the thermal printer:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `PRINTER_IP` | `192.168.192.10` | IP address of the thermal printer |
| `PRINTER_PORT` | `9100` | Port number (usually 9100 for Epson printers) |
| `PRINTER_NAME` | `Imprimante Thermique` | Display name for the printer |
| `PRINTER_WIDTH` | `48` | Paper width in characters |
| `PRINTER_TIMEOUT` | `5000` | Connection timeout in milliseconds |
| `PRINTER_MODEL` | `TM-T20X` | Printer model identifier |

## Setup Scripts

### Windows

#### Option 1: Batch Script (Recommended for simple setup)
```cmd
# Run as Administrator for system-wide variables
setup-printer-env-windows.bat
```

#### Option 2: PowerShell Script (Recommended for advanced users)
```powershell
# Run as Administrator for system-wide variables
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\setup-printer-env-windows.ps1
```

### Linux

```bash
# Run as root for system-wide variables, or as user for user variables
sudo ./setup-printer-env-linux.sh
```

## Manual Setup

### Windows

#### System-wide (requires Administrator):
```cmd
setx PRINTER_IP "192.168.192.10" /M
setx PRINTER_PORT "9100" /M
setx PRINTER_NAME "Imprimante Thermique" /M
setx PRINTER_WIDTH "48" /M
setx PRINTER_TIMEOUT "5000" /M
setx PRINTER_MODEL "TM-T20X" /M
```

#### User-only:
```cmd
setx PRINTER_IP "192.168.192.10"
setx PRINTER_PORT "9100"
setx PRINTER_NAME "Imprimante Thermique"
setx PRINTER_WIDTH "48"
setx PRINTER_TIMEOUT "5000"
setx PRINTER_MODEL "TM-T20X"
```

#### PowerShell:
```powershell
[Environment]::SetEnvironmentVariable("PRINTER_IP", "192.168.192.10", "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_PORT", "9100", "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_NAME", "Imprimante Thermique", "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_WIDTH", "48", "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_TIMEOUT", "5000", "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_MODEL", "TM-T20X", "Machine")
```

### Linux

#### System-wide (requires root):
```bash
# Add to /etc/environment
echo 'PRINTER_IP="192.168.192.10"' >> /etc/environment
echo 'PRINTER_PORT="9100"' >> /etc/environment
echo 'PRINTER_NAME="Imprimante Thermique"' >> /etc/environment
echo 'PRINTER_WIDTH="48"' >> /etc/environment
echo 'PRINTER_TIMEOUT="5000"' >> /etc/environment
echo 'PRINTER_MODEL="TM-T20X"' >> /etc/environment

# Add to /etc/profile.d/printer-env.sh
cat > /etc/profile.d/printer-env.sh << 'EOF'
export PRINTER_IP="192.168.192.10"
export PRINTER_PORT="9100"
export PRINTER_NAME="Imprimante Thermique"
export PRINTER_WIDTH="48"
export PRINTER_TIMEOUT="5000"
export PRINTER_MODEL="TM-T20X"
EOF

chmod +x /etc/profile.d/printer-env.sh
```

#### User-only:
```bash
# Add to ~/.bashrc
echo 'export PRINTER_IP="192.168.192.10"' >> ~/.bashrc
echo 'export PRINTER_PORT="9100"' >> ~/.bashrc
echo 'export PRINTER_NAME="Imprimante Thermique"' >> ~/.bashrc
echo 'export PRINTER_WIDTH="48"' >> ~/.bashrc
echo 'export PRINTER_TIMEOUT="5000"' >> ~/.bashrc
echo 'export PRINTER_MODEL="TM-T20X"' >> ~/.bashrc

# Reload the configuration
source ~/.bashrc
```

## Verification

### Windows
```cmd
echo %PRINTER_IP%
echo %PRINTER_PORT%
echo %PRINTER_NAME%
echo %PRINTER_WIDTH%
echo %PRINTER_TIMEOUT%
echo %PRINTER_MODEL%
```

### PowerShell
```powershell
$env:PRINTER_IP
$env:PRINTER_PORT
$env:PRINTER_NAME
$env:PRINTER_WIDTH
$env:PRINTER_TIMEOUT
$env:PRINTER_MODEL
```

### Linux
```bash
echo $PRINTER_IP
echo $PRINTER_PORT
echo $PRINTER_NAME
echo $PRINTER_WIDTH
echo $PRINTER_TIMEOUT
echo $PRINTER_MODEL
```

## Troubleshooting

### Variables not taking effect
1. **Restart the application** - Environment variables are read at startup
2. **Restart your terminal/command prompt** - New variables may not be visible in current session
3. **Check the scope** - Make sure you're setting variables for the correct user/system scope
4. **Verify the syntax** - Ensure there are no typos in variable names or values

### Common Issues

#### Windows
- **"Access Denied"**: Run as Administrator for system-wide variables
- **Variables not visible**: Restart Command Prompt or PowerShell
- **PowerShell execution policy**: Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

#### Linux
- **Permission denied**: Use `sudo` for system-wide variables
- **Variables not loaded**: Run `source ~/.bashrc` or restart terminal
- **Wrong shell**: Make sure you're using bash (not zsh, fish, etc.)

## Customization

To use different printer settings, modify the values in the scripts or set the environment variables manually:

```bash
# Example: Different printer IP
export PRINTER_IP="192.168.1.100"
export PRINTER_PORT="9100"
export PRINTER_NAME="Station Printer"
```

## Notes

- The application will use default values if environment variables are not set
- Changes to environment variables require an application restart
- System-wide variables affect all users on the system
- User variables only affect the current user
- The scripts automatically detect if they're running with appropriate privileges