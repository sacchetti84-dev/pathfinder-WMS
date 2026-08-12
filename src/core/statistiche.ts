/* LO STATO DI UNA CELLA, E I NUMERI CHE NE ESCONO.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Quinto blocco della conversione di `store.js` (PIANO-1.4 §3), e l'ultimo
   che si possa staccare senza toccare `Persistence`: qui si LEGGE la cache e
   si contano gli stati. Ciò che resta in `Store` dopo questo sono le
   mutazioni, cioè le cose che scrivono.

   Nessuna memorizzazione: chi chiama lo chiede una volta per disegnata e se lo
   tiene. Con duemila celle, una chiamata per cella sarebbe duemila giri sulla
   stessa cache. */

import type { Cache, Indici } from './cache.js';
import type { Sito, Movimento } from '../types/entita.js';
import { generaUbicazioni } from './geometria.js';

export type StatoCella = 'disabled' | 'blocked' | 'reserved' | 'occupied' | 'empty' | string;

export interface Conteggi {
  total: number;
  occupied: number;
  blocked: number;
  reserved: number;
  disabled: number;
  empty: number;
}

/* L'ORDINE DI QUESTE TRE RIGHE È LA REGOLA.
   Uno stato ESPLICITO vince su «occupata»: una cella Riservata con merce
   dentro resta `reserved`, non diventa `occupied`. Senza questo, la deroga
   della cella riservata non scatterebbe mai — è la trappola 10 dell'HANDOFF,
   e si paga una volta sola. */
export function statoUbicazione(C: Cache, indici: Indici, code: string): StatoCella {
  if (C.disabled.has(code)) return 'disabled';
  const esplicito = C.locStatus.get(code);
  if (esplicito) return esplicito.status;
  return (indici.invByLoc.get(code)?.length ?? 0) > 0 ? 'occupied' : 'empty';
}

/** Quante celle per stato, su un elenco di codici. `empty` si calcola per
    differenza: è ciò che non è nient'altro, e così i cinque numeri sommano
    sempre a `total` anche se domani nascesse uno stato in più. */
export function contaStati(C: Cache, indici: Indici, codici: Iterable<string>): Conteggi {
  let total = 0, occupied = 0, blocked = 0, reserved = 0, disabled = 0;
  for (const code of codici) {
    total++;
    switch (statoUbicazione(C, indici, code)) {
      case 'occupied': occupied++; break;
      case 'blocked': blocked++; break;
      case 'reserved': reserved++; break;
      case 'disabled': disabled++; break;
    }
  }
  return {
    total, occupied, blocked, reserved, disabled,
    empty: total - occupied - blocked - reserved - disabled,
  };
}

/* ── Il cruscotto ──────────────────────────────────────────────────────── */

const GIORNO_MS = 86_400_000;
/* Due prelievi a meno di cinque minuti l'uno dall'altro sono lo stesso giro.
   Non è una misura del tempo di prelievo: è il modo di raggrupparli senza
   che l'ODP debba dirlo, e regge finché nessuno preleva due ordini insieme. */
const STESSO_GIRO_MS = 5 * 60 * 1000;

export interface KPI {
  totalLocs: number; occupiedLocs: number; emptyLocs: number;
  blockedLocs: number; reservedLocs: number; disabledLocs: number;
  occPct: number; totalItems: number; todayMov: number; todayPick: number;
  typeCounts: Record<string, number>;
  dailyTrend: { label: string; total: number; picks: number }[];
  hourlyDist: number[];
  zoneSummaries: Record<string, unknown>[];
  pickOrders: number; avgPickTimeOrder: number; avgPickTimeItem: number;
  accuracyPct: number; fixCount: number; totalMovements: number;
  topArticles: { code: string; count: number }[];
}

