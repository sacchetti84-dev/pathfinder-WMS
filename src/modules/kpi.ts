/* I NUMERI CHE SI POSSONO GIÀ CHIEDERE — 2.0.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 1.14 il cruscotto contava le ubicazioni: quante piene, quante
   vuote, quanti movimenti oggi. Sono i numeri del MAGAZZINO, e sono la metà
   di quelli che un magazzino produce. Le altre tre famiglie stanno già
   scritte a database e nessuno le somma:

   - **Gli articoli.** Quanto ne gira, quanto ne resta fermo, cosa scade fra
     poco, e quanta anagrafica manca sotto la merce che si sta muovendo.
   - **I movimenti.** Per causale, per zona, per ora, e quanto pesano — le UM
     ci sono su ogni movimento dalla 1.4.2, e nessuno le ha mai sommate.
   - **Le persone.** Ogni movimento porta la sigla di chi l'ha fatto: è la
     firma GMP, tenuta a sei anni. Le attività portano `started_at` e
     `completed_at`, cioè quanto un compito è rimasto in coda e quanto ci si
     è messi a farlo.

   NON SI INVENTA UN DATO CHE NON C'È. Ogni numero qui dentro esce da campi
   che il database porta già: nessuna migrazione, nessun campo nuovo, e
   niente che si possa calcolare solo da domani in avanti. Quello che oggi
   non è misurabile — la durata di un singolo movimento, per esempio, che
   nessuno cronometra — non compare, e sta scritto in fondo perché chi lo
   cerca sappia che è stato guardato.

   IL SILENZIO HA DUE SIGNIFICATI, anche qui. Un operatore senza movimenti in
   finestra non è un operatore lento: è uno che in quei giorni non c'era, o
   che fa un altro lavoro. Le righe a zero si contano a parte e non entrano
   nelle medie — la stessa regola dell'articolo senza attributi.

   Nessuno stato, nessun accesso a Store, nessun DOM: entrano elenchi,
   escono numeri. Collaudato da fermo in `test/kpi.test.js`. */

import type { Movimento, Compito, Giacenza, Articolo, Istante } from '../types/entita.js';

const GIORNO_MS = 86_400_000;

function arrotonda(n: number, dec = 3): number {
  const f = 10 ** dec;
  const r = Math.round(n * f * (1 + Number.EPSILON)) / f;
  return r === 0 ? 0 : r;
}

/** La finestra su cui si guarda. `da` incluso, `a` escluso: due finestre
    contigue non contano due volte lo stesso movimento. */
export interface Finestra { da: Istante; a: Istante }

/** L'ultima settimana, l'ultimo mese: le due che si chiedono davvero. */
export function ultimiGiorni(giorni: number, adesso: Istante = Date.now()): Finestra {
  const fine = new Date(adesso); fine.setHours(24, 0, 0, 0);
  return { da: fine.getTime() - giorni * GIORNO_MS, a: fine.getTime() };
}

function dentro(ts: unknown, f: Finestra | null): boolean {
  if (!f) return true;
  const t = Number(ts);
  return Number.isFinite(t) && t >= f.da && t < f.a;
}

/* ═══════════════════════════════════════════════════════════════════════
   LE PERSONE
   ═══════════════════════════════════════════════════════════════════════ */

