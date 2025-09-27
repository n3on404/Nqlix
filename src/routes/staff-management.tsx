import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { useAuth } from '../context/AuthProvider';
import { toast } from 'sonner';
import api from '../lib/api';
import { Users, UserCheck, UserX, FileText, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any | null>(null);
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    cin: '',
    role: 'WORKER' as 'WORKER' | 'SUPERVISOR' | 'ADMIN'
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
        cin: createForm.cin,
        password: 'default123', // Default password - should be changed on first login
        role: createForm.role
      });
      
      if (response.success) {
        toast.success('Membre du personnel créé avec succès');
        setIsCreateDialogOpen(false);
        setCreateForm({
          firstName: '',
          lastName: '',
          phoneNumber: '',
          cin: '',
          role: 'WORKER'
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

  const formatTND = (value: number) => `${value.toFixed(3)} TND`;
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const openReport = async (staff: StaffMember) => {
    setSelectedStaff(staff);
    setIsReportOpen(true);
    setReportLoading(true);
    setReportError(null);
    try {
      console.log(`📊 [FRONTEND DEBUG] Fetching report for staff: ${staff.firstName} ${staff.lastName} (${staff.id})`);
      console.log(`📊 [FRONTEND DEBUG] Date: ${todayStr()}`);
      
      const res = await api.getStaffTransactions(staff.id, todayStr());
      console.log(`📊 [FRONTEND DEBUG] API Response:`, res);
      
      if (res.success) {
        setReportData(res.data);
        console.log(`📊 [FRONTEND DEBUG] Report data set:`, res.data);
        console.log(`📊 [FRONTEND DEBUG] Service fees:`, res.data.totals?.totalServiceFees);
        console.log(`📊 [FRONTEND DEBUG] Day passes:`, res.data.totals?.totalDayPasses);
        console.log(`📊 [FRONTEND DEBUG] Total income:`, res.data.totals?.totalIncome);
      } else {
        setReportError(res.message || 'Failed to load report');
      }
    } catch (e) {
      console.error('📊 [FRONTEND DEBUG] Error fetching report:', e);
      setReportError('Failed to load report');
    } finally {
      setReportLoading(false);
    }
  };

  const printReport = () => {
    if (!selectedStaff) return;
    const date = reportData?.date || todayStr();
    try {
      if (reportData) {
        const key = `staffReport:${selectedStaff.id}:${date}`;
        sessionStorage.setItem(key, JSON.stringify(reportData));
      }
    } catch {}
    navigate(`/print-staff-report?staffId=${encodeURIComponent(selectedStaff.id)}&date=${encodeURIComponent(date)}`);
  };

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Gestion du Personnel</h1>
          <p className="text-gray-600">Gérez les membres du personnel de votre station</p>
        </div>
        <Button variant="outline" onClick={async () => {
          const date = todayStr();
          const res = await api.getAllStaffDailyReport(date);
          if (res.success && res.data) {
            try { sessionStorage.setItem(`allStaffReport:${date}`, JSON.stringify(res.data)); } catch {}
            navigate(`/print-all-staff-report?date=${encodeURIComponent(date)}`);
          } else {
            toast.error(res.message || 'Échec du chargement du rapport');
          }
        }}>
          <Printer className="h-4 w-4 mr-2" /> Imprimer tout le personnel (A4)
        </Button>
      </div>

      <div className="flex justify-between items-center">
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              Ajouter un Membre
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ajouter un Membre du Personnel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prénom
                  </label>
                  <Input
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom
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
                  Numéro de Téléphone
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

              {currentStaff?.role === 'ADMIN' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rôle
                  </label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as 'WORKER' | 'SUPERVISOR' | 'ADMIN' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="WORKER">Ouvrier</option>
                    <option value="SUPERVISOR">Superviseur</option>
                    <option value="ADMIN">Administrateur</option>
                  </select>
                </div>
              )}
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={createStaffMember}>
                  Créer
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
              <p className="text-sm font-medium text-gray-600">Total Personnel</p>
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
              <p className="text-sm font-medium text-gray-600">Actifs</p>
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
              <p className="text-sm font-medium text-gray-600">Inactifs</p>
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
          <CardTitle>Membres du Personnel</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-600 py-8">{error}</div>
          ) : staffMembers.length === 0 ? (
            <div className="text-center text-gray-500 py-8">Aucun membre trouvé</div>
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
                variant="secondary"
                onClick={() => openReport(staff)}
                title="View today's transactions report"
              >
                <FileText className="h-4 w-4 mr-1" /> Report
              </Button>
              <Button
                        size="sm"
                variant="outline"
                        onClick={() => openEditDialog(staff)}
                      >
                        Modifier
              </Button>
                      <div className="relative group">
              <Button
                size="sm"
                          variant={staff.isActive ? "destructive" : "default"}
                          onClick={() => toggleStaffStatus(staff.id)}
                          disabled={staff.id === currentStaff.id}
              >
                          {staff.isActive ? 'Désactiver' : 'Activer'}
              </Button>
                        {staff.id === currentStaff.id && (
                          <span className="absolute left-0 mt-1 w-max text-xs text-gray-500 bg-card border border-gray-200 rounded px-2 py-1 shadow group-hover:block hidden">
                            Vous ne pouvez pas désactiver votre propre compte
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
                            Supprimer
              </Button>
                          {staff.id === currentStaff.id && (
                            <span className="absolute left-0 mt-1 w-max text-xs text-gray-500 bg-card border border-gray-200 rounded px-2 py-1 shadow group-hover:block hidden">
                              Vous ne pouvez pas supprimer votre propre compte
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

      {/* Report Dialog */}
      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Rapport Journalier du Personnel</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 overflow-y-auto max-h-[80vh]">
            {reportLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : reportError ? (
              <div className="text-center text-red-600 py-8">{reportError}</div>
            ) : reportData ? (
              <>
                {/* Header Info */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Date du Rapport</div>
                      <div className="font-semibold text-lg">{reportData.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Personnel</div>
                      <div className="font-semibold text-lg">{reportData.staff.firstName} {reportData.staff.lastName}</div>
                      <div className="text-sm text-gray-600">CIN: {reportData.staff.cin} • {reportData.staff.role}</div>
                    </div>
                  </div>
                </div>

                {/* Work Timeline Summary */}
                {reportData.workTimeline && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold mb-3 text-gray-800">Résumé de la Journée</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-xs text-gray-600">Début</div>
                        <div className="font-semibold text-sm">
                          {reportData.workTimeline.startTime ? 
                            new Date(reportData.workTimeline.startTime).toLocaleTimeString('fr-FR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            }) : '—'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-600">Fin</div>
                        <div className="font-semibold text-sm">
                          {reportData.workTimeline.endTime ? 
                            new Date(reportData.workTimeline.endTime).toLocaleTimeString('fr-FR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            }) : '—'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-600">Durée</div>
                        <div className="font-semibold text-sm">{reportData.workTimeline.duration || '—'}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-600">Transactions</div>
                        <div className="font-semibold text-sm">{reportData.workTimeline.totalTransactions || 0}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Income Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-green-600 font-medium">Frais de Service</div>
                        <div className="text-2xl font-bold text-green-700">{formatTND(reportData.totals.totalServiceFees || 0)}</div>
                        <div className="text-xs text-green-600">{reportData.summary?.totalSeatsBooked || 0} places vendues</div>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <Users className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-blue-600 font-medium">Pass Journaliers</div>
                        <div className="text-2xl font-bold text-blue-700">{formatTND(reportData.totals.totalDayPasses || 0)}</div>
                        <div className="text-xs text-blue-600">{reportData.summary?.totalDayPassesSold || 0} passes vendus</div>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <FileText className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 rounded-lg border border-purple-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-purple-600 font-medium">Revenus Totaux</div>
                        <div className="text-2xl font-bold text-purple-700">{formatTND(reportData.totals.totalIncome || 0)}</div>
                        <div className="text-xs text-purple-600">Total de la journée</div>
                      </div>
                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                        <UserCheck className="h-6 w-6 text-purple-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Transaction Timeline */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-800 text-lg">Chronologie des Transactions</h3>
                  
                  {/* Bookings Timeline */}
                  {reportData.items.bookings.length > 0 && (
                    <div>
                      <div className="font-semibold mb-3 text-gray-700 flex items-center">
                        <Users className="h-4 w-4 mr-2 text-green-600" />
                        Réservations (Frais de Service)
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {reportData.items.bookings.map((b: any, index: number) => (
                          <div key={b.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-xs font-semibold text-green-700">
                                {index + 1}
                              </div>
                              <div>
                                <div className="font-medium text-gray-800">
                                  {b.seatsBooked} place(s) • {b.destinationName || '—'}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {new Date(b.createdAt).toLocaleTimeString('fr-FR', { 
                                    hour: '2-digit', 
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Véhicule: {b.vehicleLicensePlate || 'N/A'}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-green-700 text-lg">{formatTND(b.serviceFeeAmount || 0)}</div>
                              <div className="text-xs text-gray-500">Frais de service</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Day Passes Timeline */}
                  {reportData.items.dayPasses.length > 0 && (
                    <div>
                      <div className="font-semibold mb-3 text-gray-700 flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-blue-600" />
                        Pass Journaliers
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {reportData.items.dayPasses.map((p: any, index: number) => (
                          <div key={p.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-semibold text-blue-700">
                                {index + 1}
                              </div>
                              <div>
                                <div className="font-medium text-gray-800">
                                  Plaque: {p.licensePlate}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {new Date(p.purchaseDate).toLocaleTimeString('fr-FR', { 
                                    hour: '2-digit', 
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Pass journalier
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-blue-700 text-lg">{formatTND(2)}</div>
                              <div className="text-xs text-gray-500">Pass journalier</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No Transactions Message */}
                  {reportData.items.bookings.length === 0 && reportData.items.dayPasses.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <div className="text-lg font-medium">Aucune transaction aujourd'hui</div>
                      <div className="text-sm">Aucune réservation ou pass journalier vendu</div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between items-center pt-4 border-t">
                  <div className="text-sm text-gray-600">
                    Rapport généré le {new Date().toLocaleString('fr-FR')}
                  </div>
                  <Button onClick={printReport} className="bg-blue-600 hover:bg-blue-700">
                    <Printer className="h-4 w-4 mr-2" /> Imprimer (A4)
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
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