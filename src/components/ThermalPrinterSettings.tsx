import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { useThermalPrinter } from '../hooks/useThermalPrinter';
import { 
  Printer, 
  RefreshCw, 
  Settings, 
  CheckCircle, 
  AlertCircle, 
  Wifi, 
  Usb, 
  Bluetooth,
  TestTube,
  Loader2
} from 'lucide-react';

export const ThermalPrinterSettings: React.FC = () => {
  const {
    isInitialized,
    isLoading,
    availablePrinters,
    selectedPrinter,
    refreshPrinters,
    selectPrinter,
    testPrint,
    checkStatus
  } = useThermalPrinter();

  const [testingPrinter, setTestingPrinter] = useState<string | null>(null);

  const getConnectionIcon = (type: string) => {
    switch (type) {
      case 'TCP': return <Wifi className="w-4 h-4" />;
      case 'Bluetooth': return <Bluetooth className="w-4 h-4" />;
      case 'USB': return <Usb className="w-4 h-4" />;
      default: return <Printer className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'offline': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'error': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online': return 'En ligne';
      case 'offline': return 'Hors ligne';
      case 'error': return 'Erreur';
      default: return 'Inconnu';
    }
  };

  const handleTestPrint = async (printerId: string) => {
    setTestingPrinter(printerId);
    
    // Select the printer first if not already selected
    if (selectedPrinter?.id !== printerId) {
      selectPrinter(printerId);
    }
    
    try {
      await testPrint();
    } finally {
      setTestingPrinter(null);
    }
  };

  if (!isInitialized) {
    return (
      <Card className="border-orange-200 dark:border-orange-800">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <CardTitle className="text-orange-900 dark:text-orange-100">
              Service d'impression thermique
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-orange-700 dark:text-orange-300 mb-4">
            Le service d'impression thermique n'est pas disponible. Les tickets devront être imprimés manuellement.
          </p>
          <p className="text-sm text-orange-600 dark:text-orange-400">
            Assurez-vous que les plugins Tauri pour l'impression thermique sont installés et configurés.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Printer className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <CardTitle>Imprimantes Thermiques</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-sm">
              {availablePrinters.length} imprimante{availablePrinters.length > 1 ? 's' : ''} trouvée{availablePrinters.length > 1 ? 's' : ''}
            </Badge>
            <Button
              onClick={refreshPrinters}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Actualiser
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {availablePrinters.length === 0 ? (
          <div className="text-center py-8">
            <Printer className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Aucune imprimante trouvée
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Vérifiez que vos imprimantes thermiques sont connectées et allumées.
            </p>
            <Button onClick={refreshPrinters} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Rechercher à nouveau
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {availablePrinters.map((printer) => (
              <div
                key={printer.id}
                className={`p-4 border rounded-lg transition-all ${
                  selectedPrinter?.id === printer.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      {getConnectionIcon(printer.connectionType)}
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                          {printer.name}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {printer.connectionType}
                          {printer.address && ` - ${printer.address}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(printer.status)}>
                      {getStatusLabel(printer.status)}
                    </Badge>

                    {selectedPrinter?.id === printer.id && (
                      <Badge variant="default">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Sélectionnée
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 mt-3">
                  {selectedPrinter?.id !== printer.id && (
                    <Button
                      onClick={() => selectPrinter(printer.id)}
                      variant="outline"
                      size="sm"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Sélectionner
                    </Button>
                  )}

                  <Button
                    onClick={() => handleTestPrint(printer.id)}
                    disabled={testingPrinter === printer.id}
                    variant="outline"
                    size="sm"
                  >
                    {testingPrinter === printer.id ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4 mr-2" />
                    )}
                    Test d'impression
                  </Button>
                </div>
              </div>
            ))}

            {selectedPrinter && (
              <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <h4 className="font-medium text-green-900 dark:text-green-100">
                    Imprimante Active
                  </h4>
                </div>
                <p className="text-green-700 dark:text-green-300">
                  <strong>{selectedPrinter.name}</strong> est prête pour l'impression automatique des tickets.
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  Les tickets d'entrée et de sortie seront automatiquement imprimés sur cette imprimante.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};