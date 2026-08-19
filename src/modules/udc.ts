/* L'UNITÀ DI CARICO, E IL CODICE CHE PORTA ADDOSSO — 1.12.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Un'UDC è un contenitore che sta in un'ubicazione e porta la merce con sé:
   si sposta il pallet, e quello che c'è sopra si sposta con lui. La colonna
   `inventory.udc_id` esiste dalla 1.4 ed è sempre stata vuota.

   QUI STA SOLO IL CODICE, e il perché è la sua durata. Un'etichetta si stampa
   una volta e resta incollata al legno per mesi: se il modo di generarla
   dipendesse da Store, dal servizio o dallo schermo, non ci sarebbe modo di
   provarla se non stampandola. Il resto dell'UDC — nascere, riempirsi,
   svuotarsi, morire — tocca le giacenze e sta altrove.

   DUE FORME, UNA SCELTA SOLA, ED È UN PARAMETRO. Il prefisso GS1 vive in
   Configurazione: vuoto, i codici sono interni e valgono dentro l'azienda;
   compilato, sono SSCC veri, che un cliente legge con il suo lettore. Chi
   compila quel campo cambia forma alle etichette nuove — e a quelle sole:
   un'etichetta già stampata non si riscrive, e le due forme convivono.

   IL CODICE NON SI RIUSA MAI. Un'UDC che muore lascia il suo record come
   storia, e il numero che portava non torna: due pallet diversi con lo
   stesso codice sono due tracciabilità sovrapposte, ed è esattamente ciò
   che un'unità di carico esiste per evitare.

   Nessuno stato, nessun accesso a Store, nessun DOM. Collaudato da fermo in
   `test/udc.test.js`. */

/** Quante cifre ha un SSCC, cifra di controllo compresa. Non è una scelta:
    è lo standard GS1, e un lettore che ne conta diciassette non legge. */
export const CIFRE_SSCC = 18;

/** Il prefisso dei codici interni. Serve a distinguerli a occhio da un SSCC
    quando in magazzino convivono etichette delle due epoche. */
export const PREFISSO_INTERNO = 'UDC';

/** Quante cifre porta il seriale di un codice interno. Un milione di unità
    di carico è più di quante questo magazzino ne veda in vent'anni, e sei
    cifre stanno su un'etichetta senza rimpicciolire il font. */
export const CIFRE_INTERNE = 6;

/** La cifra di controllo GS1, modulo 10: si sommano le cifre da destra con
    peso 3 e 1 alternati, e la cifra è quanto manca alla decina.

    `null` se quel che arriva non sono diciassette cifre: un codice a cui si
    aggiunge una cifra di controllo calcolata su un dato sbagliato è peggio
    di un codice senza, perché sembra valido. */
export function cifraControllo(diciassette: string | null | undefined): number | null {
  const s = String(diciassette ?? '').trim();
  if (!/^\d{17}$/.test(s)) return null;
  let somma = 0;
  /* Da DESTRA: la prima cifra a destra pesa 3. Contare da sinistra darebbe
     lo stesso risultato solo per lunghezze dispari, e l'SSCC è pari. */
  for (let i = 0; i < s.length; i++) {
    const cifra = Number(s[s.length - 1 - i]);
    somma += cifra * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (somma % 10)) % 10;
}

/** Vero se un SSCC è scritto bene: diciotto cifre, e l'ultima è quella che
    le prime diciassette pretendono. */
export function ssccValido(codice: string | null | undefined): boolean {
  const s = String(codice ?? '').trim();
  if (!/^\d{18}$/.test(s)) return false;
  return cifraControllo(s.slice(0, 17)) === Number(s[17]);
}

/** Che cosa non va nel prefisso GS1, in chiaro. Elenco vuoto = va bene, e un
    prefisso VUOTO va bene: significa «codici interni», che è la scelta di
    partenza e non un dato mancante. */
export function validaPrefisso(prefisso: string | null | undefined): string[] {
  const p = String(prefisso ?? '').trim();
  if (!p) return [];
  const errori: string[] = [];
  if (!/^\d+$/.test(p)) errori.push('Il prefisso GS1 è fatto di sole cifre');
  /* Un prefisso aziendale GS1 sta fra 7 e 10 cifre, e con l'extension digit
     davanti deve restare spazio per almeno una cifra di seriale. */
  if (/^\d+$/.test(p) && (p.length < 7 || p.length > 10)) {
    errori.push('Il prefisso GS1 assegnato dal consorzio ha da 7 a 10 cifre');
  }
  return errori;
}

