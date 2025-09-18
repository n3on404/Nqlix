import { useSettingsContext } from "../context/SettingsProvider";
import { Button } from "../components/ui/button";
import { SystemStatus } from "../components/SystemStatus";
import { UpdateSection } from "../components/UpdateSection";
import EnhancedMqttConnectionTest from "../components/EnhancedMqttConnectionTest";
import AppControls from "../components/AppControls";
import { Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
// Printer service removed

export default function Settings() {
  const { setTheme, theme: currentTheme } = useSettingsContext();

  const toggleTheme = () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
  };

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

        {/* Printer Management Section - Removed */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Gestion des imprimantes</h2>
            <p className="text-sm text-muted-foreground">
              Fonctionnalité d'impression temporairement désactivée. Les données de tickets sont loggées dans la console.
            </p>
          </div>
          
          <div className="bg-card border rounded-lg p-4 space-y-4">
            <div className="text-center py-4 text-muted-foreground">
              <p>Les fonctionnalités d'impression ont été temporairement supprimées.</p>
              <p className="text-sm mt-2">Les données de tickets sont disponibles dans la console du navigateur pour le développement.</p>
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
