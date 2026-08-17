/* UNITÀ DI MISURA E COLLI — 1.4.2, PIANO §4.2.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 1.4.1 una quantità era un numero di colli, e basta. Qui accanto
   ai colli compare ciò che c'è dentro: `qty` resta i colli, `qty_uom` sono le
   UM totali della riga.

   LA DECISIONE DI DISEGNO CHE TIENE IN PIEDI TUTTO: il collo incompleto NON
   è una riga sua. `inventory` ha l'indice composto `[location_code+item_key]`
   e tutto Store è scritto sopra l'idea che quella coppia identifichi UNA
   riga: due righe sulla stessa ubicazione per lo stesso articolo/lotto sono
   la strada più corta per un saldo sbagliato ma plausibile. Una riga sola —
   `qty: 11`, `qty_uom: 10100` — e il resto si calcola: 10.100 − 10 × 1.000.

   Nessuno stato, nessun accesso a Store, nessun DOM: entrano numeri, escono
   suddivisioni. Collaudato da fermo in `test/misure.test.js`. */

/* Il tipo sta in `types/entita.ts` insieme alle entità che lo portano, e da
   qui si ri-esporta: chi importa le tabelle importa anche il tipo, senza che
   nasca un anello fra i due file. */
import type { Istante, Lotto, UnitaMisura } from '../types/entita.js';
export type { UnitaMisura };

/* Le unità che contano oggetti non hanno decimali: mezzo pezzo non esiste, e
   ammetterlo vorrebbe dire ammettere un saldo che non si può prelevare.
   Quelle che misurano ne portano tre — sotto al grammo e al millimetro non
   si pesa in magazzino. */
export const DECIMALI_MAX = 3;

export const UNITA_MISURA: readonly {
  code: UnitaMisura; label: string; nota: string; decimali: number;
}[] = [
  { code: 'PZ', label: 'Pezzi', nota: 'quantità a numero', decimali: 0 },
  { code: 'MT', label: 'Metri', nota: 'metri lineari', decimali: DECIMALI_MAX },
  { code: 'LT', label: 'Litri', nota: 'volume', decimali: DECIMALI_MAX },
  { code: 'KG', label: 'Chilogrammi', nota: 'peso', decimali: DECIMALI_MAX },
  { code: 'GR', label: 'Grammi', nota: 'peso, a numero intero', decimali: 0 },
];

const PER_CODICE = new Map(UNITA_MISURA.map(u => [u.code as string, u]));

export function unitaValida(code: unknown): code is UnitaMisura {
  return typeof code === 'string' && PER_CODICE.has(code);
}

export function etichettaUnita(code: string | null | undefined): string {
  if (!code) return '';
  return PER_CODICE.get(code)?.label ?? code;
}

/** Quanti decimali porta l'unità. Un codice sconosciuto prende la precisione
    più larga: arrotondare in silenzio un dato che non si è capito è peggio. */
export function decimali(code: string | null | undefined): number {
  return PER_CODICE.get(String(code ?? ''))?.decimali ?? DECIMALI_MAX;
}

/** Cella → unità. `null` se vuota, `undefined` se c'è scritto qualcosa di
    sconosciuto: la lettura è stretta come quella degli allergeni, e per lo
    stesso motivo — i valori arrivano convalidati da Excel. */
export function leggiUnita(raw: unknown): UnitaMisura | null | undefined {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return null;
  return unitaValida(v) ? v : undefined;
}

/* ── L'aritmetica, e la deriva del virgola mobile ────────────────────── */

/* 0,1 + 0,2 = 0,30000000000000004, e in un magazzino quel numero è una
   giacenza che non si azzera mai. Ogni quantità in UM passa da qui prima di
   essere scritta o confrontata: la precisione la decide l'unità, non il
   caso. Il `1 + EPSILON` rimette in riga i mezzi che il doppio rappresenta
   appena sotto — 2,0005 × 1000 vale 2000,4999999999998. */
