import { invoke } from '@tauri-apps/api/tauri';
import { toast } from 'sonner';

// Types for thermal printer functionality
export interface ThermalPrinter {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  connectionType: 'USB' | 'TCP' | 'Bluetooth';
  address?: string; // For TCP/Bluetooth
}

export interface PrintJob {
  id: string;
  printerId: string;
  status: 'pending' | 'printing' | 'completed' | 'failed';
  ticketType: 'entry' | 'exit';
  createdAt: Date;
}

export interface ESCPOSCommand {
  type: 'text' | 'cut' | 'feed' | 'align' | 'bold' | 'size' | 'image' | 'barcode' | 'qr';
  value?: string | number;
  data?: string; // For images/barcodes
}

export interface ThermalTicketData {
  ticketNumber: string;
  licensePlate: string;
  stationName: string;
  datetime: Date;
  ticketType: 'entry' | 'exit' | 'booking';
  queuePosition?: number;
  nextVehicle?: string;
  price?: number;
  departureStation?: string;
  destinationStation?: string;
  exitTime?: Date;
  // Additional fields for booking tickets
  customerName?: string;
  seatsBooked?: number;
  verificationCode?: string;
}

class ThermalPrinterService {
  private availablePrinters: ThermalPrinter[] = [];
  private selectedPrinterId: string | null = null;
  private isInitialized = false;

  /**
   * Initialize the thermal printer service
   */
  async initialize(): Promise<boolean> {
    try {
      // Check if Tauri plugin is available
      const isAvailable = await this.checkPluginAvailability();
      if (!isAvailable) {
        console.warn('Thermal printer plugin not available');
        return false;
      }

      // Discover available printers
      await this.discoverPrinters();
      this.isInitialized = true;
      
      console.log('Thermal printer service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize thermal printer service:', error);
      return false;
    }
  }

  /**
   * Check if the thermal printer plugin is available
   */
  private async checkPluginAvailability(): Promise<boolean> {
    try {
      // Use the standard tauri-plugin-printer
      await invoke('plugin:printer|get_printers');
      return true;
    } catch (error) {
      console.warn('Printer plugin not available:', error);
      return false;
    }
  }

  /**
   * Discover available thermal printers
   */
  async discoverPrinters(): Promise<ThermalPrinter[]> {
    try {
      // Use the standard tauri-plugin-printer
      const printers: any[] = await invoke('plugin:printer|get_printers');

      this.availablePrinters = printers.map((printer: any) => ({
        id: printer.id || printer.name,
        name: printer.name,
        status: printer.status || 'offline',
        connectionType: this.detectConnectionType(printer),
        address: printer.address
      }));

      // Auto-select the first thermal printer if none selected
      if (this.availablePrinters.length > 0 && !this.selectedPrinterId) {
        const thermalPrinter = this.availablePrinters.find(p => 
          p.name.toLowerCase().includes('thermal') || 
          p.name.toLowerCase().includes('pos') ||
          p.name.toLowerCase().includes('receipt')
        );
        this.selectedPrinterId = thermalPrinter?.id || this.availablePrinters[0].id;
      }

      console.log('Discovered printers:', this.availablePrinters);
      return this.availablePrinters;
    } catch (error) {
      console.error('Failed to discover printers:', error);
      return [];
    }
  }

  /**
   * Detect connection type based on printer info
   */
  private detectConnectionType(printer: any): 'USB' | 'TCP' | 'Bluetooth' {
    const name = printer.name?.toLowerCase() || '';
    const address = printer.address?.toLowerCase() || '';
    
    if (address.includes('192.168') || address.includes('tcp')) return 'TCP';
    if (name.includes('bluetooth') || address.includes('bluetooth')) return 'Bluetooth';
    return 'USB';
  }

  /**
   * Get available printers
   */
  getPrinters(): ThermalPrinter[] {
    return this.availablePrinters;
  }

  /**
   * Set the selected printer
   */
  setSelectedPrinter(printerId: string): boolean {
    const printer = this.availablePrinters.find(p => p.id === printerId);
    if (printer) {
      this.selectedPrinterId = printerId;
      return true;
    }
    return false;
  }

