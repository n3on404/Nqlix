import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { useAuth } from '../context/AuthProvider';
import { toast } from 'sonner';
import api from '../lib/api';
import { Users, UserCheck, UserX } from 'lucide-react';

interface StaffMember {
  id: string;
  cin: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: 'WORKER' | 'SUPERVISOR' | 'ADMIN';
  isActive: boolean;
  stationId: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  _count: {
    approvedDrivers: number;
  };
}

interface CreateStaffForm {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  cin: string;
  role: 'WORKER' | 'SUPERVISOR' | 'ADMIN';
}

const StaffManagement: React.FC = () => {
  const { currentStaff } = useAuth();
  
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    cin: ''
  });
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    cin: '',
    role: 'WORKER',
    isActive: true
  });

  // Fetch staff members
  const fetchStaffMembers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.getStaffMembers();
      
      if (response.success) {
        setStaffMembers(response.data || []);
      } else {
        setError(response.message || 'Échec de la récupération des membres du personnel');
      }
    } catch (error) {
      console.error('Error fetching staff members:', error);
      setError('Échec de la récupération des membres du personnel');
    } finally {
      setLoading(false);
    }
  };

  // Create new staff member
  const createStaffMember = async () => {
    try {
      if (!createForm.firstName || !createForm.lastName || !createForm.phoneNumber || !createForm.cin) {
        toast.error('Tous les champs sont requis');
        return;
      }

      const response = await api.createStaffMember({
        firstName: createForm.firstName,
        lastName: createForm.lastName,
        phoneNumber: createForm.phoneNumber,
        cin: createForm.cin
      });
      
      if (response.success) {
        toast.success('Membre du personnel créé avec succès');
        setIsCreateDialogOpen(false);
        setCreateForm({
      firstName: '',
      lastName: '',
          phoneNumber: '',
          cin: ''
        });
        fetchStaffMembers();
      } else {
        toast.error(response.message || 'Échec de la création du membre du personnel');
      }
    } catch (error) {
      console.error('Error creating staff member:', error);
      toast.error('Échec de la création du membre du personnel');
    }
  };

  // Update staff member
  const updateStaffMember = async () => {
    try {
      if (!selectedStaff) return;

      if (!editForm.firstName || !editForm.lastName || !editForm.phoneNumber || !editForm.cin) {
        toast.error('Tous les champs sont requis');
        return;
      }

      const response = await api.updateStaffMember(selectedStaff.id, editForm);
      
      if (response.success) {
        toast.success('Staff member updated successfully');
        setIsEditDialogOpen(false);
        setSelectedStaff(null);
        fetchStaffMembers();
      } else {
        toast.error(response.message || 'Failed to update staff member');
      }
    } catch (error) {
      console.error('Error updating staff member:', error);
      toast.error('Failed to update staff member');
    }
  };

  // Toggle staff status
  const toggleStaffStatus = async (staffId: string) => {
    try {
      const response = await api.toggleStaffStatus(staffId);
      
      if (response.success) {
        toast.success(response.message);
        fetchStaffMembers();
      } else {
        toast.error(response.message || 'Failed to toggle staff status');
      }
    } catch (error) {
      console.error('Error toggling staff status:', error);
      toast.error('Failed to toggle staff status');
    }
  };

  // Delete staff member
  const deleteStaffMember = async (staffId: string) => {
    try {
      const response = await api.deleteStaffMember(staffId);
      
      if (response.success) {
        toast.success('Staff member deleted successfully');
        fetchStaffMembers();
      } else {
        toast.error(response.message || 'Failed to delete staff member');
      }
    } catch (error) {
      console.error('Error deleting staff member:', error);
      toast.error('Failed to delete staff member');
    }
  };

  // Open edit dialog
  const openEditDialog = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setEditForm({
      firstName: staff.firstName,
      lastName: staff.lastName,
      phoneNumber: staff.phoneNumber,
      cin: staff.cin,
      role: staff.role,
      isActive: staff.isActive
    });
    setIsEditDialogOpen(true);
  };

  // Initial fetch
  useEffect(() => {
    if (currentStaff) {
      fetchStaffMembers();
    }
  }, [currentStaff]);

  if (!currentStaff) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Please log in to access staff management</p>
      </div>
    );
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-100 text-red-800';
      case 'SUPERVISOR':
        return 'bg-blue-100 text-blue-800';
      case 'WORKER':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Staff Management</h1>
        <p className="text-gray-600">Manage staff members at your station</p>
      </div>

      <div className="flex justify-between items-center">
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              Add New Staff
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <Input
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <Input
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                    placeholder="Last name"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <Input
                  value={createForm.phoneNumber}
                  onChange={(e) => setCreateForm({ ...createForm, phoneNumber: e.target.value })}
                  placeholder="Phone number"
                />
            </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CIN
                </label>
                <Input
                  value={createForm.cin}
                  onChange={(e) => setCreateForm({ ...createForm, cin: e.target.value })}
                  placeholder="8-digit CIN"
                  maxLength={8}
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createStaffMember}>
                  Create Staff Member
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card p-4 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Staff</p>
              <p className="text-2xl font-bold text-gray-900">{staffMembers.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-card p-4 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Staff</p>
              <p className="text-2xl font-bold text-gray-900">
                {staffMembers.filter(staff => staff.isActive).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-card p-4 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <UserX className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Inactive Staff</p>
              <p className="text-2xl font-bold text-gray-900">
                {staffMembers.filter(staff => !staff.isActive).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Staff List */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-600 py-8">{error}</div>
          ) : staffMembers.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No staff members found</div>
          ) : (
            <div className="space-y-4">
              {staffMembers.map((staff) => (
                <div key={staff.id} className="border rounded-lg p-4 hover:bg-muted">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {staff.firstName} {staff.lastName}
                          {staff.id === currentStaff.id && (
                            <span className="ml-2 px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700 font-semibold">(You)</span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-600">CIN: {staff.cin}</p>
                        <p className="text-sm text-gray-600">Phone: {staff.phoneNumber}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Badge className={getRoleBadgeColor(staff.role)}>
                        {staff.role}
                      </Badge>
                      <Badge className={getStatusBadgeColor(staff.isActive)}>
                        {staff.isActive ? 'Active' : 'Inactive'}
                      </Badge>
            </div>

                    <div className="flex items-center space-x-2">
              <Button
                        size="sm"
                variant="outline"
                        onClick={() => openEditDialog(staff)}
                      >
                        Edit
              </Button>
                      <div className="relative group">
              <Button
                size="sm"
                          variant={staff.isActive ? "destructive" : "default"}
                          onClick={() => toggleStaffStatus(staff.id)}
                          disabled={staff.id === currentStaff.id}
              >
                          {staff.isActive ? 'Deactivate' : 'Activate'}
              </Button>
                        {staff.id === currentStaff.id && (
                          <span className="absolute left-0 mt-1 w-max text-xs text-gray-500 bg-card border border-gray-200 rounded px-2 py-1 shadow group-hover:block hidden">
                            You cannot deactivate your own account
                          </span>
                        )}
            </div>
                      {staff.role !== 'ADMIN' && (
                        <div className="relative group">
              <Button
                size="sm"
                            variant="destructive"
                            onClick={() => {
                              setStaffToDelete(staff);
                              setIsDeleteConfirmOpen(true);
                            }}
                            disabled={staff.id === currentStaff.id}
                          >
                            Delete
              </Button>
                          {staff.id === currentStaff.id && (
                            <span className="absolute left-0 mt-1 w-max text-xs text-gray-500 bg-card border border-gray-200 rounded px-2 py-1 shadow group-hover:block hidden">
                              You cannot delete your own account
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <Input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  placeholder="First name"
                  />
                </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <Input
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  placeholder="Last name"
                  />
                </div>
              </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <Input
                value={editForm.phoneNumber}
                onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                placeholder="Phone number"
              />
              </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CIN
              </label>
              <Input
                value={editForm.cin}
                onChange={(e) => setEditForm({ ...editForm, cin: e.target.value })}
                placeholder="8-digit CIN"
                maxLength={8}
                />
              </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
              <Button onClick={updateStaffMember}>
                Update Staff Member
              </Button>
              </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Are you sure you want to delete this staff member?</p>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => {
                if (staffToDelete) {
                  deleteStaffMember(staffToDelete.id);
                }
                setIsDeleteConfirmOpen(false);
              }}>
                Delete
          </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffManagement; 