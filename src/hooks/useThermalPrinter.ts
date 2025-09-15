import { useState, useEffect, useCallback } from 'react';
import { thermalPrinterService, ThermalPrinter, ThermalTicketData } from '../services/thermalPrinter';
import { toast } from 'sonner';

export interface UseThermalPrinterReturn {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  availablePrinters: ThermalPrinter[];
  selectedPrinter: ThermalPrinter | null;
  
  // Actions
  initialize: () => Promise<boolean>;
  refreshPrinters: () => Promise<void>;
  selectPrinter: (printerId: string) => boolean;
  printTicket: (ticketData: ThermalTicketData) => Promise<boolean>;
  testPrint: () => Promise<boolean>;
  checkStatus: (printerId?: string) => Promise<string>;
}

export const useThermalPrinter = (): UseThermalPrinterReturn => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<ThermalPrinter[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<ThermalPrinter | null>(null);

  /**
   * Initialize the thermal printer service
   */
  const initialize = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const success = await thermalPrinterService.initialize();
      setIsInitialized(success);
      
      if (success) {
        await refreshPrinters();
        toast.success('Service d\'impression thermique initialisé');
      } else {
        toast.warning('Service d\'impression thermique non disponible - utilisation du mode manuel');
      }
      
      return success;
    } catch (error) {
      console.error('Failed to initialize thermal printer:', error);
      toast.error('Erreur d\'initialisation de l\'imprimante thermique');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh available printers
   */
  const refreshPrinters = useCallback(async (): Promise<void> => {
    try {
      const printers = await thermalPrinterService.discoverPrinters();
      setAvailablePrinters(printers);
      
      // Update selected printer
      const currentSelected = thermalPrinterService.getSelectedPrinter();
      setSelectedPrinter(currentSelected);
      
      console.log(`Trouvé ${printers.length} imprimante(s)`);
    } catch (error) {
      console.error('Failed to refresh printers:', error);
      toast.error('Erreur lors de la recherche d\'imprimantes');
    }
  }, []);

  /**
   * Select a printer
   */
  const selectPrinter = useCallback((printerId: string): boolean => {
    const success = thermalPrinterService.setSelectedPrinter(printerId);
    if (success) {
      const printer = thermalPrinterService.getSelectedPrinter();
      setSelectedPrinter(printer);
      toast.success(`Imprimante sélectionnée: ${printer?.name}`);
    } else {
      toast.error('Impossible de sélectionner cette imprimante');
    }
    return success;
  }, []);

  /**
   * Print a ticket
   */
  const printTicket = useCallback(async (ticketData: ThermalTicketData): Promise<boolean> => {
    if (!isInitialized) {
      toast.warning('Service d\'impression non initialisé - impression manuelle requise');
      return false;
    }

    if (!selectedPrinter) {
      toast.error('Aucune imprimante sélectionnée');
      return false;
    }

    setIsLoading(true);
    try {
      const success = await thermalPrinterService.printTicket(ticketData);
      return success;
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Erreur d\'impression - veuillez réessayer');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, selectedPrinter]);

  /**
   * Test print functionality
   */
  const testPrint = useCallback(async (): Promise<boolean> => {
    if (!isInitialized) {
      toast.warning('Service d\'impression non initialisé');
      return false;
    }

    setIsLoading(true);
    try {
      const success = await thermalPrinterService.testPrint();
      if (success) {
        toast.success('Test d\'impression réussi');
      }
      return success;
    } catch (error) {
      console.error('Test print error:', error);
      toast.error('Échec du test d\'impression');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized]);

  /**
   * Check printer status
   */
  const checkStatus = useCallback(async (printerId?: string): Promise<string> => {
    try {
      return await thermalPrinterService.checkPrinterStatus(printerId);
    } catch (error) {
      console.error('Status check error:', error);
      return 'error';
    }
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Auto-refresh printers periodically
  useEffect(() => {
    if (!isInitialized) return;

    const interval = setInterval(() => {
      refreshPrinters();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [isInitialized, refreshPrinters]);

  return {
    // State
    isInitialized,
    isLoading,
    availablePrinters,
    selectedPrinter,
    
    // Actions
    initialize,
    refreshPrinters,
    selectPrinter,
    printTicket,
    testPrint,
    checkStatus
  };
};