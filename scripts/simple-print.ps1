# Simple, bulletproof print script for Windows
param(
    [Parameter(Mandatory=$true)]
    [string]$PrinterIP,
    
    [Parameter(Mandatory=$true)]
    [int]$PrinterPort,
    
    [Parameter(Mandatory=$true)]
    [string]$Content
)

Write-Host "🖨️ Printing to $PrinterIP`:$PrinterPort" -ForegroundColor Cyan
Write-Host "📄 Content: $Content" -ForegroundColor Yellow

try {
    # Create TCP connection
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.Connect($PrinterIP, $PrinterPort)
    
    if ($tcpClient.Connected) {
        Write-Host "✅ Connected to printer successfully" -ForegroundColor Green
        
        $stream = $tcpClient.GetStream()
        
        # Send ESC/POS commands
        $commands = @()
        $commands += [byte]0x1B  # ESC
        $commands += [byte]0x40  # Initialize printer
        $commands += [byte]0x1B  # ESC
        $commands += [byte]0x61  # Alignment
        $commands += [byte]0x01  # Center
        
        # Add content
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($Content)
        $commands += $contentBytes
        
        # Add line feeds and cut
        $commands += [byte]0x0A  # Line feed
        $commands += [byte]0x0A  # Line feed
        $commands += [byte]0x0A  # Line feed
        $commands += [byte]0x0A  # Line feed
        $commands += [byte]0x0A  # Line feed
        $commands += [byte]0x1D  # GS
        $commands += [byte]0x56  # Cut
        $commands += [byte]0x00  # Full cut
        
        # Send data
        $stream.Write($commands, 0, $commands.Length)
        $stream.Flush()
        
        Write-Host "✅ Print job sent successfully!" -ForegroundColor Green
        Write-Host "📊 Sent $($commands.Length) bytes" -ForegroundColor Cyan
        
        $stream.Close()
        $tcpClient.Close()
        
        exit 0
    } else {
        Write-Host "❌ Failed to connect to printer" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Print error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "🔍 Error details: $($_.Exception)" -ForegroundColor Red
    exit 1
}