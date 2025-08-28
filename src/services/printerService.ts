import { printers, print } from "tauri-plugin-printer";

import type { Printer, PrintData, PrintType } from "tauri-plugin-printer/dist/lib/types";

export type PrinterInfo = Printer;
export interface TicketData {
  ticketId: string;
  customerName?: string;
  startStationName: string;
  destinationName: string;
  vehicleLicensePlate: string;
  seatsBooked: number;
  seatNumber?: string;
  totalAmount: number;
  verificationCode?: string;
  bookingTime: string;
  qrCodeData?: string;
}

export class PrinterService {
  private static instance: PrinterService;
  private availablePrinters: PrinterInfo[] = [];

  static getInstance(): PrinterService {
    if (!PrinterService.instance) {
      PrinterService.instance = new PrinterService();
    }
    return PrinterService.instance;
  }

  /**
   * Get list of available printers
   */
  async getAvailablePrinters(): Promise<PrinterInfo[]> {
    try {
      const printerList = await printers();
      this.availablePrinters = Array.isArray(printerList) ? printerList : [];
      return this.availablePrinters;
    } catch (error) {
      console.error('Failed to get printers:', error);
      this.availablePrinters = [];
      return [];
    }
  }

  /**
   * Check if any printer is available
   */
  async isPrinterAvailable(): Promise<boolean> {
    const printers = await this.getAvailablePrinters();
    return printers.length > 0;
  }

  /**
   * Get the default printer (first available printer)
   */
  async getDefaultPrinter(): Promise<PrinterInfo | null> {
    const printers = await this.getAvailablePrinters();
    return printers.length > 0 ? printers[0] : null;
  }

