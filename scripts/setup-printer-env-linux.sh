#!/bin/bash

# Setup script for printer environment variables on Linux
# This script sets up environment variables for the current user

echo "Setting up printer environment variables for Linux..."
echo

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "Running as root - setting system-wide environment variables"
    ENV_FILE="/etc/environment"
    PROFILE_FILE="/etc/profile.d/printer-env.sh"
else
    echo "Running as user - setting user environment variables"
    ENV_FILE="$HOME/.bashrc"
    PROFILE_FILE="$HOME/.profile"
fi

# Function to add or update environment variable
add_env_var() {
    local var_name="$1"
    local var_value="$2"
    local file="$3"
    
    # Remove existing entry if it exists
    if grep -q "^export $var_name=" "$file" 2>/dev/null; then
        sed -i "/^export $var_name=/d" "$file"
    fi
    
    # Add new entry
    echo "export $var_name=\"$var_value\"" >> "$file"
    echo "✓ $var_name set to $var_value"
}

# Function to add to system-wide environment
add_system_env_var() {
    local var_name="$1"
    local var_value="$2"
    local file="$3"
    
    # Remove existing entry if it exists
    if grep -q "^$var_name=" "$file" 2>/dev/null; then
        sed -i "/^$var_name=/d" "$file"
    fi
    
    # Add new entry
    echo "$var_name=\"$var_value\"" >> "$file"
    echo "✓ $var_name set to $var_value"
}

# Set printer environment variables
echo "Setting PRINTER_IP..."
if [ "$EUID" -eq 0 ]; then
    add_system_env_var "PRINTER_IP" "192.168.192.10" "$ENV_FILE"
    add_env_var "PRINTER_IP" "192.168.192.10" "$PROFILE_FILE"
else
    add_env_var "PRINTER_IP" "192.168.192.10" "$ENV_FILE"
fi

echo "Setting PRINTER_PORT..."
if [ "$EUID" -eq 0 ]; then
    add_system_env_var "PRINTER_PORT" "9100" "$ENV_FILE"
    add_env_var "PRINTER_PORT" "9100" "$PROFILE_FILE"
else
    add_env_var "PRINTER_PORT" "9100" "$ENV_FILE"
fi

echo "Setting PRINTER_NAME..."
if [ "$EUID" -eq 0 ]; then
    add_system_env_var "PRINTER_NAME" "Imprimante Thermique" "$ENV_FILE"
    add_env_var "PRINTER_NAME" "Imprimante Thermique" "$PROFILE_FILE"
else
    add_env_var "PRINTER_NAME" "Imprimante Thermique" "$ENV_FILE"
fi

echo "Setting PRINTER_WIDTH..."
if [ "$EUID" -eq 0 ]; then
    add_system_env_var "PRINTER_WIDTH" "48" "$ENV_FILE"
    add_env_var "PRINTER_WIDTH" "48" "$PROFILE_FILE"
else
    add_env_var "PRINTER_WIDTH" "48" "$ENV_FILE"
fi

echo "Setting PRINTER_TIMEOUT..."
if [ "$EUID" -eq 0 ]; then
    add_system_env_var "PRINTER_TIMEOUT" "5000" "$ENV_FILE"
    add_env_var "PRINTER_TIMEOUT" "5000" "$PROFILE_FILE"
else
    add_env_var "PRINTER_TIMEOUT" "5000" "$ENV_FILE"
fi

echo "Setting PRINTER_MODEL..."
if [ "$EUID" -eq 0 ]; then
    add_system_env_var "PRINTER_MODEL" "TM-T20X" "$ENV_FILE"
    add_env_var "PRINTER_MODEL" "TM-T20X" "$PROFILE_FILE"
else
    add_env_var "PRINTER_MODEL" "TM-T20X" "$ENV_FILE"
fi

# Make profile script executable if it exists
if [ -f "$PROFILE_FILE" ]; then
    chmod +x "$PROFILE_FILE"
fi

echo
echo "========================================"
echo "Environment variables setup complete!"
echo "========================================"
echo
echo "Current printer configuration:"
echo "- IP: 192.168.192.10"
echo "- Port: 9100"
echo "- Name: Imprimante Thermique"
echo "- Width: 48 characters"
echo "- Timeout: 5000ms"
echo "- Model: TM-T20X"
echo
echo "IMPORTANT: You need to restart the application for changes to take effect."
echo "You may also need to restart your terminal or run: source ~/.bashrc"
echo
echo "To modify these values later, you can:"
echo "1. Run this script again with different values"
echo "2. Edit the environment files directly:"
if [ "$EUID" -eq 0 ]; then
    echo "   - System-wide: $ENV_FILE"
    echo "   - Profile: $PROFILE_FILE"
else
    echo "   - User: $ENV_FILE"
fi
echo "3. Use export commands in your terminal"
echo
echo "To verify the variables are set, run:"
echo "echo \$PRINTER_IP"
echo "echo \$PRINTER_PORT"
echo "echo \$PRINTER_NAME"
echo "echo \$PRINTER_WIDTH"
echo "echo \$PRINTER_TIMEOUT"
echo "echo \$PRINTER_MODEL"
echo