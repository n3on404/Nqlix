import React, { useState, useEffect } from 'react';
import { useEnhancedConnection } from '../context/EnhancedConnectionProvider';
import enhancedApi from '../services/enhancedLocalNodeApi';

export const EnhancedConnectionTest: React.FC = () => {
  const { 
    connectionState, 
    connectionMetrics, 
    isConnected, 
    isAuthenticated,
    discoveredServers,
    connect,
    disconnect,
    refreshConnection
  } = useEnhancedConnection();
  
  const [testResults, setTestResults] = useState<any>({});
  const [isTesting, setIsTesting] = useState(false);

  const runConnectionTest = async () => {
    setIsTesting(true);
    const results: any = {};

    try {
      console.log('🧪 Starting enhanced connection test...');

      // Test 1: Check if we have auth token
      const authData = localStorage.getItem('auth');
      results.authToken = authData ? 'Found' : 'Not found';
      console.log('🔍 Auth token check:', results.authToken);

      // Test 2: Test API connection
      try {
        const apiTest = await enhancedApi.checkConnection();
        results.apiConnection = apiTest ? 'Success' : 'Failed';
        console.log('🔌 API connection test:', results.apiConnection);
      } catch (error) {
        results.apiConnection = `Error: ${error}`;
        console.error('❌ API connection test failed:', error);
      }

      // Test 3: Test server discovery
      try {
        const servers = await enhancedApi.discoverLocalNodeServers();
        results.serverDiscovery = servers.length > 0 ? `Found ${servers.length} servers` : 'No servers found';
        console.log('🔍 Server discovery test:', results.serverDiscovery);
      } catch (error) {
        results.serverDiscovery = `Error: ${error}`;
        console.error('❌ Server discovery test failed:', error);
      }

      // Test 4: Test WebSocket connection
      try {
        if (!isConnected) {
          await connect();
          // Wait a bit for connection
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        results.websocketConnection = isConnected ? 'Connected' : 'Not connected';
        console.log('🔌 WebSocket connection test:', results.websocketConnection);
      } catch (error) {
        results.websocketConnection = `Error: ${error}`;
        console.error('❌ WebSocket connection test failed:', error);
      }

      // Test 5: Test authentication
      results.authentication = isAuthenticated ? 'Authenticated' : 'Not authenticated';
      console.log('🔐 Authentication test:', results.authentication);

      // Test 6: Get connection metrics
      try {
        const metrics = await enhancedApi.getEnhancedServerMetrics();
        results.serverMetrics = metrics.success ? 'Available' : 'Not available';
        console.log('📊 Server metrics test:', results.serverMetrics);
      } catch (error) {
        results.serverMetrics = `Error: ${error}`;
        console.error('❌ Server metrics test failed:', error);
      }

    } catch (error) {
      console.error('❌ Connection test failed:', error);
      results.error = (error as Error).message;
    }

    setTestResults(results);
    setIsTesting(false);
    console.log('✅ Enhanced connection test completed:', results);
  };

  const clearTestResults = () => {
    setTestResults({});
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">🔌 Enhanced Connection Test</h2>
      
      {/* Connection Status */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Connection Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="font-medium">State:</span>
            <span className={`ml-2 px-2 py-1 rounded text-sm ${
              connectionState === 'connected' || connectionState === 'authenticated' || connectionState === 'optimizing'
                ? 'bg-green-100 text-green-800' 
                : connectionState === 'connecting' || connectionState === 'discovering'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {connectionState}
            </span>
          </div>
          <div>
            <span className="font-medium">Connected:</span>
            <span className={`ml-2 px-2 py-1 rounded text-sm ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {isConnected ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="font-medium">Authenticated:</span>
            <span className={`ml-2 px-2 py-1 rounded text-sm ${
              isAuthenticated ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {isAuthenticated ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="font-medium">Quality:</span>
            <span className={`ml-2 px-2 py-1 rounded text-sm ${
              connectionMetrics.connectionQuality === 'excellent' || connectionMetrics.connectionQuality === 'good'
                ? 'bg-green-100 text-green-800'
                : connectionMetrics.connectionQuality === 'fair'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {connectionMetrics.connectionQuality}
            </span>
          </div>
        </div>
      </div>

      {/* Connection Metrics */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Connection Metrics</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="font-medium">Latency:</span>
            <span className="ml-2">{connectionMetrics.latency}ms</span>
          </div>
          <div>
            <span className="font-medium">Error Rate:</span>
            <span className="ml-2">{connectionMetrics.errorRate.toFixed(3)}</span>
          </div>
          <div>
            <span className="font-medium">Last Heartbeat:</span>
            <span className="ml-2">{connectionMetrics.lastHeartbeat.toLocaleTimeString()}</span>
          </div>
          <div>
            <span className="font-medium">Message Throughput:</span>
            <span className="ml-2">{connectionMetrics.messageThroughput.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* Discovered Servers */}
      {discoveredServers.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">🔍 Discovered Servers</h3>
          <div className="space-y-2">
            {discoveredServers.map((server, index) => (
              <div key={index} className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="font-mono">{server}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Controls */}
      <div className="mb-6 flex space-x-4">
        <button
          onClick={runConnectionTest}
          disabled={isTesting}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isTesting ? '🧪 Testing...' : '🧪 Run Connection Test'}
        </button>
        
        <button
          onClick={connect}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          🔌 Connect
        </button>
        
        <button
          onClick={disconnect}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          ❌ Disconnect
        </button>
        
        <button
          onClick={refreshConnection}
          className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
        >
          🔄 Refresh
        </button>
        
        <button
          onClick={clearTestResults}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          🧹 Clear Results
        </button>
      </div>

      {/* Test Results */}
      {Object.keys(testResults).length > 0 && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">🧪 Test Results</h3>
          <div className="space-y-2">
            {Object.entries(testResults).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="font-medium">{key}:</span>
                <span className={`px-2 py-1 rounded text-sm ${
                  typeof value === 'string' && value.includes('Error')
                    ? 'bg-red-100 text-red-800'
                    : typeof value === 'string' && (value.includes('Success') || value.includes('Found') || value.includes('Connected') || value.includes('Authenticated'))
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debug Info */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">🐛 Debug Information</h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">User Agent:</span>
            <span className="ml-2 font-mono">{navigator.userAgent}</span>
          </div>
          <div>
            <span className="font-medium">Platform:</span>
            <span className="ml-2">{navigator.platform}</span>
          </div>
          <div>
            <span className="font-medium">Tauri Available:</span>
            <span className="ml-2">{(window as any).__TAURI__ ? 'Yes' : 'No'}</span>
          </div>
          <div>
            <span className="font-medium">Local Storage:</span>
            <span className="ml-2">{typeof localStorage !== 'undefined' ? 'Available' : 'Not available'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}; 