// ═══════════════════════════════════════════════════════════════════
// APP 
// ═══════════════════════════════════════════════════════════════════

/* v2.0.0+ — Helper alert "Data di Ritiro Prevista" per DDT pendenti.
   Calcola il livello di urgenza in base alla differenza tra oggi e la data
   di ritiro programmata. Restituisce un oggetto strutturato con label, colore
   CSS e sortKey (utilizzato per ordinare la lista DDT con i più urgenti in cima).
   Livelli:
     - 'overdue'  : data passata (rosso, critico)
     - 'today'    : ritiro oggi (rosso, urgentissimo)
     - 'tomorrow' : ritiro domani (arancio, urgente)
     - 'soon'     : 2-3 giorni (arancio chiaro, attenzione)
     - 'ok'       : >3 giorni (verde, regolare)
     - 'none'     : data non specificata (grigio, da definire) */
const pickupAlertStatus = (doc) => {
  if (!doc?.expected_pickup_date) {
    return { level: 'none', label: 'Data ritiro non impostata', shortLabel: 'da definire', color: 'var(--sx-text-muted)', bg: 'var(--sx-card-alt)', days: null, sortKey: 99999 };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pickup = new Date(doc.expected_pickup_date + 'T00:00:00');
  if (isNaN(pickup.getTime())) {
    return { level: 'none', label: 'Data non valida', shortLabel: '!', color: 'var(--sx-text-muted)', bg: 'var(--sx-card-alt)', days: null, sortKey: 99999 };
  }
  const diff = Math.round((pickup - today) / 86400000);
  const fmtIT = pickup.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (diff < 0) {
    const ago = Math.abs(diff);
    return { level: 'overdue', label: `⚠ SCADUTO da ${ago} ${ago === 1 ? 'giorno' : 'giorni'} (${fmtIT})`, shortLabel: `SCADUTO ${ago}g`, color: 'var(--sx-danger)', bg: 'var(--sx-danger-soft)', days: diff, sortKey: -1000 + diff };
  }
  if (diff === 0) return { level: 'today', label: `⚠ RITIRO OGGI (${fmtIT})`, shortLabel: 'OGGI', color: 'var(--sx-danger)', bg: 'var(--sx-danger-soft)', days: 0, sortKey: 0 };
  if (diff === 1) return { level: 'tomorrow', label: `RITIRO DOMANI (${fmtIT})`, shortLabel: 'DOMANI', color: 'var(--sx-warning)', bg: 'var(--sx-warning-soft)', days: 1, sortKey: 1 };
  if (diff <= 3) return { level: 'soon', label: `Ritiro tra ${diff} giorni (${fmtIT})`, shortLabel: `${diff}g`, color: 'var(--sx-warning)', bg: 'var(--sx-warning-soft)', days: diff, sortKey: diff };
  return { level: 'ok', label: `Ritiro tra ${diff} giorni (${fmtIT})`, shortLabel: `${diff}g`, color: 'var(--sx-success)', bg: 'var(--sx-success-soft)', days: diff, sortKey: diff };
};

export { pickupAlertStatus };
