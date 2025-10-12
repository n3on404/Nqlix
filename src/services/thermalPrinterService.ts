import { invoke } from '@tauri-apps/api/tauri';
import { getLocalStorage } from '../lib/storage';

export interface PrinterConfig {
  id: string;
  name: string;
  ip: string;
  port: number;
  width: number;
  timeout: number;
  model: string;
  enabled: boolean;
  is_default: boolean;
}

export interface PrintJob {
  content: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  underline?: boolean;
  size?: 'normal' | 'double_height' | 'double_width' | 'quad';
  cut?: boolean;
  open_cash_drawer?: boolean;
}

export interface PrinterStatus {
  connected: boolean;
  error?: string;
}

export interface PrintQueueStatus {
  queue_length: number;
  is_processing: boolean;
  last_printed_at?: string;
  failed_jobs: number;
}

export enum PrintJobType {
  BookingTicket = "BookingTicket",
  EntryTicket = "EntryTicket",
  ExitTicket = "ExitTicket",
  DayPassTicket = "DayPassTicket",
  ExitPassTicket = "ExitPassTicket",
  Talon = "Talon",
  StandardTicket = "StandardTicket",
  Receipt = "Receipt",
  QRCode = "QRCode",
}

export class ThermalPrinterService {
  private static instance: ThermalPrinterService;
  private config: PrinterConfig;

  private constructor() {
    // Static printer configuration - no more dynamic IP changes
    this.config = {
      id: 'printer1',
      name: 'Imprimante Thermique',
      ip: '192.168.192.12', // Static IP - never changes
      port: 9100, // Static port - never changes
      width: 48,
      timeout: 10000, // Increased timeout for better reliability
      model: 'TM-T20X',
      enabled: true,
      is_default: true,
    };
  }

  public static getInstance(): ThermalPrinterService {
    if (!ThermalPrinterService.instance) {
      ThermalPrinterService.instance = new ThermalPrinterService();
    }
    return ThermalPrinterService.instance;
  }

  /**
   * Get all printers
   */
  async getAllPrinters(): Promise<PrinterConfig[]> {
    try {
      return await invoke<PrinterConfig[]>('get_all_printers');
    } catch (error) {
      console.error('Failed to get all printers:', error);
      throw error;
    }
  }

  /**
   * Get printer by ID
   */
  async getPrinterById(printerId: string): Promise<PrinterConfig | null> {
    try {
      return await invoke<PrinterConfig | null>('get_printer_by_id', { printerId });
    } catch (error) {
      console.error('Failed to get printer by ID:', error);
      throw error;
    }
  }

  /**
   * Get current printer configuration
   */
  async getCurrentPrinter(): Promise<PrinterConfig | null> {
    try {
      // Get current printer from backend
      const printer = await invoke<PrinterConfig | null>('get_current_printer');
      if (printer) {
        // Update local config
        this.config = printer;
      }
      return printer;
    } catch (error) {
      console.error('Failed to get current printer:', error);
      throw error;
    }
  }

  /**
   * Set current printer
   */
  async setCurrentPrinter(printerId: string): Promise<void> {
    try {
      await invoke('set_current_printer', { printerId });
      // Update local config
      const printer = await this.getPrinterById(printerId);
      if (printer) {
        this.config = printer;
      }
    } catch (error) {
      console.error('Failed to set current printer:', error);
      throw error;
    }
  }

  /**
   * Update printer configuration
   */
  async updatePrinterConfig(printerId: string, config: Partial<PrinterConfig>): Promise<void> {
    try {
      const currentPrinter = await this.getPrinterById(printerId);
      if (!currentPrinter) {
        throw new Error(`Printer with ID ${printerId} not found`);
      }
      
      const updatedConfig = { ...currentPrinter, ...config };
      await invoke('update_printer_config', { printerId, config: updatedConfig });
      
      // Update local config if this is the current printer
      if (this.config.id === printerId) {
        this.config = updatedConfig;
      }
    } catch (error) {
      console.error('Failed to update printer config:', error);
      throw error;
    }
  }