  /**
   * Get the currently selected printer
   */
  getSelectedPrinter(): ThermalPrinter | null {
    if (!this.selectedPrinterId) return null;
    return this.availablePrinters.find(p => p.id === this.selectedPrinterId) || null;
  }

  /**
   * Generate ESC/POS commands for entry ticket
   */
  private generateEntryTicketCommands(data: ThermalTicketData): ESCPOSCommand[] {
    const commands: ESCPOSCommand[] = [
      // Header
      { type: 'align', value: 'center' },
      { type: 'bold', value: 1 },
      { type: 'size', value: 2 },
      { type: 'text', value: 'NQLIX COMPANY' },
      { type: 'feed', value: 1 },
      { type: 'size', value: 1 },
      { type: 'text', value: 'TICKET D\'ENTRÉE CONDUCTEUR' },
      { type: 'text', value: 'تذكرة دخول السائق' },
      { type: 'feed', value: 1 },
      { type: 'bold', value: 0 },
      
      // Date/Time
      { type: 'text', value: `Date: ${data.datetime.toLocaleDateString('fr-FR')}` },
      { type: 'text', value: `Heure: ${data.datetime.toLocaleTimeString('fr-FR')}` },
      { type: 'feed', value: 1 },
      
      // Separator
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      
      // Station
      { type: 'bold', value: 1 },
      { type: 'text', value: 'STATION / المحطة' },
      { type: 'bold', value: 0 },
      { type: 'text', value: data.stationName },
      { type: 'feed', value: 1 },
      
      // Vehicle
      { type: 'bold', value: 1 },
      { type: 'text', value: 'VÉHICULE / المركبة' },
      { type: 'bold', value: 0 },
      { type: 'size', value: 2 },
      { type: 'text', value: data.licensePlate },
      { type: 'size', value: 1 },
      { type: 'feed', value: 1 },
      
      // Queue Position
      { type: 'bold', value: 1 },
      { type: 'text', value: 'POSITION / موقع في الطابور' },
      { type: 'bold', value: 0 },
      { type: 'size', value: 3 },
      { type: 'text', value: `#${data.queuePosition || 'N/A'}` },
      { type: 'size', value: 1 },
      { type: 'feed', value: 1 },
      
      // Next Vehicle (if available)
      ...(data.nextVehicle ? [
        { type: 'bold', value: 1 } as ESCPOSCommand,
        { type: 'text', value: 'VÉHICULE SUIVANT / المركبة التالية' } as ESCPOSCommand,
        { type: 'bold', value: 0 } as ESCPOSCommand,
        { type: 'text', value: data.nextVehicle } as ESCPOSCommand,
        { type: 'feed', value: 1 } as ESCPOSCommand,
      ] : []),
      
      // Price
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      { type: 'bold', value: 1 },
      { type: 'size', value: 2 },
      { type: 'text', value: `FRAIS: ${data.price || 2.0} TND` },
      { type: 'text', value: `رسوم الدخول: ${data.price || 2.0} دينار` },
      { type: 'size', value: 1 },
      { type: 'bold', value: 0 },
      { type: 'feed', value: 1 },
      
      // Ticket Number
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      { type: 'bold', value: 1 },
      { type: 'text', value: 'TICKET / التذكرة' },
      { type: 'size', value: 2 },
      { type: 'text', value: `#${data.ticketNumber}` },
      { type: 'size', value: 1 },
      { type: 'bold', value: 0 },
      { type: 'feed', value: 1 },
      
      // QR Code (if supported)
      { type: 'qr', data: JSON.stringify({
        type: 'entry',
        ticket: data.ticketNumber,
        vehicle: data.licensePlate,
        station: data.stationName,
        time: data.datetime.toISOString()
      })},
      { type: 'feed', value: 1 },
      
      // Footer
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      { type: 'align', value: 'center' },
      { type: 'text', value: 'Conservez ce ticket' },
      { type: 'text', value: 'احتفظ بهذه التذكرة' },
      { type: 'feed', value: 2 },
      { type: 'text', value: `Imprimé: ${new Date().toLocaleString('fr-FR')}` },
      { type: 'feed', value: 3 },
      { type: 'cut' }
    ];

    return commands;
  }

