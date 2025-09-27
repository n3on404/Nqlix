# Server Configuration Summary

## 🌐 **Network Configuration**

The Nqlix application has been updated to use the remote server IP `192.168.192.100` instead of localhost.

### **Updated Services:**

| Service | Old URL | New URL |
|---------|---------|---------|
| **API Server** | `http://localhost:3001/api` | `http://192.168.192.100:3001/api` |
| **MQTT WebSocket** | `ws://localhost:8083/mqtt` | `ws://192.168.192.100:8083/mqtt` |
| **MQTT TCP** | `mqtt://localhost:1883` | `mqtt://192.168.192.100:1883` |
| **PostgreSQL** | `localhost:5432` | `192.168.192.100:5433` |
| **Redis** | `localhost:6379` | `192.168.192.100:6380` |
| **EMQX Dashboard** | `http://localhost:18083` | `http://192.168.192.100:18083` |

## 📁 **Files Updated:**

### **Configuration Files:**
- `src/config/server.ts` - **NEW** - Centralized server configuration
- `src/lib/api.ts` - Updated to use server IP
- `src/services/enhancedLocalNodeApi.ts` - Updated to use server IP
- `src/lib/mqttService.ts` - Updated to use server IP
- `src-tauri/src/main.rs` - Updated database connection

### **Key Changes:**

1. **Centralized Configuration**: Created `src/config/server.ts` with all server endpoints
2. **API Services**: Both main and enhanced API services now use the server IP
3. **MQTT Service**: Updated WebSocket and TCP connections to use server IP
4. **Database**: Tauri backend now connects to remote PostgreSQL
5. **No Authentication**: MQTT and Redis configured without authentication for simplicity

## 🔧 **Connection Details:**

### **API Server:**
- **URL**: `http://192.168.192.100:3001`
- **Status**: ✅ Responding
- **Authentication**: JWT Bearer tokens

### **Database (PostgreSQL):**
- **Host**: `192.168.192.100`
- **Port**: `5433`
- **Database**: `louaj_node`
- **Username**: `ivan`
- **Password**: `Lost2409`

### **Redis Cache:**
- **Host**: `192.168.192.100`
- **Port**: `6380`
- **Authentication**: None (open access)

### **MQTT Broker (EMQX):**
- **WebSocket**: `ws://192.168.192.100:8083/mqtt`
- **TCP**: `mqtt://192.168.192.100:1883`
- **Authentication**: None (open access)

### **EMQX Dashboard:**
- **URL**: `http://192.168.192.100:18083`
- **Username**: `admin`
- **Password**: `transportation2024`

## 🧪 **Testing:**

Run the test script to verify all connections:
```bash
cd Nqlix
node test-server-connection.js
```

## 🚀 **Benefits:**

1. **Real-time Data Exchange**: All services accessible from local network
2. **Centralized Management**: Single server for all transportation system components
3. **Network Access**: Multiple devices can connect to the same server
4. **Scalability**: Easy to add more client applications
5. **Monitoring**: EMQX dashboard accessible for MQTT monitoring

## 📝 **Notes:**

- All services are configured for network access
- No authentication required for MQTT and Redis (simplified setup)
- Database uses standard PostgreSQL authentication
- API uses JWT authentication for security
- EMQX dashboard has admin authentication enabled

The application is now ready for real-time data exchange across your local network! 🎯