/** Un SSCC dal prefisso aziendale e da un numero di serie.

    La forma è: cifra di estensione, prefisso, seriale riempito di zeri fino
    a diciassette cifre, cifra di controllo. `null` quando il prefisso non
    sta in piedi o quando il seriale non ci sta più — a quel punto il numero
    successivo non si può scrivere, e inventarne uno più corto vorrebbe dire
    emettere un codice che un altro pallet ha già avuto. */
export function sscc(
  prefisso: string | null | undefined,
  seriale: number | string | null | undefined,
  estensione: number | string = 0,
): string | null {
  const p = String(prefisso ?? '').trim();
  if (!p || validaPrefisso(p).length) return null;
  const e = String(estensione ?? '0').trim();
  if (!/^\d$/.test(e)) return null;
  const n = String(seriale ?? '').trim();
  if (!/^\d+$/.test(n) || Number(n) < 0) return null;

  const spazio = 17 - e.length - p.length;
  if (spazio < 1 || n.length > spazio) return null;
  const corpo = e + p + n.padStart(spazio, '0');
  const c = cifraControllo(corpo);
  return c === null ? null : corpo + String(c);
}

/** Un codice interno: `UDC-000042`. Vale dentro l'azienda e basta, ed è
    quello che esce finché nessuno compila il prefisso in Configurazione. */
export function codiceInterno(seriale: number | string | null | undefined): string | null {
  const n = String(seriale ?? '').trim();
  if (!/^\d+$/.test(n)) return null;
  if (n.length > CIFRE_INTERNE) return null;
  return `${PREFISSO_INTERNO}-${n.padStart(CIFRE_INTERNE, '0')}`;
}

/** Il codice della prossima unità di carico, nella forma che la
    configurazione impone. È l'unica funzione che le maschere chiamano: la
    scelta fra le due forme non si ripete in ogni punto che crea un'UDC. */
export function nuovoCodice(
  prefissoGS1: string | null | undefined,
  seriale: number | string | null | undefined,
): string | null {
  const p = String(prefissoGS1 ?? '').trim();
  return p ? sscc(p, seriale) : codiceInterno(seriale);
}

/** Come si legge un codice già emesso, senza sapere da quale epoca arriva.
    Serve a chi lo scansiona: sul vetro il pallet è uno solo, e l'etichetta
    che porta può essere di prima o di dopo il prefisso. */
export function riconosci(codice: string | null | undefined):
  { forma: 'sscc' | 'interno' | 'ignoto'; valido: boolean } {
  const s = String(codice ?? '').trim().toUpperCase();
  if (/^\d{18}$/.test(s)) return { forma: 'sscc', valido: ssccValido(s) };
  if (new RegExp(`^${PREFISSO_INTERNO}-\\d{1,${CIFRE_INTERNE}}$`).test(s)) {
    return { forma: 'interno', valido: true };
  }
  return { forma: 'ignoto', valido: false };
}

/** Se un'unità di carico è vuota, cioè se deve morire. Lo svuotamento è
    automatico e la creazione no: un contenitore senza niente dentro che
    resta in elenco è la «lista che invecchia», e chi cerca un pallet libero
    ne troverebbe cento che non esistono più.

    Il record NON si cancella — questa funzione dice solo che è ora di
    chiuderlo: la storia di cosa c'è stato sopra resta, e il codice non si
    riusa. */
export function eVuota(righe: readonly { qty?: number | null }[] | null | undefined): boolean {
  if (!righe?.length) return true;
  return righe.every(r => !r || !Number(r.qty));
}

/** Il seriale successivo, dato il più alto già emesso. Parte da 1, e non
    riempie i buchi: un numero saltato è un'UDC che è nata e morta, e
    riassegnarlo è la sola cosa che questo modulo non deve mai fare. */
export function prossimoSeriale(ultimo: number | string | null | undefined): number {
  const n = Number(ultimo);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) + 1 : 1;
}
