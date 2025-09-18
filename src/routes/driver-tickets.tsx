import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { DriverEntryTicket } from '../components/DriverEntryTicket';
import { DriverExitTicket } from '../components/DriverExitTicket';
import { thermalPrinter } from '../services/thermalPrinterService';
import { useAuth } from '../context/AuthProvider';
import api from '../lib/api';
import { toast } from 'sonner';
import { 
  Search, 
  Car, 
  User, 
  MapPin, 
  Clock, 
  Hash, 
  FileText, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  RefreshCw,
  Plus,
  ArrowRight,
  QrCode,
  Calendar,
  Settings,
  Printer
} from 'lucide-react';

interface Vehicle {
  id: string;
  licensePlate: string;
  queuePosition?: number;
  status?: string;
  destinationName: string;
  destinationId: string;
  enteredAt?: string;
  startTime?: string;
  seatsBooked?: number;
  source: 'queue' | 'trip';
  driver: {
    firstName: string;
    lastName: string;
    cin: string;
    phoneNumber: string;
  } | null;
  vehicle: {
    model?: string;
    color?: string;
    capacity: number;
  };
}

interface DriverTicket {
  id: string;
  licensePlate: string;
  ticketNumber: string;
  entryTime?: string;
  exitTime?: string;
  stationName?: string;
  departureStationName?: string;
  destinationStationName?: string;
  queuePosition?: number;
  nextVehiclePlate?: string;
  ticketPrice?: number;
}

