# Wasla Real-Time Communication System

This document describes the real-time communication system implemented for Wasla apps to enable instant synchronization between multiple instances running on different machines.

## Overview

The real-time system consists of three main components:

1. **PostgreSQL Triggers** - Database-level notifications for data changes
2. **WebSocket Server** - Inter-app communication hub running on port 8765
3. **WebSocket Client** - Frontend integration for real-time updates

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Wasla App 1   │    │   Wasla App 2   │    │   Wasla App 3   │
│                 │    │                 │    │                 │
│  ┌───────────┐  │    │  ┌───────────┐  │    │  ┌───────────┐  │
│  │ WebSocket │  │    │  │ WebSocket │  │    │  │ WebSocket │  │
│  │  Client   │  │    │  │  Client   │  │    │  │  Client   │  │
│  └───────────┘  │    │  └───────────┘  │    │  └───────────┘  │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     WebSocket Server       │
                    │      (Port 8765)          │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │    PostgreSQL Database     │
                    │   (Triggers & NOTIFY)     │
                    └───────────────────────────┘
```

## Components

### 1. PostgreSQL Triggers

**Location**: `scripts/setup-realtime-triggers.sql`

The database triggers automatically send notifications when data changes occur:

- **bookings** table → `booking_events` channel
- **vehicle_queue** table → `vehicle_events` channel  
- **day_passes** table → `day_passes_events` channel
- **exit_passes** table → `exit_passes_events` channel

**Trigger Functions**:
- `notify_change()` - Generic notification function
- `notify_booking_change()` - Specialized booking notifications
- `notify_vehicle_queue_change()` - Specialized vehicle queue notifications

### 2. WebSocket Server

**Location**: `src-tauri/src/websocket_realtime.rs`

The WebSocket server runs on port 8765 and handles:

- Client connections from Wasla apps
- Broadcasting database events to all connected clients
- Client registration and heartbeat management
- Automatic reconnection handling

**Key Features**:
- Multi-client support
- Automatic reconnection
- Event broadcasting
- Client status monitoring

### 3. WebSocket Client

**Location**: `src/services/websocketRealtimeService.ts`

The frontend WebSocket client provides:

- Automatic connection to WebSocket server
- Event listening and handling
- Automatic reconnection on connection loss
- Integration with existing real-time systems

## Setup Instructions

### 1. Database Setup

Run the setup script to create the necessary triggers:

```bash
cd Nqlix
./setup-realtime.sh
```

This script will:
- Test database connectivity
- Create PostgreSQL triggers
- Test the notification system
- Display configuration information

### 2. Application Setup

The WebSocket system is automatically initialized when the app starts. No additional configuration is required.

### 3. Network Configuration

Ensure that:
- All Wasla apps are on the same network
- Port 8765 is accessible between machines
- Database server is accessible from all machines

## Usage

### Automatic Operation

The real-time system works automatically:

1. **App Startup**: WebSocket client connects to server
2. **Database Changes**: Triggers send notifications
3. **Event Broadcasting**: Server broadcasts to all clients
4. **UI Updates**: Frontend receives and processes events

### Manual Testing

You can test the system manually:

```sql
-- Test booking notification
SELECT test_notifications();

-- Create a test booking (will trigger notification)
INSERT INTO bookings (destination_id, vehicle_license_plate, seats_booked, total_amount) 
VALUES ('test-dest', 'TEST123', 2, 10.0);
```

### Connection Status

The UI displays connection status indicators:

- **DB**: Database connection status
- **WebSocket**: WebSocket server connection
- **Temps réel**: Overall real-time status

## Event Types

### Database Events

- `INSERT` - New record created
- `UPDATE` - Record modified
- `DELETE` - Record removed

### Business Events

- `BOOKING_CREATED` - New booking made
- `BOOKING_CANCELLED` - Booking cancelled
- `VEHICLE_ENTERED` - Vehicle joined queue
- `VEHICLE_UPDATED` - Vehicle status changed
- `VEHICLE_EXITED` - Vehicle left queue

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check if port 8765 is accessible
   - Verify network connectivity
   - Check firewall settings

2. **Database Triggers Not Working**
   - Verify triggers are installed: `\dt` in psql
   - Check PostgreSQL logs for errors
   - Test with `SELECT test_notifications();`

3. **Events Not Received**
   - Check WebSocket connection status in UI
   - Verify database triggers are active
   - Check browser console for errors

### Debug Commands

```sql
-- Check if triggers exist
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'public';

-- Test notification system
SELECT test_notifications();

-- Check recent notifications
SELECT * FROM pg_stat_activity WHERE state = 'active';
```

### Log Monitoring

Monitor these logs for debugging:

- **Rust Backend**: Console output shows WebSocket server status
- **Frontend**: Browser console shows WebSocket client events
- **PostgreSQL**: Database logs show trigger execution

## Performance Considerations

### Optimization

- **Polling Interval**: Reduced to 50ms for faster response
- **Connection Pooling**: Database connections are pooled
- **Event Batching**: Multiple events can be batched together
- **Selective Updates**: Only affected UI components are updated

### Scalability

- **Multi-Client**: Supports unlimited connected clients
- **Event Filtering**: Clients can subscribe to specific event types
- **Connection Management**: Automatic cleanup of disconnected clients

## Security

### Network Security

- **Local Network Only**: WebSocket server binds to local network
- **No Authentication**: Currently no authentication (local network only)
- **Port Access**: Only port 8765 needs to be accessible

### Data Security

- **No Sensitive Data**: Only event metadata is transmitted
- **Local Processing**: Actual data queries happen locally
- **Encrypted Database**: Database connections use encryption

## Future Enhancements

### Planned Features

1. **Authentication**: Add authentication for WebSocket connections
2. **Event Filtering**: Allow clients to subscribe to specific events
3. **Compression**: Add message compression for large events
4. **Metrics**: Add performance monitoring and metrics
5. **Failover**: Add backup WebSocket servers

### Configuration Options

Future configuration options will include:

- WebSocket server port
- Reconnection intervals
- Event filtering rules
- Performance tuning parameters

## API Reference

### WebSocket Messages

#### Client to Server

```typescript
// Register app
{
  message_type: 'register',
  data: { app_name: 'Wasla App' },
  timestamp: '2024-01-01T00:00:00Z'
}

// Ping
{
  message_type: 'ping',
  data: {},
  timestamp: '2024-01-01T00:00:00Z'
}
```

#### Server to Client

```typescript
// Realtime event
{
  message_type: 'realtime_event',
  data: {
    event_type: 'INSERT',
    table: 'bookings',
    id: 'booking-123',
    timestamp: '2024-01-01T00:00:00Z',
    data: { /* booking data */ }
  },
  timestamp: '2024-01-01T00:00:00Z'
}
```

### Frontend API

```typescript
// Initialize WebSocket
await websocketDbClient.initializeWebSocket('App Name');

// Listen to events
const unsubscribe = websocketDbClient.onWebSocketEvent('booking-change', (event) => {
  console.log('Booking changed:', event);
});

// Get connection status
const status = websocketDbClient.getWebSocketStatus();

// Broadcast custom event
websocketDbClient.broadcastToOtherApps('custom-event', { data: 'value' });
```

## Support

For issues or questions about the real-time system:

1. Check the troubleshooting section above
2. Review the console logs for error messages
3. Test the database triggers manually
4. Verify network connectivity between machines

The system is designed to be robust and self-healing, with automatic reconnection and fallback mechanisms to ensure continuous operation.