export interface KpiOperatore {
  /** La sigla, che è come l'operatore firma ogni movimento. */
  sigla: string;
  movimenti: number;
  /** Per causale: `PICK`, `MOVE`, `FIX_OUT`… Chi fa solo rettifiche e chi
      solo prelievi fanno due lavori diversi, e la somma li confonde. */
  perCausale: Record<string, number>;
  /** I colli mossi, in valore assoluto: un'uscita da tre e un ingresso da
      tre sono sei colli maneggiati, non zero. */
  colli: number;
  /** Le UM mosse, per unità. Un magazzino che pesa in KG e conta in PZ non
      ha un totale unico, e sommarli scriverebbe un numero che non esiste. */
  uom: Record<string, number>;
  /** I giorni in cui ha mosso qualcosa: è il denominatore onesto di una
      media, molto più del numero di giorni della finestra. */
  giorniAttivi: number;
  /** Media dei movimenti nei soli giorni in cui ha lavorato. */
  movimentiAlGiorno: number;
  /** Le ventiquattro ore, per vedere se un turno è quello che si crede. */
  perOra: number[];
  primo: Istante | null;
  ultimo: Istante | null;
  /* Le attività: quante ne ha prese, quante chiuse, quante annullate, e i
     due tempi che lo schedulatore già scrive. */
  compitiPresi: number;
  compitiChiusi: number;
  compitiAnnullati: number;
  /** Minuti fra la presa in carico e la chiusura, mediana. La mediana e non
      la media: un compito lasciato aperto per il fine settimana sposterebbe
      una media di ore e non dice niente su come si lavora. */
  minutiEsecuzione: number | null;
  /** Minuti fra la richiesta e la presa in carico: è l'attesa della coda, e
      non è un numero della persona ma del carico di lavoro. */
  minutiAttesa: number | null;
}

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : arrotonda((s[m - 1]! + s[m]!) / 2, 1);
}

/** I numeri di ogni persona che ha firmato qualcosa nella finestra.

    Esce ordinato per movimenti, dal più attivo: è l'ordine in cui si legge
    una tabella di produttività, e l'unico che non chiede di riordinare a
    mano. Chi non ha mosso niente NON compare — vedi il commento in testa al
    file: uno zero qui vorrebbe dire «ha lavorato male», e non è quello che
    il dato dice. */
export function perPersona(
  movimenti: readonly Movimento[] | null | undefined,
  compiti: readonly Compito[] | null | undefined,
  finestra: Finestra | null = null,
): KpiOperatore[] {
  const per = new Map<string, KpiOperatore>();
  const giorni = new Map<string, Set<number>>();
  const esecuzione = new Map<string, number[]>();
  const attesa = new Map<string, number[]>();

  const riga = (sigla: string) => {
    let r = per.get(sigla);
    if (!r) {
      r = {
        sigla, movimenti: 0, perCausale: {}, colli: 0, uom: {},
        giorniAttivi: 0, movimentiAlGiorno: 0, perOra: new Array(24).fill(0),
        primo: null, ultimo: null,
        compitiPresi: 0, compitiChiusi: 0, compitiAnnullati: 0,
        minutiEsecuzione: null, minutiAttesa: null,
      };
      per.set(sigla, r);
      giorni.set(sigla, new Set());
    }
    return r;
  };

  for (const m of movimenti ?? []) {
    const sigla = String(m?.user ?? '').trim().toUpperCase();
    if (!sigla || !dentro(m.ts, finestra)) continue;
    const r = riga(sigla);
    r.movimenti++;
    r.perCausale[m.type] = (r.perCausale[m.type] || 0) + 1;
    if (typeof m.qty_delta === 'number') r.colli += Math.abs(m.qty_delta);
    if (typeof m.qty_uom_delta === 'number' && m.uom) {
      r.uom[m.uom] = arrotonda((r.uom[m.uom] || 0) + Math.abs(m.qty_uom_delta));
    }
    const d = new Date(m.ts);
    r.perOra[d.getHours()]!++;
    giorni.get(sigla)!.add(Math.floor(m.ts / GIORNO_MS));
    if (r.primo === null || m.ts < r.primo) r.primo = m.ts;
    if (r.ultimo === null || m.ts > r.ultimo) r.ultimo = m.ts;
  }

  for (const t of compiti ?? []) {
    /* Un compito lo prende chi se lo assegna e lo chiude chi lo conferma, e
       non sono sempre la stessa persona: si contano su due sigle diverse. */
    const preso = String(t?.assigned_to ?? '').trim().toUpperCase();
    const chiuso = String(t?.completed_by ?? '').trim().toUpperCase();
    const quando = t?.completed_at ?? t?.started_at ?? t?.requested_at;
    if (!dentro(quando, finestra)) continue;

    if (preso) riga(preso).compitiPresi++;
    if (chiuso) {
      const r = riga(chiuso);
      if (t.status === 'cancelled') r.compitiAnnullati++; else r.compitiChiusi++;
    }
    if (preso && t.started_at && t.completed_at && t.completed_at > t.started_at) {
      if (!esecuzione.has(preso)) esecuzione.set(preso, []);
      esecuzione.get(preso)!.push((t.completed_at - t.started_at) / 60000);
    }
    if (preso && t.requested_at && t.started_at && t.started_at > t.requested_at) {
      if (!attesa.has(preso)) attesa.set(preso, []);
      attesa.get(preso)!.push((t.started_at - t.requested_at) / 60000);
    }
  }

  for (const [sigla, r] of per) {
    r.giorniAttivi = giorni.get(sigla)?.size ?? 0;
    r.movimentiAlGiorno = r.giorniAttivi ? arrotonda(r.movimenti / r.giorniAttivi, 1) : 0;
    const e = mediana(esecuzione.get(sigla) ?? []);
    const a = mediana(attesa.get(sigla) ?? []);
    r.minutiEsecuzione = e === null ? null : arrotonda(e, 1);
    r.minutiAttesa = a === null ? null : arrotonda(a, 1);
  }

  return [...per.values()].sort((a, b) => b.movimenti - a.movimenti || a.sigla.localeCompare(b.sigla));
}