  /**
   * Generate ticket print data structure
   */
  private generateTicketPrintData(ticketData: TicketData): PrintData[] {
    const currentDateTime = new Date();
    const formattedDate = currentDateTime.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = currentDateTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Helper to cast type
    const t = (type: string): PrintType => type as PrintType;

    return [
      {
        type: t('text'),
        value: 'NQLIX COMPANY',
        style: {
          fontWeight: "700",
          textAlign: 'center',
          fontSize: "18px",
          marginBottom: "10px"
        }
      },
      {
        type: t('text'),
        value: 'PASSENGER TICKET | تذكرة راكب',
        style: {
          fontWeight: "600",
          textAlign: 'center',
          fontSize: "14px",
          marginBottom: "8px"
        }
      },
      {
        type: t('text'),
        value: `${formattedDate} - ${formattedTime}`,
        style: {
          textAlign: 'center',
          fontSize: "10px",
          marginBottom: "10px"
        }
      },
      {
        type: t('text'),
        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        style: {
          textAlign: 'center',
          fontSize: "10px",
          marginBottom: "8px"
        }
      },
      ...(ticketData.customerName ? [
        {
          type: t('text'),
          value: 'PASSENGER | الراكب',
          style: {
            fontWeight: "600",
            textAlign: 'center',
            fontSize: "12px",
            marginBottom: "4px"
          }
        },
        {
          type: t('text'),
          value: ticketData.customerName,
          style: {
            textAlign: 'center',
            fontSize: "12px",
            fontWeight: "500",
            marginBottom: "8px"
          }
        }
      ] : []),
      {
        type: t('text'),
        value: 'JOURNEY | الرحلة',
        style: {
          fontWeight: "600",
          textAlign: 'center',
          fontSize: "12px",
          marginBottom: "4px"
        }
      },
      {
        type: t('text'),
        value: `${ticketData.startStationName} → ${ticketData.destinationName}`,
        style: {
          textAlign: 'center',
          fontSize: "12px",
          fontWeight: "500",
          marginBottom: "8px"
        }
      },
      {
        type: t('text'),
        value: 'VEHICLE | المركبة',
        style: {
          fontWeight: "600",
          textAlign: 'center',
          fontSize: "12px",
          marginBottom: "4px"
        }
      },
      {
        type: t('text'),
        value: ticketData.vehicleLicensePlate,
        style: {
          textAlign: 'center',
          fontSize: "14px",
          fontWeight: "700",
          fontFamily: "monospace",
          marginBottom: "8px"
        }
      },
      {
        type: t('text'),
        value: `SEATS | المقاعد: ${ticketData.seatsBooked}`,
        style: {
          textAlign: 'center',
          fontSize: "11px",
          marginBottom: "4px"
        }
      },
      ...(ticketData.seatNumber ? [
        {
          type: t('text'),
          value: `SEAT NO | رقم المقعد: ${ticketData.seatNumber}`,
          style: {
            textAlign: 'center',
            fontSize: "11px",
            marginBottom: "8px"
          }
        }
      ] : []),
      {
        type: t('text'),
        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        style: {
          textAlign: 'center',
          fontSize: "10px",
          marginBottom: "8px"
        }
      },
      {
        type: t('text'),
        value: 'TOTAL | المجموع',
        style: {
          fontWeight: "600",
          textAlign: 'center',
          fontSize: "12px",
          marginBottom: "4px"
        }
      },
      {
        type: t('text'),
        value: `${ticketData.totalAmount.toFixed(2)} TND`,
        style: {
          textAlign: 'center',
          fontSize: "16px",
          fontWeight: "700",
          marginBottom: "8px"
        }
      },
      {
        type: t('text'),
        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        style: {
          textAlign: 'center',
          fontSize: "10px",
          marginBottom: "8px"
        }
      },
      {
        type: t('text'),
        value: 'TICKET | التذكرة',
        style: {
          fontWeight: "600",
          textAlign: 'center',
          fontSize: "12px",
          marginBottom: "4px"
        }
      },
      {
        type: t('text'),
        value: `#${ticketData.ticketId}`,
        style: {
          textAlign: 'center',
          fontSize: "14px",
          fontWeight: "700",
          fontFamily: "monospace",
          marginBottom: "8px"
        }
      },
      ...(ticketData.verificationCode ? [
        {
          type: t('text'),
          value: `CODE | الرمز: ${ticketData.verificationCode}`,
          style: {
            textAlign: 'center',
            fontSize: "10px",
            fontFamily: "monospace",
            marginBottom: "8px"
          }
        }
      ] : []),
      ...(ticketData.qrCodeData ? [
        {
          type: t('qrCode'),
          value: ticketData.qrCodeData,
          height: 60,
          width: 60,
          style: { 
            margin: '8px auto',
            display: 'block'
          }
        },
        {
          type: t('text'),
          value: 'Scan for verification | امسح للتحقق',
          style: {
            textAlign: 'center',
            fontSize: "8px",
            marginBottom: "8px"
          }
        }
      ] : []),
      {
        type: t('text'),
        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        style: {
          textAlign: 'center',
          fontSize: "10px",
          marginBottom: "8px"
        }
      },
      {
        type: t('text'),
        value: 'Keep this ticket for your journey',
        style: {
          textAlign: 'center',
          fontSize: "9px",
          fontStyle: "italic",
          marginBottom: "2px"
        }
      },
      {
        type: t('text'),
        value: 'احتفظ بهذه التذكرة لرحلتك',
        style: {
          textAlign: 'center',
          fontSize: "9px",
          fontStyle: "italic",
          marginBottom: "4px"
        }
      },
      {
        type: t('text'),
        value: 'Valid for one trip only | صالحة لرحلة واحدة فقط',
        style: {
          textAlign: 'center',
          fontSize: "8px",
          marginBottom: "4px"
        }
      },
      {
        type: t('text'),
        value: 'Thank you for traveling with us!',
        style: {
          textAlign: 'center',
          fontSize: "9px",
          fontStyle: "italic",
          marginBottom: "2px"
        }
      },
      {
        type: t('text'),
        value: 'شكرًا لسفرك معنا!',
        style: {
          textAlign: 'center',
          fontSize: "9px",
          fontStyle: "italic",
          marginBottom: "4px"
        }
      },
      {
        type: t('text'),
        value: `Printed on: ${currentDateTime.toLocaleString()}`,
        style: {
          textAlign: 'center',
          fontSize: "7px",
          marginTop: "4px"
        }
      }
    ];
  }