export function calcolaKPI(C: Cache, indici: Indici, adesso: number = Date.now()): KPI {
  const inizioOggi = new Date(adesso); inizioOggi.setHours(0, 0, 0, 0);
  const oggiTs = inizioOggi.getTime();
  const log: Movimento[] = C.movLog;

  let totalLocs = 0, occupiedLocs = 0, blockedLocs = 0, reservedLocs = 0, disabledLocs = 0, totalItems = 0;
  const zoneSummaries: Record<string, unknown>[] = [];

  for (const sito of C.sites as Sito[]) {
    if (!sito.active) continue;
    for (const zona of (sito.zones || []).filter(z => z.active)) {
      const locs = generaUbicazioni(sito.id, zona);
      let zOcc = 0, zItems = 0;
      for (const loc of locs) {
        totalLocs++;
        const items = indici.invByLoc.get(loc.code)?.length ?? 0;
        totalItems += items; zItems += items;
        switch (statoUbicazione(C, indici, loc.code)) {
          case 'occupied': occupiedLocs++; zOcc++; break;
          case 'blocked': blockedLocs++; break;
          case 'reserved': reservedLocs++; break;
          case 'disabled': disabledLocs++; break;
        }
      }
      zoneSummaries.push({
        siteId: sito.id, siteName: sito.name, zoneId: zona.id, zoneName: zona.name,
        type: zona.type, total: locs.length, occupied: zOcc, items: zItems,
      });
    }
  }

  const emptyLocs = totalLocs - occupiedLocs - blockedLocs - reservedLocs - disabledLocs;
  const occPct = totalLocs ? Math.round(occupiedLocs / totalLocs * 100) : 0;

  const typeCounts: Record<string, number> = {};
  let todayMov = 0, todayPick = 0;
  for (const m of log) {
    typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
    if (m.ts >= oggiTs) { todayMov++; if (m.type === 'PICK') todayPick++; }
  }

  const dailyTrend: { label: string; total: number; picks: number }[] = [];
  for (let d = 13; d >= 0; d--) {
    const dt = new Date(adesso); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - d);
    const start = dt.getTime(), end = start + GIORNO_MS;
    let count = 0, picks = 0;
    for (const m of log) {
      if (m.ts >= start && m.ts < end) { count++; if (m.type === 'PICK') picks++; }
    }
    dailyTrend.push({
      label: dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
      total: count, picks,
    });
  }

  const hourlyDist = new Array(24).fill(0);
  for (const m of log) if (m.ts >= oggiTs) hourlyDist[new Date(m.ts).getHours()]++;

  /* I prelievi si raggruppano per vicinanza nel tempo: da lì escono quanti
     giri sono stati fatti e quanto sono durati. Il minimo di 10 secondi
     evita che un giro di un movimento solo risulti istantaneo. */
  const prelievi = log.filter(m => m.type === 'PICK').sort((a, b) => a.ts - b.ts);
  const giri: Movimento[][] = [];
  let giro: Movimento[] = [];
  for (const p of prelievi) {
    if (!giro.length) { giro.push(p); continue; }
    if (p.ts - giro[giro.length - 1]!.ts < STESSO_GIRO_MS) giro.push(p);
    else { giri.push(giro); giro = [p]; }
  }
  if (giro.length) giri.push(giro);

  let avgPickTimeOrder = 0, avgPickTimeItem = 0;
  if (giri.length) {
    const durate = giri.map(o => Math.max((o[o.length - 1]!.ts - o[0]!.ts) / 1000, 10));
    const totale = durate.reduce((s, d) => s + d, 0);
    avgPickTimeOrder = Math.round(totale / durate.length);
    const quanti = giri.reduce((s, o) => s + o.length, 0);
    avgPickTimeItem = quanti ? Math.round(totale / quanti) : 0;
  }

  /* Accuratezza: quante correzioni su quante occasioni di sbagliare. Il
     denominatore sono le correzioni più i posizionamenti, non tutti i
     movimenti: uno spostamento non è un'occasione di contare male. */
  const fixCount = (typeCounts['FIX+'] || 0) + (typeCounts['FIX-'] || 0);
  const invChecks = fixCount + (typeCounts['IN'] || 0);
  const accuracyPct = invChecks > 0 ? Math.max(0, Math.round((1 - fixCount / invChecks) * 100)) : 100;

  const artFreq: Record<string, number> = {};
  for (const m of log) if (m.article_code) artFreq[m.article_code] = (artFreq[m.article_code] || 0) + 1;
  const topArticles = Object.entries(artFreq)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([code, count]) => ({ code, count }));

  return {
    totalLocs, occupiedLocs, emptyLocs, blockedLocs, reservedLocs, disabledLocs, occPct,
    totalItems, todayMov, todayPick,
    typeCounts, dailyTrend, hourlyDist, zoneSummaries,
    pickOrders: giri.length, avgPickTimeOrder, avgPickTimeItem,
    accuracyPct, fixCount, totalMovements: log.length, topArticles,
  };
}