/* ═══════════════════════════════════════════════════════════════════════
   I MOVIMENTI
   ═══════════════════════════════════════════════════════════════════════ */

export interface KpiMovimenti {
  totale: number;
  perCausale: Record<string, number>;
  /** Il sito si legge dal codice dell'ubicazione, che comincia col suo id:
      `MAG1-RAKA-01-01-T` è di MAG1. È l'unico legame che un movimento porta
      con sé — la zona di allora può non essere quella di adesso. */
  perSito: Record<string, number>;
  perOra: number[];
  perGiorno: { giorno: string; movimenti: number }[];
  /** Colli e UM mossi, in valore assoluto. Le UM restano separate per unità. */
  colli: number;
  uom: Record<string, number>;
  /** Le rettifiche sul totale: è l'indice di quanto il sistema e lo scaffale
      si assomigliano. Cresce quando qualcuno conta, non quando sbaglia. */
  rettifiche: number;
  rettifichePct: number;
  /** Quanti movimenti NON portano una sigla. Dovrebbero essere zero: la
      firma è un requisito GMP, e un buco qui è un buco in un registro che si
      tiene sei anni. */
  senzaFirma: number;
  /** Quanti non portano le quantità: sono i movimenti storici, scritti
      prima che i tre campi esistessero. Il numero cala da solo. */
  senzaQuantita: number;
}

