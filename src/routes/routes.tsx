import React from 'react';
import { RoutesTable } from '../components/RoutesTable';
import { useAuth } from '../context/AuthProvider';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { MapPin, DollarSign, Shield } from 'lucide-react';

export default function RoutesPage() {
  const { currentStaff } = useAuth();
  const isSupervisor = currentStaff?.role === 'SUPERVISOR';
  const isAdmin = currentStaff?.role === 'ADMIN';

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MapPin className="h-8 w-8" />
            Gestion des itinéraires
          </h1>
          <p className="text-muted-foreground mt-2">
            Voir et gérer les informations et tarifs des itinéraires
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            {isAdmin ? 'Administrateur' : isSupervisor ? 'Superviseur' : 'Utilisateur'}
          </Badge>
        </div>
      </div>

      {/* Routes Table */}
      <RoutesTable />
    </div>
  );
} 