# Tauri Signing Key Setup Script
# This script helps you generate a signing key and set up GitHub secrets

Write-Host "🔐 Tauri Signing Key Setup" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green

# Check if Tauri CLI is installed
try {
    $tauriVersion = pnpm tauri --version
    Write-Host "✅ Tauri CLI found: $tauriVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Tauri CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   pnpm add -D @tauri-apps/cli" -ForegroundColor Yellow
    exit 1
}

# Generate signing key
Write-Host "`n🔑 Generating Tauri signing key..." -ForegroundColor Yellow
Write-Host "This will create a new signing key pair." -ForegroundColor Yellow
Write-Host "IMPORTANT: Keep the private key secure and never commit it to your repository!" -ForegroundColor Red

$keyName = "nqlix_desktop_app"
$password = Read-Host "Enter a password for the signing key (or press Enter for no password)"

if ($password) {
    pnpm tauri sign --generate-key --password $password --key-name $keyName
} else {
    pnpm tauri sign --generate-key --key-name $keyName
}

# Get the public key
Write-Host "`n📋 Getting public key..." -ForegroundColor Yellow
$publicKey = pnpm tauri sign --get-public-key --key-name $keyName

# Get the private key
Write-Host "`n🔒 Getting private key..." -ForegroundColor Yellow
$privateKey = pnpm tauri sign --get-private-key --key-name $keyName

Write-Host "`n✅ Setup Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green

Write-Host "`n📋 Next steps:" -ForegroundColor Yellow
Write-Host "1. Add these secrets to your GitHub repository:" -ForegroundColor White
Write-Host "   - Go to your repository Settings > Secrets and variables > Actions" -ForegroundColor White
Write-Host "   - Add the following secrets:" -ForegroundColor White
Write-Host ""

Write-Host "🔑 TAURI_SIGNING_PRIVATE_KEY:" -ForegroundColor Cyan
Write-Host $privateKey -ForegroundColor Gray
Write-Host ""

Write-Host "🔐 TAURI_KEY_PASSWORD:" -ForegroundColor Cyan
if ($password) {
    Write-Host $password -ForegroundColor Gray
} else {
    Write-Host "(empty - no password was set)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "📝 Public Key (already in your tauri.conf.json):" -ForegroundColor Cyan
Write-Host $publicKey -ForegroundColor Gray
Write-Host ""

Write-Host "2. Create a new release by pushing a tag:" -ForegroundColor White
Write-Host "   git tag v0.0.4" -ForegroundColor White
Write-Host "   git push origin v0.0.4" -ForegroundColor White
Write-Host ""

Write-Host "3. The GitHub Action will automatically:" -ForegroundColor White
Write-Host "   - Build your app" -ForegroundColor White
Write-Host "   - Generate .sig files" -ForegroundColor White
Write-Host "   - Upload everything to the release" -ForegroundColor White
Write-Host ""

Write-Host "🎉 Your updater should now work with proper signatures!" -ForegroundColor Green 