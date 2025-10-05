import { useSettingsContext } from "../context/SettingsProvider";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { SystemStatus } from "../components/SystemStatus";
import { UpdateSection } from "../components/UpdateSection";
import AppControls from "../components/AppControls";
import { Moon, Sun, RefreshCw, Save, TestTube, Activity, Wifi, WifiOff, Clock, Zap, AlertCircle, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { thermalPrinter } from "../services/thermalPrinterService";
import { invoke } from "@tauri-apps/api/tauri";
import { getLocalStorage, setLocalStorage } from "../lib/storage";
import { useMQTT } from "../lib/useMQTT";
import { SERVER_CONFIG } from "../config/server";

export default function Settings() {
  const { setTheme, theme: currentTheme } = useSettingsContext();
  const [printerIp, setPrinterIp] = useState<string>("");
  const [printerPort, setPrinterPort] = useState<string>("9100");
  const [loadingPrinter, setLoadingPrinter] = useState<boolean>(false);
  const [savingPrinter, setSavingPrinter] = useState<boolean>(false);
  const [testingPrinter, setTestingPrinter] = useState<boolean>(false);
  const [printerMessage, setPrinterMessage] = useState<string>("");
  const [envSnapshot, setEnvSnapshot] = useState<string>("");
  const [mqttErrorMessage, setMqttErrorMessage] = useState<string>("");
  const [latencyTest, setLatencyTest] = useState<number | null>(null);
  const [isTestingLatency, setIsTestingLatency] = useState<boolean>(false);

  // MQTT integration
  const { isConnected, connectionStatus, metrics, subscribe, unsubscribe } = useMQTT();

  const toggleTheme = () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
  };

  const testMQTTLatency = async () => {
    if (!isConnected) {
      setMqttErrorMessage("❌ MQTT non connecté - impossible de tester la latence");
      return;
    }

    setIsTestingLatency(true);
    setMqttErrorMessage("");
    
    try {
      const startTime = Date.now();
      
      // Subscribe to a test topic
      const testTopic = `transport/test/latency/${Date.now()}`;
      const testPayload = { timestamp: startTime, test: true };
      
      // Publish a test message and wait for response
      const mqttService = await import('../lib/mqttService');
      const service = mqttService.getMQTTService();
      
      // Set up a one-time subscription to catch the response
      const responseHandler = (payload: any, topic: string) => {
        if (topic === testTopic && payload.test) {
          const endTime = Date.now();
          const latency = endTime - payload.timestamp;
          setLatencyTest(latency);
          unsubscribe(testTopic, responseHandler);
        }
      };
      
      subscribe(testTopic, responseHandler);
      
      // Publish test message
      await service.publish(testTopic, testPayload);
      
      // Set timeout for test
      setTimeout(() => {
        if (latencyTest === null) {
          setMqttErrorMessage("❌ Test de latence expiré - aucune réponse reçue");
          unsubscribe(testTopic, responseHandler);
        }
        setIsTestingLatency(false);
      }, 5000);
      
    } catch (error) {
      setMqttErrorMessage(`❌ Erreur lors du test de latence: ${error}`);
      setIsTestingLatency(false);
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'reconnecting': return 'text-orange-600';
      case 'disconnected': return 'text-red-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'connecting': return <Activity className="h-4 w-4 text-yellow-600 animate-pulse" />;
      case 'reconnecting': return <RefreshCw className="h-4 w-4 text-orange-600 animate-spin" />;
      case 'disconnected': return <WifiOff className="h-4 w-4 text-red-600" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <Wifi className="h-4 w-4 text-gray-600" />;
    }
  };

  const loadCurrentPrinter = async () => {
    setLoadingPrinter(true);
    try {
      // Prefill from localStorage first (fast UX), then sync from backend
      const storedIp = getLocalStorage('printerIp');
      const storedPort = getLocalStorage('printerPort');
      if (storedIp) setPrinterIp(storedIp);
      if (storedPort) setPrinterPort(storedPort);

      // Load current printer configuration from backend
      const currentPrinter = await thermalPrinter.getCurrentPrinter();
      
      if (currentPrinter) {
        setPrinterIp(currentPrinter.ip);
        setPrinterPort(currentPrinter.port.toString());
        // Keep a local backup for faster restore
        setLocalStorage('printerIp', currentPrinter.ip);
        setLocalStorage('printerPort', currentPrinter.port.toString());
        
        // Test connection to current printer
        try {
          const status = await thermalPrinter.testConnectionManual(currentPrinter.ip, currentPrinter.port);
          if (status.connected) {
            setPrinterMessage(`✅ Imprimante connectée: ${currentPrinter.ip}:${currentPrinter.port}`);
          } else {
            setPrinterMessage(`❌ Imprimante non connectée: ${currentPrinter.ip}:${currentPrinter.port}`);
          }
        } catch (error) {
          setPrinterMessage(`❌ Erreur de connexion: ${currentPrinter.ip}:${currentPrinter.port}`);
        }
      } else {
        // Fallback to default configuration
        const defaultIp = "192.168.192.12";
        const defaultPort = "9100";
        
        setPrinterIp(defaultIp);
        setPrinterPort(defaultPort);
        setPrinterMessage(`⚠️ Configuration par défaut: ${defaultIp}:${defaultPort}`);
      }
    } catch (e) {
      setPrinterMessage("❌ Erreur lors du chargement de la configuration");
    } finally {
      setLoadingPrinter(false);
    }
  };

  const savePrinterConfig = async () => {
    setSavingPrinter(true);
    try {
      // Validate IP address format
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(printerIp)) {
        setPrinterMessage("❌ Adresse IP invalide");
        return;
      }

      // Validate port number
      const port = parseInt(printerPort);
      if (isNaN(port) || port < 1 || port > 65535) {
        setPrinterMessage("❌ Port invalide (doit être entre 1 et 65535)");
        return;
      }

      // Update printer configuration
      await thermalPrinter.updatePrinterConfigManual({
        ip: printerIp,
        port: port,
        enabled: true
      });

      // Persist locally for quick restore
      setLocalStorage('printerIp', printerIp);
      setLocalStorage('printerPort', String(port));

      setPrinterMessage(`✅ Configuration sauvegardée: ${printerIp}:${port}`);
    } catch (error) {
      setPrinterMessage(`❌ Erreur lors de la sauvegarde: ${error}`);
    } finally {
      setSavingPrinter(false);
    }
  };

  const testPrinterConnection = async () => {
    setTestingPrinter(true);
    try {
      const status = await thermalPrinter.testConnectionManual(printerIp.trim(), parseInt(printerPort.trim()));
      if (status.connected) {
        setPrinterMessage(`✅ Test réussi: ${printerIp.trim()}:${printerPort.trim()}`);
      } else {
        setPrinterMessage(`❌ Test échoué: ${status.error || 'Imprimante non accessible'}`);
      }
    } catch (error) {
      setPrinterMessage(`❌ Erreur de test: ${error}`);
    } finally {
      setTestingPrinter(false);
    }
  };

  useEffect(() => {
    loadCurrentPrinter();
  }, []);

 

  return (
    <div className="flex flex-col h-full w-full p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">
          Personnalisez les préférences d'interface de votre station.
        </p>
      </div>

      <div className="space-y-6">
        {/* Appearance Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Apparence</h2>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="w-24"
              >
                {currentTheme === "light" ? (
                  <>
                    <Sun className="h-4 w-4 mr-2" />
                    Clair
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 mr-2" />
                    Sombre
                  </>
                )}
              </Button>
              <span className="text-sm text-muted-foreground">
                Thème actuel : {currentTheme === "light" ? "Clair" : "Sombre"}
              </span>
            </div>
          </div>
        </div>

        {/* App Controls Section */}
        <AppControls />

        {/* MQTT Connection Status Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              <span>Statut MQTT</span>
            </CardTitle>
            <CardDescription>
              Surveillance de la connexion MQTT et des performances en temps réel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Connection Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  {getConnectionStatusIcon()}
                  Statut de connexion
                </Label>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${getConnectionStatusColor()}`}>
                    {connectionStatus === 'connected' ? 'Connecté' :
                     connectionStatus === 'connecting' ? 'Connexion en cours...' :
                     connectionStatus === 'reconnecting' ? 'Reconnexion...' :
                     connectionStatus === 'disconnected' ? 'Déconnecté' :
                     connectionStatus === 'error' ? 'Erreur' : 'Inconnu'}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Latence
                </Label>
                <div className="flex items-center gap-2">
                  {latencyTest !== null ? (
                    <span className="font-medium text-blue-600">
                      {latencyTest}ms
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Non testé
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testMQTTLatency}
                    disabled={isTestingLatency || !isConnected}
                    className="flex items-center gap-1"
                  >
                    <Activity className="h-3 w-3" />
                    {isTestingLatency ? "Test..." : "Tester"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Messages reçus</Label>
                <div className="text-lg font-mono text-green-600">
                  {metrics.messagesReceived}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Messages envoyés</Label>
                <div className="text-lg font-mono text-blue-600">
                  {metrics.messagesSent}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Dernier message</Label>
                <div className="text-sm text-muted-foreground">
                  {metrics.lastMessageTime 
                    ? new Date(metrics.lastMessageTime).toLocaleTimeString()
                    : 'Aucun'
                  }
                </div>
              </div>
            </div>

            {/* Error Messages */}
            {mqttErrorMessage && (
              <div className="p-3 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">{mqttErrorMessage}</p>
              </div>
            )}

            {/* Connection Info */}
            <div className="p-3 border rounded-lg bg-muted/50">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Broker:</span>
                  <span className="font-mono">{SERVER_CONFIG.MQTT.BROKER_URL}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client ID:</span>
                  <span className="font-mono text-xs">nqlix-client-{Math.random().toString(16).substr(2, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Protocole:</span>
                  <span className="font-mono">MQTT over WebSocket</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Printer Configuration Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Configuration de l'imprimante</span>
            </CardTitle>
            <CardDescription>
              Configurez l'adresse IP et le port de votre imprimante thermique
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="printer-ip">Adresse IP</Label>
                <Input
                  id="printer-ip"
                  type="text"
                  value={printerIp}
                  onChange={(e) => setPrinterIp(e.target.value)}
                  placeholder="192.168.192.12"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Adresse IP de l'imprimante</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="printer-port">Port</Label>
                <Input
                  id="printer-port"
                  type="number"
                  value={printerPort}
                  onChange={(e) => setPrinterPort(e.target.value)}
                  placeholder="9100"
                  min="1"
                  max="65535"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Port de l'imprimante (généralement 9100)</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                onClick={savePrinterConfig} 
                disabled={savingPrinter}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {savingPrinter ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
              <Button 
                variant="outline" 
                onClick={testPrinterConnection} 
                disabled={testingPrinter || loadingPrinter}
                className="flex items-center gap-2"
              >
                <TestTube className="h-4 w-4" />
                {testingPrinter ? "Test..." : "Tester"}
              </Button>
              <Button 
                variant="outline" 
                onClick={loadCurrentPrinter} 
                disabled={loadingPrinter}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {loadingPrinter ? "Actualisation..." : "Actualiser"}
              </Button>
            </div>
            
            {printerMessage && (
              <div className="p-3 border rounded-lg bg-muted/50">
                <p className="text-sm">{printerMessage}</p>
              </div>
            )}
          </CardContent>
        </Card>



        {/* Update Section */}
        <UpdateSection />

        {/* System Status */}
        <SystemStatus />
      </div>
    </div>
  );
}
