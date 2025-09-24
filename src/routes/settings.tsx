import { useSettingsContext } from "../context/SettingsProvider";
import { Button } from "../components/ui/button";
import { SystemStatus } from "../components/SystemStatus";
import { UpdateSection } from "../components/UpdateSection";
import EnhancedMqttConnectionTest from "../components/EnhancedMqttConnectionTest";
import AppControls from "../components/AppControls";
import { Moon, Sun, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { thermalPrinter } from "../services/thermalPrinterService";
import { invoke } from "@tauri-apps/api/tauri";

export default function Settings() {
  const { setTheme, theme: currentTheme } = useSettingsContext();
  const [printerIp, setPrinterIp] = useState<string>("");
  const [loadingPrinter, setLoadingPrinter] = useState<boolean>(false);
  const [envSnapshot, setEnvSnapshot] = useState<string>("");

  const toggleTheme = () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
  };

  const loadCurrentPrinter = async () => {
    setLoadingPrinter(true);
    try {
      const printer = await thermalPrinter.getCurrentPrinter();
      setPrinterIp(printer?.ip ?? "");
      try {
        const snapshot = await invoke<string>("get_printer_env_snapshot");
        setEnvSnapshot(snapshot);
      } catch {}
    } catch (e) {
      setPrinterIp("");
    } finally {
      setLoadingPrinter(false);
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

        {/* Printer Configuration Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Configuration de l'imprimante</h2>
            <p className="text-sm text-muted-foreground">
              La configuration de l'imprimante est gérée via des variables d'environnement.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">IP actuelle détectée :</span>
            <span className="font-mono">{printerIp || "(non détectée)"}</span>
            <Button variant="outline" size="sm" onClick={loadCurrentPrinter} disabled={loadingPrinter}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {loadingPrinter ? "Actualisation..." : "Rafraîchir"}
            </Button>
          </div>
          {envSnapshot && (
            <div className="p-4 border rounded-lg bg-muted/50">
              <h3 className="text-sm font-medium mb-2">Valeurs système détectées</h3>
              <pre className="text-xs p-2 bg-background border rounded overflow-auto max-h-48">
{envSnapshot}
              </pre>
            </div>
          )}
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
