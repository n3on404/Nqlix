#!/bin/bash

# Test script for Wasla real-time communication system
# This script tests the WebSocket server and database triggers

echo "🧪 Testing Wasla real-time communication system..."

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

# Test 4: Check WebSocket port availability
echo "🔍 Test 4: Checking WebSocket port availability"
if command -v netstat &> /dev/null; then
    if netstat -ln | grep -q ":8765 "; then
        echo "✅ Port 8765 is in use (WebSocket server likely running)"
    else
        echo "⚠️ Port 8765 is not in use (WebSocket server not running)"
        echo "Start a Wasla app to activate the WebSocket server"
    fi
else
    echo "⚠️ netstat not available, cannot check port status"
fi

# Test 5: Test database event (if possible)
echo "🔍 Test 5: Testing database event generation"
echo "Creating a test booking to trigger notifications..."

# Create a temporary test booking
TEST_RESULT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
INSERT INTO bookings (id, destination_id, vehicle_license_plate, seats_booked, total_amount, created_at, verification_code)
VALUES ('test-realtime-' || extract(epoch from now())::text, 'test-dest', 'TEST-REALTIME', 1, 5.0, NOW(), 'TEST-' || extract(epoch from now())::text)
RETURNING id;
" 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "✅ Test booking created successfully"
    echo "📋 Booking ID: $(echo "$TEST_RESULT" | grep -o 'test-realtime-[0-9]*' | head -1)"
    
    # Clean up test booking
    echo "🧹 Cleaning up test booking..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "DELETE FROM bookings WHERE id LIKE 'test-realtime-%';" &> /dev/null
    echo "✅ Test booking cleaned up"
else
    echo "❌ Failed to create test booking"
fi

echo ""
echo "🎉 Testing completed!"
echo ""
echo "📋 Summary:"
echo "- Database connection: $(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null && echo "✅ OK" || echo "❌ FAILED")"
echo "- Triggers installed: $TRIGGER_COUNT triggers found"
echo "- Notification function: $(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT test_notifications();" &> /dev/null && echo "✅ OK" || echo "❌ FAILED")"
echo "- WebSocket port: $(netstat -ln 2>/dev/null | grep -q ":8765 " && echo "✅ IN USE" || echo "⚠️ NOT IN USE")"
echo ""
echo "🚀 Next steps:"
echo "1. Start your Wasla apps to activate the WebSocket server"
echo "2. Open multiple Wasla apps to test inter-app communication"
echo "3. Make bookings in one app and watch for updates in others"
echo "4. Check the UI for WebSocket connection status indicators"