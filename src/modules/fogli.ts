/* LE FORME DI UN FOGLIO EXCEL — 2.0.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Un foglio è una matrice di celle, e chi lo compone deve rispondere a due
   domande che non riguardano SheetJS: quante righe fa una giacenza, e che
   numero scrive un riepilogo che ha visto unità diverse.

   Stanno qui e non nella vista perché la vista non ha prove: `configDati.ts`
   si importa solo passando da `App`, e le funzioni pure non devono farlo.
   Nessuno stato, nessun accesso a Store, nessun DOM. */

import { arrotonda, decimali } from './misure';

/** Quel che si può mettere in una cella. */
export type Cella = string | number | null | undefined;
export type Foglio = Cella[][];

/* LE UM SI SOMMANO SOLO DENTRO LA STESSA UNITÀ.
   Un riepilogo che mette insieme 300 KG e 40 PZ scrive 340 di niente. Chi
   accumula tiene da parte le unità che ha visto: una sola e il totale vale,
   più d'una e la riga dichiara MISTA e lascia il totale vuoto — che è
   un'assenza, non uno zero. */
export type SommaUom = { tot: number; unita: Set<string> };

export function nuovaSomma(): SommaUom { return { tot: 0, unita: new Set() }; }

export function accumula(s: SommaUom, uom: string, quanto: number | null): void {
  if (!uom || quanto === null) return;
  s.unita.add(uom);
  s.tot += quanto;
}

/** Le due celle da stendere: il totale e la sua unità. */
export function celleUom(s: SommaUom): [Cella, Cella] {
  const unita = [...s.unita];
  if (!unita.length) return ['', ''];
  if (unita.length > 1) return ['', 'MISTA'];
  return [arrotonda(s.tot, decimali(unita[0])), unita[0]!];
}

/** IL LIMITE DI UN FOGLIO EXCEL: 1.048.576 righe, meno quella dei titoli.

    Non e' un'opinione su quanto possa essere grande un bancale — quelle non
    si scrivono in un foglio di calcolo — e' il muro dentro cui il file deve
    stare per esistere. Oltre, non c'e' un export piu' grande: non c'e'
    export. */
export const RIGHE_MAX_FOGLIO = 1_048_575;

/** Le misure da stendere per una riga di giacenza: una per collo. Senza
    elenco — articolo mai configurato a UM — restano i colli e basta, e sono
    celle vuote: il foglio conta le righe, e delle UM non dice niente invece
    di dire zero.

    LE RIGHE SI STENDONO PER COLLO, NON PER PEZZO. Un semilavorato da tre
    milioni di pezzi in dieci colli fa dieci righe: i pezzi stanno in
    `qty_uom` e occupano UNA cella. Qui non c'e' nessun tetto sulla merce.

    `null` QUANDO QUELLA RIGA DA SOLA NON STA IN UN FOGLIO, e chi chiama ne
    scrive una che lo dice.

    Dalla 2.0 il foglio da' UNA RIGA PER COLLO, e da quel giorno un `qty`
    sbagliato ha smesso di essere una cella storta ed e' diventato
    un'allocazione: `new Array(qty)` senza un tetto. Il 20/08 una giacenza
    portava come quantita' il proprio codice articolo — 3.501.794 — e
    l'export dell'intero magazzino moriva con «too many properties to
    enumerate», che e' il modo di V8 di dire che un oggetto ha piu' chiavi di
    quante se ne possano elencare: SheetJS tiene un foglio come un oggetto
    con una chiave per cella.

    Quel messaggio non nomina la riga, non nomina il numero e non dice che il
    problema sta nei dati: un magazzino intero non si esportava piu', e chi
    guardava non aveva da dove cominciare. */
export function colliDaStendere(
  colli: number[] | null | undefined, qty: number | null | undefined,
  restanti: number = RIGHE_MAX_FOGLIO,
): (number | null)[] | null {
  if (colli) return colli.length > restanti ? null : colli;
  const quanti = Math.max(1, Math.round(qty || 0));
  return quanti > restanti ? null : new Array(quanti).fill(null);
}

/** QUANTE RIGHE FA UNA GIACENZA, PRIMA DI STENDERLA.

    Serve a sapere se il foglio ci sta, e la risposta si vuole senza aver
    gia' allocato tre milioni e mezzo di celle. */
export function righeDiGiacenza(
  colli: number[] | null | undefined, qty: number | null | undefined,
): number {
  return colli ? colli.length : Math.max(1, Math.round(qty || 0));
}

/** IL FOGLIO SI RIEMPIE FINCHE' CI STA, E QUEL CHE NON CI STA LO DICE.

    Non e' il tetto di una riga: e' il conto di tutte. Duecento righe da
    diecimila colli fanno due milioni di righe, ognuna innocente e il foglio
    morto lo stesso — ed e' la stessa morte, perche' a contare le chiavi e'
    il foglio intero e non la riga.

    Torna, per ogni giacenza nell'ordine dato, le misure da stendere oppure
    `null` per quelle che non ci stanno. Una riga che da sola sfonda il
    foglio non ne consuma il budget: sarebbe una condanna per tutte quelle
    dopo, e quella riga e' un numero sbagliato, non merce. */
export function distendiGiacenze<T>(
  righe: readonly T[],
  leggi: (r: T) => { colli: number[] | null | undefined; qty: number | null | undefined },
  max: number = RIGHE_MAX_FOGLIO,
): ((number | null)[] | null)[] {
  let restanti = max;
  return righe.map((r) => {
    const { colli, qty } = leggi(r);
    const quante = righeDiGiacenza(colli, qty);
    if (quante > restanti) return null;
    restanti -= quante;
    return colliDaStendere(colli, qty, quante);
  });
}
