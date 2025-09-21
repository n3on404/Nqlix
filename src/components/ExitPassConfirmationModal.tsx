import React, { useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  Printer, 
  Loader2,
  Car,
  Clock,
  AlertTriangle,
  Keyboard
} from 'lucide-react';

interface ExitPassConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onReprint: () => void;
  vehicleData: {
    licensePlate: string;
    destinationName: string;
    totalSeats: number;
    bookedSeats: number;
    previousVehicle?: {
      licensePlate: string;
      exitTime: string;
    } | null;
  } | null;
  isReprinting: boolean;
  isConfirming: boolean;
}

export default function ExitPassConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onReprint,
  vehicleData,
  isReprinting,
  isConfirming
}: ExitPassConfirmationModalProps) {
  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('[contenteditable]')
      ) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'y':
        case 'enter':
          event.preventDefault();
          onConfirm();
          break;
        case 'r':
          event.preventDefault();
          onReprint();
          break;
        case 'escape':
        case 'n':
          event.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onReprint, onClose]);

  if (!isOpen || !vehicleData) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-orange-600">
            <AlertTriangle className="h-6 w-6" />
            Confirmation de Sortie - Véhicule Complet
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            title="Fermer (Échap ou N)"
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Vehicle Information */}
          <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-700">
            <div className="flex items-center gap-3 mb-3">
              <Car className="h-6 w-6 text-orange-600" />
              <h3 className="text-lg font-bold text-orange-800 dark:text-orange-200">
                Véhicule Complet - Prêt à Sortir
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Plaque d'immatriculation</p>
                <p className="text-lg font-mono font-bold text-orange-800 dark:text-orange-200">
                  {vehicleData.licensePlate}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Destination</p>
                <p className="text-lg font-bold text-orange-800 dark:text-orange-200">
                  {vehicleData.destinationName}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Places occupées</p>
                <p className="text-lg font-bold text-green-600">
                  {vehicleData.bookedSeats}/{vehicleData.totalSeats}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Statut</p>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Complet
                </Badge>
              </div>
            </div>
          </div>

          {/* Previous Vehicle Information */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Véhicule Précédent
            </h4>
            
            {vehicleData.previousVehicle ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Plaque d'immatriculation</p>
                  <p className="text-lg font-mono font-bold text-gray-800 dark:text-gray-200">
                    {vehicleData.previousVehicle.licensePlate}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Heure de sortie</p>
                  <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                    {new Date(vehicleData.previousVehicle.exitTime).toLocaleString('fr-FR')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-500 dark:text-gray-400 italic">
                  Premier véhicule à sortir aujourd'hui
                </p>
                <Badge variant="outline" className="mt-2">
                  N/A
                </Badge>
              </div>
            )}
          </div>

          {/* Confirmation Question */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Le ticket de sortie a-t-il été imprimé avec succès ?
            </h4>
            <p className="text-sm text-blue-600 dark:text-blue-300">
              Vérifiez que le ticket de sortie a été correctement imprimé avant de confirmer.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={onConfirm}
              disabled={isConfirming}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 text-lg font-semibold"
              title="Confirmer (Y ou Entrée)"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Confirmation...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Confirmer
                </>
              )}
            </Button>
            
            <Button
              onClick={onReprint}
              disabled={isReprinting}
              variant="outline"
              className="border-orange-300 text-orange-600 hover:bg-orange-50 px-6 py-3 text-lg font-semibold"
              title="Réimprimer (R)"
            >
              {isReprinting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Réimpression...
                </>
              ) : (
                <>
                  <Printer className="w-5 h-5 mr-2" />
                  Réimprimer
                </>
              )}
            </Button>
            
            <Button
              onClick={onClose}
              variant="outline"
              className="border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-3 text-lg font-semibold"
              title="Fermer (Échap ou N)"
            >
              <XCircle className="w-5 h-5 mr-2" />
              Fermer
            </Button>
          </div>

          {/* Keyboard Shortcuts Help */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Raccourcis Clavier
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center justify-between">
                <span>Confirmer</span>
                <Badge variant="outline" className="font-mono">Y ou Entrée</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Réimprimer</span>
                <Badge variant="outline" className="font-mono">R</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Fermer</span>
                <Badge variant="outline" className="font-mono">Échap ou N</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}