# Test direct printing functionality
Write-Host "🧪 Testing Direct Print Functionality" -ForegroundColor Cyan

# Test Printer 1
Write-Host "`n🖨️ Testing Printer 1 (192.168.192.10:9100)" -ForegroundColor Yellow
& ".\scripts\simple-print.ps1" -PrinterIP "192.168.192.10" -PrinterPort 9100 -Content "TEST PRINTER 1`nDirect TCP Print`n$(Get-Date)"

# Test Printer 2  
Write-Host "`n🖨️ Testing Printer 2 (192.168.192.11:9100)" -ForegroundColor Yellow
& ".\scripts\simple-print.ps1" -PrinterIP "192.168.192.11" -PrinterPort 9100 -Content "TEST PRINTER 2`nDirect TCP Print`n$(Get-Date)"

# Test Printer 3
Write-Host "`n🖨️ Testing Printer 3 (192.168.192.12:9100)" -ForegroundColor Yellow
& ".\scripts\simple-print.ps1" -PrinterIP "192.168.192.12" -PrinterPort 9100 -Content "TEST PRINTER 3`nDirect TCP Print`n$(Get-Date)"

Write-Host "`n✅ All print tests completed!" -ForegroundColor Green