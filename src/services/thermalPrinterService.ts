import { invoke } from '@tauri-apps/api/tauri';

export interface PrinterConfig {
  ip: string;
  port: number;
  width: number;
  timeout: number;
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

export class ThermalPrinterService {
  private static instance: ThermalPrinterService;
  private config: PrinterConfig;

  private constructor() {
    this.config = {
      ip: '192.168.192.168', // Default IP for Epson TM-T20X
      port: 9100, // Default port for Epson printers
      width: 48,
      timeout: 5000,
    };
  }

  public static getInstance(): ThermalPrinterService {
    if (!ThermalPrinterService.instance) {
      ThermalPrinterService.instance = new ThermalPrinterService();
    }
    return ThermalPrinterService.instance;
  }

  /**
   * Get current printer configuration
   */
  async getConfig(): Promise<PrinterConfig> {
    try {
      this.config = await invoke<PrinterConfig>('get_printer_config');
      return this.config;
    } catch (error) {
      console.error('Failed to get printer config:', error);
      throw error;
    }
  }

  /**
   * Update printer configuration
   */
  async updateConfig(config: Partial<PrinterConfig>): Promise<void> {
    try {
      const newConfig = { ...this.config, ...config };
      await invoke('update_printer_config', { config: newConfig });
      this.config = newConfig;
    } catch (error) {
      console.error('Failed to update printer config:', error);
      throw error;
    }
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
   * Print a simple ticket
   */
  async printTicket(content: string): Promise<string> {
    try {
      return await invoke<string>('print_ticket', { content });
    } catch (error) {
      console.error('Failed to print ticket:', error);
      throw error;
    }
  }

  /**
   * Print a receipt
   */
  async printReceipt(content: string): Promise<string> {
    try {
      return await invoke<string>('print_receipt', { content });
    } catch (error) {
      console.error('Failed to print receipt:', error);
      throw error;
    }
  }

  /**
   * Print a barcode
   */
  async printBarcode(data: string, barcodeType: number = 73): Promise<string> {
    try {
      return await invoke<string>('print_barcode', { 
        data, 
        barcodeType 
      });
    } catch (error) {
      console.error('Failed to print barcode:', error);
      throw error;
    }
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
    barcode?: string;
    qrCode?: string;
  }): Promise<string> {
    const { header, content, footer, barcode, qrCode } = ticketData;
    
    let printContent = '';
    
    // Header
    if (header) {
      printContent += `\n${'='.repeat(48)}\n`;
      printContent += `${header}\n`;
      printContent += `${'='.repeat(48)}\n\n`;
    }
    
    // Content
    printContent += content;
    
    // Barcode
    if (barcode) {
      printContent += `\n\nBarcode: ${barcode}`;
    }
    
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
  async printBookingTicket(ticketData: string): Promise<string> {
    console.log('🖨️ ThermalPrinterService.printBookingTicket called');
    console.log('📄 Ticket data:', ticketData);
    try {
      console.log('📡 Calling Tauri command: print_booking_ticket');
      const result = await invoke<string>('print_booking_ticket', { ticketData });
      console.log('✅ Tauri command result:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to print booking ticket:', error);
      console.error('❌ Error details:', error);
      throw error;
    }
  }

  /**
   * Print entry ticket with thermal printer
   */
  async printEntryTicket(ticketData: string): Promise<string> {
    try {
      return await invoke<string>('print_entry_ticket', { ticketData });
    } catch (error) {
      console.error('Failed to print entry ticket:', error);
      throw error;
    }
  }

  /**
   * Print exit ticket with thermal printer
   */
  async printExitTicket(ticketData: string): Promise<string> {
    try {
      return await invoke<string>('print_exit_ticket', { ticketData });
    } catch (error) {
      console.error('Failed to print exit ticket:', error);
      throw error;
    }
  }

  /**
   * Print day pass ticket with thermal printer
   */
  async printDayPassTicket(ticketData: string): Promise<string> {
    console.log('🖨️ ThermalPrinterService.printDayPassTicket called');
    console.log('📄 Day pass ticket data:', ticketData);
    try {
      console.log('📡 Calling Tauri command: print_day_pass_ticket');
      const result = await invoke<string>('print_day_pass_ticket', { ticketData });
      console.log('✅ Day pass ticket printed successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to print day pass ticket:', error);
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
    
    // Ticket number - use verificationCode as primary, fallback to id
    if (booking.verificationCode) {
      ticketContent += `N° Ticket: ${booking.verificationCode}\n`;
    } else if (booking.id) {
      ticketContent += `N° Ticket: ${booking.id}\n`;
    }
    
    // Customer name - might not be available in this API response
    if (booking.customerName) {
      ticketContent += `Passager: ${booking.customerName}\n`;
    } else if (booking.customerPhone) {
      ticketContent += `Téléphone: ${booking.customerPhone}\n`;
    }
    
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
    }
    
    // Seat information
    if (booking.seatsBooked) {
      ticketContent += `Places: ${booking.seatsBooked}\n`;
    }
    
    if (booking.seatNumber) {
      ticketContent += `Siège: ${booking.seatNumber}\n`;
    }
    
    // Queue position
    if (booking.queuePosition) {
      ticketContent += `Position file: #${booking.queuePosition}\n`;
    }
    
    // Price
    if (booking.totalAmount) {
      ticketContent += `Prix: ${booking.totalAmount} TND\n`;
    }
    
    // Booking type
    if (booking.bookingType) {
      ticketContent += `Type: ${booking.bookingType}\n`;
    }
    
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
    
    console.log('📄 Formatted ticket content:', ticketContent);
    return ticketContent;
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
    let ticketContent = '';
    
    // Generate a unique day pass number
    const dayPassNumber = `DP${Date.now().toString().slice(-8)}`;
    ticketContent += `N° Pass: ${dayPassNumber}\n`;
    
    // Vehicle information
    if (dayPassData.licensePlate) {
      ticketContent += `Véhicule: ${dayPassData.licensePlate}\n`;
    }
    
    // Driver information
    if (dayPassData.driverName) {
      ticketContent += `Conducteur: ${dayPassData.driverName}\n`;
    }
    
    // Purchase amount
    if (dayPassData.amount) {
      ticketContent += `Montant: ${dayPassData.amount.toFixed(2)} TND\n`;
    }
    
    // Purchase date and time
    const purchaseDate = new Date();
    ticketContent += `Date d'achat: ${purchaseDate.toLocaleString('fr-FR')}\n`;
    
    // Validity information
    ticketContent += `Valide pour: ${purchaseDate.toLocaleDateString('fr-FR')}\n`;
    ticketContent += `Type: Pass Journalier\n`;
    
    return ticketContent;
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
    await this.updateConfig({ ip });
  }

  /**
   * Set printer port
   */
  async setPrinterPort(port: number): Promise<void> {
    await this.updateConfig({ port });
  }

  /**
   * Set printer width
   */
  async setPrinterWidth(width: number): Promise<void> {
    await this.updateConfig({ width });
  }

  /**
   * Set printer timeout
   */
  async setPrinterTimeout(timeout: number): Promise<void> {
    await this.updateConfig({ timeout });
  }
}

// Export singleton instance
export const thermalPrinter = ThermalPrinterService.getInstance();