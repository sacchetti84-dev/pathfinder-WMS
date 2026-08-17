/* L'ANAGRAFICA DEI DESTINATARI, LA PARTE CHE NON TOCCA NIENTE — 1.6, PIANO §9.5.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   L'anagrafica NON si compila: si popola da sé, compilando i DDT. È la
   differenza che regge tutta la funzione — nessuno andrà mai a caricare
   duecento destinatari a mano, e un'anagrafica che nessuno compila è una
   maschera in più fra l'operatore e il documento.

   Da qui in poi tre domande, e stanno tutte qui perché sono regole e non
   dettagli di resa:
   - **è lo stesso destinatario?** → la partita IVA, D20;
   - **è la stessa destinazione?** → l'indirizzo normalizzato;
   - **cosa è cambiato?** → `differenze`, che è ciò che la maschera mostra
     prima di chiedere «permanente o spot».

   Nessuno stato, nessun accesso a Store, nessun DOM. Collaudato in
   `test/destinatari.test.js`. */

import type { Destinatario, Destinazione, Istante } from '../types/entita.js';

/* ── Le chiavi ──────────────────────────────────────────────────────── */

/** Solo cifre e lettere, maiuscole. `IT 012 345 678 90` e `IT01234567890`
    sono la stessa partita IVA, e nessuno le digita allo stesso modo. */
export function normalizzaPIva(v: unknown): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Il nome ridotto a ciò che lo distingue: forme societarie, punteggiatura
    e spazi doppi via. `Rossi S.r.l.` e `ROSSI SRL` collassano. */
