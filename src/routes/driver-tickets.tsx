import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { DriverEntryTicket } from '../components/DriverEntryTicket';
import { DriverExitTicket } from '../components/DriverExitTicket';
import { useAuth } from '../context/AuthProvider';
import api from '../lib/api';
import { toast } from 'sonner';
import { Search, Car, User, MapPin, Clock, Hash } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'entry' | 'exit'>('entry');
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

  const loadVehicles = async () => {
    setIsLoadingVehicles(true);
    try {
      const response = activeTab === 'entry' 
        ? await api.getVehiclesInQueue()
        : await api.getVehiclesForExit();
      
      if (response.success) {
        if (activeTab === 'entry') {
          // For entry tickets, vehicles are grouped by destination
          const vehiclesByDestination = (response.data as any)?.vehiclesByDestination || {};
          const allVehicles: Vehicle[] = [];
          Object.values(vehiclesByDestination).forEach((destinationVehicles: any) => {
            allVehicles.push(...destinationVehicles);
          });
          setVehicles(allVehicles);
        } else {
          // For exit tickets, vehicles come as a flat array
          setVehicles((response.data as any)?.vehicles || []);
        }
      } else {
        toast.error(response.message || 'Failed to load vehicles');
      }
    } catch (error: any) {
      console.error('Error loading vehicles:', error);
      toast.error(error.message || 'Failed to load vehicles');
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  const searchByCIN = async () => {
    if (!cinSearch.trim()) {
      toast.error('Please enter a CIN');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.searchVehicleByCIN(cinSearch.trim());
      
      if (response.success) {
        const data = response.data as any;
        if (data.queueEntry || data.recentTrip) {
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
          toast.success('Vehicle found!');
        } else {
          toast.error('No active queue entry or recent trip found for this driver');
        }
      } else {
        toast.error(response.message || 'Driver not found');
      }
    } catch (error: any) {
      console.error('Error searching by CIN:', error);
      toast.error(error.message || 'Failed to search by CIN');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateEntryTicket = async (vehicle: Vehicle) => {
    if (!currentStaff?.id) {
      toast.error('Staff authentication required');
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
        setEntryTicket((response.data as any)?.ticket);
        setShowEntryTicket(true);
        toast.success('Entry ticket generated successfully');
      } else {
        toast.error(response.message || 'Failed to generate entry ticket');
      }
    } catch (error: any) {
      console.error('Error generating entry ticket:', error);
      toast.error(error.message || 'Failed to generate entry ticket');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateExitTicket = async (vehicle: Vehicle) => {
    if (!currentStaff?.id) {
      toast.error('Staff authentication required');
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
        setExitTicket((response.data as any)?.ticket);
        setShowExitTicket(true);
        toast.success('Exit ticket generated successfully');
      } else {
        toast.error(response.message || 'Failed to generate exit ticket');
      }
    } catch (error: any) {
      console.error('Error generating exit ticket:', error);
      toast.error(error.message || 'Failed to generate exit ticket');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintEntryTicket = () => {
    if (entryTicket) {
      // Create a new window for printing
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        toast.error('Please allow popups to print tickets');
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
              <div class="company-name">شركة لواج</div>
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

  const handlePrintExitTicket = () => {
    if (exitTicket) {
      // Create a new window for printing
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        toast.error('Please allow popups to print tickets');
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
              <div class="company-name">شركة لواج</div>
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
      case 'WAITING': return 'bg-yellow-100 text-yellow-800';
      case 'LOADING': return 'bg-blue-100 text-blue-800';
      case 'READY': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSourceColor = (source: string) => {
    return source === 'queue' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Driver Tickets</h1>
        <p className="text-gray-600 mt-2">Generate entry and exit tickets for drivers</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6">
        <button
          onClick={() => setActiveTab('entry')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === 'entry'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📥 Entry Tickets
        </button>
        <button
          onClick={() => setActiveTab('exit')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === 'exit'
              ? 'bg-white text-red-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📤 Exit Tickets
        </button>
      </div>

      {/* Search Section */}
      <div className="mb-6 space-y-4">
        {/* CIN Search */}
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Search by driver CIN..."
            value={cinSearch}
            onChange={(e) => setCinSearch(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={searchByCIN}
            disabled={isLoading || !cinSearch.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? 'Searching...' : 'Search CIN'}
          </Button>
          <Button
            onClick={() => {
              setCinSearch('');
              loadVehicles();
            }}
            variant="outline"
          >
            Clear
          </Button>
        </div>

        {/* General Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder={`Search vehicles for ${activeTab} tickets...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Vehicles Grid */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {activeTab === 'entry' ? 'Vehicles in Queue' : 'Vehicles for Exit'}
          </h2>
          <Button
            onClick={loadVehicles}
            disabled={isLoadingVehicles}
            variant="outline"
            size="sm"
          >
            {isLoadingVehicles ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {isLoadingVehicles ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading vehicles...</p>
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="text-center py-8">
            <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No vehicles found</p>
            <p className="text-sm text-gray-500 mt-1">
              {activeTab === 'entry' 
                ? 'No vehicles are currently in queue for entry tickets'
                : 'No vehicles found for exit tickets'
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVehicles.map((vehicle) => (
              <Card key={vehicle.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg font-mono">{vehicle.licensePlate}</CardTitle>
                      <p className="text-sm text-gray-600">{vehicle.destinationName}</p>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      {vehicle.source && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSourceColor(vehicle.source)}`}>
                          {vehicle.source.toUpperCase()}
                        </span>
                      )}
                      {vehicle.status && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(vehicle.status)}`}>
                          {vehicle.status}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Driver Info */}
                  {vehicle.driver && (
                    <div className="flex items-center space-x-2 text-sm">
                      <User className="w-4 h-4 text-gray-500" />
                      <span>
                        {vehicle.driver.firstName} {vehicle.driver.lastName}
                      </span>
                    </div>
                  )}

                  {/* Queue Position */}
                  {vehicle.queuePosition && (
                    <div className="flex items-center space-x-2 text-sm">
                      <Hash className="w-4 h-4 text-gray-500" />
                      <span>Position: #{vehicle.queuePosition}</span>
                    </div>
                  )}

                  {/* Time Info */}
                  <div className="flex items-center space-x-2 text-sm">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span>
                      {vehicle.enteredAt 
                        ? `Entered: ${formatDateTime(vehicle.enteredAt)}`
                        : vehicle.startTime 
                        ? `Started: ${formatDateTime(vehicle.startTime)}`
                        : 'No time info'
                      }
                    </span>
                  </div>

                  {/* Vehicle Info */}
                  <div className="flex items-center space-x-2 text-sm">
                    <Car className="w-4 h-4 text-gray-500" />
                    <span>
                      {vehicle.vehicle.model || 'Unknown'} • {vehicle.vehicle.capacity} seats
                    </span>
                  </div>

                  {/* Action Button */}
                  <Button
                    onClick={() => activeTab === 'entry' 
                      ? handleGenerateEntryTicket(vehicle)
                      : handleGenerateExitTicket(vehicle)
                    }
                    disabled={isLoading}
                    className={`w-full ${
                      activeTab === 'entry' 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {isLoading ? 'Generating...' : `Generate ${activeTab === 'entry' ? 'Entry' : 'Exit'} Ticket`}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Entry Ticket Printout */}
      {showEntryTicket && entryTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Entry Ticket Generated</h3>
            <div className="mb-4">
              <p><strong>Vehicle:</strong> {entryTicket.licensePlate}</p>
              <p><strong>Station:</strong> {entryTicket.stationName}</p>
              <p><strong>Position:</strong> #{entryTicket.queuePosition}</p>
              <p><strong>Fee:</strong> {entryTicket.ticketPrice} TND</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handlePrintEntryTicket} className="flex-1">
                Print Ticket
              </Button>
              <Button onClick={handleCloseEntryTicket} variant="outline" className="flex-1">
                Close
              </Button>
            </div>
            <div className="hidden">
              <DriverEntryTicket ticket={entryTicket} />
            </div>
          </div>
        </div>
      )}

      {/* Exit Ticket Printout */}
      {showExitTicket && exitTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Exit Ticket Generated</h3>
            <div className="mb-4">
              <p><strong>Vehicle:</strong> {exitTicket.licensePlate}</p>
              <p><strong>From:</strong> {exitTicket.departureStationName}</p>
              <p><strong>To:</strong> {exitTicket.destinationStationName}</p>
              <p><strong>Exit Time:</strong> {new Date(exitTicket.exitTime!).toLocaleString()}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handlePrintExitTicket} className="flex-1">
                Print Ticket
              </Button>
              <Button onClick={handleCloseExitTicket} variant="outline" className="flex-1">
                Close
              </Button>
            </div>
            <div className="hidden">
              <DriverExitTicket ticket={exitTicket} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 