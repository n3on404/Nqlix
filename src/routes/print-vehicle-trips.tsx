import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';

const A4: React.CSSProperties = { width: '210mm', minHeight: '297mm', padding: '15mm', margin: 'auto', background: 'white', color: 'black' };

export default function PrintVehicleTrips() {
  const [params] = useSearchParams();
  const vehicleId = params.get('vehicleId') || '';
  const date = params.get('date') || (() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })();
  const [data, setData] = useState<any | null>(null);
  const [income, setIncome] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toNumber = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(v || '0'); return Number.isFinite(n) ? n : 0; };
  const formatTND = (v: any) => `${toNumber(v).toFixed(3)} TND`;

  useEffect(() => {
    (async () => {
      try {
        const key = `vehicleTrips:${vehicleId}:${date}`;
        const cached = sessionStorage.getItem(key);
        if (cached) setData(JSON.parse(cached));
        const res = await api.getVehicleTrips(vehicleId, date);
        if (res.success) {
          setData(res.data);
          try { sessionStorage.setItem(key, JSON.stringify(res.data)); } catch {}
          // Also load driver income from exit passes using license plate
          const lp = res.data?.vehicle?.licensePlate;
          if (lp) {
            const incomeRes = await api.getDriverIncome(lp, date);
            if (incomeRes.success) setIncome(incomeRes.data);
          }
        } else if (!cached) setError(res.message || 'Erreur de chargement');
      } catch (e: any) {
        if (!data) setError(e?.message || 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    })();
  }, [vehicleId, date]);

  if (loading) return <div className="p-6">Chargement...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div style={A4}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12mm' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6mm' }}>
          <img src="/ste_260.png" alt="STE" style={{ width: '28mm', height: '28mm', objectFit: 'contain' }} onLoad={() => setTimeout(() => window.print(), 200)} />
          <div>
            <div style={{ fontSize: '16pt', fontWeight: 700, margin: 0 }}>STE Dhraiff Services Transport</div>
            <div style={{ fontSize: '11pt', color: '#555' }}>Rapport des trajets du véhicule</div>
            <div style={{ fontSize: '11pt', color: '#555' }}>{data.date}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12pt', fontWeight: 600 }}>Immatriculation: {data.vehicle.licensePlate}</div>
          {data.vehicle.driver && (
            <>
              <div style={{ fontSize: '10pt', color: '#555' }}>Conducteur: {data.vehicle.driver.firstName} {data.vehicle.driver.lastName}</div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6mm', marginBottom: '10mm' }}>
        <div style={{ border: '1px solid #ddd', padding: '4mm' }}>
          <div style={{ fontSize: '9pt', color: '#666' }}>Revenus (sorties)</div>
          <div style={{ fontSize: '12pt', fontWeight: 700 }}>
            {income ? formatTND(income.totals?.totalIncome || 0) : formatTND(data.totals?.totalRevenue || 0)}
          </div>
        </div>
      </div>

      {income && Array.isArray(income.items) && income.items.length > 0 ? (
        <section>
          <h2 style={{ fontSize: '12pt', margin: 0, marginBottom: '2mm' }}>Sorties (calcul revenu)</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Heure</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Destination</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Capacité</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Prix/Place</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {income.items.map((it: any) => (
                <tr key={it.id}>
                  <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{new Date(it.exitTime).toLocaleTimeString()}</td>
                  <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{it.destinationName || '—'}</td>
                  <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{toNumber(it.capacity)}</td>
                  <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(it.basePrice)}</td>
                  <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section>
          <h2 style={{ fontSize: '12pt', margin: 0, marginBottom: '2mm' }}>Trajets</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Heure</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Destination</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Places</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Prix/Place</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {data.trips.map((t: any, idx: number) => (
                <tr key={idx}>
                  <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{new Date(t.time).toLocaleTimeString()}</td>
                  <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{t.destination}</td>
                  <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{t.seats}</td>
                  <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(t.basePrice)}</td>
                  <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(t.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}