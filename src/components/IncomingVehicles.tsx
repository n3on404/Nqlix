import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  MapPin,
  Clock,
  Phone,
  RefreshCw,
  Truck,
  RouteIcon
} from 'lucide-react';
import { 
  getIncomingVehicles, 
  simulateVehicleMovement,
  removeArrivedVehicle,
  IncomingVehicle 
} from '../data/mockData';

interface IncomingVehiclesProps {
  onNewArrival?: (vehicle: IncomingVehicle) => void;
}

export const IncomingVehicles: React.FC<IncomingVehiclesProps> = ({ onNewArrival }) => {
  const [vehicles, setVehicles] = useState<IncomingVehicle[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshVehicles = () => {
    setIsRefreshing(true);
    
    // Simulate vehicle movement
    simulateVehicleMovement();
    
    // Get updated vehicles
    const updatedVehicles = getIncomingVehicles();
    
    // Check for new arrivals and handle them
    updatedVehicles.forEach(vehicle => {
      if (vehicle.isNewArrival && onNewArrival) {
        onNewArrival(vehicle);
        // Remove the vehicle from the list when it arrives
        setTimeout(() => {
          removeArrivedVehicle(vehicle.id);
          setVehicles(getIncomingVehicles().filter(v => v.status !== 'ARRIVED'));
        }, 2000); // Give time for notification to show
      }
    });
    
    // Filter out arrived vehicles
    const enRouteVehicles = updatedVehicles.filter(v => v.status !== 'ARRIVED');
    setVehicles(enRouteVehicles);
    setLastUpdate(new Date());
    
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    // Initial load
    refreshVehicles();

    // Set up periodic updates every 30 seconds
    const interval = setInterval(refreshVehicles, 30000);

    return () => clearInterval(interval);
  }, []);

  const formatDepartureTime = (departureTime: string) => {
    return new Date(departureTime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <RouteIcon className="h-5 w-5" />
            <span>Incoming Vehicles</span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshVehicles}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{vehicles.length} vehicles en route</span>
          <span>Updated: {lastUpdate.toLocaleTimeString()}</span>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="h-full overflow-y-auto px-6 pb-6">
          {vehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Truck className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No incoming vehicles</p>
            </div>
          ) : (
            <div className="space-y-3">
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                >
                  {/* Header with License Plate */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="font-semibold text-sm text-foreground">{vehicle.licensePlate}</span>
                    </div>
                    <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-xs">
                      En Route
                    </Badge>
                  </div>

                  {/* Origin */}
                  <div className="flex items-center space-x-2 mb-2">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">From: </span>
                      <span className="text-xs text-foreground">{vehicle.fromStationName}</span>
                    </div>
                  </div>

                  {/* Driver Info */}
                  <div className="mb-2">
                    <div className="text-xs">
                      <span className="font-medium text-muted-foreground">Driver: </span>
                      <span className="text-foreground">{vehicle.driverName}</span>
                    </div>
                    <div className="flex items-center space-x-1 mt-1">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{vehicle.driverPhone}</span>
                    </div>
                  </div>

                  {/* Departure Time */}
                  <div className="flex items-center space-x-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">Departed: </span>
                      <span className="text-xs text-foreground">{formatDepartureTime(vehicle.departureTime)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}; 