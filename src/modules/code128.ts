/* IL CODICE A BARRE, DISEGNATO IN CASA — 2.1.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Un barcode in testata a ogni documento e sull'etichetta di ogni unità di
   carico serve a una cosa sola: che chi ha il foglio in mano lo rimetta
   dentro l'applicativo passandoci sopra il lettore, invece di digitare
   quattordici caratteri con i guanti.

   PERCHÉ NON UNA LIBRERIA. §6 dice «niente dipendenze nuove senza motivo
   forte», e qui il motivo forte non c'è: Code128 è una tabella di 107
   righe e tre righe di aritmetica, sta in questo file, si collauda da fermo
   e non si aggiorna mai più. Una dipendenza in più sarebbe un pacchetto da
   rinnovare per sempre in cambio di sessanta righe.

   SOLO IL SOTTOINSIEME B, E IL PERCHÉ È DICHIARATO. Il set B copre l'ASCII
   stampabile da 32 a 126 — cioè tutto quello che questo applicativo mette
   in un riferimento: `DDT-2026-0001`, `UDC-MSR…`, diciotto cifre di SSCC.
   Il set C dimezzerebbe la larghezza sulle cifre, e non è stato scritto
   perché il posto dove servirebbe davvero è un'altra cosa:

   QUESTO NON È UN GS1-128. Un SSCC letto da un cliente vuole il carattere
   FNC1 in testa e l'identificativo `(00)`, che qui non ci sono: il simbolo
   che esce di qua porta le cifre e basta, e un lettore restituisce quelle.
   Dentro l'azienda è esattamente ciò che serve — si scansiona e si ritrova
   il documento. Fuori, no: il giorno che le etichette devono uscire dal
   cancello, questo modulo va esteso, non aggirato.

   Nessuno stato, nessun DOM, nessun accesso a Store: entra una stringa,
   esce un `<svg>`. Collaudato in `test/code128.test.js`. */

/* Le 107 combinazioni di larghezze. Ogni voce sono sei cifre — barra,
   spazio, barra, spazio, barra, spazio — che sommano 11 moduli; l'ultima,
   lo STOP, ne ha sette e somma 13. È la tabella dello standard, e non si
   tocca: un modulo sbagliato è un'etichetta che non legge. */
const MODELLI = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
] as const;

const START_B = 104;
const STOP = 106;

/** Il primo carattere che il set B non sa scrivere, o `null` se sa scriverli
    tutti. Chi chiama decide se è un errore o se il barcode si salta: su un
    documento un simbolo mancante è meglio di un simbolo sbagliato. */
export function primoCarattereFuoriSet(testo: string): string | null {
  for (const ch of String(testo ?? '')) {
    const c = ch.codePointAt(0)!;
    if (c < 32 || c > 126) return ch;
  }
  return null;
}

/** I valori del simbolo, START e checksum compresi, STOP escluso.

    IL CHECKSUM È UNA SOMMA PESATA, e il peso parte da 1 sul primo
    carattere: lo START pesa 1 anche lui, non 0 — è l'errore che fa leggere
    tutto tranne l'ultima cifra, e non lo si vede finché non si prova con un
    lettore vero. */
export function valori(testo: string): number[] {
  const s = String(testo ?? '');
  const fuori = primoCarattereFuoriSet(s);
  if (fuori !== null) throw new Error(`Code128-B non scrive «${fuori}»: ammessi i caratteri ASCII da 32 a 126`);
  const dati = [...s].map(ch => ch.codePointAt(0)! - 32);
  let somma = START_B;
  dati.forEach((v, i) => { somma += v * (i + 1); });
  return [START_B, ...dati, somma % 103];
}

/** Le larghezze in moduli, una per striscia, partendo da una BARRA e
    alternando. Comprende la barra di chiusura dello STOP. */
export function strisce(testo: string): number[] {
  const out: number[] = [];
  for (const v of [...valori(testo), STOP]) {
    for (const cifra of MODELLI[v]!) out.push(Number(cifra));
  }
  return out;
}

export interface OpzioniSvg {
  /** Larghezza di un modulo. In stampa si ragiona in millimetri: 0,33 mm è
      la misura di serie dei lettori da magazzino su carta A4. */
  modulo?: number;
  /** Altezza delle barre, stessa unità del modulo. */
  altezza?: number;
  /** L'unità di misura del disegno: `mm` per la carta, `px` per lo schermo. */
  unita?: 'mm' | 'px' | '';
  /** La zona di rispetto ai lati. Lo standard ne vuole almeno dieci moduli:
      senza, un lettore comincia a leggere dentro il codice e non trova lo
      START. Si può stringere, non azzerare. */
  margine?: number;
  /** Il testo sotto le barre. Vuoto = nessuno. Serve a chi ha il foglio in
      mano quando il lettore non legge. */
  etichetta?: string;
  /** Finisce in `aria-label`: un barcode senza è un rettangolo nero. */
  descrizione?: string;
}

/** Il simbolo come `<svg>` autoportante — nessun font, nessuna immagine,
    nessuna richiesta verso l'esterno: entra nella stringa di una vista e si
    stampa con lei.

    LE BARRE SONO NERE E BASTA, e il fondo bianco è dichiarato: su un tema
    scuro un barcode che eredita i colori della pagina esce bianco su nero,
    e un lettore ottico non lo vede. La carta non ha un tema. */
export function svg(testo: string, opzioni: OpzioniSvg = {}): string {
  const modulo = opzioni.modulo ?? 0.33;
  const altezza = opzioni.altezza ?? 15;
  const unita = opzioni.unita ?? 'mm';
  const margineModuli = Math.max(0, opzioni.margine ?? 10);
  const etichetta = opzioni.etichetta ?? '';
  const alte = strisce(testo);

  const moduliTotali = alte.reduce((t, n) => t + n, 0);
  const margine = margineModuli * modulo;
  const larghezza = moduliTotali * modulo + margine * 2;
  const altoTesto = etichetta ? altezza * 0.28 : 0;
  const alto = altezza + altoTesto;

  let x = margine;
  let barre = '';
  alte.forEach((n, i) => {
    const w = n * modulo;
    if (i % 2 === 0) barre += `<rect x="${arrotonda(x)}" y="0" width="${arrotonda(w)}" height="${arrotonda(altezza)}" fill="#000"/>`;
    x += w;
  });

  const testoSotto = etichetta
    ? `<text x="${arrotonda(larghezza / 2)}" y="${arrotonda(alto - altoTesto * 0.15)}" text-anchor="middle"
         font-family="monospace" font-size="${arrotonda(altoTesto * 0.8)}" fill="#000">${esc(etichetta)}</text>`
    : '';

  return `<svg class="barcode" xmlns="http://www.w3.org/2000/svg" role="img"`
    + ` aria-label="${esc(opzioni.descrizione || `Codice a barre ${testo}`)}"`
    + ` width="${arrotonda(larghezza)}${unita}" height="${arrotonda(alto)}${unita}"`
    + ` viewBox="0 0 ${arrotonda(larghezza)} ${arrotonda(alto)}">`
    + `<rect x="0" y="0" width="${arrotonda(larghezza)}" height="${arrotonda(alto)}" fill="#fff"/>`
    + barre + testoSotto + '</svg>';
}

/* Tre decimali bastano a un millimetro e tengono corto l'SVG: una vista che
   ne stampa venti si porta dietro la differenza. */
function arrotonda(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function esc(v: string): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