  /**
   * Add new printer - Not supported with environment variable configuration
   */
  async addPrinter(printer: PrinterConfig): Promise<void> {
    throw new Error('Adding printers is not supported. Printer configuration is managed via environment variables.');
  }

  /**
   * Remove printer - Not supported with environment variable configuration
   */
  async removePrinter(printerId: string): Promise<void> {
    throw new Error('Removing printers is not supported. Printer configuration is managed via environment variables.');
  }

  /**
   * Test printer connection
   */
  async testConnection(): Promise<PrinterStatus> {
    try {
      return await invoke<PrinterStatus>('test_printer_connection');
    } catch (error) {
      console.error('Failed to test printer connection:', error);
      throw error;
    }
  }

  /**
   * Test printer connection with specific IP and port
   */
  async testConnectionManual(ip: string, port: number): Promise<PrinterStatus> {
    try {
      return await invoke<PrinterStatus>('test_printer_connection_manual', { ip, port });
    } catch (error) {
      console.error('Failed to test printer connection:', error);
      throw error;
    }
  }

  /**
   * Update printer configuration manually
   */
  async updateConfig(config: { ip: string; port: number; enabled: boolean }): Promise<void> {
    try {
      await invoke('update_printer_config_manual', { config });
      // Update local config
      this.config = {
        ...this.config,
        ip: config.ip,
        port: config.port,
        enabled: config.enabled
      };
    } catch (error) {
      console.error('Failed to update printer config:', error);
      throw error;
    }
  }

  /**
   * Update printer configuration manually (alias for updateConfig)
   */
  async updatePrinterConfigManual(config: { ip: string; port: number; enabled: boolean }): Promise<void> {
    return this.updateConfig(config);
  }

  /**
   * Test printer connection by ID
   */
  async testPrinterConnection(printerId: string): Promise<PrinterStatus> {
    try {
      return await invoke<PrinterStatus>('test_printer_connection_by_id', { printerId });
    } catch (error) {
      console.error('Failed to test printer connection:', error);
      throw error;
    }
  }

