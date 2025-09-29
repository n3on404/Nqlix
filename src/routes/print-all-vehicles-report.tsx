import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AllVehiclesDailyReport } from '../services/dbClient';

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

export default function PrintAllVehiclesReport() {
  const [params] = useSearchParams();
  const date = params.get('date') || new Date().toISOString().split('T')[0];
  const [report, setReport] = useState<AllVehiclesDailyReport | null>(null);
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

  useEffect(() => {
    const loadReport = async () => {
      try {
        const cacheKey = `allVehiclesReport:${date}`;
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
  }, [date]);

  if (loading) return <div className="p-6">Chargement du rapport...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!report) return <div className="p-6">Aucun rapport disponible</div>;

  return (
    <div style={A4}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #333', paddingBottom: '15px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
          RAPPORT QUOTIDIEN - TOUS LES VÉHICULES
        </h1>
        <div style={{ fontSize: '14px', color: '#666' }}>
          <div>Date: {formatDate(report.date)}</div>
          <div>Période: {formatDate(report.date)}</div>
        </div>
      </div>

      {/* Overall Summary */}
      <div style={{ marginBottom: '20px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 15px 0', color: '#333' }}>
          RÉSUMÉ GLOBAL
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
          <div style={{ textAlign: 'center', backgroundColor: '#e3f2fd', padding: '15px', borderRadius: '5px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976d2' }}>{report.totalVehicles}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Véhicules actifs</div>
          </div>
          <div style={{ textAlign: 'center', backgroundColor: '#e8f5e8', padding: '15px', borderRadius: '5px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#388e3c' }}>{report.totalTrips}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total des trajets</div>
          </div>
          <div style={{ textAlign: 'center', backgroundColor: '#fff3e0', padding: '15px', borderRadius: '5px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f57c00' }}>{report.totalSeatsSold}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Places vendues</div>
          </div>
          <div style={{ textAlign: 'center', backgroundColor: '#fce4ec', padding: '15px', borderRadius: '5px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c2185b' }}>{formatTND(report.totalIncome)}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Revenus totaux</div>
          </div>
        </div>
      </div>

      {/* Vehicles Summary Table */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 15px 0', color: '#333' }}>
          RÉSUMÉ PAR VÉHICULE
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd', fontSize: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left' }}>Véhicule</th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>Capacité</th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>Trajets</th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>Places vendues</th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>Revenus</th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>Taux occupation</th>
            </tr>
          </thead>
          <tbody>
            {report.vehicles.map((vehicle, index) => {
              const occupancyRate = vehicle.vehicle.capacity > 0 
                ? ((vehicle.totalSeatsSold / (vehicle.totalTrips * vehicle.vehicle.capacity)) * 100).toFixed(1)
                : '0.0';
              
              return (
                <tr key={index}>
                  <td style={{ border: '1px solid #ddd', padding: '6px' }}>{vehicle.vehicle.licensePlate}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{vehicle.vehicle.capacity}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{vehicle.totalTrips}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{vehicle.totalSeatsSold}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{formatTND(vehicle.totalIncome)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{occupancyRate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detailed Trips by Vehicle */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 15px 0', color: '#333' }}>
          DÉTAIL DES TRAJETS PAR VÉHICULE
        </h2>
        
        {report.vehicles.map((vehicle, vehicleIndex) => (
          <div key={vehicleIndex} style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
            <h3 style={{ 
              fontSize: '14px', 
              fontWeight: 'bold', 
              margin: '0 0 10px 0', 
              color: '#333',
              backgroundColor: '#e9ecef',
              padding: '8px',
              borderRadius: '3px'
            }}>
              Véhicule: {vehicle.vehicle.licensePlate} ({vehicle.vehicle.capacity} places)
            </h3>
            
            {vehicle.trips.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd', fontSize: '9px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'left' }}>Heure</th>
                    <th style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'left' }}>Destination</th>
                    <th style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center' }}>Position</th>
                    <th style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center' }}>Places</th>
                    <th style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center' }}>Vendues</th>
                    <th style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'right' }}>Prix/place</th>
                    <th style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicle.trips.map((trip, tripIndex) => (
                    <tr key={tripIndex}>
                      <td style={{ border: '1px solid #ddd', padding: '4px' }}>
                        {new Date(trip.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ border: '1px solid #ddd', padding: '4px' }}>{trip.destinationName}</td>
                      <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center' }}>{trip.queuePosition}</td>
                      <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center' }}>{trip.totalSeats}</td>
                      <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center' }}>{trip.totalSeats - trip.availableSeats}</td>
                      <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'right' }}>{formatTND(trip.basePrice)}</td>
                      <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'right' }}>
                        {formatTND(trip.basePrice * (trip.totalSeats - trip.availableSeats))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
                    <td style={{ border: '1px solid #ddd', padding: '4px' }} colSpan={3}>TOTAL</td>
                    <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center' }}>{vehicle.totalTrips}</td>
                    <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center' }}>{vehicle.totalSeatsSold}</td>
                    <td style={{ border: '1px solid #ddd', padding: '4px' }}></td>
                    <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'right' }}>{formatTND(vehicle.totalIncome)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontStyle: 'italic' }}>
                Aucun trajet enregistré pour ce véhicule
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '10px', color: '#666', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
        <div>Rapport généré le {new Date().toLocaleString('fr-FR')}</div>
        <div>STE Dhraiff Services Transport</div>
        <div>Page 1 de 1</div>
      </div>
    </div>
  );
}