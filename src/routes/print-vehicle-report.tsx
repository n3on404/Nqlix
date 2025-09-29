import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { VehicleDailyReport } from '../services/dbClient';

const A4: React.CSSProperties = { 
  width: '210mm', 
  minHeight: '297mm', 
  padding: '15mm', 
  margin: 'auto', 
  background: 'white', 
  color: 'black',
  fontFamily: 'Arial, sans-serif',
  fontSize: '12px',
  lineHeight: '1.4'
};

export default function PrintVehicleReport() {
  const [params] = useSearchParams();
  const vehicleId = params.get('vehicleId') || '';
  const date = params.get('date') || new Date().toISOString().split('T')[0];
  const [report, setReport] = useState<VehicleDailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatTND = (value: number) => `${value.toFixed(3)} TND`;
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    const loadReport = async () => {
      try {
        const cacheKey = `vehicleReport:${vehicleId}:${date}`;
        const cached = sessionStorage.getItem(cacheKey);
        
        if (cached) {
          setReport(JSON.parse(cached));
        } else {
          setError('Rapport non trouvé. Veuillez le régénérer.');
        }
      } catch (e: any) {
        setError(e?.message || 'Erreur de chargement du rapport');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [vehicleId, date]);

  if (loading) return <div className="p-6">Chargement du rapport...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!report) return <div className="p-6">Aucun rapport disponible</div>;

  return (
    <div style={A4}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #333', paddingBottom: '15px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
          RAPPORT QUOTIDIEN - VÉHICULE
        </h1>
        <div style={{ fontSize: '14px', color: '#666' }}>
          <div>Date: {formatDate(report.date)}</div>
          <div>Véhicule: {report.vehicle.licensePlate}</div>
        </div>
      </div>

      {/* Vehicle Information */}
      <div style={{ marginBottom: '20px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 10px 0', color: '#333' }}>
          INFORMATIONS DU VÉHICULE
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div><strong>Plaque d'immatriculation:</strong> {report.vehicle.licensePlate}</div>
          <div><strong>Capacité:</strong> {report.vehicle.capacity} places</div>
          <div><strong>Statut:</strong> {report.vehicle.isActive ? 'Actif' : 'Inactif'}</div>
          <div><strong>Disponibilité:</strong> {report.vehicle.isAvailable ? 'Disponible' : 'Indisponible'}</div>
        </div>
      </div>

      {/* Summary Statistics */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 15px 0', color: '#333' }}>
          RÉSUMÉ DE LA JOURNÉE
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
          <div style={{ textAlign: 'center', backgroundColor: '#e3f2fd', padding: '15px', borderRadius: '5px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976d2' }}>{report.totalTrips}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total des trajets</div>
          </div>
          <div style={{ textAlign: 'center', backgroundColor: '#e8f5e8', padding: '15px', borderRadius: '5px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#388e3c' }}>{report.totalSeatsSold}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Places vendues</div>
          </div>
          <div style={{ textAlign: 'center', backgroundColor: '#fff3e0', padding: '15px', borderRadius: '5px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f57c00' }}>{formatTND(report.totalIncome)}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Revenus totaux</div>
          </div>
        </div>
      </div>

      {/* Destinations Summary */}
      {report.destinations.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 15px 0', color: '#333' }}>
            RÉPARTITION PAR DESTINATION
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Destination</th>
                <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Trajets</th>
                <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Places vendues</th>
                <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right' }}>Revenus</th>
              </tr>
            </thead>
            <tbody>
              {report.destinations.map((dest, index) => (
                <tr key={index}>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{dest.destinationName}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{dest.tripCount}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{dest.totalSeatsSold}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right' }}>{formatTND(dest.totalIncome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detailed Trips */}
      {report.trips.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 15px 0', color: '#333' }}>
            DÉTAIL DES TRAJETS
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd', fontSize: '10px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left' }}>Heure</th>
                <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left' }}>Destination</th>
                <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>Position</th>
                <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>Places</th>
                <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>Vendues</th>
                <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>Prix/place</th>
                <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {report.trips.map((trip, index) => (
                <tr key={index}>
                  <td style={{ border: '1px solid #ddd', padding: '6px' }}>{formatTime(trip.createdAt)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px' }}>{trip.destinationName}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{trip.queuePosition}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{trip.totalSeats}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{trip.totalSeats - trip.availableSeats}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{formatTND(trip.basePrice)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>
                    {formatTND(trip.basePrice * (trip.totalSeats - trip.availableSeats))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '10px', color: '#666', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
        <div>Rapport généré le {new Date().toLocaleString('fr-FR')}</div>
        <div>STE Dhraiff Services Transport</div>
      </div>
    </div>
  );
}