  /**
   * Generate ESC/POS commands for exit ticket
   */
  private generateExitTicketCommands(data: ThermalTicketData): ESCPOSCommand[] {
    const commands: ESCPOSCommand[] = [
      // Header
      { type: 'align', value: 'center' },
      { type: 'bold', value: 1 },
      { type: 'size', value: 2 },
      { type: 'text', value: 'NQLIX COMPANY' },
      { type: 'feed', value: 1 },
      { type: 'size', value: 1 },
      { type: 'text', value: 'TICKET DE SORTIE CONDUCTEUR' },
      { type: 'text', value: 'تذكرة خروج السائق' },
      { type: 'feed', value: 1 },
      { type: 'bold', value: 0 },
      
      // Date/Time
      { type: 'text', value: `Date: ${(data.exitTime || data.datetime).toLocaleDateString('fr-FR')}` },
      { type: 'text', value: `Heure: ${(data.exitTime || data.datetime).toLocaleTimeString('fr-FR')}` },
      { type: 'feed', value: 1 },
      
      // Separator
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      
      // Journey
      { type: 'bold', value: 1 },
      { type: 'text', value: 'VOYAGE / الرحلة' },
      { type: 'bold', value: 0 },
      { type: 'text', value: `${data.departureStation || data.stationName} → ${data.destinationStation || 'Destination'}` },
      { type: 'feed', value: 1 },
      
      // Vehicle
      { type: 'bold', value: 1 },
      { type: 'text', value: 'VÉHICULE / المركبة' },
      { type: 'bold', value: 0 },
      { type: 'size', value: 2 },
      { type: 'text', value: data.licensePlate },
      { type: 'size', value: 1 },
      { type: 'feed', value: 1 },
      
      // Exit Time
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      { type: 'bold', value: 1 },
      { type: 'text', value: 'HEURE DE SORTIE / وقت الخروج' },
      { type: 'bold', value: 0 },
      { type: 'size', value: 2 },
      { type: 'text', value: (data.exitTime || data.datetime).toLocaleTimeString('fr-FR') },
      { type: 'size', value: 1 },
      { type: 'feed', value: 1 },
      
      // Ticket Number
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      { type: 'bold', value: 1 },
      { type: 'text', value: 'TICKET / التذكرة' },
      { type: 'size', value: 2 },
      { type: 'text', value: `#${data.ticketNumber}` },
      { type: 'size', value: 1 },
      { type: 'bold', value: 0 },
      { type: 'feed', value: 1 },
      
      // QR Code (if supported)
      { type: 'qr', data: JSON.stringify({
        type: 'exit',
        ticket: data.ticketNumber,
        vehicle: data.licensePlate,
        departure: data.departureStation,
        destination: data.destinationStation,
        time: (data.exitTime || data.datetime).toISOString()
      })},
      { type: 'feed', value: 1 },
      
      // Footer
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      { type: 'align', value: 'center' },
      { type: 'text', value: 'Bon voyage!' },
      { type: 'text', value: 'رحلة سعيدة!' },
      { type: 'feed', value: 1 },
      { type: 'text', value: 'Merci pour votre service!' },
      { type: 'text', value: 'شكرًا لخدمتك!' },
      { type: 'feed', value: 2 },
      { type: 'text', value: `Imprimé: ${new Date().toLocaleString('fr-FR')}` },
      { type: 'feed', value: 3 },
      { type: 'cut' }
    ];

    return commands;
  }

