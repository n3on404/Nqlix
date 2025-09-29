#!/bin/bash

echo "🔧 Installing Wasla with WebKit compatibility fix..."

# Install required dependencies
sudo apt update
sudo apt install -y libgtk-3-0 libayatana-appindicator3-1

# Create compatibility symlink for WebKit 4.0 -> 4.1
echo "Creating WebKit compatibility symlink..."
sudo ln -sf /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so.0 /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.0.so.37

# Install the package
echo "Installing Wasla package..."
sudo dpkg -i wasla_1.9.0_amd64.deb

# Fix any remaining dependencies
sudo apt install -f

echo "✅ Installation complete!"
echo "You can now run: wasla"