export default function DriverTicketsPage() {
  const { currentStaff } = useAuth();
  // Thermal printer functionality removed - keeping console logging
  
  const [activeTab, setActiveTab] = useState<'entry' | 'exit' | 'settings'>('entry');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cinSearch, setCinSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [entryTicket, setEntryTicket] = useState<DriverTicket | null>(null);
  const [exitTicket, setExitTicket] = useState<DriverTicket | null>(null);
  const [showEntryTicket, setShowEntryTicket] = useState(false);
  const [showExitTicket, setShowExitTicket] = useState(false);

  const reprintLastEntry = async () => {
    try {
      await thermalPrinter.reprintLastEntry();
      console.log('✅ Reprinted last entry ticket');
    } catch (error) {
      console.error('❌ Failed to reprint last entry ticket:', error);
    }
  };

  const reprintLastExit = async () => {
    try {
      await thermalPrinter.reprintLastExit();
      console.log('✅ Reprinted last exit ticket');
    } catch (error) {
      console.error('❌ Failed to reprint last exit ticket:', error);
    }
  };

  // Load vehicles based on active tab
  useEffect(() => {
    loadVehicles();
  }, [activeTab]);

  // Filter vehicles based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredVehicles(vehicles);
    } else {
      const filtered = vehicles.filter(vehicle =>
        vehicle.licensePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vehicle.driver?.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vehicle.driver?.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vehicle.driver?.cin.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vehicle.destinationName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredVehicles(filtered);
    }
  }, [vehicles, searchTerm]);

  // Helper function to log ticket data for development
  const logTicketData = async (
    ticketData: DriverTicket, 
    vehicle: Vehicle, 
    ticketType: 'entry' | 'exit'
  ) => {
    try {
      const thermalData = {
        ticketNumber: ticketData.ticketNumber,
        licensePlate: ticketData.licensePlate,
        stationName: ticketData.stationName || ticketData.departureStationName || 'Station',
        datetime: new Date(ticketData.entryTime || ticketData.exitTime || new Date()),
        ticketType,
        queuePosition: ticketData.queuePosition,
        nextVehicle: ticketData.nextVehiclePlate,
        price: ticketData.ticketPrice,
        departureStation: ticketData.departureStationName,
        destinationStation: ticketData.destinationStationName,
        exitTime: ticketData.exitTime ? new Date(ticketData.exitTime) : undefined
      };

      console.log(`Ticket data for ${ticketType} ticket:`, thermalData);
      console.log(`Full ticket data:`, ticketData);
      console.log(`Vehicle data:`, vehicle);
    } catch (error) {
      console.error('Failed to log ticket data:', error);
    }
  };

  const loadVehicles = async () => {
    setIsLoadingVehicles(true);
    try {
      const response = activeTab === 'entry' 
        ? await api.getVehiclesInQueue()
        : await api.getVehiclesForExit();
      
      if (response.success) {
        if (activeTab === 'entry') {
          // For entry tickets, filter only WAITING and LOADING status vehicles
          const vehiclesByDestination = (response.data as any)?.vehiclesByDestination || {};
          const allVehicles: Vehicle[] = [];
          Object.values(vehiclesByDestination).forEach((destinationVehicles: any) => {
            const filteredVehicles = destinationVehicles.filter((vehicle: any) => 
              vehicle.status === 'WAITING' || vehicle.status === 'LOADING'
            );
            allVehicles.push(...filteredVehicles);
          });
          setVehicles(allVehicles);
        } else {
          // For exit tickets, filter only READY status vehicles
          const allVehicles = (response.data as any)?.vehicles || [];
          const filteredVehicles = allVehicles.filter((vehicle: any) => 
            vehicle.status === 'READY'
          );
          setVehicles(filteredVehicles);
        }
      } else {
        toast.error(response.message || 'Échec du chargement des véhicules');
      }
    } catch (error: any) {
      console.error('Error loading vehicles:', error);
      toast.error(error.message || 'Échec du chargement des véhicules');
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  const searchByCIN = async () => {
    if (!cinSearch.trim()) {
      toast.error('Veuillez saisir un CIN');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.searchVehicleByCIN(cinSearch.trim());
      
      if (response.success) {
        const data = response.data as any;
        if (data.queueEntry || data.recentTrip) {
          // Apply status filter based on active tab
          const shouldShow = activeTab === 'entry' 
            ? (data.queueEntry?.status === 'WAITING' || data.queueEntry?.status === 'LOADING')
            : (data.queueEntry?.status === 'READY');

          if (shouldShow) {
            // Create a vehicle object from the search result
            const vehicle: Vehicle = {
              id: data.queueEntry?.id || data.recentTrip?.id || 'search-result',
              licensePlate: data.vehicle.licensePlate,
              queuePosition: data.queueEntry?.queuePosition,
              status: data.queueEntry?.status,
              destinationName: data.queueEntry?.destinationName || data.recentTrip?.destinationName,
              destinationId: data.queueEntry?.destinationId || data.recentTrip?.destinationId,
              enteredAt: data.queueEntry?.enteredAt,
              startTime: data.recentTrip?.startTime,
              seatsBooked: data.recentTrip?.seatsBooked,
              source: data.queueEntry ? 'queue' : 'trip',
              driver: data.driver,
              vehicle: data.vehicle
            };
            
            setVehicles([vehicle]);
            setFilteredVehicles([vehicle]);
            toast.success('Véhicule trouvé!');
          } else {
            const requiredStatus = activeTab === 'entry' ? 'EN ATTENTE ou EN CHARGEMENT' : 'PRÊT';
            toast.error(`Ce véhicule n'a pas le statut requis (${requiredStatus}) pour ce type de ticket`);
          }
        } else {
          toast.error('Aucune entrée de file ou voyage récent trouvé pour ce conducteur');
        }
      } else {
        toast.error(response.message || 'Conducteur non trouvé');
      }
    } catch (error: any) {
      console.error('Error searching by CIN:', error);
      toast.error(error.message || 'Échec de la recherche par CIN');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateEntryTicket = async (vehicle: Vehicle) => {
    if (!currentStaff?.id) {
      toast.error('Authentification du personnel requise');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post('/api/driver-tickets/entry', {
        licensePlate: vehicle.licensePlate,
        destinationId: vehicle.destinationId,
        destinationName: vehicle.destinationName,
        staffId: currentStaff.id
      });

      if (response.success) {
        const ticketData = (response.data as any)?.ticket;
        setEntryTicket(ticketData);
        setShowEntryTicket(true);
        
        // Print with thermal printer
        try {
          const formattedData = thermalPrinter.formatEntryTicketData(ticketData, vehicle);
          await thermalPrinter.printEntryTicket(formattedData);
          console.log('✅ Entry ticket printed successfully with thermal printer');
        } catch (printError) {
          console.error('Thermal printer error:', printError);
          // Don't fail the ticket generation if printing fails
        }
        
        toast.success('Ticket d\'entrée généré avec succès');
        // Reload vehicles to update the list
        loadVehicles();
      } else {
        toast.error(response.message || 'Échec de la génération du ticket d\'entrée');
      }
    } catch (error: any) {
      console.error('Error generating entry ticket:', error);
      toast.error(error.message || 'Échec de la génération du ticket d\'entrée');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateExitTicket = async (vehicle: Vehicle) => {
    if (!currentStaff?.id) {
      toast.error('Authentification du personnel requise');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post('/api/driver-tickets/exit', {
        licensePlate: vehicle.licensePlate,
        destinationId: vehicle.destinationId,
        destinationName: vehicle.destinationName,
        staffId: currentStaff.id
      });

      if (response.success) {
        const ticketData = (response.data as any)?.ticket;
        setExitTicket(ticketData);
        setShowExitTicket(true);
        
        // Print with thermal printer
        try {
          const formattedData = thermalPrinter.formatExitTicketData(ticketData, vehicle);
          await thermalPrinter.printExitTicket(formattedData);
          console.log('✅ Exit ticket printed successfully with thermal printer');
        } catch (printError) {
          console.error('Thermal printer error:', printError);
          // Don't fail the ticket generation if printing fails
        }
        
        toast.success('Ticket de sortie généré avec succès - Véhicule marqué comme parti');
        // Reload vehicles to remove the departed vehicle from the list
        loadVehicles();
      } else {
        toast.error(response.message || 'Échec de la génération du ticket de sortie');
      }
    } catch (error: any) {
      console.error('Error generating exit ticket:', error);
      toast.error(error.message || 'Échec de la génération du ticket de sortie');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintEntryTicket = () => {
    if (entryTicket) {
      // Try to use window.open first, if it fails, use iframe method
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      if (!printWindow) {
        // Fallback: Use iframe method if popup is blocked
        printEntryTicketWithIframe();
        return;
      }

      // Get the ticket element
      const ticketElement = document.querySelector('.driver-entry-ticket');
      if (!ticketElement) {
        printWindow.close();
        toast.error('Ticket element not found');
        return;
      }

      // Create the print content
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Driver Entry Ticket</title>
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              font-size: 12px;
              background: white;
              color: black;
            }
            .ticket {
              width: 100%;
              max-width: 100%;
              margin: 0 auto;
              padding: 16px;
              border: 2px solid #000;
              background: white;
              color: black;
              page-break-inside: avoid;
              break-inside: avoid;
              box-sizing: border-box;
            }
            .ticket * {
              color: black !important;
              background: transparent !important;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
            }
            .company-name {
              text-align: center;
              margin: 0 0 4px 0;
              font-size: 20px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .bilingual-title {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin: 6px 0;
            }
            .english-title {
              font-size: 14px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .arabic-title {
              font-size: 14px;
              font-weight: bold;
              direction: rtl;
              padding-right: 12px;
            }
            .datetime {
              text-align: center;
              font-size: 12px;
              color: #333;
              margin-bottom: 12px;
            }
            .divider {
              border: none;
              border-top: 1px solid #000;
              margin: 8px 0;
              width: 100%;
            }
            .section {
              text-align: center;
              margin: 12px 0;
              padding: 8px;
              border: 1px solid #000;
            }
            .station-section { background-color: #f8f8f8; }
            .vehicle-section { background-color: #f0f0f0; }
            .queue-section { background-color: #e8f4f8; }
            .price-section { background-color: #f8f8f8; }
            .ticket-number {
              text-align: center;
              font-size: 18px;
              font-weight: bold;
              margin: 12px 0;
              padding: 8px;
              border: 2px solid #000;
              border-radius: 4px;
              background-color: #f0f0f0;
            }
            .vehicle-plate {
              font-size: 18px;
              font-weight: bold;
              font-family: monospace;
              letter-spacing: 1px;
              margin: 8px 0;
            }
            .queue-position {
              font-size: 24px;
              font-weight: bold;
              margin: 8px 0;
              text-align: center;
            }
            .next-vehicle {
              font-size: 18px;
              font-weight: bold;
              margin: 8px 0;
              text-align: center;
              font-family: monospace;
              letter-spacing: 1px;
              padding: 8px;
              background-color: #f0f0f0;
              border: 1px solid #000;
              border-radius: 4px;
            }
            .footer {
              text-align: center;
              margin-top: 12px;
              font-size: 10px;
              font-style: italic;
              border-top: 1px solid #000;
              padding-top: 8px;
            }
            .bilingual-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin: 6px 0;
              font-size: 14px;
              min-height: 24px;
            }
            .english-label {
              font-weight: bold;
              text-transform: uppercase;
              font-size: 12px;
              text-align: left;
              flex: 0 0 auto;
              min-width: 80px;
            }
            .arabic-label {
              font-weight: bold;
              font-size: 12px;
              text-align: right;
              flex: 0 0 auto;
              min-width: 100px;
              direction: rtl;
              margin-right: 25px;
            }
            .center-value {
              font-weight: normal;
              text-align: center;
              flex: 1;
              font-size: 14px;
              margin: 0 12px;
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="header">
              <h2 class="company-name">NQLIX COMPANY</h2>
              <div class="bilingual-title">
                <span class="english-title">DRIVER ENTRY TICKET</span>
                <span class="arabic-title">تذكرة دخول السائق</span>
              </div>
              <div class="datetime">
                <div>${new Date(entryTicket.entryTime || new Date()).toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}</div>
                <div>${new Date(entryTicket.entryTime || new Date()).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}</div>
              </div>
            </div>
            <hr class="divider">
            <div class="section station-section">
              <div class="bilingual-title">
                <span class="english-title">STATION</span>
                <span class="arabic-title">المحطة</span>
              </div>
              <div style="font-size: 12px; font-weight: bold; margin: 4px 0;">
                ${entryTicket.stationName}
              </div>
            </div>
            <div class="section vehicle-section">
              <div class="bilingual-title">
                <span class="english-title">VEHICLE</span>
                <span class="arabic-title">المركبة</span>
              </div>
              <div class="vehicle-plate">
                ${entryTicket.licensePlate}
              </div>
            </div>
            <div class="section queue-section">
              <div class="bilingual-title">
                <span class="english-title">QUEUE POSITION</span>
                <span class="arabic-title">موقع في الطابور</span>
              </div>
              <div class="queue-position">
                #${entryTicket.queuePosition}
              </div>
              ${entryTicket.nextVehiclePlate ? `
                <div class="bilingual-title">
                  <span class="english-title">NEXT VEHICLE</span>
                  <span class="arabic-title">المركبة التالية</span>
                </div>
                <div class="next-vehicle">
                  ${entryTicket.nextVehiclePlate}
                </div>
              ` : ''}
            </div>
            <hr class="divider">
            <div class="section price-section">
              <div class="bilingual-row">
                <span class="english-label">ENTRY FEE</span>
                <span class="center-value" style="font-weight: bold; font-size: 12px;">
                  ${entryTicket.ticketPrice || 2.0} TND
                </span>
                <span class="arabic-label">رسوم الدخول</span>
              </div>
            </div>
            <hr class="divider">
            <div class="ticket-number">
              <div class="bilingual-title">
                <span class="english-title">TICKET</span>
                <span class="arabic-title">التذكرة</span>
              </div>
              #${entryTicket.ticketNumber}
            </div>
            <hr class="divider">
            <div class="footer">
              <div class="bilingual-title">
                <span>Keep this ticket for your records</span>
                <span style="direction: rtl; margin-right: 20px;">احتفظ بهذه التذكرة لسجلاتك</span>
              </div>
              <div class="bilingual-title">
                <span>Entry fee: 2 TND</span>
                <span style="direction: rtl; margin-right: 20px;">رسوم الدخول: 2 دينار</span>
              </div>
              <div style="margin-top: 2px; font-size: 7px; text-align: center;">
                Printed on ${new Date().toLocaleString()} | طُبع في ${new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(printContent);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };
    }
  };

  const printEntryTicketWithIframe = () => {
    if (!entryTicket) return;

    // Create iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    document.body.appendChild(iframe);

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket d'Entrée Conducteur</title>
        <style>
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            font-size: 12px;
            background: white;
            color: black;
          }
          .ticket {
            width: 100%;
            max-width: 100%;
            margin: 0 auto;
            padding: 16px;
            border: 2px solid #000;
            background: white;
            color: black;
            page-break-inside: avoid;
            break-inside: avoid;
            box-sizing: border-box;
          }
          .ticket * {
            color: black !important;
            background: transparent !important;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .company-name {
            text-align: center;
            margin: 0 0 4px 0;
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .bilingual-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 6px 0;
          }
          .english-title {
            font-size: 14px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .arabic-title {
            font-size: 14px;
            font-weight: bold;
            direction: rtl;
            padding-right: 12px;
          }
          .datetime {
            text-align: center;
            font-size: 12px;
            color: #333;
            margin-bottom: 12px;
          }
          .divider {
            border: none;
            border-top: 1px solid #000;
            margin: 8px 0;
            width: 100%;
          }
          .section {
            text-align: center;
            margin: 12px 0;
            padding: 8px;
            border: 1px solid #000;
          }
          .station-section { background-color: #f8f8f8; }
          .vehicle-section { background-color: #f0f0f0; }
          .queue-section { background-color: #e8f4f8; }
          .price-section { background-color: #f8f8f8; }
          .ticket-number {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin: 12px 0;
            padding: 8px;
            border: 2px solid #000;
            border-radius: 4px;
            background-color: #f0f0f0;
          }
          .vehicle-plate {
            font-size: 18px;
            font-weight: bold;
            font-family: monospace;
            letter-spacing: 1px;
            margin: 8px 0;
          }
          .queue-position {
            font-size: 24px;
            font-weight: bold;
            margin: 8px 0;
            text-align: center;
          }
          .next-vehicle {
            font-size: 18px;
            font-weight: bold;
            margin: 8px 0;
            text-align: center;
            font-family: monospace;
            letter-spacing: 1px;
            padding: 8px;
            background-color: #f0f0f0;
            border: 1px solid #000;
            border-radius: 4px;
          }
          .footer {
            text-align: center;
            margin-top: 12px;
            font-size: 10px;
            font-style: italic;
            border-top: 1px solid #000;
            padding-top: 8px;
          }
          .bilingual-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 6px 0;
            font-size: 14px;
            min-height: 24px;
          }
          .english-label {
            font-weight: bold;
            text-transform: uppercase;
            font-size: 12px;
            text-align: left;
            flex: 0 0 auto;
            min-width: 80px;
          }
          .arabic-label {
            font-weight: bold;
            font-size: 12px;
            text-align: right;
            flex: 0 0 auto;
            min-width: 100px;
            direction: rtl;
            margin-right: 25px;
          }
          .center-value {
            font-weight: normal;
            text-align: center;
            flex: 1;
            font-size: 14px;
            margin: 0 12px;
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            <h2 class="company-name">NQLIX COMPANY</h2>
            <div class="bilingual-title">
              <span class="english-title">DRIVER ENTRY TICKET</span>
              <span class="arabic-title">تذكرة دخول السائق</span>
            </div>
            <div class="datetime">
              <div>${new Date(entryTicket.entryTime || new Date()).toLocaleDateString('fr-FR', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}</div>
              <div>${new Date(entryTicket.entryTime || new Date()).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
              })}</div>
            </div>
          </div>
          <hr class="divider">
          <div class="section station-section">
            <div class="bilingual-title">
              <span class="english-title">STATION</span>
              <span class="arabic-title">المحطة</span>
            </div>
            <div style="font-size: 12px; font-weight: bold; margin: 4px 0;">
              ${entryTicket.stationName}
            </div>
          </div>
          <div class="section vehicle-section">
            <div class="bilingual-title">
              <span class="english-title">VEHICLE</span>
              <span class="arabic-title">المركبة</span>
            </div>
            <div class="vehicle-plate">
              ${entryTicket.licensePlate}
            </div>
          </div>
          <div class="section queue-section">
            <div class="bilingual-title">
              <span class="english-title">QUEUE POSITION</span>
              <span class="arabic-title">موقع في الطابور</span>
            </div>
            <div class="queue-position">
              #${entryTicket.queuePosition}
            </div>
            ${entryTicket.nextVehiclePlate ? `
              <div class="bilingual-title">
                <span class="english-title">NEXT VEHICLE</span>
                <span class="arabic-title">المركبة التالية</span>
              </div>
              <div class="next-vehicle">
                ${entryTicket.nextVehiclePlate}
              </div>
            ` : ''}
          </div>
          <hr class="divider">
          <div class="section price-section">
            <div class="bilingual-row">
              <span class="english-label">ENTRY FEE</span>
              <span class="center-value" style="font-weight: bold; font-size: 12px;">
                ${entryTicket.ticketPrice || 2.0} TND
              </span>
              <span class="arabic-label">رسوم الدخول</span>
            </div>
          </div>
          <hr class="divider">
          <div class="ticket-number">
            <div class="bilingual-title">
              <span class="english-title">TICKET</span>
              <span class="arabic-title">التذكرة</span>
            </div>
            #${entryTicket.ticketNumber}
          </div>
          <hr class="divider">
          <div class="footer">
            <div class="bilingual-title">
              <span>Keep this ticket for your records</span>
              <span style="direction: rtl; margin-right: 20px;">احتفظ بهذه التذكرة لسجلاتك</span>
            </div>
            <div class="bilingual-title">
              <span>Entry fee: 2 TND</span>
              <span style="direction: rtl; margin-right: 20px;">رسوم الدخول: 2 دينار</span>
            </div>
            <div style="margin-top: 2px; font-size: 7px; text-align: center;">
              Imprimé le ${new Date().toLocaleString('fr-FR')} | طُبع في ${new Date().toLocaleString('fr-FR')}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    if (iframe.contentWindow && iframe.contentDocument) {
      iframe.contentDocument.open();
      iframe.contentDocument.write(printContent);
      iframe.contentDocument.close();

      // Wait for content to load then print
      iframe.onload = () => {
        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }
          // Clean up
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 500);
      };

      toast.success('Ticket préparé pour impression');
    }
  };

  const handlePrintExitTicket = () => {
    if (exitTicket) {
      // Try to use window.open first, if it fails, use iframe method
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      if (!printWindow) {
        // Fallback: Use iframe method if popup is blocked
        printExitTicketWithIframe();
        return;
      }

      // Create the print content
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Driver Exit Ticket</title>
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              font-size: 12px;
              background: white;
              color: black;
            }
            .ticket {
              width: 100%;
              max-width: 100%;
              margin: 0 auto;
              padding: 16px;
              border: 2px solid #000;
              background: white;
              color: black;
              page-break-inside: avoid;
              break-inside: avoid;
              box-sizing: border-box;
            }
            .ticket * {
              color: black !important;
              background: transparent !important;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
            }
            .company-name {
              text-align: center;
              margin: 0 0 4px 0;
              font-size: 20px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .bilingual-title {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin: 6px 0;
            }
            .english-title {
              font-size: 14px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .arabic-title {
              font-size: 14px;
              font-weight: bold;
              direction: rtl;
              padding-right: 12px;
            }
            .datetime {
              text-align: center;
              font-size: 12px;
              color: #333;
              margin-bottom: 12px;
            }
            .divider {
              border: none;
              border-top: 1px solid #000;
              margin: 8px 0;
              width: 100%;
            }
            .section {
              text-align: center;
              margin: 12px 0;
              padding: 8px;
              border: 1px solid #000;
            }
            .journey-section { background-color: #f8f8f8; }
            .vehicle-section { background-color: #f0f0f0; }
            .ticket-number {
              text-align: center;
              font-size: 18px;
              font-weight: bold;
              margin: 12px 0;
              padding: 8px;
              border: 2px solid #000;
              border-radius: 4px;
              background-color: #f0f0f0;
            }
            .vehicle-plate {
              font-size: 18px;
              font-weight: bold;
              font-family: monospace;
              letter-spacing: 1px;
              margin: 8px 0;
            }
            .journey-flow {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin: 4px 0;
            }
            .station {
              font-size: 12px;
              font-weight: bold;
              flex: 1;
              text-align: center;
            }
            .arrow {
              font-size: 16px;
              font-weight: bold;
              margin: 0 8px;
              color: #000;
            }
            .footer {
              text-align: center;
              margin-top: 12px;
              font-size: 10px;
              font-style: italic;
              border-top: 1px solid #000;
              padding-top: 8px;
            }
            .bilingual-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin: 6px 0;
              font-size: 14px;
              min-height: 24px;
            }
            .english-label {
              font-weight: bold;
              text-transform: uppercase;
              font-size: 12px;
              text-align: left;
              flex: 0 0 auto;
              min-width: 80px;
            }
            .arabic-label {
              font-weight: bold;
              font-size: 12px;
              text-align: right;
              flex: 0 0 auto;
              min-width: 100px;
              direction: rtl;
              margin-right: 25px;
            }
            .center-value {
              font-weight: normal;
              text-align: center;
              flex: 1;
              font-size: 14px;
              margin: 0 12px;
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="header">
              <h2 class="company-name">NQLIX COMPANY</h2>
              <div class="bilingual-title">
                <span class="english-title">DRIVER EXIT TICKET</span>
                <span class="arabic-title">تذكرة خروج السائق</span>
              </div>
              <div class="datetime">
                <div>${new Date(exitTicket.exitTime || new Date()).toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}</div>
                <div>${new Date(exitTicket.exitTime || new Date()).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}</div>
              </div>
            </div>
            <hr class="divider">
            <div class="section journey-section">
              <div class="bilingual-title">
                <span class="english-title">JOURNEY</span>
                <span class="arabic-title">الرحلة</span>
              </div>
              <div class="journey-flow">
                <div class="station">
                  ${exitTicket.departureStationName}
                </div>
                <div class="arrow">→</div>
                <div class="station">
                  ${exitTicket.destinationStationName}
                </div>
              </div>
            </div>
            <div class="section vehicle-section">
              <div class="bilingual-title">
                <span class="english-title">VEHICLE</span>
                <span class="arabic-title">المركبة</span>
              </div>
              <div class="vehicle-plate">
                ${exitTicket.licensePlate}
              </div>
            </div>
            <hr class="divider">
            <div class="bilingual-row">
              <span class="english-label">EXIT TIME</span>
              <span class="center-value">${new Date(exitTicket.exitTime || new Date()).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })}</span>
              <span class="arabic-label">وقت الخروج</span>
            </div>
            <div class="bilingual-row">
              <span class="english-label">EXIT DATE</span>
              <span class="center-value">${new Date(exitTicket.exitTime || new Date()).toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}</span>
              <span class="arabic-label">تاريخ الخروج</span>
            </div>
            <hr class="divider">
            <div class="ticket-number">
              <div class="bilingual-title">
                <span class="english-title">TICKET</span>
                <span class="arabic-title">التذكرة</span>
              </div>
              #${exitTicket.ticketNumber}
            </div>
            <hr class="divider">
            <div class="footer">
              <div class="bilingual-title">
                <span>Keep this ticket for your records</span>
                <span style="direction: rtl; margin-right: 20px;">احتفظ بهذه التذكرة لسجلاتك</span>
              </div>
              <div class="bilingual-title">
                <span>Safe journey!</span>
                <span style="direction: rtl; margin-right: 20px;">رحلة سعيدة!</span>
              </div>
              <div class="bilingual-title">
                <span>Thank you for your service!</span>
                <span style="direction: rtl; margin-right: 20px;">شكرًا لخدمتك!</span>
              </div>
              <div style="margin-top: 2px; font-size: 7px; text-align: center;">
                Printed on ${new Date().toLocaleString()} | طُبع في ${new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(printContent);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };
    }
  };

  const printExitTicketWithIframe = () => {
    if (!exitTicket) return;

    // Create iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    document.body.appendChild(iframe);

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket de Sortie Conducteur</title>
        <style>
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            font-size: 12px;
            background: white;
            color: black;
          }
          .ticket {
            width: 100%;
            max-width: 100%;
            margin: 0 auto;
            padding: 16px;
            border: 2px solid #000;
            background: white;
            color: black;
            page-break-inside: avoid;
            break-inside: avoid;
            box-sizing: border-box;
          }
          .ticket * {
            color: black !important;
            background: transparent !important;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .company-name {
            text-align: center;
            margin: 0 0 4px 0;
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .bilingual-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 6px 0;
          }
          .english-title {
            font-size: 14px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .arabic-title {
            font-size: 14px;
            font-weight: bold;
            direction: rtl;
            padding-right: 12px;
          }
          .datetime {
            text-align: center;
            font-size: 12px;
            color: #333;
            margin-bottom: 12px;
          }
          .divider {
            border: none;
            border-top: 1px solid #000;
            margin: 8px 0;
            width: 100%;
          }
          .section {
            text-align: center;
            margin: 12px 0;
            padding: 8px;
            border: 1px solid #000;
          }
          .journey-section { background-color: #f8f8f8; }
          .vehicle-section { background-color: #f0f0f0; }
          .ticket-number {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin: 12px 0;
            padding: 8px;
            border: 2px solid #000;
            border-radius: 4px;
            background-color: #f0f0f0;
          }
          .vehicle-plate {
            font-size: 18px;
            font-weight: bold;
            font-family: monospace;
            letter-spacing: 1px;
            margin: 8px 0;
          }
          .journey-flow {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 4px 0;
          }
          .station {
            font-size: 12px;
            font-weight: bold;
            flex: 1;
            text-align: center;
          }
          .arrow {
            font-size: 16px;
            font-weight: bold;
            margin: 0 8px;
            color: #000;
          }
          .footer {
            text-align: center;
            margin-top: 12px;
            font-size: 10px;
            font-style: italic;
            border-top: 1px solid #000;
            padding-top: 8px;
          }
          .bilingual-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 6px 0;
            font-size: 14px;
            min-height: 24px;
          }
          .english-label {
            font-weight: bold;
            text-transform: uppercase;
            font-size: 12px;
            text-align: left;
            flex: 0 0 auto;
            min-width: 80px;
          }
          .arabic-label {
            font-weight: bold;
            font-size: 12px;
            text-align: right;
            flex: 0 0 auto;
            min-width: 100px;
            direction: rtl;
            margin-right: 25px;
          }
          .center-value {
            font-weight: normal;
            text-align: center;
            flex: 1;
            font-size: 14px;
            margin: 0 12px;
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            <h2 class="company-name">NQLIX COMPANY</h2>
            <div class="bilingual-title">
              <span class="english-title">DRIVER EXIT TICKET</span>
              <span class="arabic-title">تذكرة خروج السائق</span>
            </div>
            <div class="datetime">
              <div>${new Date(exitTicket.exitTime || new Date()).toLocaleDateString('fr-FR', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}</div>
              <div>${new Date(exitTicket.exitTime || new Date()).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
              })}</div>
            </div>
          </div>
          <hr class="divider">
          <div class="section journey-section">
            <div class="bilingual-title">
              <span class="english-title">JOURNEY</span>
              <span class="arabic-title">الرحلة</span>
            </div>
            <div class="journey-flow">
              <div class="station">
                ${exitTicket.departureStationName}
              </div>
              <div class="arrow">→</div>
              <div class="station">
                ${exitTicket.destinationStationName}
              </div>
            </div>
          </div>
          <div class="section vehicle-section">
            <div class="bilingual-title">
              <span class="english-title">VEHICLE</span>
              <span class="arabic-title">المركبة</span>
            </div>
            <div class="vehicle-plate">
              ${exitTicket.licensePlate}
            </div>
          </div>
          <hr class="divider">
          <div class="bilingual-row">
            <span class="english-label">EXIT TIME</span>
            <span class="center-value">${new Date(exitTicket.exitTime || new Date()).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit'
            })}</span>
            <span class="arabic-label">وقت الخروج</span>
          </div>
          <div class="bilingual-row">
            <span class="english-label">EXIT DATE</span>
            <span class="center-value">${new Date(exitTicket.exitTime || new Date()).toLocaleDateString('fr-FR', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })}</span>
            <span class="arabic-label">تاريخ الخروج</span>
          </div>
          <hr class="divider">
          <div class="ticket-number">
            <div class="bilingual-title">
              <span class="english-title">TICKET</span>
              <span class="arabic-title">التذكرة</span>
            </div>
            #${exitTicket.ticketNumber}
          </div>
          <hr class="divider">
          <div class="footer">
            <div class="bilingual-title">
              <span>Keep this ticket for your records</span>
              <span style="direction: rtl; margin-right: 20px;">احتفظ بهذه التذكرة لسجلاتك</span>
            </div>
            <div class="bilingual-title">
              <span>Safe journey!</span>
              <span style="direction: rtl; margin-right: 20px;">رحلة سعيدة!</span>
            </div>
            <div class="bilingual-title">
              <span>Thank you for your service!</span>
              <span style="direction: rtl; margin-right: 20px;">شكرًا لخدمتك!</span>
            </div>
            <div style="margin-top: 2px; font-size: 7px; text-align: center;">
              Imprimé le ${new Date().toLocaleString('fr-FR')} | طُبع في ${new Date().toLocaleString('fr-FR')}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    if (iframe.contentWindow && iframe.contentDocument) {
      iframe.contentDocument.open();
      iframe.contentDocument.write(printContent);
      iframe.contentDocument.close();

      // Wait for content to load then print
      iframe.onload = () => {
        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }
          // Clean up
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 500);
      };

      toast.success('Ticket préparé pour impression');
    }
  };

  const handleCloseEntryTicket = () => {
    setShowEntryTicket(false);
    setEntryTicket(null);
  };

  const handleCloseExitTicket = () => {
    setShowExitTicket(false);
    setExitTicket(null);
  };

  const formatDateTime = (dateTime: string) => {
    return new Date(dateTime).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'WAITING': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'LOADING': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'READY': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'DEPARTED': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'WAITING': return 'EN ATTENTE';
      case 'LOADING': return 'EN CHARGEMENT';
      case 'READY': return 'PRÊT';
      case 'DEPARTED': return 'PARTI';
      default: return status;
    }
  };

  const getSourceColor = (source: string) => {
    return source === 'queue' 
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' 
      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
  };

  const getSourceLabel = (source: string) => {
    return source === 'queue' ? 'FILE' : 'VOYAGE';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto p-6 space-y-8">
        {/* Header Section */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-3 rounded-xl">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Tickets Conducteurs
                </h1>
                <p className="text-slate-600 dark:text-slate-400 mt-1 text-lg">
                  Génération des tickets d'entrée et de sortie pour les conducteurs
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-sm">
                <Clock className="w-4 h-4 mr-1" />
                {new Date().toLocaleDateString('fr-FR')}
              </Badge>
            </div>
          </div>
        </div>

        {/* Tab Navigation - Modern Design */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setActiveTab('entry')}
              className={`relative flex items-center justify-center py-4 px-6 rounded-xl font-semibold transition-all duration-300 ${
                activeTab === 'entry'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg transform scale-105'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${activeTab === 'entry' ? 'bg-white/20' : 'bg-green-100 dark:bg-green-900/30'}`}>
                  <Plus className={`w-5 h-5 ${activeTab === 'entry' ? 'text-white' : 'text-green-600 dark:text-green-400'}`} />
                </div>
                <span className="text-lg">Tickets d'Entrée</span>
              </div>
              {activeTab === 'entry' && (
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-emerald-600/20 rounded-xl animate-pulse" />
              )}
            </button>
            
            <button
              onClick={() => setActiveTab('exit')}
              className={`relative flex items-center justify-center py-4 px-6 rounded-xl font-semibold transition-all duration-300 ${
                activeTab === 'exit'
                  ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg transform scale-105'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${activeTab === 'exit' ? 'bg-white/20' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  <ArrowRight className={`w-5 h-5 ${activeTab === 'exit' ? 'text-white' : 'text-red-600 dark:text-red-400'}`} />
                </div>
                <span className="text-lg">Tickets de Sortie</span>
              </div>
              {activeTab === 'exit' && (
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-rose-600/20 rounded-xl animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`relative flex items-center justify-center py-4 px-6 rounded-xl font-semibold transition-all duration-300 ${
                activeTab === 'settings'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transform scale-105'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${activeTab === 'settings' ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                  <Printer className={`w-5 h-5 ${activeTab === 'settings' ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
                </div>
                <span className="text-lg">Imprimantes</span>
                {/* Printer status indicator removed */}
              </div>
              {activeTab === 'settings' && (
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-600/20 rounded-xl animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Settings Tab Content */}
        {activeTab === 'settings' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="text-center py-8">
              <Printer className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Gestion des Imprimantes
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Les fonctionnalités d'impression thermique ont été temporairement supprimées.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Les données de tickets sont disponibles dans la console du navigateur pour le développement.
              </p>
            </div>
          </div>
        )}

        {/* Search Section - Modern Design */}
        {activeTab !== 'settings' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-4">
              <Search className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Recherche de Véhicules
              </h3>
            </div>

            {/* CIN Search */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Recherche par CIN du conducteur
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    type="text"
                    placeholder="Entrez le CIN du conducteur..."
                    value={cinSearch}
                    onChange={(e) => setCinSearch(e.target.value)}
                    className="pl-10 border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400"
                  />
                </div>
              </div>
              <Button
                onClick={searchByCIN}
                disabled={isLoading || !cinSearch.trim()}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Recherche...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Rechercher
                  </>
                )}
              </Button>
              <Button
                onClick={() => {
                  setCinSearch('');
                  loadVehicles();
                }}
                variant="outline"
                size="lg"
                className="border-slate-300 dark:border-slate-600"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Réinitialiser
              </Button>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700"></div>

            {/* General Search */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Recherche générale
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder={`Rechercher des véhicules pour les tickets ${activeTab === 'entry' ? 'd\'entrée' : 'de sortie'}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Recherche par plaque d'immatriculation, nom du conducteur, CIN ou destination
              </p>
            </div>
          </div>
          </div>
        )}

        {/* Vehicles Grid - Modern Design */}
        {activeTab !== 'settings' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${activeTab === 'entry' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  <Car className={`w-5 h-5 ${activeTab === 'entry' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {activeTab === 'entry' ? 'Véhicules en File' : 'Véhicules Prêts à Partir'}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {activeTab === 'entry' 
                      ? 'Véhicules en attente ou en chargement' 
                      : 'Véhicules prêts pour le départ'
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="text-sm">
                  {filteredVehicles.length} véhicule{filteredVehicles.length > 1 ? 's' : ''}
                </Badge>
                <Button
                  onClick={loadVehicles}
                  disabled={isLoadingVehicles}
                  variant="outline"
                  size="sm"
                  className="border-slate-300 dark:border-slate-600"
                >
                  {isLoadingVehicles ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Chargement...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Actualiser
                    </>
                  )}
                </Button>
                <Button
                  onClick={activeTab === 'entry' ? reprintLastEntry : reprintLastExit}
                  variant="outline"
                  size="sm"
                  className="border-slate-300 dark:border-slate-600"
                >
                  <Printer className="w-4 h-4 mr-2" /> Réimprimer dernier
                </Button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {isLoadingVehicles ? (
              <div className="text-center py-12">
                <div className="relative">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-300 dark:border-slate-600 mx-auto"></div>
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent absolute inset-0 mx-auto"></div>
                </div>
                <p className="mt-4 text-slate-600 dark:text-slate-400 font-medium">Chargement des véhicules...</p>
              </div>
            ) : filteredVehicles.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-slate-100 dark:bg-slate-700 rounded-full p-6 w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                  <Car className="w-12 h-12 text-slate-400 dark:text-slate-500" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Aucun véhicule trouvé
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  {activeTab === 'entry' 
                    ? 'Aucun véhicule en attente ou en chargement dans la file'
                    : 'Aucun véhicule prêt pour le départ'
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredVehicles.map((vehicle) => (
                  <Card key={vehicle.id} className="border-slate-200 dark:border-slate-700 hover:shadow-xl transition-all duration-300 hover:scale-105">
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <CardTitle className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                            {vehicle.licensePlate}
                          </CardTitle>
                          <div className="flex items-center space-x-2">
                            <MapPin className="w-4 h-4 text-slate-500" />
                            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                              {vehicle.destinationName}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          {vehicle.source && (
                            <Badge variant="outline" className={getSourceColor(vehicle.source)}>
                              {getSourceLabel(vehicle.source)}
                            </Badge>
                          )}
                          {vehicle.status && (
                            <Badge className={getStatusColor(vehicle.status)}>
                              {getStatusLabel(vehicle.status)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      {/* Driver Info */}
                      {vehicle.driver && (
                        <div className="flex items-center space-x-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                          <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full">
                            <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {vehicle.driver.firstName} {vehicle.driver.lastName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              CIN: {vehicle.driver.cin}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        {/* Queue Position */}
                        {vehicle.queuePosition && (
                          <div className="flex items-center space-x-2">
                            <Hash className="w-4 h-4 text-slate-500" />
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Position</p>
                              <p className="font-bold text-slate-900 dark:text-slate-100">#{vehicle.queuePosition}</p>
                            </div>
                          </div>
                        )}

                        {/* Vehicle Capacity */}
                        <div className="flex items-center space-x-2">
                          <Car className="w-4 h-4 text-slate-500" />
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Capacité</p>
                            <p className="font-bold text-slate-900 dark:text-slate-100">{vehicle.vehicle.capacity} places</p>
                          </div>
                        </div>
                      </div>

                      {/* Time Info */}
                      <div className="flex items-center space-x-2 text-sm p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <Clock className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-600 dark:text-slate-400">
                          {vehicle.enteredAt 
                            ? `Entré: ${formatDateTime(vehicle.enteredAt)}`
                            : vehicle.startTime 
                            ? `Démarré: ${formatDateTime(vehicle.startTime)}`
                            : 'Aucune info de temps'
                          }
                        </span>
                      </div>

                      {/* Action Button */}
                      <Button
                        onClick={() => activeTab === 'entry' 
                          ? handleGenerateEntryTicket(vehicle)
                          : handleGenerateExitTicket(vehicle)
                        }
                        disabled={isLoading}
                        className={`w-full font-semibold py-3 transition-all duration-300 ${
                          activeTab === 'entry' 
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl' 
                            : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg hover:shadow-xl'
                        }`}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Génération...
                          </>
                        ) : (
                          <>
                            {activeTab === 'entry' ? (
                              <>
                                <Plus className="w-4 h-4 mr-2" />
                                Générer Ticket d'Entrée
                              </>
                            ) : (
                              <>
                                <Download className="w-4 h-4 mr-2" />
                                Générer Ticket de Sortie
                              </>
                            )}
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Entry Ticket Modal */}
        {showEntryTicket && entryTicket && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-md w-full">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-3">
                  <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-xl">
                    <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    Ticket d'Entrée Généré
                  </h3>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">VÉHICULE</p>
                    <p className="font-bold text-slate-900 dark:text-slate-100 font-mono">{entryTicket.licensePlate}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">POSITION</p>
                    <p className="font-bold text-slate-900 dark:text-slate-100">#{entryTicket.queuePosition}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">STATION</p>
                    <p className="font-bold text-slate-900 dark:text-slate-100">{entryTicket.stationName}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">FRAIS</p>
                    <p className="font-bold text-green-600 dark:text-green-400">{entryTicket.ticketPrice} TND</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 pt-4">
                  <Button 
                    onClick={handlePrintEntryTicket} 
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    Imprimer Ticket (Nouvelle fenêtre)
                  </Button>
                  <Button 
                    onClick={() => {
                      // Use browser's native print dialog
                      window.print();
                    }}
                    variant="outline"
                    className="w-full border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Imprimer Page Actuelle
                  </Button>
                  <Button 
                    onClick={handleCloseEntryTicket} 
                    variant="outline" 
                    className="w-full border-slate-300 dark:border-slate-600"
                  >
                    Fermer
                  </Button>
                </div>
              </div>
              
              <div className="hidden">
                <DriverEntryTicket ticket={entryTicket} />
              </div>
            </div>
          </div>
        )}

        {/* Exit Ticket Modal */}
        {showExitTicket && exitTicket && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-md w-full">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-3">
                  <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-xl">
                    <CheckCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    Ticket de Sortie Généré
                  </h3>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">VÉHICULE</p>
                    <p className="font-bold text-slate-900 dark:text-slate-100 font-mono">{exitTicket.licensePlate}</p>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">DÉPART</p>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{exitTicket.departureStationName}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-400" />
                    <div className="text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">DESTINATION</p>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{exitTicket.destinationStationName}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">HEURE DE SORTIE</p>
                    <p className="font-bold text-slate-900 dark:text-slate-100">
                      {new Date(exitTicket.exitTime!).toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 pt-4">
                  <Button 
                    onClick={handlePrintExitTicket} 
                    className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    Imprimer Ticket (Nouvelle fenêtre)
                  </Button>
                  <Button 
                    onClick={() => {
                      // Use browser's native print dialog
                      window.print();
                    }}
                    variant="outline"
                    className="w-full border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Imprimer Page Actuelle
                  </Button>
                  <Button 
                    onClick={handleCloseExitTicket} 
                    variant="outline" 
                    className="w-full border-slate-300 dark:border-slate-600"
                  >
                    Fermer
                  </Button>
                </div>
              </div>
              
              <div className="hidden">
                <DriverExitTicket ticket={exitTicket} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 