  /**
   * Print a simple ticket with multiple fallback methods
   */
  async printTicket(content: string): Promise<string> {
    const methods = [
      () => this.printTicketMethod1(content),
      () => this.printTicketMethod2(content),
      () => this.printTicketMethod3(content),
      () => this.printTicketFallback(content)
    ];

    let lastError: Error | null = null;
    
    for (let i = 0; i < methods.length; i++) {
      try {
        console.log(`🖨️ Attempting print method ${i + 1}...`);
        const result = await methods[i]();
        console.log(`✅ Print method ${i + 1} succeeded`);
        return result;
      } catch (error) {
        console.warn(`❌ Print method ${i + 1} failed:`, error);
        lastError = error as Error;
        
        // Wait a bit before trying the next method
        if (i < methods.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    throw new Error(`All print methods failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Primary print method - Tauri invoke
   */
  private async printTicketMethod1(content: string): Promise<string> {
    return await invoke<string>('print_ticket', { content });
  }

  /**
   * Secondary print method - Direct TCP connection
   */
  private async printTicketMethod2(content: string): Promise<string> {
    return await invoke<string>('print_ticket_tcp', { 
      content, 
      ip: this.config.ip, 
      port: this.config.port 
    });
  }

  /**
   * Tertiary print method - Raw socket connection
   */
  private async printTicketMethod3(content: string): Promise<string> {
    return await invoke<string>('print_ticket_raw', { 
      content, 
      ip: this.config.ip, 
      port: this.config.port 
    });
  }

  /**
   * Fallback method - Save to file for manual printing
   */
  private async printTicketFallback(content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ticket-${timestamp}.txt`;
    
    // Save to file as fallback
    await invoke<string>('save_ticket_to_file', { 
      content, 
      filename 
    });
    
    return `Ticket saved to file: ${filename} (Printer unavailable)`;
  }

  /**
   * Print a receipt with multiple fallback methods
   */
  async printReceipt(content: string): Promise<string> {
    const methods = [
      () => this.printReceiptMethod1(content),
      () => this.printReceiptMethod2(content),
      () => this.printReceiptMethod3(content),
      () => this.printReceiptFallback(content)
    ];

    let lastError: Error | null = null;
    
    for (let i = 0; i < methods.length; i++) {
      try {
        console.log(`🖨️ Attempting receipt print method ${i + 1}...`);
        const result = await methods[i]();
        console.log(`✅ Receipt print method ${i + 1} succeeded`);
        return result;
      } catch (error) {
        console.warn(`❌ Receipt print method ${i + 1} failed:`, error);
        lastError = error as Error;
        
        // Wait a bit before trying the next method
        if (i < methods.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    throw new Error(`All receipt print methods failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Primary receipt print method - Tauri invoke
   */
  private async printReceiptMethod1(content: string): Promise<string> {
    return await invoke<string>('print_receipt', { content });
  }

  /**
   * Secondary receipt print method - Direct TCP connection
   */
  private async printReceiptMethod2(content: string): Promise<string> {
    return await invoke<string>('print_receipt_tcp', { 
      content, 
      ip: this.config.ip, 
      port: this.config.port 
    });
  }

  /**
   * Tertiary receipt print method - Raw socket connection
   */
  private async printReceiptMethod3(content: string): Promise<string> {
    return await invoke<string>('print_receipt_raw', { 
      content, 
      ip: this.config.ip, 
      port: this.config.port 
    });
  }

  /**
   * Fallback method - Save receipt to file for manual printing
   */
  private async printReceiptFallback(content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `receipt-${timestamp}.txt`;
    
    // Save to file as fallback
    await invoke<string>('save_ticket_to_file', { 
      content, 
      filename 
    });
    
    return `Receipt saved to file: ${filename} (Printer unavailable)`;
  }


  /**
   * Print a QR code
   */
  async printQRCode(data: string): Promise<string> {
    try {
      return await invoke<string>('print_qr_code', { data });
    } catch (error) {
      console.error('Failed to print QR code:', error);
      throw error;
    }
  }

  /**
   * Execute a custom print job
   */
  async executePrintJob(job: PrintJob): Promise<string> {
    try {
      return await invoke<string>('execute_print_job', { job });
    } catch (error) {
      console.error('Failed to execute print job:', error);
      throw error;
    }
  }

  /**
   * Print a formatted ticket with header, content, and footer
   */
  async printFormattedTicket(ticketData: {
    header?: string;
    content: string;
    footer?: string;
    qrCode?: string;
  }): Promise<string> {
    const { header, content, footer, qrCode } = ticketData;
    
    let printContent = '';
    
    // Header
    if (header) {
      printContent += `\n${'='.repeat(48)}\n`;
      printContent += `${header}\n`;
      printContent += `${'='.repeat(48)}\n\n`;
    }
    
    // Content
    printContent += content;
    
    
    // QR Code
    if (qrCode) {
      printContent += `\n\nQR Code: ${qrCode}`;
    }
    
    // Footer
    if (footer) {
      printContent += `\n\n${'='.repeat(48)}\n`;
      printContent += `${footer}\n`;
      printContent += `${'='.repeat(48)}\n`;
    }
    
    return this.printTicket(printContent);
  }


  /**
   * Print a receipt for payment
   */
  async printPaymentReceipt(paymentData: {
    receiptNumber: string;
    amount: string;
    paymentMethod: string;
    date: string;
    description?: string;
  }): Promise<string> {
    const receiptContent = `
REÇU DE PAIEMENT
N°: ${paymentData.receiptNumber}

Montant: ${paymentData.amount} TND
Méthode: ${paymentData.paymentMethod}
${paymentData.description ? `Description: ${paymentData.description}` : ''}

Date: ${paymentData.date}

    `.trim();

    return this.printFormattedTicket({
      header: 'REÇU DE PAIEMENT',
      content: receiptContent,
      footer: 'Merci!',
    });
  }

  /**
   * Print with company logo
   */
  async printWithLogo(content: string, logoPath: string): Promise<string> {
    try {
      return await invoke<string>('print_with_logo', { content, logoPath });
    } catch (error) {
      console.error('Failed to print with logo:', error);
      throw error;
    }
  }

  /**
   * Print standard ticket with STE Dhraiff Services Transport branding
   */
  async printStandardTicket(content: string): Promise<string> {
    try {
      return await invoke<string>('print_standard_ticket', { content });
    } catch (error) {
      console.error('Failed to print standard ticket:', error);
      throw error;
    }
  }

  /**
   * Print a STE Dhraiff Services Transport branded ticket
   */
  async printSTETicket(ticketData: {
    ticketNumber?: string;
    passengerName?: string;
    route?: string;
    departureTime?: string;
    seatNumber?: string;
    price?: string;
    additionalInfo?: string;
  }): Promise<string> {
    const { ticketNumber, passengerName, route, departureTime, seatNumber, price, additionalInfo } = ticketData;
    
    let ticketContent = '';
    
    if (ticketNumber) {
      ticketContent += `N° Ticket: ${ticketNumber}\n`;
    }
    
    if (passengerName) {
      ticketContent += `Passager: ${passengerName}\n`;
    }
    
    if (route) {
      ticketContent += `Trajet: ${route}\n`;
    }
    
    if (departureTime) {
      ticketContent += `Départ: ${departureTime}\n`;
    }
    
    if (seatNumber) {
      ticketContent += `Siège: ${seatNumber}\n`;
    }
    
    if (price) {
      ticketContent += `Prix: ${price} TND\n`;
    }
    
    if (additionalInfo) {
      ticketContent += `\n${additionalInfo}\n`;
    }
    
    return this.printStandardTicket(ticketContent);
  }

  /**
   * Print booking ticket with thermal printer
   */
  async printBookingTicket(ticketData: string, staffName?: string): Promise<string> {
    console.log('🖨️ ThermalPrinterService.printBookingTicket called');
    console.log('📄 Ticket data:', ticketData);
    console.log('👤 Staff name:', staffName);
    try {
      console.log('📡 Calling Tauri command: print_booking_ticket');
      const result = await invoke<string>('print_booking_ticket', { 
        ticketData, 
        staffName: staffName || null 
      });
      console.log('✅ Tauri command result:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to print booking ticket:', error);
      console.error('❌ Error details:', error);
      throw error;
    }
  }

  /**
   * Print talon (detachable stub) with thermal printer
   */
  async printTalon(talonData: string, staffName?: string): Promise<string> {
    console.log('🖨️ ThermalPrinterService.printTalon called');
    console.log('📄 Talon data:', talonData);
    console.log('👤 Staff name:', staffName);
    try {
      console.log('📡 Calling Tauri command: print_talon');
      const result = await invoke<string>('print_talon', { 
        talonData, 
        staffName: staffName || null 
      });
      console.log('✅ Tauri command result:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to print talon:', error);
      console.error('❌ Error details:', error);
      throw error;
    }
  }

  /**
   * Print entry ticket with thermal printer
   */
  async printEntryTicket(ticketData: string, staffName?: string): Promise<string> {
    try {
      return await invoke<string>('print_entry_ticket', { 
        ticketData, 
        staffName: staffName || null 
      });
    } catch (error) {
      console.error('Failed to print entry ticket:', error);
      throw error;
    }
  }

  /**
   * Print exit ticket with thermal printer
   */
  async printExitTicket(ticketData: string, staffName?: string): Promise<string> {
    try {
      return await invoke<string>('print_exit_ticket', { 
        ticketData, 
        staffName: staffName || null 
      });
    } catch (error) {
      console.error('Failed to print exit ticket:', error);
      throw error;
    }
  }

  /**
   * Print day pass ticket with thermal printer
   */
  async printDayPassTicket(ticketData: string, staffName?: string): Promise<string> {
    console.log('🖨️ ThermalPrinterService.printDayPassTicket called');
    console.log('📄 Day pass ticket data:', ticketData);
    console.log('👤 Staff name:', staffName);
    try {
      console.log('📡 Calling Tauri command: print_day_pass_ticket');
      const result = await invoke<string>('print_day_pass_ticket', { 
        ticketData, 
        staffName: staffName || null 
      });
      console.log('✅ Day pass ticket printed successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to print day pass ticket:', error);
      console.error('❌ Error details:', error);
      throw error;
    }
  }

  /**
   * Print exit pass ticket with thermal printer
   */
  async printExitPassTicket(ticketData: string, staffName?: string): Promise<string> {
    console.log('🖨️ ThermalPrinterService.printExitPassTicket called');
    console.log('📄 Exit pass ticket data:', ticketData);
    console.log('👤 Staff name:', staffName);
    try {
      console.log('📡 Calling Tauri command: print_exit_pass_ticket');
      const result = await invoke<string>('print_exit_pass_ticket', { 
        ticketData, 
        staffName: staffName || null 
      });
      console.log('✅ Exit pass ticket printed successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to print exit pass ticket:', error);
      console.error('❌ Error details:', error);
      throw error;
    }
  }

  // Reprint last tickets (cached in backend)
  async reprintLastBooking(): Promise<string> {
    try {
      return await invoke<string>('reprint_booking_ticket');
    } catch (error) {
      console.error('Failed to reprint last booking ticket:', error);
      throw error;
    }
  }

  async reprintLastEntry(): Promise<string> {
    try {
      return await invoke<string>('reprint_entry_ticket');
    } catch (error) {
      console.error('Failed to reprint last entry ticket:', error);
      throw error;
    }
  }

  async reprintLastExit(): Promise<string> {
    try {
      return await invoke<string>('reprint_exit_ticket');
    } catch (error) {
      console.error('Failed to reprint last exit ticket:', error);
      throw error;
    }
  }

  async reprintLastDayPass(): Promise<string> {
    try {
      return await invoke<string>('reprint_day_pass_ticket');
    } catch (error) {
      console.error('Failed to reprint last day pass ticket:', error);
      throw error;
    }
  }

  /**
   * Format booking data for thermal printing
   */
  formatBookingTicketData(booking: any): string {
    console.log('📝 formatBookingTicketData called with booking:', booking);
    let ticketContent = '';
    
    // Station information
    if (booking.startStationName) {
      ticketContent += `Station départ: ${booking.startStationName}\n`;
    }
    
    if (booking.destinationName) {
      ticketContent += `Destination: ${booking.destinationName}\n`;
    }
    
    // Vehicle information
    if (booking.vehicleLicensePlate) {
      ticketContent += `Véhicule: ${booking.vehicleLicensePlate}\n`;
    } else if (booking.licensePlate) {
      ticketContent += `Véhicule: ${booking.licensePlate}\n`;
    }
    
    // Seat information - removed as requested
    
    // Queue position
    if (booking.queuePosition) {
      ticketContent += `Position file: #${booking.queuePosition}\n`;
    }
    
    // Price breakdown - always show base price + service fees = total
    const basePrice = booking.basePrice || booking.baseAmount || 0;
    const serviceFee = 0.200; // Fixed 0.200 TND service fee per seat
    const totalPrice = basePrice + serviceFee;
    
    ticketContent += `Prix de base: ${basePrice.toFixed(3)} TND\n`;
    ticketContent += `Frais de service: ${serviceFee.toFixed(3)} TND\n`;
    ticketContent += `Total: ${totalPrice.toFixed(3)} TND\n`;
    
    // Booking type - removed as requested
    
    // Date
    if (booking.createdAt) {
      const date = new Date(booking.createdAt);
      ticketContent += `Date réservation: ${date.toLocaleString('fr-FR')}\n`;
    }
    
    // Estimated departure
    if (booking.estimatedDeparture) {
      const date = new Date(booking.estimatedDeparture);
      ticketContent += `Départ estimé: ${date.toLocaleString('fr-FR')}\n`;
    }
    
    // Staff information
    if (booking.staffName) {
      ticketContent += `Agent: ${booking.staffName}\n`;
    }
    
    console.log('📄 Formatted main ticket content:', ticketContent);
    return ticketContent;
  }

  /**
   * Format talon (detachable stub) data for thermal printing
   */
  formatTalonData(booking: any): string {
    console.log('📝 formatTalonData called with booking:', booking);
    let talonContent = '';
    
    // Compact talon content
    // Seat index (actual position/total capacity)
    if (booking.seatNumber && booking.vehicleCapacity) {
      talonContent += `Siège: ${booking.seatNumber}/${booking.vehicleCapacity}\n`;
    } else if (booking.seatNumber) {
      talonContent += `Siège: ${booking.seatNumber}/8\n`;
    } else {
      console.warn('⚠️ No seat number found in booking:', booking);
      talonContent += `Siège: N/A\n`;
    }
    
    // Vehicle license plate
    if (booking.vehicleLicensePlate) {
      talonContent += `Véhicule: ${booking.vehicleLicensePlate}\n`;
    } else if (booking.licensePlate) {
      talonContent += `Véhicule: ${booking.licensePlate}\n`;
    } else {
      console.warn('⚠️ No vehicle license plate found in booking:', booking);
      talonContent += `Véhicule: N/A\n`;
    }
    
    // Price per place (base price only, no service fees)
    const basePrice = booking.basePrice || booking.baseAmount || 0;
    talonContent += `Prix: ${basePrice.toFixed(3)} TND\n`;
    
    // Time
    const currentTime = new Date();
    talonContent += `Heure: ${currentTime.toLocaleTimeString('fr-FR')}\n`;
    
    // Staff name (from booking data or parameter)
    const staffName = booking.staffName || 'N/A';
    talonContent += `Agent: ${staffName}\n`;
    
    console.log('📄 Formatted talon content:', talonContent);
    return talonContent;
  }

  /**
   * Format driver entry ticket data for thermal printing
   */
  formatEntryTicketData(ticket: any, vehicle: any): string {
    let ticketContent = '';
    
    if (ticket.ticketNumber) {
      ticketContent += `N° Ticket: ${ticket.ticketNumber}\n`;
    }
    
    if (ticket.licensePlate || vehicle.licensePlate) {
      ticketContent += `Véhicule: ${ticket.licensePlate || vehicle.licensePlate}\n`;
    }
    
    if (ticket.stationName || ticket.departureStationName) {
      ticketContent += `Station: ${ticket.stationName || ticket.departureStationName}\n`;
    }
    
    if (ticket.destinationName || vehicle.destinationName) {
      ticketContent += `Destination: ${ticket.destinationName || vehicle.destinationName}\n`;
    }
    
    if (ticket.queuePosition) {
      ticketContent += `Position file: #${ticket.queuePosition}\n`;
    }
    
    if (ticket.nextVehiclePlate) {
      ticketContent += `Véhicule suivant: ${ticket.nextVehiclePlate}\n`;
    }
    
    if (ticket.ticketPrice) {
      ticketContent += `Frais d'entrée: ${ticket.ticketPrice} TND\n`;
    }
    
    if (ticket.entryTime) {
      const date = new Date(ticket.entryTime);
      ticketContent += `Heure d'entrée: ${date.toLocaleString('fr-FR')}\n`;
    }
    
    return ticketContent;
  }

  /**
   * Format driver exit ticket data for thermal printing
   */
  formatExitTicketData(ticket: any, vehicle: any): string {
    let ticketContent = '';
    
    if (ticket.ticketNumber) {
      ticketContent += `N° Ticket: ${ticket.ticketNumber}\n`;
    }
    
    if (ticket.licensePlate || vehicle.licensePlate) {
      ticketContent += `Véhicule: ${ticket.licensePlate || vehicle.licensePlate}\n`;
    }
    
    if (ticket.departureStationName) {
      ticketContent += `Station départ: ${ticket.departureStationName}\n`;
    }
    
    if (ticket.destinationStationName || vehicle.destinationName) {
      ticketContent += `Destination: ${ticket.destinationStationName || vehicle.destinationName}\n`;
    }
    
    if (ticket.exitTime) {
      const date = new Date(ticket.exitTime);
      ticketContent += `Heure de sortie: ${date.toLocaleString('fr-FR')}\n`;
    }
    
    return ticketContent;
  }

  /**
   * Format day pass ticket data for thermal printing
   */
  formatDayPassTicketData(dayPassData: any): string {
    console.log('📝 formatDayPassTicketData called with data:', dayPassData);
    
    // Generate a unique day pass number
    const dayPassNumber = `DP${Date.now().toString().slice(-8)}`;
    
    // Purchase date and time
    const purchaseDate = new Date();
    
    // Return JSON object as string for the printer
    const ticketData = {
      dayPassNumber: dayPassNumber,
      licensePlate: dayPassData.licensePlate || '',
      driverName: dayPassData.driverName || '',
      amount: dayPassData.amount ? dayPassData.amount.toFixed(2) : '0.00',
      purchaseDate: purchaseDate.toLocaleString('fr-FR'),
      validFor: purchaseDate.toLocaleDateString('fr-FR'),
      destinationName: dayPassData.destinationName || 'Toutes destinations',
      staffName: dayPassData.staffName || 'Staff'
    };
    
    return JSON.stringify(ticketData);
  }

  /**
   * Format exit pass ticket data for thermal printing
   */
  formatExitPassTicketData(exitPassData: any): string {
    console.log('📝 formatExitPassTicketData called with data:', exitPassData);
    
    // Generate a unique exit pass number
    const exitPassNumber = `EXIT${Date.now().toString().slice(-8)}`;
    
    const currentExitDate = new Date(exitPassData.currentExitTime);
    const exitTime = !isNaN(currentExitDate.getTime()) 
      ? currentExitDate.toLocaleString('fr-FR')
      : exitPassData.currentExitTime || new Date().toLocaleString('fr-FR');
    
    // Return JSON object as string for the printer
    const ticketData = {
      exitPassNumber: exitPassNumber,
      licensePlate: exitPassData.licensePlate || '',
      destinationName: exitPassData.destinationName || '',
      exitTime: exitTime,
      vehicleCapacity: exitPassData.vehicleCapacity || 8,
      previousVehicle: exitPassData.previousLicensePlate || null,
      previousExitTime: exitPassData.previousExitTime ? new Date(exitPassData.previousExitTime).toLocaleString('fr-FR') : null,
      basePricePerSeat: exitPassData.basePricePerSeat || 0,
      totalSeats: exitPassData.totalSeats || 8,
      totalBasePrice: exitPassData.totalBasePrice || 0,
      staffName: exitPassData.staffName || 'Staff'
    };
    
    console.log('📄 Formatted exit pass ticket data:', ticketData);
    return JSON.stringify(ticketData);
  }

  /**
   * Get current configuration
   */
  getCurrentConfig(): PrinterConfig {
    return { ...this.config };
  }

  /**
   * Set printer IP address
   */
  async setPrinterIP(ip: string): Promise<void> {
    await this.updatePrinterConfig(this.config.id, { ip });
  }

  /**
   * Set printer port
   */
  async setPrinterPort(port: number): Promise<void> {
    await this.updatePrinterConfig(this.config.id, { port });
  }

  /**
   * Set printer width
   */
  async setPrinterWidth(width: number): Promise<void> {
    await this.updatePrinterConfig(this.config.id, { width });
  }

  /**
   * Set printer timeout
   */
  async setPrinterTimeout(timeout: number): Promise<void> {
    await this.updatePrinterConfig(this.config.id, { timeout });
  }

  /**
   * Print directly via TCP (Windows-compatible, similar to PowerShell scripts)
   */
  async printDirectTcp(printerId: string, content: string): Promise<string> {
    try {
      return await invoke<string>('print_direct_tcp', { printerId, content });
    } catch (error) {
      console.error('Failed to print via direct TCP:', error);
      throw error;
    }
  }

  /**
   * Test direct TCP connection to printer
   */
  async testDirectTcpConnection(printerId: string): Promise<string> {
    try {
      return await invoke<string>('test_direct_tcp_connection', { printerId });
    } catch (error) {
      console.error('Failed to test direct TCP connection:', error);
      throw error;
    }
  }

  /**
   * Print numbers 1-5 on a specific printer (for testing)
   */
  async printNumbers(printerId: string): Promise<string> {
    let content = '';
    for (let i = 1; i <= 5; i++) {
      content += `Number: ${i}\n`;
    }
    content += '\n\n\n\n\n'; // Add spacing
    
    return this.printDirectTcp(printerId, content);
  }

  /**
   * Print a test message on a specific printer
   */
  async printTestMessage(printerId: string, message: string = 'Test Print'): Promise<string> {
    const content = `=== ${message} ===\n` +
                   `Printer ID: ${printerId}\n` +
                   `Date: ${new Date().toLocaleString()}\n` +
                   `Password: MyPass123!\n` +
                   '\n\n\n\n\n';
    
    return this.printDirectTcp(printerId, content);
  }

  // Print Queue Methods
  async getPrintQueueStatus(): Promise<PrintQueueStatus> {
    try {
      console.log('📋 Getting print queue status...');
      const status = await invoke<PrintQueueStatus>('get_print_queue_status');
      console.log('📊 Print queue status:', status);
      return status;
    } catch (error) {
      console.error('❌ Failed to get print queue status:', error);
      throw error;
    }
  }

  async getPrintQueueLength(): Promise<number> {
    try {
      const length = await invoke<number>('get_print_queue_length');
      console.log(`📏 Print queue length: ${length}`);
      return length;
    } catch (error) {
      console.error('❌ Failed to get print queue length:', error);
      throw error;
    }
  }

  async queuePrintJob(
    jobType: PrintJobType,
    content: string,
    staffName?: string,
    priority: number = 0
  ): Promise<string> {
    try {
      console.log(`📋 Queuing print job: ${jobType} with priority ${priority}`);
      const result = await invoke<string>('queue_print_job', {
        jobType,
        content,
        staffName,
        priority
      });
      console.log('✅ Print job queued successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to queue print job:', error);
      throw error;
    }
  }

  // Updated print methods to use queue system
  async printBookingTicketQueued(ticketData: string, staffName?: string): Promise<string> {
    return this.queuePrintJob(PrintJobType.BookingTicket, ticketData, staffName, 0);
  }

  async printEntryTicketQueued(ticketData: string, staffName?: string): Promise<string> {
    return this.queuePrintJob(PrintJobType.EntryTicket, ticketData, staffName, 0);
  }

  async printExitTicketQueued(ticketData: string, staffName?: string): Promise<string> {
    return this.queuePrintJob(PrintJobType.ExitTicket, ticketData, staffName, 0);
  }

  async printDayPassTicketQueued(ticketData: string, staffName?: string): Promise<string> {
    return this.queuePrintJob(PrintJobType.DayPassTicket, ticketData, staffName, 0);
  }

  async printExitPassTicketQueued(ticketData: string, staffName?: string): Promise<string> {
    return this.queuePrintJob(PrintJobType.ExitPassTicket, ticketData, staffName, 0);
  }

  async printTalonQueued(talonData: string, staffName?: string): Promise<string> {
    return this.queuePrintJob(PrintJobType.Talon, talonData, staffName, 0);
  }
}

// Export singleton instance
export const thermalPrinter = ThermalPrinterService.getInstance();