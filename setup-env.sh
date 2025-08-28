#!/bin/bash

# Setup Tauri environment variables for local development
echo "Setting up Tauri environment variables..."

export TAURI_PRIVATE_KEY="dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5RGdrT3lub05DVFhWOHFzYk82V0dsenBDeUV1aVNNaXZQMUowclJzZWhKSUFBQkFBQUFBQUFBQUFBQUlBQUFBQXRZTlJWRG1XY2t0M3JDRkR4VGVBVGhkSzJGcitXU0gwODdBQkdVa0xoemllL0J3YWZlNlN5ZWpXKzU2c0RmUTFZRmtkSGJ1QnpKM3AwcWtzOUx4S1ZIdGsvd0dWWW5JUkV4NTNheklEQ29DSzVkdjNDNTVJV3ZOODZpNUltN28rb1p1YmxBSlZCbDQ9Cg=="
export TAURI_KEY_PASSWORD="win1"

echo "✅ TAURI_PRIVATE_KEY set"
echo "✅ TAURI_KEY_PASSWORD set"
echo ""
echo "Now you can run: pnpm tauri dev"
echo "Or: pnpm tauri build"
echo ""
echo "Note: These variables are only set for this terminal session."
echo "Run this script again if you open a new terminal." 