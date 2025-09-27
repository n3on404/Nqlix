// Server Configuration
// ===================

export const SERVER_CONFIG = {
  // Main server IP address
  SERVER_IP: '192.168.192.100',
  
  // API Configuration
  API: {
    BASE_URL: 'http://192.168.192.100:3001/api',
    TIMEOUT: 10000,
  },
  
  // MQTT Configuration
  MQTT: {
    BROKER_URL: 'ws://192.168.192.100:8083/mqtt',
    TCP_URL: 'mqtt://192.168.192.100:1883',
    USERNAME: '',
    PASSWORD: '',
  },
  
  // Database Configuration (for direct connections)
  DATABASE: {
    HOST: '192.168.192.100',
    PORT: 5433,
    USERNAME: 'ivan',
    PASSWORD: 'Lost2409',
    DATABASE: 'louaj_node',
  },
  
  // Redis Configuration
  REDIS: {
    HOST: '192.168.192.100',
    PORT: 6380,
    PASSWORD: '',
    DB: 0,
  },
  
  // EMQX Dashboard
  EMQX_DASHBOARD: {
    URL: 'http://192.168.192.100:18083',
    USERNAME: 'admin',
    PASSWORD: 'transportation2024',
  },
  
  // Development flags
  DEVELOPMENT: {
    ENABLE_LOGGING: true,
    ENABLE_CACHE: true,
    CACHE_TTL: 30000, // 30 seconds
  }
};

// Helper function to get full API URL
export const getApiUrl = (endpoint: string = '') => {
  return `${SERVER_CONFIG.API.BASE_URL}${endpoint}`;
};

// Helper function to get server base URL (without /api)
export const getServerUrl = () => {
  return `http://${SERVER_CONFIG.SERVER_IP}:3001`;
};

// Helper function to get MQTT WebSocket URL
export const getMqttUrl = () => {
  return SERVER_CONFIG.MQTT.BROKER_URL;
};

// Helper function to get MQTT TCP URL
export const getMqttTcpUrl = () => {
  return SERVER_CONFIG.MQTT.TCP_URL;
};

export default SERVER_CONFIG;