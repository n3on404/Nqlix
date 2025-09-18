import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { useSearchParams } from 'react-router-dom';

const A4Styles: React.CSSProperties = {
  width: '210mm',
  minHeight: '297mm',
  padding: '15mm',
  margin: 'auto',
  background: 'white',
  color: 'black',
};

export default function PrintStaffReport() {
  const [params] = useSearchParams();
  const staffId = params.get('staffId') || '';
  const date = params.get('date') || new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Try to hydrate from sessionStorage first to avoid flicker/zeroing
        const key = `staffReport:${staffId}:${date}`;
        const cached = sessionStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          setData(parsed);
        }

        const res = await api.getStaffTransactions(staffId, date);
        if (res.success) {
          setData(res.data);
          try { sessionStorage.setItem(key, JSON.stringify(res.data)); } catch {}
        } else if (!cached) {
          setError(res.message || 'Failed to load report');
        }
      } catch (e: any) {
        if (!data) setError(e?.message || 'Failed to load report');
      } finally {
        setLoading(false);
      }
    })();
  }, [staffId, date]);

  const toNumber = (v: any) => {
    const n = typeof v === 'number' ? v : parseFloat(v || '0');
    return Number.isFinite(n) ? n : 0;
  };
  const formatTND = (value: any) => `${toNumber(value).toFixed(3)} TND`;

  if (loading) return <div className="p-6">Chargement...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div style={A4Styles}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12mm' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6mm' }}>
          <img src="/ste_260.png" alt="STE" style={{ width: '28mm', height: '28mm', objectFit: 'contain' }} onLoad={() => setTimeout(() => window.print(), 200)} />
          <div>
            <div style={{ fontSize: '16pt', fontWeight: 700, margin: 0 }}>STE Dhraiff Services Transport</div>
            <div style={{ fontSize: '11pt', color: '#555' }}>{data.date}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12pt', fontWeight: 600 }}>
            {data.staff.firstName} {data.staff.lastName}
          </div>
          <div style={{ fontSize: '10pt', color: '#555' }}>CIN: {data.staff.cin}</div>
          <div style={{ fontSize: '10pt', color: '#555' }}>{data.staff.role}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6mm', marginBottom: '10mm' }}>
        <div style={{ border: '1px solid #ddd', padding: '4mm' }}>
          <div style={{ fontSize: '9pt', color: '#666' }}>Réservations (Espèces)</div>
          <div style={{ fontSize: '12pt', fontWeight: 700 }}>{formatTND(data.totals.totalCashBookingsAmount)}</div>
        </div>
        <div style={{ border: '1px solid #ddd', padding: '4mm' }}>
          <div style={{ fontSize: '9pt', color: '#666' }}>Pass Journaliers</div>
          <div style={{ fontSize: '12pt', fontWeight: 700 }}>{formatTND(data.totals.totalDayPasses)}</div>
        </div>
        <div style={{ border: '1px solid #ddd', padding: '4mm' }}>
          <div style={{ fontSize: '9pt', color: '#666' }}>Total Général</div>
          <div style={{ fontSize: '12pt', fontWeight: 700 }}>{formatTND(data.totals.grandTotal)}</div>
        </div>
      </div>

      <section style={{ marginBottom: '8mm' }}>
        <h2 style={{ fontSize: '12pt', margin: 0, marginBottom: '2mm' }}>Réservations</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Places</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Montant</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Destination</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Heure</th>
            </tr>
          </thead>
          <tbody>
            {data.items.bookings.map((b: any) => (
              <tr key={b.id}>
                <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{b.seatsBooked}</td>
                <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(b.totalAmount)}</td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{b.queue?.destinationName || ''}</td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{new Date(b.createdAt).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ fontSize: '12pt', margin: 0, marginBottom: '2mm' }}>Pass Journaliers</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Immatriculation</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Prix</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Heure</th>
            </tr>
          </thead>
          <tbody>
            {data.items.dayPasses.map((p: any) => (
              <tr key={p.id}>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{p.licensePlate}</td>
                <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(p.price)}</td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{new Date(p.purchaseDate).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}