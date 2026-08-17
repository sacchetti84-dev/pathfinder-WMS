/* I PARAMETRI DELL'ARTICOLO CHE SI CONFIGURANO — 1.6, PIANO §9.3.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 1.5 gli elenchi che l'anagrafica offre erano tutti nel sorgente:
   aggiungere una voce voleva dire un rilascio. Da qui in poi tre di essi
   sono un DATO — unità di misura, allergeni e classi di conservazione — e
   uno nasce già così: la pericolosità.

   LA REGOLA CHE TIENE INSIEME LE DUE COSE (D18): i valori di LEGGE non si
   toccano. I 14 allergeni dell'Allegato II del Reg. UE 1169/2011 e le tre
   classi della logistica del freddo restano dove sono, in `anagrafica.ts` e
   `misure.ts`, e da qui si può solo AGGIUNGERE accanto. Un elenco
   interamente modificabile avrebbe voluto dire che qualcuno, un giorno, può
   togliere «Latte e derivati» da una tendina — e nessuna comodità vale
   quella riga.

   Nessuno stato, nessun accesso a Store, nessun DOM: entrano i valori
   configurati, escono elenchi uniti e convalidati. Collaudato in
   `test/parametri.test.js`. */

export interface Voce {
  code: string;
  label: string;
  /** Vera sui valori di legge o di sistema: si vedono, non si tolgono. */
  fissa?: boolean;
}

/* ── La pericolosità ────────────────────────────────────────────────── */

/* NASCE CONFIGURABILE PER INTERO, e non è una svista: non è una norma di
   etichettatura come gli allergeni ma una classificazione di magazzino —
   dice dove una cosa non si può mettere, e quel «dove» cambia con le zone.
   Queste sei sono un punto di partenza, non un vincolo. */
export const PERICOLI_DI_SERIE: readonly Voce[] = [
  { code: 'INFIAMMABILE', label: 'Infiammabile' },
  { code: 'NOCIVO', label: 'Nocivo' },
  { code: 'CORROSIVO', label: 'Corrosivo' },
  { code: 'COMBURENTE', label: 'Comburente' },
  { code: 'TOSSICO', label: 'Tossico' },
  { code: 'IRRITANTE', label: 'Irritante' },
];

/* ── Gli allergeni aziendali, accanto ai 14 ─────────────────────────── */

/* IL LATTOSIO NON È IL LATTE. L'Allegato II dichiara «latte e derivati»
   perché l'allergene è la proteina; l'intolleranza al lattosio è un'altra
   cosa, e per il magazzino sono due segregazioni diverse. Per questo entra
   come voce aziendale e non come quindicesimo codice di legge.

   Il GLUTINE invece c'è già, ed è il codice `GLUTINE` — «cereali contenenti
   glutine». Chi cerca «glutine» in tendina lo trova: non serve aggiungerlo. */
export const ALLERGENI_AZIENDALI_DI_SERIE: readonly Voce[] = [
  { code: 'LATTOSIO', label: 'Lattosio' },
];

/* ── Igiene dei codici ──────────────────────────────────────────────── */

/** Maiuscolo, senza spazi ai bordi, spazi interni a `_`. Un codice è una
    chiave: due grafie della stessa parola sono due voci diverse in tendina. */
export function normalizzaCodice(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_+-]/g, '');
}

/** Vuoto = la riga si scarta. Chi configura vede l'errore, non il silenzio. */
export function validaVoce(v: Partial<Voce> | null | undefined): string[] {
  const errori: string[] = [];
  const code = normalizzaCodice(v?.code);
  if (!code) errori.push('Il codice non può essere vuoto');
  else if (code.length > 24) errori.push(`Codice troppo lungo: ${code}`);
  if (!String(v?.label ?? '').trim()) errori.push(`Manca l'etichetta di ${code || '—'}`);
  return errori;
}

/** Le voci configurate, ripulite e senza doppioni. Ciò che non passa la
    validazione esce, e chi chiama decide se dirlo o tacerlo. */
export function ripulisciVoci(raw: unknown): Voce[] {
  if (!Array.isArray(raw)) return [];
  const out: Voce[] = [];
  const visti = new Set<string>();
  for (const r of raw) {
    const code = normalizzaCodice((r as Voce)?.code);
    const label = String((r as Voce)?.label ?? '').trim();
    if (!code || !label || visti.has(code)) continue;
    visti.add(code);
    out.push({ code, label });
  }
  return out;
}

/* ── L'unione, che è il punto di tutto il modulo ────────────────────── */

/** I fissi PRIMI e marcati, poi gli aggiunti. Un codice aggiunto che
    ripete un fisso non lo sostituisce e non lo sdoppia: sparisce. Togliere
    una voce di legge riscrivendola è la strada che D18 chiude. */
export function unisci(fissi: readonly Voce[], aggiunti: readonly Voce[]): Voce[] {
  const out: Voce[] = fissi.map(v => ({ ...v, fissa: true }));
  const visti = new Set(out.map(v => v.code));
  for (const v of ripulisciVoci(aggiunti)) {
    if (visti.has(v.code)) continue;
    visti.add(v.code);
    out.push({ ...v, fissa: false });
  }
  return out;
}

/** Vera se il codice si può togliere dalla configurazione. */
export function rimovibile(elenco: readonly Voce[], code: string): boolean {
  const v = elenco.find(x => x.code === normalizzaCodice(code));
  return !!v && !v.fissa;
}

export function etichettaDi(elenco: readonly Voce[], code: string): string {
  return elenco.find(x => x.code === normalizzaCodice(code))?.label ?? String(code ?? '');
}

/* ── La forma che va in `meta` ──────────────────────────────────────── */

export interface ParametriArticolo {
  /** Unità di misura AGGIUNTE alle cinque di `misure.ts`. */
  unita: Voce[];
  /** Allergeni aziendali, accanto ai 14 di legge. */
  allergeni: Voce[];
  /** Classi di conservazione aggiunte alle tre della logistica del freddo. */
  conservazione: Voce[];
  /** La pericolosità, che è configurabile per intero. */
  pericoli: Voce[];
}

/** Ciò che un impianto nuovo si trova già dentro. */
export function parametriDiSerie(): ParametriArticolo {
  return {
    unita: [],
    allergeni: ALLERGENI_AZIENDALI_DI_SERIE.map(v => ({ ...v })),
    conservazione: [],
    pericoli: PERICOLI_DI_SERIE.map(v => ({ ...v })),
  };
}

/** Un record letto da `meta` non è mai della forma che ci si aspetta: è un
    dato, e i dati sopravvivono ai rilasci. Qui si riporta alla forma. */
export function leggiParametri(raw: unknown): ParametriArticolo {
  const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : null;
  if (!r) return parametriDiSerie();
  return {
    unita: ripulisciVoci(r.unita),
    allergeni: ripulisciVoci(r.allergeni),
    conservazione: ripulisciVoci(r.conservazione),
    pericoli: ripulisciVoci(r.pericoli),
  };
}
