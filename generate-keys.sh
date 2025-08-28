#!/bin/bash

echo "🔑 Generating Tauri signing keys..."
echo ""

# Check if minisign is installed
if ! command -v minisign &> /dev/null; then
    echo "❌ minisign is not installed. Please install it first:"
    echo "   Ubuntu/Debian: sudo apt install minisign"
    echo "   macOS: brew install minisign"
    echo "   Windows: Download from https://github.com/jedisct1/minisign/releases"
    exit 1
fi

# Generate new key pair
echo "📝 Generating new key pair..."
minisign -G -p nqlix_desktop_app.pub -s nqlix_desktop_app.key

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Keys generated successfully!"
    echo ""
    echo "🔐 PRIVATE KEY (add this to GitHub secret TAURI_PRIVATE_KEY):"
    echo "=========================================="
    cat nqlix_desktop_app.key
    echo "=========================================="
    echo ""
    echo "🔓 PUBLIC KEY (update this in tauri.conf.json):"
    echo "=========================================="
    cat nqlix_desktop_app.pub
    echo "=========================================="
    echo ""
    echo "📋 Next steps:"
    echo "1. Copy the PRIVATE KEY above to GitHub secret 'TAURI_PRIVATE_KEY'"
    echo "2. Copy the PUBLIC KEY above to src-tauri/tauri.conf.json 'pubkey' field"
    echo "3. Make sure TAURI_KEY_PASSWORD is set to 'win1' (or your chosen password)"
    echo "4. Commit and push the updated tauri.conf.json"
    echo "5. Create a new release tag"
else
    echo "❌ Failed to generate keys"
    exit 1
fi 