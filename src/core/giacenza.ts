/* LE LETTURE DELLA GIACENZA: QUALE LOTTO ESCE PRIMA, E DOV'È.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Terzo blocco della conversione di `store.js` (PIANO-1.4 §3). Come i due
   prima, è il codice che stava in `Store`, spostato e tipizzato: le 9 prove di
   `test/fefo.test.js` passano da `Store` e sono ciò che dimostra che la
   semantica non si è mossa.

   Qui non si scrive niente e non si decide niente: si LEGGE. Le regole di
   movimentazione — quanto è disponibile, cosa è impegnato su un DDT — restano
   in `Store`, perché parlano con `Persistence` e con i documenti aperti. */

import type { Giacenza } from '../types/entita.js';

/* ── FEFO ──────────────────────────────────────────────────────────────── */

/** First Expired, First Out: esce prima ciò che scade prima.
    Restituisce sempre una copia — l'elenco che arriva non si tocca, perché
    chi lo ha passato spesso è la cache. */
export function ordinaFEFO(items: readonly Giacenza[] | null | undefined): Giacenza[] {
  if (!items || items.length < 2) return items ? [...items] : [];
  const ordinati = [...items];
  ordinati.sort((a, b) => {
    const ea = (a.expiry_date || '').trim();
    const eb = (b.expiry_date || '').trim();
    /* Senza scadenza vanno in CODA, non in testa: un lotto di cui non
       conosciamo la scadenza non è un lotto che scade domani. Fra loro
       decide l'anzianità in magazzino, cioè FIFO. */
    if (!ea && !eb) return (a.placed_at || 0) - (b.placed_at || 0);
    if (!ea) return 1;
    if (!eb) return -1;
    /* Le date sono `AAAA-MM-GG`: il confronto fra stringhe è già quello fra
       date, e regge il cavallo d'anno senza costruire un Date per riga. */
    if (ea !== eb) return ea < eb ? -1 : 1;
    return (a.placed_at || 0) - (b.placed_at || 0);
  });
  return ordinati;
}

/** Il lotto che il sistema consiglia di prelevare per un articolo, o `null`
    se di quell'articolo non c'è niente a magazzino. */
export function primoFEFO(
  inventario: readonly Giacenza[], articleCode: string,
): Giacenza | null {
  const candidati = inventario.filter(i => i.article_code === articleCode);
  if (!candidati.length) return null;
  return ordinaFEFO(candidati)[0] ?? null;
}

/** Se questa riga è il candidato FEFO del suo articolo. Serve a evidenziarlo
    nelle schermate di prelievo: il consiglio si vede, non si impone.

    Il confronto ha due strade perché una riga può arrivare da due mondi: dalla
    cache, e allora ha il suo `_id`; oppure ricostruita da un documento, e
    allora l'`_id` non ce l'ha e a identificarla sono ubicazione e articolo/lotto. */
export function eFEFO(inventario: readonly Giacenza[], item: Giacenza | null | undefined): boolean {
  if (!item) return false;
  const fefo = primoFEFO(inventario, item.article_code);
  if (!fefo) return false;
  return fefo._id === item._id
    || (fefo.item_key === item.item_key && fefo.location_code === item.location_code);
}

/* ── Ricerca ───────────────────────────────────────────────────────────── */

/** Dove sta una merce. Cerca per pezzi di codice, lotto, descrizione,
    `item_key` o ubicazione — chi scrive nella casella non sa quale dei cinque
    sta digitando, e non deve saperlo.

    La scorciatoia sull'indice non è un'ottimizzazione qualunque: una scansione
    con il lettore produce un `item_key` esatto, che è il caso più frequente di
    tutti, e passarlo per la scansione di undicimila righe sarebbe assurdo. */
export function cercaGiacenze(
  inventario: readonly Giacenza[],
  invByKey: Map<string, Giacenza[]>,
  query: string | null | undefined,
): Giacenza[] {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  const esatta = invByKey.get(query.toUpperCase());
  if (esatta) return [...esatta];

  const out: Giacenza[] = [];
  for (const i of inventario) {
    if (i.article_code?.toLowerCase().includes(q)
      || i.lot_code?.toLowerCase().includes(q)
      || i.article_description?.toLowerCase().includes(q)
      || i.item_key?.toLowerCase().includes(q)
      || i.location_code?.toLowerCase().includes(q)) {
      out.push(i);
    }
  }
  return out;
}
