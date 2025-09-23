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
          // Auto-print after data loads
          setTimeout(() => window.print(), 500);
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
        <div>
          <div style={{ fontSize: '16pt', fontWeight: 700, margin: 0 }}>Rapport de Performance du Personnel</div>
          <div style={{ fontSize: '11pt', color: '#555' }}>STE Dhraiff Services Transport</div>
          <div style={{ fontSize: '10pt', color: '#555' }}>{data.date}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12pt', fontWeight: 600 }}>
            {data.staff.firstName} {data.staff.lastName}
          </div>
          <div style={{ fontSize: '10pt', color: '#555' }}>CIN: {data.staff.cin}</div>
          <div style={{ fontSize: '10pt', color: '#555' }}>{data.staff.role}</div>
        </div>
      </div>

      {/* Work Timeline Section */}
      {data.workTimeline && (
        <div style={{ marginBottom: '8mm', padding: '4mm', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '4px' }}>
          <h3 style={{ fontSize: '11pt', margin: 0, marginBottom: '3mm', color: '#495057' }}>📅 Timeline de Travail</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4mm' }}>
            <div>
              <div style={{ fontSize: '9pt', color: '#666' }}>Début de travail</div>
              <div style={{ fontSize: '10pt', fontWeight: 600 }}>
                {data.workTimeline.startTime ? new Date(data.workTimeline.startTime).toLocaleTimeString() : 'N/A'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '9pt', color: '#666' }}>Fin de travail</div>
              <div style={{ fontSize: '10pt', fontWeight: 600 }}>
                {data.workTimeline.endTime ? new Date(data.workTimeline.endTime).toLocaleTimeString() : 'N/A'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '9pt', color: '#666' }}>Durée totale</div>
              <div style={{ fontSize: '10pt', fontWeight: 600 }}>
                {data.workTimeline.duration || 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Income Totals Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6mm', marginBottom: '10mm' }}>
        <div style={{ border: '1px solid #ddd', padding: '6mm', textAlign: 'center' }}>
          <div style={{ fontSize: '10pt', color: '#666', marginBottom: '2mm' }}>💰 Frais de Service</div>
          <div style={{ fontSize: '16pt', fontWeight: 700, color: '#28a745' }}>{formatTND(data.totals.totalServiceFees)}</div>
          <div style={{ fontSize: '9pt', color: '#666' }}>({data.totals.serviceFeeRate} TND/place)</div>
        </div>
        <div style={{ border: '1px solid #ddd', padding: '6mm', textAlign: 'center' }}>
          <div style={{ fontSize: '10pt', color: '#666', marginBottom: '2mm' }}>🎫 Pass Journaliers</div>
          <div style={{ fontSize: '16pt', fontWeight: 700, color: '#17a2b8' }}>{formatTND(data.totals.totalDayPasses)}</div>
        </div>
        <div style={{ border: '2px solid #28a745', padding: '6mm', textAlign: 'center', backgroundColor: '#f8fff9' }}>
          <div style={{ fontSize: '10pt', color: '#666', marginBottom: '2mm' }}>💵 Revenus Totaux</div>
          <div style={{ fontSize: '18pt', fontWeight: 700, color: '#28a745' }}>{formatTND(data.totals.totalIncome)}</div>
        </div>
      </div>

      {/* Summary Stats */}
      {data.summary && (
        <div style={{ marginBottom: '8mm', padding: '4mm', backgroundColor: '#e3f2fd', border: '1px solid #bbdefb', borderRadius: '4px' }}>
          <h3 style={{ fontSize: '11pt', margin: 0, marginBottom: '3mm', color: '#1976d2' }}>📊 Résumé des Performances</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4mm' }}>
            <div>
              <div style={{ fontSize: '9pt', color: '#666' }}>Places vendues</div>
              <div style={{ fontSize: '11pt', fontWeight: 600 }}>{data.summary.totalSeatsBooked}</div>
            </div>
            <div>
              <div style={{ fontSize: '9pt', color: '#666' }}>Pass journaliers vendus</div>
              <div style={{ fontSize: '11pt', fontWeight: 600 }}>{data.summary.totalDayPassesSold}</div>
            </div>
            <div>
              <div style={{ fontSize: '9pt', color: '#666' }}>Frais de service moyen/place</div>
              <div style={{ fontSize: '11pt', fontWeight: 600 }}>{formatTND(data.summary.averageServiceFeePerSeat)}</div>
            </div>
          </div>
        </div>
      )}

      <section style={{ marginBottom: '8mm' }}>
        <h2 style={{ fontSize: '12pt', margin: 0, marginBottom: '2mm' }}>🚌 Détail des Réservations (Frais de Service)</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ textAlign: 'center', borderBottom: '1px solid #000', padding: '2mm' }}>Heure</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Véhicule</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Destination</th>
              <th style={{ textAlign: 'center', borderBottom: '1px solid #000', padding: '2mm' }}>Places</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Frais/Place</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Frais Service</th>
            </tr>
          </thead>
          <tbody>
            {data.items.bookings.map((b: any) => (
              <tr key={b.id}>
                <td style={{ padding: '2mm', textAlign: 'center', borderBottom: '1px solid #eee' }}>
                  {new Date(b.createdAt).toLocaleTimeString()}
                </td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>
                  {b.vehicleLicensePlate}
                </td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>
                  {b.destinationName}
                </td>
                <td style={{ padding: '2mm', textAlign: 'center', borderBottom: '1px solid #eee' }}>
                  {b.seatsBooked}
                </td>
                <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                  {formatTND(b.serviceFee)}
                </td>
                <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee', color: '#28a745', fontWeight: '600' }}>
                  {formatTND(b.serviceFeeAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ fontSize: '12pt', margin: 0, marginBottom: '2mm' }}>🎫 Pass Journaliers</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ textAlign: 'center', borderBottom: '1px solid #000', padding: '2mm' }}>Heure</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2mm' }}>Immatriculation</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '2mm' }}>Prix</th>
              <th style={{ textAlign: 'center', borderBottom: '1px solid #000', padding: '2mm' }}>Code</th>
            </tr>
          </thead>
          <tbody>
            {data.items.dayPasses.map((p: any) => (
              <tr key={p.id}>
                <td style={{ padding: '2mm', textAlign: 'center', borderBottom: '1px solid #eee' }}>
                  {new Date(p.purchaseDate).toLocaleTimeString()}
                </td>
                <td style={{ padding: '2mm', borderBottom: '1px solid #eee', fontWeight: '600' }}>
                  {p.licensePlate}
                </td>
                <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee', fontWeight: '600', color: '#17a2b8' }}>
                  {formatTND(p.price)}
                </td>
                <td style={{ padding: '2mm', textAlign: 'center', borderBottom: '1px solid #eee', fontFamily: 'monospace', fontSize: '8pt' }}>
                  {p.verificationCode || 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Footer with income summary */}
      <div style={{ marginTop: '15mm', padding: '4mm', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '10pt', color: '#666' }}>Rapport généré le {new Date().toLocaleString()}</div>
            <div style={{ fontSize: '9pt', color: '#999' }}>STE Dhraiff Services Transport - Système de Gestion</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14pt', fontWeight: '700', color: '#28a745' }}>
              Revenus Totaux: {formatTND(data.totals.totalIncome)}
            </div>
            <div style={{ fontSize: '9pt', color: '#666' }}>
              Frais de Service: {formatTND(data.totals.totalServiceFees)} | Pass Journaliers: {formatTND(data.totals.totalDayPasses)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}