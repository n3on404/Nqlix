## Printer Environment Configuration (Windows PowerShell)

Use these PowerShell commands to configure the thermal printer for the desktop app. Run PowerShell as Administrator to set system-wide (Machine) variables.

### Set Variables (System-wide)
```powershell
[Environment]::SetEnvironmentVariable("PRINTER_IP",      "192.168.192.10", "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_PORT",    "9100",           "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_NAME",    "Imprimante Thermique", "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_WIDTH",   "48",             "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_TIMEOUT", "5000",           "Machine")
[Environment]::SetEnvironmentVariable("PRINTER_MODEL",   "TM-T20X",        "Machine")
```

### Example: Change Printer IP
```powershell
[Environment]::SetEnvironmentVariable("PRINTER_IP", "192.168.192.12", "Machine")
```

### Verify Current Values
```powershell
$env:PRINTER_IP
$env:PRINTER_PORT
$env:PRINTER_NAME
$env:PRINTER_WIDTH
$env:PRINTER_TIMEOUT
$env:PRINTER_MODEL
```

#### Quick verify (IP only)
```powershell
Write-Host ("PRINTER_IP = " + $env:PRINTER_IP)
```

If you just changed values in this PowerShell window, you may need to re-open PowerShell for `$env:*` to reflect the new values. The desktop app reads system values at runtime; fully close and reopen the app after changes.

### Optional: User-only Scope
If you prefer to set variables only for the current user, replace `"Machine"` with `"User"`.
```powershell
[Environment]::SetEnvironmentVariable("PRINTER_IP", "192.168.192.12", "User")
```

