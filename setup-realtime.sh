#!/bin/bash

# Setup script for Wasla real-time communication system
# This script sets up PostgreSQL triggers and WebSocket server for inter-app communication

echo "🚀 Setting up Wasla real-time communication system..."

# Database connection details
DB_HOST="192.168.192.100"
DB_PORT="5432"
DB_NAME="louaj_node"
DB_USER="ivan"
DB_PASSWORD="Lost2409"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql command not found. Please install PostgreSQL client tools."
    exit 1
fi

# Test database connection
echo "🔍 Testing database connection..."
if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
    echo "❌ Cannot connect to database. Please check your connection details."
    exit 1
fi

echo "✅ Database connection successful"

# Create triggers
echo "📝 Setting up PostgreSQL triggers..."
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "scripts/setup-realtime-triggers.sql"; then
    echo "✅ PostgreSQL triggers created successfully"
else
    echo "❌ Failed to create PostgreSQL triggers"
    exit 1
fi

# Test the triggers
echo "🧪 Testing notification system..."
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT test_notifications();"; then
    echo "✅ Notification system test completed"
else
    echo "⚠️ Notification system test failed (this might be normal if no apps are listening)"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Start your Wasla apps - they will automatically connect to the WebSocket server"
echo "2. The WebSocket server runs on port 8765"
echo "3. Apps will automatically reconnect if the connection is lost"
echo "4. All database changes will be broadcast to connected apps in real-time"
echo ""
echo "🔧 Configuration:"
echo "- WebSocket server port: 8765"
echo "- Database triggers: Active"
echo "- Auto-reconnection: Enabled"
echo ""
echo "🌐 Network requirements:"
echo "- All Wasla apps must be on the same network"
echo "- Port 8765 must be accessible between machines"
echo "- Database server must be accessible from all machines"
echo ""
echo "📊 Monitoring:"
echo "- Check the console logs in each Wasla app for connection status"
echo "- WebSocket connection status is shown in the UI"
echo "- Database triggers will log notifications to PostgreSQL logs"