#!/bin/bash

# Test script for Wasla network discovery and real-time communication
# This script tests the UDP discovery system and WebSocket connections

echo "🧪 Testing Wasla network discovery and real-time communication..."

# Database connection details
DB_HOST="192.168.192.100"
DB_PORT="5432"
DB_NAME="louaj_node"
DB_USER="ivan"
DB_PASSWORD="Lost2409"

# Test 1: Database connectivity
echo "🔍 Test 1: Database connectivity"
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Test 2: Check if triggers exist
echo "🔍 Test 2: Checking PostgreSQL triggers"
TRIGGER_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name LIKE '%_notify_trigger';" 2>/dev/null | tr -d ' ')

if [ "$TRIGGER_COUNT" -ge 4 ]; then
    echo "✅ Found $TRIGGER_COUNT triggers (expected: 4+)"
else
    echo "❌ Found only $TRIGGER_COUNT triggers (expected: 4+)"
    echo "Run ./setup-realtime.sh to create the triggers"
fi

# Test 3: Test notification function
echo "🔍 Test 3: Testing notification function"
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT test_notifications();" &> /dev/null; then
    echo "✅ Notification function executed successfully"
else
    echo "❌ Notification function failed"
fi

# Test 4: Check UDP discovery port
echo "🔍 Test 4: Checking UDP discovery port (8766)"
if command -v netstat &> /dev/null; then
    if netstat -ln | grep -q ":8766 "; then
        echo "✅ Port 8766 is in use (UDP discovery likely running)"
    else
        echo "⚠️ Port 8766 is not in use (UDP discovery not running)"
        echo "Start a Wasla app to activate UDP discovery"
    fi
else
    echo "⚠️ netstat not available, cannot check UDP port status"
fi

# Test 5: Check WebSocket port
echo "🔍 Test 5: Checking WebSocket port (8765)"
if command -v netstat &> /dev/null; then
    if netstat -ln | grep -q ":8765 "; then
        echo "✅ Port 8765 is in use (WebSocket server likely running)"
    else
        echo "⚠️ Port 8765 is not in use (WebSocket server not running)"
        echo "Start a Wasla app to activate the WebSocket server"
    fi
else
    echo "⚠️ netstat not available, cannot check WebSocket port status"
fi

# Test 6: Test UDP broadcast (if possible)
echo "🔍 Test 6: Testing UDP broadcast capability"
if command -v nc &> /dev/null; then
    # Try to send a test UDP broadcast
    echo '{"message_type":"test","app_info":{"app_id":"test-script","app_name":"Test Script","ip_address":"127.0.0.1","websocket_port":8765,"capabilities":["test"]},"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' | nc -u -b 255.255.255.255 8766 &
    NC_PID=$!
    sleep 1
    kill $NC_PID 2>/dev/null
    echo "✅ UDP broadcast test completed"
else
    echo "⚠️ netcat not available, cannot test UDP broadcast"
fi

# Test 7: Check network interfaces
echo "🔍 Test 7: Checking network interfaces"
if command -v ip &> /dev/null; then
    echo "📡 Available network interfaces:"
    ip addr show | grep -E "inet [0-9]" | grep -v "127.0.0.1" | while read line; do
        echo "  → $line"
    done
elif command -v ifconfig &> /dev/null; then
    echo "📡 Available network interfaces:"
    ifconfig | grep -E "inet [0-9]" | grep -v "127.0.0.1" | while read line; do
        echo "  → $line"
    done
else
    echo "⚠️ Network tools not available"
fi

# Test 8: Test database event (if possible)
echo "🔍 Test 8: Testing database event generation"
echo "Creating a test booking to trigger notifications..."

# Create a temporary test booking
TEST_RESULT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
INSERT INTO bookings (id, destination_id, vehicle_license_plate, seats_booked, total_amount, created_at, verification_code)
VALUES ('test-discovery-' || extract(epoch from now())::text, 'test-dest', 'TEST-DISCOVERY', 1, 5.0, NOW(), 'TEST-' || extract(epoch from now())::text)
RETURNING id;
" 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "✅ Test booking created successfully"
    echo "📋 Booking ID: $(echo "$TEST_RESULT" | grep -o 'test-discovery-[0-9]*' | head -1)"
    
    # Clean up test booking
    echo "🧹 Cleaning up test booking..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "DELETE FROM bookings WHERE id LIKE 'test-discovery-%';" &> /dev/null
    echo "✅ Test booking cleaned up"
else
    echo "❌ Failed to create test booking"
fi

echo ""
echo "🎉 Network discovery testing completed!"
echo ""
echo "📋 Summary:"
echo "- Database connection: $(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null && echo "✅ OK" || echo "❌ FAILED")"
echo "- Triggers installed: $TRIGGER_COUNT triggers found"
echo "- Notification function: $(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT test_notifications();" &> /dev/null && echo "✅ OK" || echo "❌ FAILED")"
echo "- UDP discovery port: $(netstat -ln 2>/dev/null | grep -q ":8766 " && echo "✅ IN USE" || echo "⚠️ NOT IN USE")"
echo "- WebSocket port: $(netstat -ln 2>/dev/null | grep -q ":8765 " && echo "✅ IN USE" || echo "⚠️ NOT IN USE")"
echo ""
echo "🌐 Network Discovery Process:"
echo "1. Each Wasla app broadcasts UDP messages on port 8766"
echo "2. Apps discover each other and elect a WebSocket server"
echo "3. All apps connect to the elected server on port 8765"
echo "4. Database changes trigger notifications to all connected apps"
echo ""
echo "🚀 Multi-Machine Testing:"
echo "1. Start Wasla app on Machine 1 (becomes WebSocket server)"
echo "2. Start Wasla app on Machine 2 (discovers Machine 1, connects as client)"
echo "3. Start Wasla app on Machine 3 (discovers Machine 1, connects as client)"
echo "4. Make a booking in any app - all apps should update instantly"
echo ""
echo "📊 UI Indicators:"
echo "- DB: Database connection status"
echo "- WebSocket: Connection to WebSocket server"
echo "- Network: Number of discovered apps"
echo "- Temps réel: Overall real-time status"
echo "- Serveur: IP address of the elected WebSocket server"