  /**
   * Print a ticket using the tauri printer plugin
   */
  async printTicket(ticketData: TicketData, printerId?: string): Promise<boolean> {
    try {
      // Check if printer is available
      const isAvailable = await this.isPrinterAvailable();
      if (!isAvailable) {
        throw new Error('No printer available');
      }

      // Get printer to use
      let targetPrinter: PrinterInfo | null = null;
      if (printerId) {
        const printers = await this.getAvailablePrinters();
        targetPrinter = printers.find(p => p.id === printerId) || null;
      }
      
      if (!targetPrinter) {
        targetPrinter = await this.getDefaultPrinter();
      }

      if (!targetPrinter) {
        throw new Error('No suitable printer found');
      }

      // Generate print data
      const printData = this.generateTicketPrintData(ticketData);

      // Print the ticket
      await print(printData, {
        preview: false, // Set to true for testing/debugging
        page_size: {
          width: 300, // 80mm in pixels (approximately)
          height: 600 // Auto height
        },
        print_setting: {
          orientation: "portrait",
          method: "simplex",
          paper: "A4", // Will be scaled down to receipt size
          scale: "fit",
          repeat: 1,
          color_type: "monochrome" // Force black and white for thermal printers
        }
      });

      console.log('Ticket printed successfully');
      return true;

    } catch (error) {
      console.error('Failed to print ticket:', error);
      throw error;
    }
  }

  /**
   * Print a test page to verify printer functionality
   */
  async printTestPage(): Promise<boolean> {
    try {
      const t = (type: string): PrintType => type as PrintType;
      const testData: PrintData[] = [
        {
          type: t('text'),
          value: 'NQLIX PRINTER TEST',
          style: {
            fontWeight: "700",
            textAlign: 'center',
            fontSize: "16px",
            marginBottom: "10px"
          }
        },
        {
          type: t('text'),
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          style: {
            textAlign: 'center',
            fontSize: "10px",
            marginBottom: "8px"
          }
        },
        {
          type: t('text'),
          value: 'This is a test print to verify',
          style: {
            textAlign: 'center',
            fontSize: "12px",
            marginBottom: "4px"
          }
        },
        {
          type: t('text'),
          value: 'that your printer is working correctly.',
          style: {
            textAlign: 'center',
            fontSize: "12px",
            marginBottom: "8px"
          }
        },
        {
          type: t('text'),
          value: `Test Time: ${new Date().toLocaleString()}`,
          style: {
            textAlign: 'center',
            fontSize: "10px",
            marginBottom: "8px"
          }
        },
        {
          type: t('text'),
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          style: {
            textAlign: 'center',
            fontSize: "10px",
            marginBottom: "8px"
          }
        },
        {
          type: t('text'),
          value: 'If you can read this clearly,',
          style: {
            textAlign: 'center',
            fontSize: "11px",
            marginBottom: "4px"
          }
        },
        {
          type: t('text'),
          value: 'your printer is ready to use!',
          style: {
            textAlign: 'center',
            fontSize: "11px",
            fontWeight: "600"
          }
        }
      ];

      await print(testData, {
        preview: false,
        page_size: {
          width: 300,
          height: 400
        },
        print_setting: {
          orientation: "portrait",
          method: "simplex",
          paper: "A4",
          scale: "fit",
          repeat: 1,
          color_type: "monochrome" // Force black and white for thermal printers
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to print test page:', error);
      throw error;
    }
  }
}

export const printerService = PrinterService.getInstance();
