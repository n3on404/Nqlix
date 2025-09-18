import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';

const A4: React.CSSProperties = { width: '210mm', minHeight: '297mm', padding: '15mm', margin: 'auto', background: 'white', color: 'black' };

export default function PrintAllVehicleTrips() {
  const [params] = useSearchParams();
  const date = params.get('date') || new Date().toISOString().slice(0,10);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toNumber = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(v || '0'); return Number.isFinite(n) ? n : 0; };
  const formatTND = (v: any) => `${toNumber(v).toFixed(3)} TND`;

  useEffect(() => {
    (async () => {
      try {
        const key = `allVehicleTrips:${date}`;
        const cached = sessionStorage.getItem(key);
        if (cached) setData(JSON.parse(cached));
        const res = await api.get(`/api/vehicles/trips/daily?date=${encodeURIComponent(date)}`);
        if (res.success) {
          setData(res.data);
          try { sessionStorage.setItem(key, JSON.stringify(res.data)); } catch {}
        } else if (!cached) setError(res.message || 'Erreur de chargement');
      } catch (e: any) {
        if (!data) setError(e?.message || 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  if (loading) return <div className="p-6">Chargement...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return null;

  const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
  const grandTotalSeats = vehicles.reduce((s, v) => s + toNumber(v.totals?.totalSeats), 0);
  const grandTotalRevenue = vehicles.reduce((s, v) => s + toNumber(v.totals?.totalRevenue), 0);

  return (
    <div style={A4}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12mm' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6mm' }}>
          <img src="/ste_260.png" alt="STE" style={{ width: '28mm', height: '28mm', objectFit: 'contain' }} onLoad={() => setTimeout(() => window.print(), 200)} />
          <div>
            <div style={{ fontSize: '16pt', fontWeight: 700, margin: 0 }}>STE Dhraiff Services Transport</div>
            <div style={{ fontSize: '11pt', color: '#555' }}>Rapport journalier des trajets (tous les véhicules)</div>
            <div style={{ fontSize: '11pt', color: '#555' }}>{data.date}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10pt', color: '#555' }}>Total places: {grandTotalSeats}</div>
          <div style={{ fontSize: '10pt', color: '#555' }}>Recette totale: {formatTND(grandTotalRevenue)}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: '2mm' }}>Plaque</th>
            <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: '2mm' }}>Conducteur (CIN)</th>
            <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: '2mm' }}>Destinations (x fois)</th>
            <th style={{ textAlign: 'right', borderBottom: '2px solid #000', padding: '2mm' }}>Montant total</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.length === 0 ? (
            <tr><td colSpan={4} style={{ padding: '3mm', textAlign: 'center', color: '#777' }}>Aucun trajet aujourd'hui</td></tr>
          ) : vehicles.map((v: any, idx: number) => {
            const dests = Array.isArray(v.destinations) ? v.destinations : [];
            const destSummary = dests.map((d: any) => `${d.destination} (x${d.count})`).join('  •  ');
            return (
              <tr key={idx}>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{v.vehicle.licensePlate}</td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>
                  {v.vehicle.driver ? `${v.vehicle.driver.firstName} ${v.vehicle.driver.lastName} (${v.vehicle.driver.cin})` : '—'}
                </td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{destSummary || '—'}</td>
                <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(v.totals?.totalRevenue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}