  /**
   * Generate ESC/POS commands for booking tickets
   */
  private generateBookingTicketCommands(data: ThermalTicketData): ESCPOSCommand[] {
    const commands: ESCPOSCommand[] = [
      // Header
      { type: 'align', value: 'center' },
      { type: 'bold', value: 1 },
      { type: 'size', value: 2 },
      { type: 'text', value: 'NQLIX COMPANY' },
      { type: 'feed', value: 1 },
      { type: 'size', value: 1 },
      { type: 'text', value: 'TICKET DE RÉSERVATION' },
      { type: 'text', value: 'تذكرة حجز' },
      { type: 'feed', value: 1 },
      { type: 'bold', value: 0 },
      
      // Date/Time
      { type: 'text', value: `Date: ${data.datetime.toLocaleDateString('fr-FR')}` },
      { type: 'text', value: `Heure: ${data.datetime.toLocaleTimeString('fr-FR')}` },
      { type: 'feed', value: 1 },
      
      // Separator
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      
      
      { type: 'bold', value: 1 },
      { type: 'text', value: 'VOYAGE / الرحلة' },
      { type: 'bold', value: 0 },
      { type: 'text', value: `${data.departureStation || data.stationName} → ${data.destinationStation || 'Destination'}` },
      { type: 'feed', value: 1 },
      
      // Vehicle
      { type: 'bold', value: 1 },
      { type: 'text', value: 'VÉHICULE / المركبة' },
      { type: 'bold', value: 0 },
      { type: 'text', value: data.licensePlate || 'À assigner' },
      { type: 'feed', value: 1 },
      
      // Seats
      { type: 'bold', value: 1 },
      { type: 'text', value: 'PLACES / المقاعد' },
      { type: 'bold', value: 0 },
      { type: 'size', value: 2 },
      { type: 'text', value: `${data.seatsBooked || 1} place${(data.seatsBooked || 1) > 1 ? 's' : ''}` },
      { type: 'size', value: 1 },
      { type: 'feed', value: 1 },
      
      // Price
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      { type: 'bold', value: 1 },
      { type: 'text', value: 'MONTANT / المبلغ' },
      { type: 'bold', value: 0 },
      { type: 'size', value: 2 },
      { type: 'text', value: `${data.price?.toFixed(2) || '0.00'} TND` },
      { type: 'size', value: 1 },
      { type: 'feed', value: 1 },
      
      // Verification Code
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      { type: 'bold', value: 1 },
      { type: 'text', value: 'CODE DE VÉRIFICATION / رمز التحقق' },
      { type: 'size', value: 2 },
      { type: 'text', value: data.verificationCode || data.ticketNumber },
      { type: 'size', value: 1 },
      { type: 'bold', value: 0 },
      { type: 'feed', value: 1 },
      
      // QR Code (if supported)
      { type: 'qr', data: JSON.stringify({
        type: 'booking',
        ticket: data.ticketNumber,
        verification: data.verificationCode,
        customer: data.customerName,
        departure: data.departureStation,
        destination: data.destinationStation,
        seats: data.seatsBooked,
        amount: data.price,
        time: data.datetime.toISOString()
      })},
      { type: 'feed', value: 1 },
      
      // Footer
      { type: 'text', value: '================================' },
      { type: 'feed', value: 1 },
      { type: 'align', value: 'center' },
      { type: 'text', value: 'Conservez ce ticket' },
      { type: 'text', value: 'احتفظ بهذه التذكرة' },
      { type: 'feed', value: 1 },
      { type: 'text', value: 'Présentez-le lors de l\'embarquement' },
      { type: 'text', value: 'قدمها عند الصعود' },
      { type: 'feed', value: 2 },
      { type: 'text', value: `Imprimé: ${new Date().toLocaleString('fr-FR')}` },
      { type: 'feed', value: 3 },
      { type: 'cut' }
    ];

    return commands;
  }

