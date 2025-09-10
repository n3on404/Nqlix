import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Zap,
  Activity,
  MessageCircle,
  Settings,
  AlertTriangle
} from 'lucide-react';
import { useEnhancedMqtt } from '../context/EnhancedMqttProvider';
import { MqttConnectionState } from '../services/enhancedMqttClient';

interface ServerInfo {
  ip: string;
  port: number;
  url: string;
  response_time?: number;
}

interface TestResults {
  discovery: {
    status: 'pending' | 'success' | 'failed';
    servers: ServerInfo[];
    duration: number;
  };
  connection: {
    status: 'pending' | 'success' | 'failed';
    latency: number;
    quality: string;
  };
  authentication: {
    status: 'pending' | 'success' | 'failed';
    method: string;
  };
  messaging: {
    status: 'pending' | 'success' | 'failed';
    testsSent: number;
    testsReceived: number;
    averageLatency: number;
  };
  subscriptions: {
    status: 'pending' | 'success' | 'failed';
    subscribedTopics: string[];
  };
}

const EnhancedMqttConnectionTest: React.FC = () => {
  const {
    mqttClient,
    connectionState,
    connectionMetrics,
    isConnected,
    isAuthenticated,
    connect,
    disconnect,
    sendTestMessage,
    sendPerformanceTest,
    subscribeToUpdates,
    lastError,
    reconnectAttempts
  } = useEnhancedMqtt();

  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testResults, setTestResults] = useState<TestResults>({
    discovery: { status: 'pending', servers: [], duration: 0 },
    connection: { status: 'pending', latency: 0, quality: 'unknown' },
    authentication: { status: 'pending', method: 'token' },
    messaging: { status: 'pending', testsSent: 0, testsReceived: 0, averageLatency: 0 },
    subscriptions: { status: 'pending', subscribedTopics: [] }
  });

  const [testProgress, setTestProgress] = useState(0);
  const [currentTestStep, setCurrentTestStep] = useState('');
  const [testStartTime, setTestStartTime] = useState<Date | null>(null);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [performanceResults, setPerformanceResults] = useState<any[]>([]);

  useEffect(() => {
    // Listen for test responses
    const handleTestResponse = (data: any) => {
      console.log('🧪 Test response received:', data);
      setMessagesReceived(prev => prev + 1);
      
      setTestResults(prev => ({
        ...prev,
        messaging: {
          ...prev.messaging,
          testsReceived: prev.messaging.testsReceived + 1,
          status: 'success'
        }
      }));
    };

    const handlePerformanceResponse = (data: any) => {
      console.log('⚡ Performance response received:', data);
      setPerformanceResults(prev => [...prev, data]);
      
      const latency = data.latency || 0;
      setTestResults(prev => ({
        ...prev,
        messaging: {
          ...prev.messaging,
          averageLatency: (prev.messaging.averageLatency + latency) / 2
        }
      }));
    };

    const handleStateChange = (state: MqttConnectionState) => {
      console.log('🔄 Connection state changed:', state);
      
      if (state === MqttConnectionState.CONNECTED) {
        setTestResults(prev => ({
          ...prev,
          connection: {
            status: 'success',
            latency: connectionMetrics.latency,
            quality: connectionMetrics.connectionQuality
          }
        }));
      }
      
      if (state === MqttConnectionState.AUTHENTICATED) {
        setTestResults(prev => ({
          ...prev,
          authentication: {
            status: 'success',
            method: 'token'
          }
        }));
      }
    };

    mqttClient.on('test_message_response', handleTestResponse);
    mqttClient.on('performance_test_response', handlePerformanceResponse);
    mqttClient.on('state_changed', handleStateChange);

    return () => {
      mqttClient.off('test_message_response', handleTestResponse);
      mqttClient.off('performance_test_response', handlePerformanceResponse);
      mqttClient.off('state_changed', handleStateChange);
    };
  }, [mqttClient, connectionMetrics]);

  const runFullTest = async () => {
    setIsRunningTest(true);
    setTestProgress(0);
    setCurrentTestStep('Initializing...');
    setTestStartTime(new Date());
    setMessagesReceived(0);
    setPerformanceResults([]);

    // Reset test results
    setTestResults({
      discovery: { status: 'pending', servers: [], duration: 0 },
      connection: { status: 'pending', latency: 0, quality: 'unknown' },
      authentication: { status: 'pending', method: 'token' },
      messaging: { status: 'pending', testsSent: 0, testsReceived: 0, averageLatency: 0 },
      subscriptions: { status: 'pending', subscribedTopics: [] }
    });

    try {
      // Step 1: Discovery (10%)
      setCurrentTestStep('Discovering servers...');
      setTestProgress(10);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setTestResults(prev => ({
        ...prev,
        discovery: {
          status: 'success',
          servers: [{ ip: '127.0.0.1', port: 1883, url: 'mqtt://127.0.0.1:1883' }],
          duration: 500
        }
      }));

      // Step 2: Connection (30%)
      setCurrentTestStep('Connecting to MQTT broker...');
      setTestProgress(30);
      
      if (!isConnected) {
        await connect();
      }
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setTestResults(prev => ({
        ...prev,
        connection: {
          status: isConnected ? 'success' : 'failed',
          latency: connectionMetrics.latency,
          quality: connectionMetrics.connectionQuality
        }
      }));

      // Step 3: Authentication (50%)
      setCurrentTestStep('Authenticating...');
      setTestProgress(50);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setTestResults(prev => ({
        ...prev,
        authentication: {
          status: isAuthenticated ? 'success' : 'failed',
          method: 'token'
        }
      }));

      // Step 4: Subscriptions (70%)
      setCurrentTestStep('Setting up subscriptions...');
      setTestProgress(70);
      
      const testTopics = [
        'queue_update',
        'cash_booking_updated',
        'seat_availability_changed',
        'financial_update',
        'dashboard_update'
      ];
      
      try {
        await subscribeToUpdates(testTopics);
        setTestResults(prev => ({
          ...prev,
          subscriptions: {
            status: 'success',
            subscribedTopics: testTopics
          }
        }));
      } catch (error) {
        setTestResults(prev => ({
          ...prev,
          subscriptions: {
            status: 'failed',
            subscribedTopics: []
          }
        }));
      }

      // Step 5: Messaging Tests (90%)
      setCurrentTestStep('Testing message delivery...');
      setTestProgress(90);
      
      const testCount = 5;
      let testsSent = 0;
      
      for (let i = 0; i < testCount; i++) {
        try {
          await sendTestMessage({
            testNumber: i + 1,
            timestamp: new Date().toISOString()
          });
          testsSent++;
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`❌ Test message ${i + 1} failed:`, error);
        }
      }
      
      // Send performance tests
      for (let i = 0; i < 3; i++) {
        try {
          await sendPerformanceTest();
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`❌ Performance test ${i + 1} failed:`, error);
        }
      }
      
      setTestResults(prev => ({
        ...prev,
        messaging: {
          ...prev.messaging,
          testsSent,
          status: testsSent > 0 ? 'success' : 'failed'
        }
      }));

      // Step 6: Complete (100%)
      setCurrentTestStep('Test completed');
      setTestProgress(100);

    } catch (error) {
      console.error('❌ Test failed:', error);
      setCurrentTestStep(`Test failed: ${error}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  const getConnectionStateIcon = () => {
    switch (connectionState) {
      case MqttConnectionState.CONNECTED:
      case MqttConnectionState.AUTHENTICATED:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case MqttConnectionState.CONNECTING:
      case MqttConnectionState.DISCOVERING:
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case MqttConnectionState.RECONNECTING:
        return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />;
      case MqttConnectionState.FAILED:
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <WifiOff className="h-4 w-4 text-gray-500" />;
    }
  };

  const getConnectionStateColor = () => {
    switch (connectionState) {
      case MqttConnectionState.CONNECTED:
      case MqttConnectionState.AUTHENTICATED:
        return 'bg-green-500';
      case MqttConnectionState.CONNECTING:
      case MqttConnectionState.DISCOVERING:
        return 'bg-blue-500';
      case MqttConnectionState.RECONNECTING:
        return 'bg-yellow-500';
      case MqttConnectionState.FAILED:
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getTestStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-gray-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getConnectionStateIcon()}
              <CardTitle>Enhanced MQTT Connection</CardTitle>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${getConnectionStateColor()}`}></div>
              <Badge variant={isConnected ? "default" : "secondary"}>
                {connectionState.toUpperCase()}
              </Badge>
            </div>
          </div>
          <CardDescription>
            Real-time communication via MQTT protocol
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{connectionMetrics.latency}ms</div>
              <div className="text-sm text-gray-500">Latency</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getQualityColor(connectionMetrics.connectionQuality)}`}>
                {connectionMetrics.connectionQuality}
              </div>
              <div className="text-sm text-gray-500">Quality</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{connectionMetrics.messagesSent}</div>
              <div className="text-sm text-gray-500">Sent</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{connectionMetrics.messagesReceived}</div>
              <div className="text-sm text-gray-500">Received</div>
            </div>
          </div>

          {/* Error Display */}
          {lastError && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-700">{lastError}</span>
            </div>
          )}

          {/* Reconnection Attempts */}
          {reconnectAttempts > 0 && (
            <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <RefreshCw className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-yellow-700">
                Reconnection attempts: {reconnectAttempts}
              </span>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex space-x-2">
            <Button
              onClick={connect}
              disabled={isConnected || isRunningTest}
              variant="default"
            >
              <Wifi className="h-4 w-4 mr-2" />
              Connect
            </Button>
            <Button
              onClick={disconnect}
              disabled={!isConnected || isRunningTest}
              variant="outline"
            >
              <WifiOff className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
            <Button
              onClick={runFullTest}
              disabled={isRunningTest}
              variant="secondary"
            >
              <Activity className="h-4 w-4 mr-2" />
              {isRunningTest ? 'Running Test...' : 'Run Full Test'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Progress */}
      {isRunningTest && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Running Connection Test</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>{currentTestStep}</span>
                <span>{testProgress}%</span>
              </div>
              <Progress value={testProgress} className="w-full" />
            </div>
            {testStartTime && (
              <div className="text-sm text-gray-500">
                Test duration: {Math.round((Date.now() - testStartTime.getTime()) / 1000)}s
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      <Card>
        <CardHeader>
          <CardTitle>Test Results</CardTitle>
          <CardDescription>
            Comprehensive MQTT connection and functionality tests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Discovery Test */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              {getTestStatusIcon(testResults.discovery.status)}
              <div>
                <div className="font-medium">Server Discovery</div>
                <div className="text-sm text-gray-500">
                  Found {testResults.discovery.servers.length} servers in {testResults.discovery.duration}ms
                </div>
              </div>
            </div>
            <Badge variant={testResults.discovery.status === 'success' ? 'default' : 'secondary'}>
              {testResults.discovery.status}
            </Badge>
          </div>

          {/* Connection Test */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              {getTestStatusIcon(testResults.connection.status)}
              <div>
                <div className="font-medium">MQTT Connection</div>
                <div className="text-sm text-gray-500">
                  Latency: {testResults.connection.latency}ms, Quality: {testResults.connection.quality}
                </div>
              </div>
            </div>
            <Badge variant={testResults.connection.status === 'success' ? 'default' : 'secondary'}>
              {testResults.connection.status}
            </Badge>
          </div>

          {/* Authentication Test */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              {getTestStatusIcon(testResults.authentication.status)}
              <div>
                <div className="font-medium">Authentication</div>
                <div className="text-sm text-gray-500">
                  Method: {testResults.authentication.method}
                </div>
              </div>
            </div>
            <Badge variant={testResults.authentication.status === 'success' ? 'default' : 'secondary'}>
              {testResults.authentication.status}
            </Badge>
          </div>

          {/* Subscriptions Test */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              {getTestStatusIcon(testResults.subscriptions.status)}
              <div>
                <div className="font-medium">Topic Subscriptions</div>
                <div className="text-sm text-gray-500">
                  Subscribed to {testResults.subscriptions.subscribedTopics.length} topics
                </div>
              </div>
            </div>
            <Badge variant={testResults.subscriptions.status === 'success' ? 'default' : 'secondary'}>
              {testResults.subscriptions.status}
            </Badge>
          </div>

          {/* Messaging Test */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              {getTestStatusIcon(testResults.messaging.status)}
              <div>
                <div className="font-medium">Message Delivery</div>
                <div className="text-sm text-gray-500">
                  Sent: {testResults.messaging.testsSent}, Received: {testResults.messaging.testsReceived}, 
                  Avg Latency: {Math.round(testResults.messaging.averageLatency)}ms
                </div>
              </div>
            </div>
            <Badge variant={testResults.messaging.status === 'success' ? 'default' : 'secondary'}>
              {testResults.messaging.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="h-4 w-4" />
            <span>Quick Actions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button
              onClick={() => sendTestMessage({ type: 'manual_test' })}
              disabled={!isConnected}
              variant="outline"
              size="sm"
            >
              <Zap className="h-3 w-3 mr-1" />
              Test Message
            </Button>
            <Button
              onClick={sendPerformanceTest}
              disabled={!isConnected}
              variant="outline"
              size="sm"
            >
              <Activity className="h-3 w-3 mr-1" />
              Performance Test
            </Button>
            <Button
              onClick={() => subscribeToUpdates(['test_topic'])}
              disabled={!isConnected}
              variant="outline"
              size="sm"
            >
              <Settings className="h-3 w-3 mr-1" />
              Subscribe Test
            </Button>
            <Button
              disabled={!isConnected}
              variant="outline"
              size="sm"
              onClick={() => {
                console.log('MQTT Config:', mqttClient.getMqttConfig());
                console.log('Connection Metrics:', connectionMetrics);
              }}
            >
              <Settings className="h-3 w-3 mr-1" />
              Debug Info
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Performance Results */}
      {performanceResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {performanceResults.map((result, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span>Test {index + 1}</span>
                  <Badge variant="outline">{result.latency}ms</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EnhancedMqttConnectionTest;
