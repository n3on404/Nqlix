import React, { useEffect } from 'react';
import { useDashboard } from '../context/DashboardProvider';
import { formatCurrency } from '../utils/formatters';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Loader2, RefreshCw, Car, Users, Receipt, Calendar, TrendingUp, SignalHigh, WifiOff, Activity } from "lucide-react";

const Dashboard: React.FC = () => {
  const {
    dashboardData,
    isLoading,
    error,
    refreshData,
    isWebSocketConnected,
    isRealTimeEnabled,
    toggleRealTime,
  } = useDashboard();

  // Auto-refresh data every 30 seconds if real-time updates are disabled
  useEffect(() => {
    if (!isRealTimeEnabled) {
      const interval = setInterval(() => {
        refreshData();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [isRealTimeEnabled, refreshData]);

  if (isLoading && !dashboardData) {
    return (
      <div className="flex justify-center items-center min-h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isWebSocketConnected ? (
              <div className="flex items-center gap-1 text-green-500">
                <SignalHigh className="h-5 w-5" />
                <Activity className="h-4 w-4 animate-pulse" />
              </div>
            ) : (
              <WifiOff className="h-5 w-5 text-red-500" />
            )}
            <label className="text-sm flex items-center gap-2 cursor-pointer">
              <span>{isRealTimeEnabled ? 'Real-time updates' : 'Manual updates'}</span>
              <div className="relative inline-block w-10 h-5">
                <input 
                  type="checkbox" 
                  checked={isRealTimeEnabled}
                  onChange={toggleRealTime}
                  className="opacity-0 w-0 h-0"
                />
                <span className={`absolute cursor-pointer top-0 left-0 right-0 bottom-0 rounded-full transition-colors duration-200 ease-in-out ${isRealTimeEnabled ? 'bg-primary' : 'bg-gray-300'}`}></span>
                <span className={`absolute h-4 w-4 rounded-full bg-white transition-transform duration-200 ease-in-out ${isRealTimeEnabled ? 'translate-x-5' : 'translate-x-1'}`} style={{top: '2px'}}></span>
              </div>
            </label>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refreshData()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md mb-6">
          {error}
        </div>
      )}

      {dashboardData && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Car className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Active Queues</p>
                    <p className="text-2xl font-bold">{dashboardData.statistics.queues}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Car className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Active Vehicles</p>
                    <p className="text-2xl font-bold">
                      {dashboardData.statistics.vehicles.active} / {dashboardData.statistics.vehicles.total}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Users className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Today's Bookings</p>
                    <p className="text-2xl font-bold">{dashboardData.statistics.bookings.today}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Receipt className="h-8 w-8 text-orange-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Today's Revenue</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(dashboardData.statistics.bookings.revenue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Queues Section */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Active Queues</h2>
            {isWebSocketConnected && (
              <Badge variant="outline" className="bg-green-50 text-green-700 flex items-center gap-1">
                <Activity className="h-3 w-3 animate-pulse" />
                <span>Live</span>
              </Badge>
            )}
          </div>
          
          {Object.keys(dashboardData.queues).length === 0 ? (
            <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-md mb-8">
              No active queues at the moment.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {Object.entries(dashboardData.queues).map(([destination, queues]) => (
                <Card key={destination} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle>{destination}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {queues.map((queue) => (
                        <div key={queue.id} className="p-4">
                          <div className="flex justify-between items-center mb-1">
                            <div className="font-medium">
                              {queue.vehicle.licensePlate}
                            </div>
                            <Badge variant={queue.availableSeats > 0 ? "default" : "destructive"}>
                              {queue.availableSeats} seats
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            CIN: {queue.vehicle.driver.cin} - {formatCurrency(queue.basePrice)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Position: {queue.queuePosition}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Recent Bookings */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Bookings</h2>
            {isWebSocketConnected && (
              <Badge variant="outline" className="bg-green-50 text-green-700 flex items-center gap-1">
                <Activity className="h-3 w-3 animate-pulse" />
                <span>Live</span>
              </Badge>
            )}
          </div>
          
          {(!dashboardData.recentBookings || dashboardData.recentBookings.length === 0) ? (
            <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-md">
              No recent bookings to display.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">ID</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Destination</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Vehicle</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Seats</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Amount</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Payment</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dashboardData.recentBookings.map((booking) => (
                      <tr key={booking.id} className="hover:bg-muted/50">
                        <td className="p-3">{booking.id.substring(0, 8)}</td>
                        <td className="p-3">{booking.queue?.destinationName || 'N/A'}</td>
                        <td className="p-3">{booking.queue?.vehicle?.licensePlate || 'N/A'}</td>
                        <td className="p-3">{booking.seatsBooked}</td>
                        <td className="p-3">{formatCurrency(booking.totalAmount)}</td>
                        <td className="p-3">
                          <Badge variant={booking.paymentMethod === 'CASH' ? 'default' : 'secondary'}>
                            {booking.paymentMethod}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant={booking.paymentStatus === 'PAID' ? 'default' : 'outline'}>
                            {booking.paymentStatus}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {new Date(booking.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 text-right">
            <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
              {isWebSocketConnected && <Activity className="h-3 w-3 text-green-500 animate-pulse" />}
              Last updated: {new Date(dashboardData.timestamp).toLocaleString()}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard; 