export function normalizzaNome(v: unknown): string {
  return String(v ?? '')
    .toUpperCase()
    .replace(/[.,'’"()]/g, '')
    .replace(/\b(S R L|SRL|S P A|SPA|S N C|SNC|S A S|SAS|SS|SOCIETA|SOC)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** LA CHIAVE DI RICONOSCIMENTO — D20. La partita IVA quando c'è; il nome
    normalizzato quando non c'è, perché un DDT a un privato non ne ha una e
    lasciarlo senza chiave vorrebbe dire un record nuovo a ogni documento. */
export function chiaveDestinatario(d: Partial<Destinatario> | null | undefined): string {
  const p = normalizzaPIva(d?.vat) || normalizzaPIva(d?.fiscal_code);
  if (p) return `P:${p}`;
  const n = normalizzaNome(d?.name);
  return n ? `N:${n}` : '';
}

/* Le tre righe che fanno un indirizzo diverso da un altro. Il `label` NON
   entra: chiamare «Deposito» ciò che si chiamava «Magazzino» non crea una
   seconda destinazione allo stesso indirizzo. */
export function chiaveDestinazione(d: Partial<Destinazione> | null | undefined): string {
  const p = (v: unknown) => String(v ?? '').toUpperCase().replace(/[.,'’"()]/g, '').replace(/\s+/g, ' ').trim();
  return [p(d?.address), p(d?.zip), p(d?.city)].join('|');
}

export function stessaDestinazione(
  a: Partial<Destinazione> | null | undefined,
  b: Partial<Destinazione> | null | undefined,
): boolean {
  const ka = chiaveDestinazione(a);
  return ka !== '||' && ka === chiaveDestinazione(b);
}

/** Vuota = non c'è niente da salvare. Un indirizzo senza via né città non è
    una destinazione: è un campo lasciato in bianco. */
export function destinazioneVuota(d: Partial<Destinazione> | null | undefined): boolean {
  return chiaveDestinazione(d) === '||';
}

/* ── La ricerca ─────────────────────────────────────────────────────── */

export function trovaDestinatario(
  elenco: readonly Destinatario[] | null | undefined,
  dati: Partial<Destinatario>,
): Destinatario | null {
  const k = chiaveDestinatario(dati);
  if (!k) return null;
  return (elenco ?? []).find(r => chiaveDestinatario(r) === k) ?? null;
}

/** Per il campo che si digita: nome o partita IVA, a pezzi. */
export function cerca(
  elenco: readonly Destinatario[] | null | undefined,
  query: string,
  max = 8,
): Destinatario[] {
  const q = String(query ?? '').trim().toUpperCase();
  if (q.length < 2) return [];
  const qn = normalizzaNome(q);
  const qp = normalizzaPIva(q);
  return (elenco ?? []).filter(r =>
    (qn && normalizzaNome(r.name).includes(qn))
    || (qp.length >= 3 && normalizzaPIva(r.vat).includes(qp))
  ).slice(0, max);
}

/* ── Cosa è cambiato ────────────────────────────────────────────────── */

export interface Differenza { campo: string; etichetta: string; prima: string; dopo: string }

const ETICHETTE: Record<string, string> = {
  name: 'Ragione sociale', vat: 'Partita IVA', fiscal_code: 'Codice fiscale',
  address: 'Indirizzo', zip: 'CAP', city: 'Città', province: 'Provincia', country: 'Nazione',
};

/* LA RIGA CHE SI MOSTRA PRIMA DI CHIEDERE «PERMANENTE O SPOT».
   Senza di lei la domanda è cieca: chi la riceve non sa cosa sta per
   cambiare in anagrafica, e risponde a caso. Confronta il record con ciò
   che c'è scritto sul DDT, e i campi vuoti sul documento NON contano come
   cancellazioni — un campo non compilato è un campo non compilato. */
export function differenze(
  rcp: Destinatario | null | undefined,
  dati: Partial<Destinatario & Destinazione>,
  dest: Destinazione | null = null,
): Differenza[] {
  const out: Differenza[] = [];
  const cfr = (campo: string, prima: unknown, dopo: unknown) => {
    const a = String(prima ?? '').trim();
    const b = String(dopo ?? '').trim();
    if (!b || a === b) return;
    out.push({ campo, etichetta: ETICHETTE[campo] ?? campo, prima: a, dopo: b });
  };
  cfr('name', rcp?.name, dati.name);
  cfr('vat', rcp?.vat, dati.vat);
  cfr('fiscal_code', rcp?.fiscal_code, dati.fiscal_code);
  for (const c of ['address', 'zip', 'city', 'province', 'country'] as const) {
    cfr(c, dest?.[c], dati[c]);
  }
  return out;
}

/* ── La composizione ────────────────────────────────────────────────── */

export function componiDestinazione(
  dati: Partial<Destinazione>, dest_id: string, adesso: Istante = Date.now(),
): Destinazione {
  const d: Destinazione = { dest_id, created_at: adesso };
  for (const c of ['label', 'address', 'zip', 'city', 'province', 'country'] as const) {
    const v = String(dati[c] ?? '').trim();
    if (v) d[c] = v;
  }
  return d;
}

export function componiDestinatario(
  dati: Partial<Destinatario & Destinazione>, rcp_id: string, dest_id: string,
  adesso: Istante = Date.now(),
): Destinatario {
  const r: Destinatario = {
    rcp_id,
    name: String(dati.name ?? '').trim(),
    destinations: [],
    created_at: adesso,
    updated_at: adesso,
  };
  const vat = normalizzaPIva(dati.vat);
  if (vat) r.vat = vat;
  const cf = normalizzaPIva(dati.fiscal_code);
  if (cf) r.fiscal_code = cf;
  if (!destinazioneVuota(dati)) {
    r.destinations = [{ ...componiDestinazione(dati, dest_id, adesso), predefinita: true }];
  }
  return r;
}

/* UNA DESTINAZIONE DIVERSA SI AGGIUNGE, NON SOSTITUISCE. È la riga della
   nota: «un destinatario con destinazione diversa da quella salvata aggiunge
   una nuova destinazione selezionabile». Sovrascrivere avrebbe voluto dire
   che spedire una volta al deposito cancella la sede. */
export function conDestinazione(
  rcp: Destinatario, dati: Partial<Destinazione>, dest_id: string,
  adesso: Istante = Date.now(),
): { record: Destinatario; aggiunta: boolean; dest: Destinazione | null } {
  if (destinazioneVuota(dati)) return { record: rcp, aggiunta: false, dest: null };
  const esistente = (rcp.destinations ?? []).find(d => stessaDestinazione(d, dati));
  if (esistente) return { record: rcp, aggiunta: false, dest: esistente };
  const nuova = componiDestinazione(dati, dest_id, adesso);
  if (!(rcp.destinations ?? []).length) nuova.predefinita = true;
  return {
    record: { ...rcp, destinations: [...(rcp.destinations ?? []), nuova], updated_at: adesso },
    aggiunta: true,
    dest: nuova,
  };
}

/** La destinazione che il DDT propone: quella marcata, o la prima. */
export function destinazionePredefinita(rcp: Destinatario | null | undefined): Destinazione | null {
  const list = rcp?.destinations ?? [];
  return list.find(d => d.predefinita) ?? list[0] ?? null;
}

/** Come si legge su una riga sola. */
export function descriviDestinazione(d: Destinazione | null | undefined): string {
  if (!d) return '';
  const luogo = [d.zip, d.city, d.province ? `(${d.province})` : ''].filter(Boolean).join(' ');
  return [d.address, luogo].filter(Boolean).join(' — ');
}
