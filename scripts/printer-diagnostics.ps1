# Nqlix Thermal Printer Diagnostics PowerShell Script
# Run this script as Administrator for best results

param(
    [string]$PrinterIP = "",
    [switch]$ScanNetwork = $false,
    [switch]$TestConnection = $false,
    [switch]$FixConfiguration = $false,
    [switch]$All = $false
)

# Color functions
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    } else {
        $input | Write-Output
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Success($message) {
    Write-ColorOutput Green "✅ $message"
}

function Write-Error($message) {
    Write-ColorOutput Red "❌ $message"
}

function Write-Warning($message) {
    Write-ColorOutput Yellow "⚠️  $message"
}

function Write-Info($message) {
    Write-ColorOutput Blue "ℹ️  $message"
}

function Write-Section($title) {
    Write-ColorOutput Cyan "`n$('=' * 60)"
    Write-ColorOutput Cyan "  $title"
    Write-ColorOutput Cyan "$('=' * 60)"
}

# Check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Section "NQLIX THERMAL PRINTER DIAGNOSTICS"
Write-Info "This script will help diagnose and fix thermal printer issues"

# Check if running as administrator
if (-not (Test-Administrator)) {
    Write-Warning "This script should be run as Administrator for best results"
    Write-Info "Some network operations may not work without elevated privileges"
}

# Check Node.js installation
Write-Section "CHECKING PREREQUISITES"
try {
    $nodeVersion = node --version
    Write-Success "Node.js found: $nodeVersion"
} catch {
    Write-Error "Node.js not found. Please install Node.js from https://nodejs.org/"
    exit 1
}

# Check if Nqlix scripts exist
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$diagnoseScript = Join-Path $scriptPath "diagnose-printer.js"
$fixScript = Join-Path $scriptPath "fix-printer-connection.js"
$testScript = Join-Path $scriptPath "test-printer-windows.js"

if (-not (Test-Path $diagnoseScript)) {
    Write-Error "Diagnostic script not found: $diagnoseScript"
    exit 1
}

Write-Success "All required scripts found"

# Network scanning function
function Scan-Network {
    Write-Section "NETWORK SCANNING"
    Write-Info "Scanning for thermal printers on the network..."
    
    # Get local network ranges
    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.InterfaceDescription -notlike "*Loopback*" }
    $ranges = @()
    
    foreach ($adapter in $adapters) {
        $ipAddresses = Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4
        foreach ($addr in $ipAddresses) {
            if ($addr.IPAddress -notlike "169.254.*" -and $addr.IPAddress -notlike "127.*") {
                $ip = $addr.IPAddress.Split('.')[0..2] -join '.'
                $ranges += "$ip."
            }
        }
    }
    
    # Common printer IPs
    $commonIPs = @(
        "192.168.1.100", "192.168.0.100", "192.168.192.168",
        "192.168.1.200", "192.168.0.200", "10.0.0.100", "172.16.0.100"
    )
    
    # Add local ranges
    foreach ($range in $ranges) {
        for ($i = 1; $i -le 50; $i++) {
            $commonIPs += "$range$i"
        }
    }
    
    $foundPrinters = @()
    $ports = @(9100, 9101, 9102, 9103, 23, 80)
    
    Write-Info "Testing $($commonIPs.Count) IP addresses on $($ports.Count) ports..."
    
    foreach ($ip in $commonIPs) {
        foreach ($port in $ports) {
            try {
                $tcpClient = New-Object System.Net.Sockets.TcpClient
                $connect = $tcpClient.BeginConnect($ip, $port, $null, $null)
                $wait = $connect.AsyncWaitHandle.WaitOne(1000, $false)
                
                if ($wait) {
                    $tcpClient.EndConnect($connect)
                    Write-Success "Found device at $ip`:$port"
                    $foundPrinters += @{
                        IP = $ip
                        Port = $port
                        Type = Get-PrinterType -Port $port
                    }
                }
                $tcpClient.Close()
            } catch {
                # Connection failed, continue
            }
        }
    }
    
    if ($foundPrinters.Count -gt 0) {
        Write-Success "Found $($foundPrinters.Count) potential printers:"
        foreach ($printer in $foundPrinters) {
            Write-Info "  $($printer.IP):$($printer.Port) - $($printer.Type)"
        }
        return $foundPrinters
    } else {
        Write-Warning "No printers found on the network"
        return $null
    }
}

