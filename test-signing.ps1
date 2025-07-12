# Test signing script
$privateKey = "dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5eC9YYitOQ0luYkovdUI5YzdFSUJrVGRDNTdLVGJvdzUxRnNuaWxvSVBvTUFBQkFBQUFBQUFBQUFBQUlBQUFBQVJWMUZqV3NTNy9GM25kaTdCTDA5cjAyWjVBMmxWWWhEZUIvalAyZjYrYi9MWTl6ZFpwWm0zR25LeVkwOTJLTTJnOHpJdzFuZUNDWkUrK1ROZnNoY0hRbklOc0lRYU1pdHJEbXdTTDFDVVlBdGVvZk5mYUNTQ2ptYzJOV2V6cUQ4NVhyeFN1aUtEWDg9Cg=="

Write-Host "Testing Tauri signing..." -ForegroundColor Green
Write-Host "Private key length: $($privateKey.Length) characters" -ForegroundColor Yellow

# Create a test file
"test content" | Out-File -FilePath "test.txt" -Encoding utf8

# Try to sign the test file
Write-Host "Signing test.txt..." -ForegroundColor Yellow
pnpm tauri signer sign --private-key $privateKey test.txt

# Check if .sig file was created
if (Test-Path "test.txt.sig") {
    Write-Host "✅ Success! Signature file created: test.txt.sig" -ForegroundColor Green
    Get-Content "test.txt.sig" | Write-Host -ForegroundColor Gray
} else {
    Write-Host "❌ Failed to create signature file" -ForegroundColor Red
}

# Clean up
Remove-Item "test.txt" -ErrorAction SilentlyContinue
Remove-Item "test.txt.sig" -ErrorAction SilentlyContinue 