export function arrotonda(n: unknown, dec: number = DECIMALI_MAX): number | null {
  const v = Number(n);
  if (n === null || n === '' || !Number.isFinite(v)) return null;
  const f = 10 ** dec;
  const r = Math.round(v * f * (1 + Number.EPSILON)) / f;
  /* `10,5 − 3 × 3,5` vale −0, che è zero per l'aritmetica e un numero
     diverso per chiunque confronti. Un saldo azzerato si scrive `0`. */
  return r === 0 ? 0 : r;
}

/** Numero come arriva: da una maschera, da un foglio Excel, dal database.
    La virgola decimale italiana è un dato, non un errore di chi digita.
    Esportata perché `modules/colli.ts` legge le stesse celle: due letture
    della virgola sono due numeri diversi nella stessa maschera. */
export function leggiNumero(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const t = String(raw ?? '').trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function sommaUom(a: unknown, b: unknown, uom?: string | null): number {
  const dec = decimali(uom);
  return arrotonda((arrotonda(a, dec) ?? 0) + (arrotonda(b, dec) ?? 0), dec)!;
}

/* Un totale in UM che scende sotto zero è un saldo sbagliato, e un saldo
   sbagliato deve costare un errore in faccia a chi lo chiede — è la stessa
   ragione per cui esiste `_assertPositiveInt`. */
export function sottraiUom(a: unknown, b: unknown, uom?: string | null): number {
  const dec = decimali(uom);
  const r = arrotonda((arrotonda(a, dec) ?? 0) - (arrotonda(b, dec) ?? 0), dec)!;
  if (r < 0) throw new Error(`Quantità in ${etichettaUnita(uom) || 'UM'}: il saldo diventerebbe negativo (${r})`);
  return r;
}

/* ── La configurazione: dell'articolo, e poi del lotto ───────────────── */

export interface Configurazione {
  uom: UnitaMisura;
  /** Quante UM stanno in un collo pieno. `null` = configurazione da finire:
      l'unità c'è, ma nessuno ha ancora detto quanto ne entra. */
  per_collo: number | null;
}

/** L'unità e il per-collo di un articolo di anagrafica. `null` se l'articolo
    non ha unità: si comporta come nella 1.2, in tutto.

    DUE CAMPI CHE ESISTEVANO GIÀ, E CHE QUI SI FINISCONO INVECE DI DOPPIARE.

    La quantità per collo è `pieces_per_pack`, che esiste dalla v3.0.0 ed è
    già la UM-per-collo: è il campo che la maschera dell'anagrafica modifica
    e che la colonna `Pezzi_Per_Collo` dell'import riempie. Lo zero è
    l'assenza, perché è così che Store lo ha sempre scritto,
    `parseInt(...) || 0`.

    `uom_per_collo` — il nome che il piano §4.2 dà al campo — si legge solo
    quando l'altro manca, ed è l'inverso di come il piano lo scriveva. La
    ragione è che l'ordine opposto è una BUGIA A VIDEO: nessuna maschera e
    nessuna colonna Excel scrivono `uom_per_collo`, quindi un articolo che
    se lo porta dietro da un foglio si comporterebbe in un modo e ne
    mostrerebbe un altro nella maschera che si apre per correggerlo. Fatto
    così, chi importa vince sempre sull'ultimo che ha digitato — che è
    l'ordine giusto per un'anagrafica di duemila righe.

    `uom` assente legge `unit`, e questo il piano NON lo diceva: `unit` esiste
    dalla v1, è già etichettato «UM» nella maschera dell'anagrafica e nella
    colonna `UM` dell'export, e vale `PZ` di serie. Aggiungere una seconda
    colonna con lo stesso nome sarebbe la cosa che il piano vieta due righe
    più su per i pezzi. Il ripiego non apre nessuna porta da solo: `unit` è
    testo libero da sempre, e ciò che non è una delle cinque unità viene
    letto come «non gestita». Anche quando lo è — `PZ`, che è il valore
    predefinito di mezza anagrafica — non succede niente finché nessuno
    compila la quantità per collo, che è un gesto deliberato. */
export function configurazione(art: Record<string, any> | null | undefined): Configurazione | null {
  const propria = leggiUnita(art?.uom);
  /* Un `uom` scritto e non capito NON ripiega su `unit`: chi ha compilato
     quella cella intendeva qualcosa, e indovinare al posto suo è il modo di
     dare un'unità sbagliata a della merce. Il ripiego vale per la cella
     VUOTA, che è l'anagrafica di oggi. */
  if (propria === undefined) return null;
  const uom = propria ?? leggiUnita(art?.unit);
  if (!uom) return null;
  const proprio = leggiNumero(art?.pieces_per_pack);
  const ripiego = leggiNumero(art?.uom_per_collo);
  const per = (proprio && proprio > 0) ? proprio : ((ripiego && ripiego > 0) ? ripiego : null);
  return { uom, per_collo: per === null ? null : arrotonda(per, decimali(uom)) };
}

/** Vera quando c'è tutto ciò che serve a dividere: l'unità da sola dice cosa
    si conta, non quanto ne sta in un collo. */
export function gestitaAUM(cfg: Configurazione | null | undefined): boolean {
  return !!cfg && !!cfg.per_collo && cfg.per_collo > 0;
}

/** Gli errori in chiaro e tutti insieme, come `validaRichiesta`: chi compila
    una maschera vuole sapere cosa manca, non cosa manca per primo. */
export function validaConfigurazione(uomRaw: unknown, perColloRaw: unknown): string[] {
  const errori: string[] = [];
  const uom = leggiUnita(uomRaw);
  const per = leggiNumero(perColloRaw);
  if (uom === undefined) {
    errori.push(`Unità di misura non prevista: ${String(uomRaw).trim()} — le ammesse sono ${UNITA_MISURA.map(u => u.code).join(', ')}`);
    return errori;
  }
  if (!uom) {
    if (per && per > 0) errori.push('C\'è la quantità per collo ma manca l\'unità di misura: da sola non configura niente');
    return errori;
  }
  if (!per || per <= 0) {
    errori.push(`Unità ${uom}: manca la quantità per collo`);
  } else if (decimali(uom) === 0 && !Number.isInteger(per)) {
    errori.push(`Unità ${uom}: la quantità per collo è un numero intero (ricevuto ${per})`);
  }
  return errori;
}

/* LA CONFEZIONE È UN FATTO DEL LOTTO, NON DELLA RIGA DI GIACENZA.
   Si congela al primo posizionamento e sopravvive all'ultimo collo che esce:
   quello che rientra tre settimane dopo è confezionato come allora, anche se
   nel frattempo l'anagrafica è cambiata. */
export function congela(
  art: Record<string, any> | null | undefined,
  articleCode: string, lotCode: string, adesso: Istante = Date.now(),
): Lotto | null {
  const cfg = configurazione(art);
  if (!cfg) return null;
  return {
    article_code: String(articleCode ?? '').trim().toUpperCase(),
    lot_code: String(lotCode ?? '').trim(),
    uom: cfg.uom,
    uom_per_collo: cfg.per_collo,
    frozen_at: adesso,
  } as Lotto;
}

/** La configurazione come la porta il lotto. Vince su quella dell'articolo:
    è un fatto già successo, e i colli a scaffale sono fatti così. */
export function daLotto(lot: Partial<Lotto> | null | undefined): Configurazione | null {
  const uom = leggiUnita(lot?.uom);
  if (!uom) return null;
  const per = leggiNumero(lot?.uom_per_collo);
  return { uom, per_collo: (per && per > 0) ? arrotonda(per, decimali(uom)) : null };
}

/* ── La suddivisione ─────────────────────────────────────────────────── */

export interface Suddivisione {
  /** Quanti colli occupa quella quantità: i pieni, più uno se avanza. */
  colli: number;
  pieni: number;
  /** Le UM nel collo incompleto. Zero quando la divisione è tonda. */
  resto: number;
  incompleto: boolean;
}

/** 10.100 pz da 1.000 → 10 pieni + 1 da 100. `null` quando non c'è niente da
    dividere: senza per-collo, o su una quantità che non è una quantità. */
export function suddividi(
  qtyUom: unknown, perCollo: unknown, uom?: string | null,
): Suddivisione | null {
  const dec = decimali(uom);
  const tot = arrotonda(qtyUom, dec);
  const per = arrotonda(perCollo, dec);
  if (tot === null || per === null || per <= 0 || tot < 0) return null;
  /* La divisione si arrotonda PRIMA del troncamento: 0,3 / 0,1 vale
     2,9999999999999996, e un `floor` su quel numero perde un collo pieno. */
  const pieni = Math.floor(arrotonda(tot / per, 6)!);
  const resto = arrotonda(tot - pieni * per, dec)!;
  return { colli: pieni + (resto > 0 ? 1 : 0), pieni, resto, incompleto: resto > 0 };
}

/** N colli PIENI quante UM sono. È ciò che si scrive posizionando merce
    intera: il collo incompleto lo dichiara chi ce l'ha in mano. */
export function uomDaColli(colli: unknown, perCollo: unknown, uom?: string | null): number | null {
  const dec = decimali(uom);
  const n = arrotonda(colli, 0);
  const per = arrotonda(perCollo, dec);
  if (n === null || per === null || per <= 0 || n < 0) return null;
  return arrotonda(n * per, dec);
}

export interface Verifica {
  colliAttesi: number;
  /** Colli dichiarati meno colli attesi. Negativo = ne manca uno all'appello. */
  scarto: number;
  ok: boolean;
  incompleto: boolean;
  resto: number;
}

/** Il conto fra ciò che dice `qty` e ciò che dice `qty_uom`. `null` quando
    non c'è niente da confrontare — riga a soli colli, o lotto non
    configurato: una verifica che non può girare non accusa nessuno. */
export function verifica(
  qty: unknown, qtyUom: unknown, perCollo: unknown, uom?: string | null,
): Verifica | null {
  if (qtyUom === null || qtyUom === undefined || qtyUom === '') return null;
  const s = suddividi(qtyUom, perCollo, uom);
  if (!s) return null;
  const colli = arrotonda(qty, 0) ?? 0;
  return {
    colliAttesi: s.colli,
    scarto: colli - s.colli,
    ok: colli === s.colli,
    incompleto: s.incompleto,
    resto: s.resto,
  };
}

/* ── Come si legge ───────────────────────────────────────────────────── */

/** Il numero come lo scrive chi lo legge: migliaia separate, decimali fino
    alla precisione dell'unità e non oltre. */
export function formattaQuantita(n: unknown, uom?: string | null): string {
  const dec = decimali(uom);
  const v = arrotonda(n, dec);
  if (v === null) return '—';
  /* `useGrouping` esplicito perché l'italiano di CLDR NON separa le migliaia
     a quattro cifre: lasciato al predefinito, 1000 uscirebbe «1000» e 10100
     «10.100» — due regole diverse nella stessa riga. Un magazzino conta a
     colli da mille: il separatore c'è sempre. */
  return v.toLocaleString('it-IT', { maximumFractionDigits: dec, useGrouping: true });
}

/* «10 × 1.000 + 1 × 100 PZ» — la stessa riga a video, in etichetta e sul
   report. Sta qui e non nella UI perché tre formattazioni dello stesso
   numero, per chi legge, sono tre numeri diversi. */
export function descrivi(qtyUom: unknown, perCollo: unknown, uom?: string | null): string {
  const s = suddividi(qtyUom, perCollo, uom);
  if (!s || s.colli === 0) return '—';
  const pezzi: string[] = [];
  if (s.pieni > 0) pezzi.push(`${s.pieni} × ${formattaQuantita(perCollo, uom)}`);
  if (s.incompleto) pezzi.push(`1 × ${formattaQuantita(s.resto, uom)}`);
  const coda = unitaValida(uom) ? ` ${uom}` : '';
  return pezzi.join(' + ') + coda;
}

/* Il foglio «Valori ammessi» che accompagna l'export dell'anagrafica: è la
   sorgente da cui si costruisce la convalida in Excel, e sta in un posto
   solo — come per allergeni, temperature e certificazioni. */
export function valoriAmmessi(): { colonna: string; valore: string; significato: string }[] {
  return UNITA_MISURA.map(u => ({
    colonna: 'UM', valore: u.code, significato: `${u.label} — ${u.nota}`,
  }));
}
