import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useAuth } from '../context/AuthProvider';
import { useNotifications } from '../context/NotificationProvider';
import api from '../lib/api';
import { Edit, MapPin, Loader2, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';

interface Route {
  id: string;
  stationId: string;
  stationName: string;
  basePrice: number;
  governorate?: string;
  governorateAr?: string;
  delegation?: string;
  delegationAr?: string;
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    delegation: '',
    basePrice: ''
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const isSupervisor = currentStaff?.role === 'SUPERVISOR';
  const isAdmin = currentStaff?.role === 'ADMIN';

  // Load routes
  const loadRoutes = async () => {
    try {
      setIsLoading(true);
      const response = await api.getAllRoutes();
      
      if (response.success) {
        // Handle nested response structure from server
        const routesData = response.data?.data || response.data;
        setRoutes(Array.isArray(routesData) ? routesData : []);
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

  // Create new route
  const createRoute = async () => {
    try {
      if (!createForm.delegation || !createForm.basePrice) {
        addNotification({
          type: 'error',
          title: 'Missing information',
          message: 'Délégation and prix are required'
        });
        return;
      }

      const basePrice = parseFloat(createForm.basePrice);
      if (isNaN(basePrice) || basePrice <= 0) {
        addNotification({
          type: 'error',
          title: 'Invalid price',
          message: 'Please enter a valid positive number'
        });
        return;
      }

      // Generate station ID from delegation name
      const stationId = `station-${createForm.delegation.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
      const stationName = createForm.delegation.toUpperCase();
      const governorate = 'Monastir';

      setIsCreating(true);
      const response = await api.createRoute({
        stationId: stationId,
        stationName: stationName,
        basePrice: basePrice,
        governorate: governorate,
        delegation: createForm.delegation
      });

      if (response.success) {
        addNotification({
          type: 'success',
          title: 'Route created successfully',
          message: 'New route has been created and synced to central server'
        });
        
        // Reset form and close dialog
        setCreateForm({
          delegation: '',
          basePrice: ''
        });
        setIsCreateDialogOpen(false);
        
        // Reload routes
        loadRoutes();
      } else {
        addNotification({
          type: 'error',
          title: 'Failed to create route',
          message: response.message || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error creating route:', error);
      addNotification({
        type: 'error',
        title: 'Failed to create route',
        message: 'Network error'
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Delete route
  const deleteRoute = async (routeId: string) => {
    try {
      setIsDeleting(routeId);
      const response = await api.deleteRoute(routeId);

      if (response.success) {
        addNotification({
          type: 'success',
          title: 'Route deleted successfully',
          message: 'Route has been deleted and synced to central server'
        });
        
        // Update local state
        setRoutes(prevRoutes => prevRoutes.filter(route => route.id !== routeId));
        setIsDeleteDialogOpen(false);
        setRouteToDelete(null);
      } else {
        addNotification({
          type: 'error',
          title: 'Failed to delete route',
          message: response.message || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error deleting route:', error);
      addNotification({
        type: 'error',
        title: 'Failed to delete route',
        message: 'Network error'
      });
    } finally {
      setIsDeleting(null);
    }
  };

  // Handle delete click
  const handleDeleteClick = (route: Route) => {
    setRouteToDelete(route);
    setIsDeleteDialogOpen(true);
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
  const safeRoutes = Array.isArray(routes) ? routes : [];
  const totalPages = Math.ceil(safeRoutes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRoutes = safeRoutes.slice(startIndex, endIndex);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Load routes on component mount and set up auto-refresh
  useEffect(() => {
    loadRoutes();
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadRoutes();
    }, 30000);
    
    // Cleanup interval on component unmount
    return () => clearInterval(interval);
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
              {isSupervisor && !isAdmin && (
                <Badge variant="default" className="ml-2">
                  Supervisor Access
                </Badge>
              )}
              {isAdmin && (
                <Badge variant="destructive" className="ml-2">
                  Admin Access
                </Badge>
              )}
            </h2>
            <p className="text-muted-foreground">
              View route information and pricing
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button 
                onClick={() => setIsCreateDialogOpen(true)} 
                variant="default" 
                size="sm"
                disabled={isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Route
              </Button>
            )}
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
        </div>

        {safeRoutes.length === 0 ? (
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
                    <th className="text-left py-3 px-4 font-medium bg-card">Location</th>
                    <th className="text-left py-3 px-4 font-medium bg-card">Base Price</th>
                    <th className="text-left py-3 px-4 font-medium bg-card">Status</th>
                    <th className="text-left py-3 px-4 font-medium bg-card">Last Updated</th>
                    <th className="text-left py-3 px-4 font-medium bg-card">
                      {(isSupervisor || isAdmin) ? 'Actions' : 'Access'}
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
                        <div>
                          {route.governorate && route.delegation ? (
                            <>
                              <p className="font-medium text-sm">{route.governorate}</p>
                              <p className="text-xs text-muted-foreground">{route.delegation}</p>
                              {route.governorateAr && route.delegationAr && (
                                <p className="text-xs text-muted-foreground font-arabic">
                                  {route.governorateAr} - {route.delegationAr}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">Location not available</p>
                          )}
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
                        <div className="flex gap-2">
                          {(isSupervisor || isAdmin) && route.isActive ? (
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
                          ) : null}
                          
                          {isAdmin && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteClick(route)}
                              disabled={isDeleting === route.id}
                            >
                              {isDeleting === route.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              <span className="ml-2">Delete</span>
                            </Button>
                          )}
                          
                          {!(isSupervisor || isAdmin) && (
                            <span className="text-sm text-muted-foreground">
                              View Only
                            </span>
                          )}
                          
                          {(isSupervisor || isAdmin) && !route.isActive && (
                            <span className="text-sm text-muted-foreground">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {safeRoutes.length > itemsPerPage && (
              <div className="flex items-center justify-between mt-4 px-4 py-3 border-t bg-muted">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, safeRoutes.length)} of {safeRoutes.length} routes
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
                {editingRoute.governorate && editingRoute.delegation && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {editingRoute.governorate}, {editingRoute.delegation}
                  </p>
                )}
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

      {/* Create Route Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Route</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="delegation" className="text-sm font-medium">
                Délégation *
              </label>
              <Input
                id="delegation"
                value={createForm.delegation}
                onChange={(e) => setCreateForm(prev => ({ ...prev, delegation: e.target.value }))}
                placeholder="e.g., Nouvelle Délégation"
                className="mt-1"
              />
            </div>
            
            <div>
              <label htmlFor="base-price" className="text-sm font-medium">
                Prix de Base (TND) *
              </label>
              <Input
                id="base-price"
                type="number"
                step="0.01"
                min="0"
                value={createForm.basePrice}
                onChange={(e) => setCreateForm(prev => ({ ...prev, basePrice: e.target.value }))}
                placeholder="e.g., 20.50"
                className="mt-1"
              />
            </div>
            
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Gouvernorat:</strong> Monastir (automatique)
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Nom de la station:</strong> Sera défini automatiquement comme la délégation
              </p>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setCreateForm({
                    delegation: '',
                    basePrice: ''
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={createRoute}
                disabled={isCreating}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Create Route
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Route Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Route</DialogTitle>
          </DialogHeader>
          
          {routeToDelete && (
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">
                  ⚠️ This action cannot be undone!
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Deleting this route will remove it permanently from the system and sync the changes to the central server.
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Route to Delete</label>
                <div className="mt-2 p-3 bg-muted rounded-lg">
                  <p className="font-medium">{routeToDelete.stationName}</p>
                  <p className="text-sm text-muted-foreground">ID: {routeToDelete.stationId}</p>
                  {routeToDelete.governorate && routeToDelete.delegation && (
                    <p className="text-sm text-muted-foreground">
                      {routeToDelete.governorate}, {routeToDelete.delegation}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Price: {formatCurrency(routeToDelete.basePrice)}
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDeleteDialogOpen(false);
                    setRouteToDelete(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteRoute(routeToDelete.id)}
                  disabled={isDeleting === routeToDelete.id}
                >
                  {isDeleting === routeToDelete.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Delete Route
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}; 