import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useAuth } from '../context/AuthProvider';
import { useNotifications } from '../context/NotificationProvider';
import api from '../lib/api';
import { Edit, MapPin, Loader2, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface Route {
  id: string;
  stationId: string;
  stationName: string;
  basePrice: number;
  isActive: boolean;
  syncedAt: string;
  updatedAt: string;
}

interface RoutesTableProps {
  className?: string;
}

export const RoutesTable: React.FC<RoutesTableProps> = ({ className = '' }) => {
  const { currentStaff } = useAuth();
  const { addNotification } = useNotifications();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const isSupervisor = currentStaff?.role === 'SUPERVISOR';

  // Load routes
  const loadRoutes = async () => {
    try {
      setIsLoading(true);
      const response = await api.getAllRoutes();
      
      if (response.success) {
        setRoutes(response.data || []);
        setCurrentPage(1); // Reset to first page when routes are loaded
      } else {
        addNotification({
          type: 'error',
          title: 'Failed to load routes',
          message: response.message || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error loading routes:', error);
      addNotification({
        type: 'error',
        title: 'Failed to load routes',
        message: 'Network error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Update route price
  const updateRoutePrice = async (routeId: string, newPrice: number) => {
    try {
      setIsUpdating(routeId);
      const response = await api.updateRoutePrice(routeId, newPrice);
      
      if (response.success) {
        addNotification({
          type: 'success',
          title: 'Price updated successfully',
          message: 'Route price has been updated and synced to central server'
        });
        
        // Update local state
        setRoutes(prevRoutes => 
          prevRoutes.map(route => 
            route.id === routeId 
              ? { ...route, basePrice: newPrice, updatedAt: new Date().toISOString() }
              : route
          )
        );
        
        setIsEditDialogOpen(false);
        setEditingRoute(null);
        setEditPrice('');
      } else {
        addNotification({
          type: 'error',
          title: 'Failed to update price',
          message: response.message || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error updating route price:', error);
      addNotification({
        type: 'error',
        title: 'Failed to update price',
        message: 'Network error'
      });
    } finally {
      setIsUpdating(null);
    }
  };

  // Handle edit dialog open
  const handleEditClick = (route: Route) => {
    setEditingRoute(route);
    setEditPrice(route.basePrice.toString());
    setIsEditDialogOpen(true);
  };

  // Handle price update
  const handlePriceUpdate = () => {
    if (!editingRoute || !editPrice) return;
    
    const newPrice = parseFloat(editPrice);
    if (isNaN(newPrice) || newPrice <= 0) {
      addNotification({
        type: 'error',
        title: 'Invalid price',
        message: 'Please enter a valid positive number'
      });
      return;
    }

    updateRoutePrice(editingRoute.id, newPrice);
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} TND`;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Pagination calculations
  const totalPages = Math.ceil(routes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRoutes = routes.slice(startIndex, endIndex);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Load routes on component mount
  useEffect(() => {
    loadRoutes();
  }, []);

  if (isLoading) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading routes...</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6" />
              Routes Management
              {isSupervisor && (
                <Badge variant="default" className="ml-2">
                  Supervisor Access
                </Badge>
              )}
            </h2>
            <p className="text-muted-foreground">
              View route information and pricing
            </p>
          </div>
          <Button 
            onClick={loadRoutes} 
            variant="outline" 
            size="sm"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {routes.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No routes found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full">
                <thead className="sticky top-0 bg-card border-b z-10">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium bg-card">Station</th>
                    <th className="text-left py-3 px-4 font-medium bg-card">Base Price</th>
                    <th className="text-left py-3 px-4 font-medium bg-card">Status</th>
                    <th className="text-left py-3 px-4 font-medium bg-card">Last Updated</th>
                    <th className="text-left py-3 px-4 font-medium bg-card">
                      {isSupervisor ? 'Actions' : 'Access'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentRoutes.map((route) => (
                    <tr key={route.id} className="border-b hover:bg-muted">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{route.stationName}</p>
                          <p className="text-sm text-muted-foreground">ID: {route.stationId}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatCurrency(route.basePrice)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={route.isActive ? "default" : "secondary"}>
                          {route.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {formatDate(route.updatedAt)}
                      </td>
                      <td className="py-3 px-4">
                        {isSupervisor && route.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(route)}
                            disabled={isUpdating === route.id}
                          >
                            {isUpdating === route.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Edit className="h-4 w-4" />
                            )}
                            <span className="ml-2">Edit Price</span>
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {!isSupervisor ? 'View Only' : 'Inactive'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {routes.length > itemsPerPage && (
              <div className="flex items-center justify-between mt-4 px-4 py-3 border-t bg-muted">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, routes.length)} of {routes.length} routes
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(page)}
                        className="w-8 h-8 p-0"
                      >
                        {page}
                      </Button>
                    ))}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Edit Price Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Route Price</DialogTitle>
          </DialogHeader>
          
          {editingRoute && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Station</label>
                <p className="text-sm text-muted-foreground">{editingRoute.stationName}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Current Price</label>
                <p className="text-lg font-medium text-green-600">
                  {formatCurrency(editingRoute.basePrice)}
                </p>
              </div>
              
              <div>
                <label htmlFor="new-price" className="text-sm font-medium">
                  New Price (TND)
                </label>
                <Input
                  id="new-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="Enter new price"
                  className="mt-1"
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingRoute(null);
                    setEditPrice('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handlePriceUpdate}
                  disabled={!editPrice || isUpdating === editingRoute.id}
                >
                  {isUpdating === editingRoute.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Update Price
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}; 