export function perMovimento(
  movimenti: readonly Movimento[] | null | undefined,
  finestra: Finestra | null = null,
): KpiMovimenti {
  const out: KpiMovimenti = {
    totale: 0, perCausale: {}, perSito: {}, perOra: new Array(24).fill(0), perGiorno: [],
    colli: 0, uom: {}, rettifiche: 0, rettifichePct: 0, senzaFirma: 0, senzaQuantita: 0,
  };
  const perGiorno = new Map<string, number>();

  for (const m of movimenti ?? []) {
    if (!m || !dentro(m.ts, finestra)) continue;
    out.totale++;
    out.perCausale[m.type] = (out.perCausale[m.type] || 0) + 1;
    if (String(m.type).startsWith('FIX')) out.rettifiche++;
    if (!String(m.user ?? '').trim()) out.senzaFirma++;
    if (typeof m.qty_delta !== 'number') out.senzaQuantita++;
    else out.colli += Math.abs(m.qty_delta);
    if (typeof m.qty_uom_delta === 'number' && m.uom) {
      out.uom[m.uom] = arrotonda((out.uom[m.uom] || 0) + Math.abs(m.qty_uom_delta));
    }
    const sito = String(m.location_code ?? '').split('-')[0] || '—';
    out.perSito[sito] = (out.perSito[sito] || 0) + 1;
    const d = new Date(m.ts);
    out.perOra[d.getHours()]!++;
    const g = d.toISOString().slice(0, 10);
    perGiorno.set(g, (perGiorno.get(g) || 0) + 1);
  }

  out.rettifichePct = out.totale ? arrotonda(out.rettifiche / out.totale * 100, 1) : 0;
  out.perGiorno = [...perGiorno.entries()].sort().map(([giorno, movimenti]) => ({ giorno, movimenti }));
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
   GLI ARTICOLI
   ═══════════════════════════════════════════════════════════════════════ */

export interface KpiArticolo {
  article_code: string;
  /** Quante righe di giacenza porta, su quante ubicazioni. */
  righe: number;
  ubicazioni: number;
  colli: number;
  /** Le UM, quando la riga le ha. `null` su un articolo a soli colli. */
  uom: number | null;
  unita: string | null;
  /** I movimenti della finestra: è la rotazione, cioè quante volte qualcuno
      è andato a toccare questa merce. */
  movimenti: number;
  uscite: number;
  /** Giorni da quando la riga più recente si è mossa. È il numero che dice
      «questo sta lì da marzo», e nessun altro lo dice. */
  giorniFermo: number | null;
  /** Il lotto che scade prima, e fra quanti giorni. Negativo = è scaduto. */
  primaScadenza: string | null;
  giorniAScadenza: number | null;
}

export interface KpiArticoli {
  articoli: KpiArticolo[];
  /** Quanti articoli a giacenza non portano l'unità, la quantità per collo,
      gli allergeni, la classe di conservazione. Non è un errore: è quanta
      anagrafica manca sotto la merce che si sta già muovendo, ed è la sola
      misura di quanto il resto dei numeri sia affidabile. */
  copertura: { conGiacenza: number; senzaUnita: number; senzaPerCollo: number; senzaAllergeni: number; senzaConservazione: number };
  /** Le righe che nessuno tocca da più di `giorniFermi` giorni. */
  ferme: number;
  /** Le righe scadute e quelle che scadono entro `giorniScadenza`. */
  scadute: number;
  inScadenza: number;
}

export function perArticolo(
  giacenze: readonly Giacenza[] | null | undefined,
  movimenti: readonly Movimento[] | null | undefined,
  anagrafica: readonly Articolo[] | null | undefined,
  opzioni: { finestra?: Finestra | null; adesso?: Istante; giorniFermi?: number; giorniScadenza?: number } = {},
): KpiArticoli {
  const adesso = opzioni.adesso ?? Date.now();
  const finestra = opzioni.finestra ?? null;
  const giorniFermi = opzioni.giorniFermi ?? 90;
  const giorniScadenza = opzioni.giorniScadenza ?? 30;

  const mov = new Map<string, { tot: number; out: number }>();
  for (const m of movimenti ?? []) {
    const code = String(m?.article_code ?? '').trim().toUpperCase();
    if (!code || !dentro(m.ts, finestra)) continue;
    const r = mov.get(code) ?? { tot: 0, out: 0 };
    r.tot++;
    if (typeof m.qty_delta === 'number' && m.qty_delta < 0) r.out++;
    mov.set(code, r);
  }

  const art = new Map<string, Articolo>();
  for (const a of anagrafica ?? []) art.set(String(a.code ?? '').trim().toUpperCase(), a);

  const per = new Map<string, KpiArticolo & { _ubicazioni: Set<string>; _ultimo: Istante }>();
  let ferme = 0, scadute = 0, inScadenza = 0;

  for (const g of giacenze ?? []) {
    const code = String(g?.article_code ?? '').trim().toUpperCase();
    if (!code) continue;
    let r = per.get(code);
    if (!r) {
      r = {
        article_code: code, righe: 0, ubicazioni: 0, colli: 0, uom: null, unita: null,
        movimenti: 0, uscite: 0, giorniFermo: null, primaScadenza: null, giorniAScadenza: null,
        _ubicazioni: new Set(), _ultimo: 0,
      };
      per.set(code, r);
    }
    r.righe++;
    r._ubicazioni.add(g.location_code);
    r.colli += Number(g.qty) || 0;
    if (typeof g.qty_uom === 'number') r.uom = arrotonda((r.uom ?? 0) + g.qty_uom);
    if (!r.unita) r.unita = art.get(code)?.unit ?? null;

    const tocco = Number(g.last_updated_at || g.placed_at || 0);
    if (tocco > r._ultimo) r._ultimo = tocco;
    if (tocco && (adesso - tocco) / GIORNO_MS > giorniFermi) ferme++;

    const scad = String(g.expiry_date ?? '').trim();
    if (scad) {
      const t = Date.parse(scad);
      if (Number.isFinite(t)) {
        const gg = Math.floor((t - adesso) / GIORNO_MS);
        if (gg < 0) scadute++; else if (gg <= giorniScadenza) inScadenza++;
        if (r.giorniAScadenza === null || gg < r.giorniAScadenza) {
          r.giorniAScadenza = gg;
          r.primaScadenza = scad;
        }
      }
    }
  }

  const articoli: KpiArticolo[] = [];
  for (const r of per.values()) {
    const m = mov.get(r.article_code);
    r.ubicazioni = r._ubicazioni.size;
    r.movimenti = m?.tot ?? 0;
    r.uscite = m?.out ?? 0;
    r.giorniFermo = r._ultimo ? Math.floor((adesso - r._ultimo) / GIORNO_MS) : null;
    const { _ubicazioni, _ultimo, ...pulito } = r;
    articoli.push(pulito);
  }
  articoli.sort((a, b) => b.movimenti - a.movimenti || a.article_code.localeCompare(b.article_code));

  const copertura = { conGiacenza: per.size, senzaUnita: 0, senzaPerCollo: 0, senzaAllergeni: 0, senzaConservazione: 0 };
  for (const code of per.keys()) {
    const a = art.get(code);
    if (!a?.unit) copertura.senzaUnita++;
    if (!a?.pieces_per_pack) copertura.senzaPerCollo++;
    if (!a?.allergens?.length) copertura.senzaAllergeni++;
    if (!a?.temp_class) copertura.senzaConservazione++;
  }

  return { articoli, copertura, ferme, scadute, inScadenza };
}

/* ═══════════════════════════════════════════════════════════════════════
   QUELLO CHE OGGI NON SI PUÒ MISURARE

   Sta scritto qui e non in un documento perché chi cerca un numero che non
   trova deve capire in dieci secondi se manca la funzione o manca il dato.
   Ognuna di queste righe è un campo che non esiste, non un calcolo che non
   è stato fatto.
   ═══════════════════════════════════════════════════════════════════════ */

export const NON_MISURABILE = [
  { cosa: 'Durata di un singolo movimento',
    perche: 'un movimento porta un istante solo, `ts`. Servirebbe l\'istante in cui la maschera si è aperta, e nessuno lo scrive.',
    servirebbe: 'un `started_at` sul movimento' },
  { cosa: 'Colli all\'ora per operatore',
    perche: 'si può stimare dall\'intervallo fra il primo e l\'ultimo movimento di un giorno, ma quell\'intervallo comprende le pause e il lavoro che non passa da qui.',
    servirebbe: 'un turno dichiarato, o la durata del movimento' },
  { cosa: 'Distanza percorsa',
    perche: 'la geometria dà l\'ordine delle ubicazioni, non i metri fra due vani.',
    servirebbe: 'le coordinate della zona, che oggi non sono un dato' },
  { cosa: 'Saturazione di un vano',
    perche: 'la capienza non è dichiarata da nessuna parte — il motore di stoccaggio ha il vincolo e non lo usa mai.',
    servirebbe: '`capacity` sulla zona (§2, voce 17)' },
  { cosa: 'Costo di una riga di giacenza',
    perche: 'nessun valore economico entra in Pathfinder, ed è deliberato: il valore sta in Sage.',
    servirebbe: 'niente — si chiede a Sage' },
] as const;
