import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';

const A4: React.CSSProperties = { width: '210mm', minHeight: '297mm', padding: '15mm', margin: 'auto', background: 'white', color: 'black' };

export default function PrintAllVehicleTrips() {
  const [params] = useSearchParams();
  const date = params.get('date') || (() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })();
  const [data, setData] = useState<any | null>(null);
  const [incomeByPlate, setIncomeByPlate] = useState<Record<string, { totalIncome: number; destCounts: Record<string, number> }> | null>(null);
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
        // Use exit-pass based aggregated endpoint for consistent data
        const res = await api.get(`/api/vehicles/trips/daily-exit-income?date=${encodeURIComponent(date)}`);
        if (res.success) {
          const d: any = res.data || {};
          setData(d);
          try { sessionStorage.setItem(key, JSON.stringify(res.data)); } catch {}
          // Build quick lookup for totals/destinations by plate
          const vehiclesArr = Array.isArray(d?.vehicles) ? d.vehicles : [];
          const incomes: Record<string, { totalIncome: number; destCounts: Record<string, number> }> = {};
          vehiclesArr.forEach((v: any) => {
            const plate = v?.vehicle?.licensePlate;
            if (!plate) return;
            const destCounts: Record<string, number> = {};
            const dests = Array.isArray(v.destinations) ? v.destinations : [];
            dests.forEach((d: any) => { destCounts[d.destination || '—'] = Number(d.count || 0); });
            incomes[plate] = { totalIncome: Number(v?.totals?.totalIncome || 0), destCounts };
          });
          setIncomeByPlate(incomes);
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
  const grandTotalIncome = vehicles.reduce((s: number, v: any) => {
    const plate = v?.vehicle?.licensePlate;
    const inc = plate && incomeByPlate ? incomeByPlate[plate] : null;
    return s + toNumber(inc?.totalIncome || 0);
  }, 0);

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
          <div style={{ fontSize: '10pt', color: '#555' }}>Revenus totaux (sorties): {formatTND(grandTotalIncome)}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: '2mm' }}>Plaque</th>
            <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: '2mm' }}>Conducteur (CIN)</th>
            <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: '2mm' }}>Destinations (x fois)</th>
            <th style={{ textAlign: 'right', borderBottom: '2px solid #000', padding: '2mm' }}>Revenu (sorties)</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.length === 0 ? (
            <tr><td colSpan={4} style={{ padding: '3mm', textAlign: 'center', color: '#777' }}>Aucun trajet aujourd'hui</td></tr>
          ) : vehicles.map((v: any, idx: number) => {
            const plate = v?.vehicle?.licensePlate;
            const inc = plate && incomeByPlate ? incomeByPlate[plate] : null;
            // Prefer exit-pass based destination counts; fallback to trips aggregation
            const destSummary = inc
              ? Object.entries(inc.destCounts).map(([name, count]) => `${name} (x${count})`).join('  •  ')
              : (Array.isArray(v.destinations) ? v.destinations.map((d: any) => `${d.destination} (x${d.count})`).join('  •  ') : '—');
            return (
              <tr key={idx}>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{v.vehicle.licensePlate}</td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>
                  {v.vehicle.driver ? `${v.vehicle.driver.firstName} ${v.vehicle.driver.lastName}` : '—'}
                </td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{destSummary || '—'}</td>
                <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(inc?.totalIncome || 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}