function Get-PrinterType($Port) {
    switch ($Port) {
        9100 { return "Epson Thermal (Standard)" }
        9101 { return "Epson Thermal (Alt Port 1)" }
        9102 { return "Epson Thermal (Alt Port 2)" }
        9103 { return "Epson Thermal (Alt Port 3)" }
        23 { return "Telnet/Serial" }
        80 { return "HTTP/Web Interface" }
        default { return "Unknown" }
    }
}

function Test-PrinterConnection($IP, $Port) {
    Write-Section "TESTING PRINTER CONNECTION"
    Write-Info "Testing connection to $IP`:$Port"
    
    try {
        # Test basic connectivity
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connect = $tcpClient.BeginConnect($IP, $Port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(5000, $false)
        
        if ($wait) {
            $tcpClient.EndConnect($connect)
            $tcpClient.Close()
            Write-Success "Basic connectivity test passed"
            
            # Test with Node.js script
            Write-Info "Running detailed printer test..."
            $testResult = & node $testScript 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Printer functionality test passed"
                return $true
            } else {
                Write-Error "Printer functionality test failed"
                Write-Info "Test output: $testResult"
                return $false
            }
        } else {
            Write-Error "Connection timeout"
            return $false
        }
    } catch {
        Write-Error "Connection test failed: $($_.Exception.Message)"
        return $false
    }
}

function Fix-PrinterConfiguration($IP, $Port) {
    Write-Section "FIXING PRINTER CONFIGURATION"
    Write-Info "Updating Nqlix configuration for printer at $IP`:$Port"
    
    try {
        # Set environment variables
        $env:PRINTER_IP = $IP
        $env:PRINTER_PORT = $Port
        
        # Run fix script
        Write-Info "Running auto-fix script..."
        $fixResult = & node $fixScript 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Configuration updated successfully"
            return $true
        } else {
            Write-Error "Configuration update failed"
            Write-Info "Fix output: $fixResult"
            return $false
        }
    } catch {
        Write-Error "Configuration fix failed: $($_.Exception.Message)"
        return $false
    }
}

# Main execution
if ($All -or $ScanNetwork) {
    $printers = Scan-Network
    if ($printers) {
        $PrinterIP = $printers[0].IP
        $PrinterPort = $printers[0].Port
        Write-Info "Using first found printer: $PrinterIP`:$PrinterPort"
    }
}

if ($All -or $TestConnection) {
    if ($PrinterIP) {
        $connectionTest = Test-PrinterConnection -IP $PrinterIP -Port $PrinterPort
    } else {
        Write-Warning "No printer IP specified. Run with -ScanNetwork first."
    }
}

if ($All -or $FixConfiguration) {
    if ($PrinterIP) {
        $configFix = Fix-PrinterConfiguration -IP $PrinterIP -Port $PrinterPort
    } else {
        Write-Warning "No printer IP specified. Run with -ScanNetwork first."
    }
}

# Run all if no specific options provided
if (-not ($ScanNetwork -or $TestConnection -or $FixConfiguration -or $All)) {
    Write-Section "RUNNING COMPLETE DIAGNOSTIC"
    Write-Info "No specific options provided. Running complete diagnostic..."
    
    # Run Node.js diagnostic script
    Write-Info "Running comprehensive printer diagnostic..."
    & node $diagnoseScript
    
    Write-Info "`nRunning auto-fix if issues found..."
    & node $fixScript
    
    Write-Info "`nTesting printer functionality..."
    & node $testScript
}

Write-Section "DIAGNOSTIC COMPLETE"
Write-Info "If you're still having issues:"
Write-Info "1. Check the troubleshooting guide: PRINTER_TROUBLESHOOTING.md"
Write-Info "2. Verify your printer is powered on and connected"
Write-Info "3. Check your network connection"
Write-Info "4. Try running: node scripts/diagnose-printer.js"
Write-Info "5. Try running: node scripts/fix-printer-connection.js"

Write-Info "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")