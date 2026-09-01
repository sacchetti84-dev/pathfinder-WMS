import type { Giorno } from '../types/entita.js';

export type LivelloRitiro = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'ok' | 'none';

export interface AvvisoRitiro {
  level: LivelloRitiro;
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  /** Giorni che mancano al ritiro: negativi se è già passato, null se non c'è
      una data da cui contarli. */
  days: number | null;
  /** Chiave d'ordinamento: i più urgenti in cima, chi non ha data in fondo. */
  sortKey: number;
}

const pickupAlertStatus = (doc?: { expected_pickup_date?: Giorno } | null): AvvisoRitiro => {
  if (!doc?.expected_pickup_date) {
    return { level: 'none', label: 'Data ritiro non impostata', shortLabel: 'da definire', color: 'var(--sx-text-muted)', bg: 'var(--sx-card-alt)', days: null, sortKey: 99999 };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pickup = new Date(doc.expected_pickup_date + 'T00:00:00');
  if (isNaN(pickup.getTime())) {
    return { level: 'none', label: 'Data non valida', shortLabel: '!', color: 'var(--sx-text-muted)', bg: 'var(--sx-card-alt)', days: null, sortKey: 99999 };
  }
  const diff = Math.round((pickup.getTime() - today.getTime()) / 86400000);
  const fmtIT = pickup.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (diff < 0) {
    const ago = Math.abs(diff);
    return { level: 'overdue', label: `⚠️ SCADUTO da ${ago} ${ago === 1 ? 'giorno' : 'giorni'} (${fmtIT})`, shortLabel: `SCADUTO ${ago}g`, color: 'var(--sx-danger)', bg: 'var(--sx-danger-soft)', days: diff, sortKey: -1000 + diff };
  }
  if (diff === 0) return { level: 'today', label: `⚠️ RITIRO OGGI (${fmtIT})`, shortLabel: 'OGGI', color: 'var(--sx-danger)', bg: 'var(--sx-danger-soft)', days: 0, sortKey: 0 };
  if (diff === 1) return { level: 'tomorrow', label: `RITIRO DOMANI (${fmtIT})`, shortLabel: 'DOMANI', color: 'var(--sx-warning)', bg: 'var(--sx-warning-soft)', days: 1, sortKey: 1 };
  if (diff <= 3) return { level: 'soon', label: `Ritiro tra ${diff} giorni (${fmtIT})`, shortLabel: `${diff}g`, color: 'var(--sx-warning)', bg: 'var(--sx-warning-soft)', days: diff, sortKey: diff };
  return { level: 'ok', label: `Ritiro tra ${diff} giorni (${fmtIT})`, shortLabel: `${diff}g`, color: 'var(--sx-success)', bg: 'var(--sx-success-soft)', days: diff, sortKey: diff };
};

export { pickupAlertStatus };
