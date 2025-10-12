import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export interface RouteOption {
  id: string;
  name: string;
  description: string;
  stations: string[];
  color: string;
}

interface RouteSelectionProps {
  onRouteSelected: (routeId: string) => void;
  isLoading?: boolean;
}

const ROUTE_OPTIONS: RouteOption[] = [
  {
    id: 'JEMMAL',
    name: 'JEMMAL',
    description: 'Route principale vers Jemmal',
    stations: ['Jemmal', 'Station Jemmal'],
    color: 'bg-blue-500'
  },
  {
    id: 'MOKNIN_TEBOULBA',
    name: 'MOKNIN - TEBOULBA',
    description: 'Route vers Moknin et Teboulba (Toughateur)',
    stations: ['Moknin', 'Teboulba', 'Station Moknin', 'Station Teboulba'],
    color: 'bg-green-500'
  },
  {
    id: 'KSAR_HLEL',
    name: 'KSAR HLEL',
    description: 'Route vers Ksar Hlel uniquement',
    stations: ['Ksar Hlel', 'Station Ksar Hlel'],
    color: 'bg-purple-500'
  },
  {
    id: 'ALL',
    name: 'TOUTES LES ROUTES',
    description: 'Accès à toutes les routes et stations',
    stations: ['Toutes les stations'],
    color: 'bg-gray-500'
  }
];

export default function RouteSelection({ onRouteSelected, isLoading = false }: RouteSelectionProps) {
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  const handleRouteSelect = (routeId: string) => {
    setSelectedRoute(routeId);
  };

  const handleConfirm = () => {
    if (selectedRoute) {
      onRouteSelected(selectedRoute);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-800">
            Sélection de la Route
          </CardTitle>
          <CardDescription className="text-gray-600">
            Choisissez la route sur laquelle vous opérez pour accéder aux stations et files d'attente correspondantes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {ROUTE_OPTIONS.map((route) => (
              <div
                key={route.id}
                className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                  selectedRoute === route.id
                    ? 'border-blue-500 bg-blue-50 shadow-lg'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                }`}
                onClick={() => handleRouteSelect(route.id)}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-4 h-4 rounded-full ${route.color} mt-1`}></div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-gray-800">
                      {route.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {route.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {route.stations.map((station, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {station}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                {selectedRoute === route.id && (
                  <div className="absolute top-2 right-2">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex justify-center">
            <Button
              onClick={handleConfirm}
              disabled={!selectedRoute || isLoading}
              className="px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Connexion...</span>
                </div>
              ) : (
                'Continuer'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}