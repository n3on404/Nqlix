import { useSettingsContext } from "../context/SettingsProvider";
import { Button } from "../components/ui/button";
import { SystemStatus } from "../components/SystemStatus";
import { UpdateSection } from "../components/UpdateSection";
import EnhancedMqttConnectionTest from "../components/EnhancedMqttConnectionTest";
import AppControls from "../components/AppControls";
import { Moon, Sun, Printer, RefreshCw, TestTube } from "lucide-react";
import { useState, useEffect } from "react";
import { printerService, type PrinterInfo } from "../services/printerService";

export default function Settings() {
  const { setTheme, theme: currentTheme } = useSettingsContext();
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const toggleTheme = () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
  };

  const loadPrinters = async () => {
    setIsLoadingPrinters(true);
    try {
      const availablePrinters = await printerService.getAvailablePrinters();
      setPrinters(availablePrinters);
    } catch (error) {
      console.error('Failed to load printers:', error);
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  const testPrinter = async () => {
    setIsTesting(true);
    try {
      await printerService.printTestPage();
      alert('Test page printed successfully!');
    } catch (error) {
      console.error('Test print failed:', error);
      alert(`Test print failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    loadPrinters();
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

        {/* Printer Management Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Gestion des imprimantes</h2>
            <p className="text-sm text-muted-foreground">
              Configurez et testez vos imprimantes pour l'impression des tickets.
            </p>
          </div>
          
          <div className="bg-card border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Imprimantes disponibles</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={loadPrinters}
                disabled={isLoadingPrinters}
              >
                {isLoadingPrinters ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Actualiser
              </Button>
            </div>
            
            {printers.length > 0 ? (
              <div className="space-y-2">
                {printers.map((printer) => (
                  <div
                    key={printer.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <Printer className="h-4 w-4" />
                      <div>
                        <p className="font-medium">{printer.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Port: {printer.port_name} | Type: {printer.type} | Shared: {printer.shared ? 'Oui' : 'Non'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                {isLoadingPrinters ? 'Chargement...' : 'Aucune imprimante détectée'}
              </div>
            )}
            
            <div className="border-t pt-4">
              <Button
                onClick={testPrinter}
                disabled={isTesting || printers.length === 0}
                className="w-full"
              >
                {isTesting ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <TestTube className="h-4 w-4 mr-2" />
                )}
                {isTesting ? 'Impression en cours...' : 'Imprimer une page de test'}
              </Button>
            </div>
          </div>
        </div>

        {/* Enhanced Connection Test */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">🔌 Test de Connexion Améliorée</h2>
            <p className="text-sm text-muted-foreground">
              Testez et diagnostiquez la connexion avec le serveur local et le système WebSocket amélioré.
            </p>
          </div>
          <EnhancedMqttConnectionTest />
        </div>

        {/* Update Section */}
        <UpdateSection />

        {/* System Status */}
        <SystemStatus />
      </div>
    </div>
  );
}
