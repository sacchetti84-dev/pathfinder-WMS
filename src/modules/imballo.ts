/* COM'È FATTO UN BANCALE, PRIMA CHE UN BANCALE ESISTA — 2.20.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   La composizione del bancale non sta sull'articolo: sta in un MODELLO che
   più articoli condividono. In magazzino i formati veri sono una decina —
   EPAL a 8 × 5, mezzo bancale, il cassone — e gli articoli sono 11.197:
   scriverla articolo per articolo vorrebbe dire compilare undicimila volte
   la stessa riga, e nessuno la compilerebbe.

   IL MODELLO PROPONE, NON IMPONE. `colliAttesi` è il numero che la maschera
   scrive nel campo prima che l'operatore lo guardi; se il bancale reale ne
   porta 37 invece di 40, vince il bancale. Un modello che rifiutasse la
   dichiarazione fermerebbe chi ha la merce in mano per difendere un dato di
   configurazione.

   Nessuno stato, nessun accesso a Store, nessun DOM: entrano valori
   configurati, escono modelli convalidati. Collaudato in
   `test/imballo.test.js`. */

import { normalizzaCodice } from './parametri';

export interface ModelloImballo {
  /** La chiave, maiuscola come ogni codice di Pathfinder. */
  code: string;
  label: string;
  /** Su che cosa si impila: EPAL, mezzo bancale, cassone. Testo, perché è
      quello che la packing list stampa e non un enum da tenere allineato. */
  supporto?: string;
  colli_strato: number;
  strati: number;
  /** Il peso del supporto vuoto. Serve al lordo della packing list, e
      ASSENTE VUOL DIRE «non lo so»: senza, il lordo non si scrive. */
  tara_kg?: number;
  altezza_max_mm?: number;
}

/** Quanti colli ci stanno, secondo il modello. `null` quando il modello non
    lo sa dire: una proposta che non c'è si lascia in bianco, non si finge
    con uno zero. */
export function colliAttesi(m: Partial<ModelloImballo> | null | undefined): number | null {
  const s = Number(m?.colli_strato);
  const n = Number(m?.strati);
  if (!Number.isFinite(s) || !Number.isFinite(n) || s <= 0 || n <= 0) return null;
  return Math.floor(s) * Math.floor(n);
}

/** Netto più tara. `null` se manca il netto — un lordo senza netto è un
    numero inventato — e senza tara il lordo è il netto: il supporto pesa,
    ma quanto non lo sappiamo, e chi legge la packing list lo vede scritto. */
export function pesoLordo(
  netto: number | null | undefined,
  tara: number | null | undefined,
): number | null {
  /* `Number(null)` è zero, non «non so»: l'assenza si guarda prima di
     convertire, o un netto mancante diventerebbe un lordo pari alla tara. */
  if (netto == null || netto === ('' as unknown)) return null;
  const n = Number(netto);
  if (!Number.isFinite(n)) return null;
  const t = Number(tara);
  return Number.isFinite(t) && t > 0 ? n + t : n;
}

/** Che cosa non va nel modello, in chiaro. Elenco vuoto = va bene. */
export function validaModello(
  m: Partial<ModelloImballo> | null | undefined,
  altri: readonly ModelloImballo[] = [],
): string[] {
  const errori: string[] = [];
  const code = normalizzaCodice(m?.code);
  if (!code) errori.push('Il codice non può essere vuoto');
  else if (code.length > 24) errori.push(`Codice troppo lungo: ${code}`);
  if (!String(m?.label ?? '').trim()) errori.push(`Manca il nome di ${code || '—'}`);

  const intero = (v: unknown, nome: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) errori.push(`${nome}: serve un numero maggiore di zero`);
    else if (Math.floor(n) !== n) errori.push(`${nome}: è un conteggio, non ammette decimali`);
  };
  intero(m?.colli_strato, 'Colli per strato');
  intero(m?.strati, 'Strati');

  if (m?.tara_kg != null && m.tara_kg !== ('' as unknown)) {
    const t = Number(m.tara_kg);
    if (!Number.isFinite(t) || t < 0) errori.push('Tara: serve un peso in chili, o niente');
  }
  if (m?.altezza_max_mm != null && m.altezza_max_mm !== ('' as unknown)) {
    const h = Number(m.altezza_max_mm);
    if (!Number.isFinite(h) || h <= 0) errori.push('Altezza massima: serve una misura in mm, o niente');
  }

  if (code && altri.some(a => a !== m && normalizzaCodice(a?.code) === code)) {
    errori.push(`${code} esiste già`);
  }
  return errori;
}

/** I modelli letti da `meta`, ripuliti e senza doppioni. Un record salvato
    da una versione precedente non è mai della forma che ci si aspetta: qui
    si riporta alla forma, e quel che non sta in piedi esce senza rumore —
    chi configura lo vede mancare, chi imballa non trova una proposta rotta. */
export function leggiModelli(raw: unknown): ModelloImballo[] {
  if (!Array.isArray(raw)) return [];
  const out: ModelloImballo[] = [];
  const visti = new Set<string>();
  for (const r of raw) {
    const m = (r && typeof r === 'object') ? r as Partial<ModelloImballo> : null;
    const code = normalizzaCodice(m?.code);
    if (!code || visti.has(code)) continue;
    if (validaModello({ ...m, code }, []).length) continue;
    visti.add(code);
    const pulito: ModelloImballo = {
      code,
      label: String(m?.label ?? '').trim(),
      colli_strato: Math.floor(Number(m?.colli_strato)),
      strati: Math.floor(Number(m?.strati)),
    };
    const supporto = String(m?.supporto ?? '').trim();
    if (supporto) pulito.supporto = supporto;
    /* `undefined` e zero non sono la stessa assenza: una tara mai compilata
       è «non lo so», e diventerebbe «pesa zero» con un `?? 0`. */
    if (m?.tara_kg != null && Number.isFinite(Number(m.tara_kg))) pulito.tara_kg = Number(m.tara_kg);
    if (m?.altezza_max_mm != null && Number.isFinite(Number(m.altezza_max_mm))) {
      pulito.altezza_max_mm = Number(m.altezza_max_mm);
    }
    out.push(pulito);
  }
  return out;
}

export function trovaModello(
  elenco: readonly ModelloImballo[] | null | undefined,
  code: string | null | undefined,
): ModelloImballo | null {
  const c = normalizzaCodice(code);
  if (!c) return null;
  return (elenco || []).find(m => m.code === c) ?? null;
}

/** Come si legge in tendina e sulla packing list: «EPAL 8 × 5 = 40 colli». */
export function descriviModello(m: ModelloImballo | null | undefined): string {
  if (!m) return '';
  const attesi = colliAttesi(m);
  const conto = attesi === null ? '' : ` — ${m.colli_strato} × ${m.strati} = ${attesi} colli`;
  const supporto = m.supporto ? ` (${m.supporto})` : '';
  return `${m.label}${supporto}${conto}`;
}
