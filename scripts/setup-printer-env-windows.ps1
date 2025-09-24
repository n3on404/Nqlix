# Setup script for printer environment variables on Windows (PowerShell)
# Run this script as Administrator for system-wide variables, or as regular user for user variables

Write-Host "Setting up printer environment variables for Windows..." -ForegroundColor Green
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if ($isAdmin) {
    Write-Host "Running as Administrator - setting system-wide environment variables" -ForegroundColor Yellow
    $scope = "Machine"
} else {
    Write-Host "WARNING: Not running as Administrator" -ForegroundColor Yellow
    Write-Host "Environment variables will be set for current user only" -ForegroundColor Yellow
    Write-Host "For system-wide variables, run this script as Administrator" -ForegroundColor Yellow
    Write-Host ""
    $scope = "User"
}

# Function to set environment variable
function Set-PrinterEnvVar {
    param(
        [string]$Name,
        [string]$Value,
        [string]$Scope
    )
    
    try {
        [Environment]::SetEnvironmentVariable($Name, $Value, $Scope)
        Write-Host "✓ $Name set to $Value" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "✗ Failed to set $Name : $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Set printer environment variables
Write-Host "Setting PRINTER_IP..."
Set-PrinterEnvVar "PRINTER_IP" "192.168.192.10" $scope

Write-Host "Setting PRINTER_PORT..."
Set-PrinterEnvVar "PRINTER_PORT" "9100" $scope

Write-Host "Setting PRINTER_NAME..."
Set-PrinterEnvVar "PRINTER_NAME" "Imprimante Thermique" $scope

Write-Host "Setting PRINTER_WIDTH..."
Set-PrinterEnvVar "PRINTER_WIDTH" "48" $scope

Write-Host "Setting PRINTER_TIMEOUT..."
Set-PrinterEnvVar "PRINTER_TIMEOUT" "5000" $scope

Write-Host "Setting PRINTER_MODEL..."
Set-PrinterEnvVar "PRINTER_MODEL" "TM-T20X" $scope

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Environment variables setup complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Current printer configuration:" -ForegroundColor White
Write-Host "- IP: 192.168.192.10" -ForegroundColor Gray
Write-Host "- Port: 9100" -ForegroundColor Gray
Write-Host "- Name: Imprimante Thermique" -ForegroundColor Gray
Write-Host "- Width: 48 characters" -ForegroundColor Gray
Write-Host "- Timeout: 5000ms" -ForegroundColor Gray
Write-Host "- Model: TM-T20X" -ForegroundColor Gray
Write-Host ""
Write-Host "IMPORTANT: You need to restart the application for changes to take effect." -ForegroundColor Yellow
Write-Host "You may also need to restart your PowerShell or Command Prompt." -ForegroundColor Yellow
Write-Host ""
Write-Host "To modify these values later, you can:" -ForegroundColor White
Write-Host "1. Run this script again with different values" -ForegroundColor Gray
Write-Host "2. Use System Properties > Environment Variables" -ForegroundColor Gray
Write-Host "3. Use PowerShell: [Environment]::SetEnvironmentVariable('PRINTER_IP', 'new_value', '$scope')" -ForegroundColor Gray
Write-Host ""
Write-Host "To verify the variables are set, run:" -ForegroundColor White
Write-Host "`$env:PRINTER_IP" -ForegroundColor Gray
Write-Host "`$env:PRINTER_PORT" -ForegroundColor Gray
Write-Host "`$env:PRINTER_NAME" -ForegroundColor Gray
Write-Host "`$env:PRINTER_WIDTH" -ForegroundColor Gray
Write-Host "`$env:PRINTER_TIMEOUT" -ForegroundColor Gray
Write-Host "`$env:PRINTER_MODEL" -ForegroundColor Gray
Write-Host ""

# Ask if user wants to verify the variables
$verify = Read-Host "Would you like to verify the environment variables now? (y/n)"
if ($verify -eq "y" -or $verify -eq "Y") {
    Write-Host ""
    Write-Host "Current environment variables:" -ForegroundColor White
    Write-Host "PRINTER_IP: $($env:PRINTER_IP)" -ForegroundColor Gray
    Write-Host "PRINTER_PORT: $($env:PRINTER_PORT)" -ForegroundColor Gray
    Write-Host "PRINTER_NAME: $($env:PRINTER_NAME)" -ForegroundColor Gray
    Write-Host "PRINTER_WIDTH: $($env:PRINTER_WIDTH)" -ForegroundColor Gray
    Write-Host "PRINTER_TIMEOUT: $($env:PRINTER_TIMEOUT)" -ForegroundColor Gray
    Write-Host "PRINTER_MODEL: $($env:PRINTER_MODEL)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")