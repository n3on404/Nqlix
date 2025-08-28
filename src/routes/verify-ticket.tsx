import { useState } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  Printer
} from "lucide-react";
import api from '../lib/api';
import { TicketPrintout } from '../components/TicketPrintout';
import { renderToString } from 'react-dom/server';
import { printerService, type TicketData } from '../services/printerService';

type VerificationStatus = 'success' | 'not_found' | 'already_verified' | 'error';

interface VerificationResult {
  status: VerificationStatus;
  message: string;
}

interface VerifyTicketResponse {
  success: boolean;
  message: string;
  data?: any;
  justVerified?: boolean;
}

export default function VerifyTicket() {
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintTicket = async (bookingData: any) => {
    setIsPrinting(true);
    try {
      // Check if printer is available
      const isPrinterAvailable = await printerService.isPrinterAvailable();
      if (!isPrinterAvailable) {
        console.warn('No printer available, falling back to browser print');
        await printTicketFallback(bookingData);
        return;
      }

      // Prepare ticket data
      const ticketData: TicketData = {
        ticketId: bookingData.ticketId || bookingData.verificationCode || bookingData.id || 'UNKNOWN',
        customerName: bookingData.customerName,
        startStationName: bookingData.startStationName || 'CURRENT STATION',
        destinationName: bookingData.destinationName,
        vehicleLicensePlate: bookingData.vehicleLicensePlate,
        seatsBooked: bookingData.seatsBooked || bookingData.seats || 1,
        seatNumber: bookingData.seatNumber,
        totalAmount: bookingData.totalAmount || (bookingData.basePrice * (bookingData.seatsBooked || 1)) || 0,
        verificationCode: bookingData.verificationCode,
        bookingTime: bookingData.bookingTime || bookingData.createdAt || new Date().toISOString(),
        qrCodeData: bookingData.verificationCode || bookingData.id
      };

      // Print using tauri printer
      await printerService.printTicket(ticketData);
      console.log('Ticket printed successfully with printer service');

    } catch (error) {
      console.error('Printer service failed, falling back to browser print:', error);
      await printTicketFallback(bookingData);
    } finally {
      setIsPrinting(false);
    }
  };

  const printTicketFallback = async (bookingData: any) => {
    // Fallback to browser print
    const html = renderToString(<TicketPrintout booking={bookingData} />);
    const printWindow = window.open('', '', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Ticket Printout</title>
            <style>
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
              }
              @media print {
                @page {
                  size: 80mm auto;
                  margin: 2mm;
                }
                body * {
                  visibility: hidden;
                }
                .ticket-printout, .ticket-printout * {
                  visibility: visible;
                }
                .ticket-printout {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100% !important;
                  box-shadow: none !important;
                  border: none !important;
                }
              }
            </style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      
      // Wait a bit for the content to load before printing
      setTimeout(() => {
        printWindow.print();
        setTimeout(() => {
          printWindow.close();
        }, 1000);
      }, 500);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setVerificationResult(null);

    try {
      const response = await api.verifyOnlineTicket(verificationCode) as VerifyTicketResponse;
      if (response.success && response.data) {
        if (response.justVerified === true) {
          setVerificationResult({
            status: 'success',
            message: 'Ticket vérifié avec succès ! Impression du ticket...'
          });
          
          // Get full booking details for printing
          const bookingDetails = await api.getBookingByVerificationCode(verificationCode);
          if (bookingDetails.success && bookingDetails.data) {
            // Automatically print the ticket
            await handlePrintTicket(bookingDetails.data);
          }
        } else {
          setVerificationResult({
            status: 'already_verified',
            message: 'Ce ticket a déjà été vérifié.'
          });
        }
      } else {
        setVerificationResult({
          status: response.message?.includes('already verified') ? 'already_verified' : 'not_found',
          message: response.message || 'Ticket invalide ou déjà vérifié.'
        });
      }
    } catch (error) {
      setVerificationResult({
        status: 'error',
        message: 'Échec de la vérification.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setVerificationCode("");
    setVerificationResult(null);
  };

  const getStatusIcon = (status: VerificationStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case 'not_found':
        return <XCircle className="h-8 w-8 text-red-500" />;
      case 'already_verified':
        return <AlertCircle className="h-8 w-8 text-orange-500" />;
      case 'error':
        return <XCircle className="h-8 w-8 text-red-500" />;
      default:
        return <XCircle className="h-8 w-8 text-red-500" />;
    }
  };

  const getStatusColor = (status: VerificationStatus) => {
    switch (status) {
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'not_found':
        return 'border-red-200 bg-red-50';
      case 'already_verified':
        return 'border-orange-200 bg-orange-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-red-200 bg-red-50';
    }
  };

  const getStatusTextColor = (status: VerificationStatus) => {
    switch (status) {
      case 'success':
        return 'text-green-700';
      case 'not_found':
        return 'text-red-700';
      case 'already_verified':
        return 'text-orange-700';
      case 'error':
        return 'text-red-700';
      default:
        return 'text-red-700';
    }
  };

  const getStatusTitle = (status: VerificationStatus) => {
    switch (status) {
      case 'success':
        return 'Ticket Valide';
      case 'not_found':
        return 'Ticket Non Trouvé';
      case 'already_verified':
        return 'Déjà Vérifié';
      case 'error':
        return 'Erreur de Vérification';
      default:
        return 'Erreur';
    }
  };

  return (
    <div className="flex flex-col h-full w-full p-6">
      <div className="max-w-md mx-auto w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Vérifier le Ticket</h1>
          <p className="text-muted-foreground">Entrez le code de vérification pour vérifier la validité du ticket</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                Code de Vérification
              </label>
              <div className="relative">
                <input
                  id="code"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                  placeholder="TN2501A123"
                  className="w-full px-4 py-3 border rounded-lg bg-background font-mono text-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                  required
                  disabled={isLoading}
                />
                {isLoading && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex space-x-3">
              <Button 
                type="submit" 
                disabled={isLoading || !verificationCode}
                className="flex-1 h-12 text-lg font-semibold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Vérification...
                  </>
                ) : (
                  "Vérifier le Ticket"
                )}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={resetForm} 
                className="h-12 px-6"
                disabled={isLoading}
              >
                Effacer
              </Button>
            </div>
          </form>
        </Card>

        {/* Verification Status */}
        {verificationResult && (
          <Card className={`p-6 ${getStatusColor(verificationResult.status)} animate-in slide-in-from-left-5 duration-300`}>
            <div className="flex items-start space-x-3">
              {getStatusIcon(verificationResult.status)}
              <div className="flex-1">
                <h3 className={`text-lg font-semibold ${getStatusTextColor(verificationResult.status)}`}>
                  {getStatusTitle(verificationResult.status)}
                </h3>
                <p className={`text-sm mt-1 ${getStatusTextColor(verificationResult.status)}`}>
                  {verificationResult.message}
                </p>
                {verificationResult.status === 'success' && isPrinting && (
                  <div className="mt-3 flex items-center space-x-2">
                    <Printer className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600">Impression du ticket...</span>
                  </div>
                )}
                {verificationResult.status === 'not_found' && (
                  <div className="mt-3 p-3 bg-card rounded-lg border">
                    <p className="text-xs text-muted-foreground">
                      <strong>Conseils:</strong> Assurez-vous que le code est saisi correctement. 
                      Les codes sont sensibles à la casse et doivent être exactement comme indiqué sur le ticket.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
} 