  /**
   * Convert ESC/POS commands to raw bytes
   */
  private commandsToESCPOS(commands: ESCPOSCommand[]): Uint8Array {
    const buffer: number[] = [];
    
    // ESC/POS control codes
    const ESC = 0x1B;
    const GS = 0x1D;
    const LF = 0x0A;
    const CR = 0x0D;

    for (const cmd of commands) {
      switch (cmd.type) {
        case 'text':
          if (cmd.value) {
            const text = cmd.value.toString();
            for (let i = 0; i < text.length; i++) {
              buffer.push(text.charCodeAt(i));
            }
            buffer.push(LF);
          }
          break;

        case 'feed':
          const feedCount = typeof cmd.value === 'number' ? cmd.value : 1;
          for (let i = 0; i < feedCount; i++) {
            buffer.push(LF);
          }
          break;

        case 'cut':
          buffer.push(GS, 0x56, 0x00); // Full cut
          break;

        case 'align':
          buffer.push(ESC, 0x61);
          if (cmd.value === 'center') buffer.push(0x01);
          else if (cmd.value === 'right') buffer.push(0x02);
          else buffer.push(0x00); // left
          break;

        case 'bold':
          buffer.push(ESC, 0x45, cmd.value ? 0x01 : 0x00);
          break;

        case 'size':
          const sizeValue = typeof cmd.value === 'number' ? cmd.value : 1;
          const size = Math.min(Math.max(sizeValue, 1), 8) - 1;
          buffer.push(GS, 0x21, (size << 4) | size);
          break;

        case 'qr':
          if (cmd.data) {
            // QR Code commands (if printer supports it)
            const qrData = cmd.data;
            buffer.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // QR Code model
            buffer.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x08); // Module size
            buffer.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30); // Error correction
            
            // Store data
            const dataLength = qrData.length + 3;
            buffer.push(GS, 0x28, 0x6B, dataLength & 0xFF, (dataLength >> 8) & 0xFF, 0x31, 0x50, 0x30);
            for (let i = 0; i < qrData.length; i++) {
              buffer.push(qrData.charCodeAt(i));
            }
            
            // Print QR
            buffer.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
          }
          break;
      }
    }

    return new Uint8Array(buffer);
  }

  /**
   * Print a ticket to the thermal printer
   */
  async printTicket(ticketData: ThermalTicketData): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.selectedPrinterId) {
      toast.error('Aucune imprimante thermique sélectionnée');
      return false;
    }

    try {
      const printer = this.getSelectedPrinter();
      if (!printer) {
        toast.error('Imprimante thermique introuvable');
        return false;
      }

      // Generate appropriate commands based on ticket type
      let commands: ESCPOSCommand[];
      if (ticketData.ticketType === 'entry') {
        commands = this.generateEntryTicketCommands(ticketData);
      } else if (ticketData.ticketType === 'exit') {
        commands = this.generateExitTicketCommands(ticketData);
      } else {
        commands = this.generateBookingTicketCommands(ticketData);
      }

      // Convert to ESC/POS bytes
      const escposData = this.commandsToESCPOS(commands);

      // Use the standard tauri-plugin-printer for raw printing
      await invoke('plugin:printer|print_raw', {
        printer_name: printer.name,
        data: Array.from(escposData)
      });

      toast.success(`Ticket ${ticketData.ticketType === 'entry' ? 'd\'entrée' : 'de sortie'} imprimé avec succès`);
      return true;

    } catch (error) {
      console.error('Failed to print ticket:', error);
      toast.error(`Erreur d'impression: ${error}`);
      return false;
    }
  }

  /**
   * Test print functionality
   */
  async testPrint(): Promise<boolean> {
    const testData: ThermalTicketData = {
      ticketNumber: 'TEST-001',
      licensePlate: 'TEST-123',
      stationName: 'Station Test',
      datetime: new Date(),
      ticketType: 'entry',
      queuePosition: 1,
      price: 2.0
    };

    return await this.printTicket(testData);
  }

  /**
   * Check printer status
   */
  async checkPrinterStatus(printerId?: string): Promise<string> {
    const id = printerId || this.selectedPrinterId;
    if (!id) return 'unknown';

    try {
      const printers = await invoke('plugin:printer|get_printers') as any[];
      const printer = printers.find((p: any) => p.id === id || p.name === id);
      return printer ? (printer.status || 'online') : 'offline';
    } catch (error) {
      return 'error';
    }
  }
}

// Create singleton instance
export const thermalPrinterService = new ThermalPrinterService();

// Export the service as default
export default thermalPrinterService;