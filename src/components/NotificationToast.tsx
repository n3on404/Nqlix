import React, { useEffect } from 'react';
import { Button } from './ui/button';
import { 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  X,
  Truck
} from 'lucide-react';
import { useNotifications, Notification } from '../context/NotificationProvider';

interface NotificationToastProps {
  notification: Notification;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ notification }) => {
  const { removeNotification } = useNotifications();

  const getNotificationStyles = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const getDefaultIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const handleDismiss = () => {
    removeNotification(notification.id);
  };

  return (
    <div className={`
      relative flex items-start space-x-3 p-4 border rounded-lg shadow-lg 
      animate-in slide-in-from-top-5 duration-300
      ${getNotificationStyles(notification.type)}
    `}>
      {/* Icon */}
      <div className="flex-shrink-0">
        {notification.icon || getDefaultIcon(notification.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold">{notification.title}</h4>
        <p className="text-sm mt-1 opacity-90">{notification.message}</p>
      </div>

      {/* Dismiss Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDismiss}
        className="flex-shrink-0 h-6 w-6 p-0 hover:bg-black/10"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export const NotificationContainer: React.FC = () => {
  const { notifications } = useNotifications();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm w-full">
      {notifications.map((notification) => (
        <NotificationToast key={notification.id} notification={notification} />
      ))}
    </div>
  );
};

// Helper hook for vehicle arrival notifications
export const useVehicleNotifications = () => {
  const { addNotification } = useNotifications();

  const notifyVehicleArrival = (vehicle: { licensePlate: string; fromStationName: string; driverName: string }) => {
    addNotification({
      type: 'success',
      title: 'Vehicle Arrived',
      message: `${vehicle.licensePlate} from ${vehicle.fromStationName} has arrived. Driver: ${vehicle.driverName}`,
      duration: 7000,
      icon: <Truck className="h-5 w-5 text-green-600" />
    });
  };

  const notifyVehicleDelay = (vehicle: { licensePlate: string; fromStationName: string }) => {
    addNotification({
      type: 'warning',
      title: 'Vehicle Delayed',
      message: `${vehicle.licensePlate} from ${vehicle.fromStationName} is experiencing delays.`,
      duration: 5000,
    });
  };

  const notifyVehicleEnRoute = (vehicle: { licensePlate: string; fromStationName: string; estimatedArrival: string }) => {
    const arrivalTime = new Date(vehicle.estimatedArrival).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    addNotification({
      type: 'info',
      title: 'Vehicle En Route',
      message: `${vehicle.licensePlate} from ${vehicle.fromStationName} is en route. ETA: ${arrivalTime}`,
      duration: 4000,
    });
  };

  return {
    notifyVehicleArrival,
    notifyVehicleDelay,
    notifyVehicleEnRoute,
  };
}; 