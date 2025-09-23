import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';

const A4: React.CSSProperties = { width: '210mm', minHeight: '297mm', padding: '15mm', margin: 'auto', background: 'white', color: 'black' };

export default function PrintAllStaffReport() {
  const [params] = useSearchParams();
  const date = params.get('date') || (() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toNumber = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(v || '0'); return Number.isFinite(n) ? n : 0; };
  const formatTND = (v: any) => `${toNumber(v).toFixed(3)} TND`;

  useEffect(() => {
    (async () => {
      try {
        const key = `allStaffReport:${date}`;
        const cached = sessionStorage.getItem(key);
        if (cached) setData(JSON.parse(cached));
        const res = await api.getAllStaffDailyReport(date);
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

  const staff = Array.isArray(data.staff) ? data.staff : [];
  const grandService = staff.reduce((s: number, r: any) => s + toNumber(r.totals?.serviceFees), 0);
  const grandPass = staff.reduce((s: number, r: any) => s + toNumber(r.totals?.dayPass), 0);
  const grandIncome = staff.reduce((s: number, r: any) => s + toNumber(r.totals?.income), 0);

  return (
    <div style={A4}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12mm' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6mm' }}>
          <img src="/ste_260.png" alt="STE" style={{ width: '28mm', height: '28mm', objectFit: 'contain' }} onLoad={() => setTimeout(() => window.print(), 200)} />
          <div>
            <div style={{ fontSize: '16pt', fontWeight: 700, margin: 0 }}>STE Dhraiff Services Transport</div>
            <div style={{ fontSize: '11pt', color: '#555' }}>Rapport journalier (Tout le personnel)</div>
            <div style={{ fontSize: '11pt', color: '#555' }}>{data.date}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10pt', color: '#555' }}>Frais de service: {formatTND(grandService)}</div>
          <div style={{ fontSize: '10pt', color: '#555' }}>Pass journaliers: {formatTND(grandPass)}</div>
          <div style={{ fontSize: '10pt', color: '#555' }}>Revenu total: {formatTND(grandIncome)}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: '2mm' }}>Personnel (CIN)</th>
            <th style={{ textAlign: 'right', borderBottom: '2px solid #000', padding: '2mm' }}>Frais de service</th>
            <th style={{ textAlign: 'right', borderBottom: '2px solid #000', padding: '2mm' }}>Pass journaliers</th>
            <th style={{ textAlign: 'right', borderBottom: '2px solid #000', padding: '2mm' }}>Revenu total</th>
          </tr>
        </thead>
        <tbody>
          {staff.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: '3mm', textAlign: 'center', color: '#777' }}>Aucune activité aujourd'hui</td></tr>
          ) : staff.map((r: any, idx: number) => (
            <tr key={idx}>
              <td style={{ padding: '2mm', borderBottom: '1px solid #eee' }}>{r.staff.firstName} {r.staff.lastName} ({r.staff.cin})</td>
              <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(r.totals?.serviceFees)}</td>
              <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(r.totals?.dayPass)}</td>
              <td style={{ padding: '2mm', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatTND(r.totals?.income)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 