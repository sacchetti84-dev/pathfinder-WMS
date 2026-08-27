/* I TRE NUMERI DI VERSIONE STANNO IN TRE FILE, E DEVONO DIRE LO STESSO.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Una versione E' l'applicativo PIU' il servizio: si installano insieme, e
   `installa-pathfinder.ps1` alla fine controlla che `service_version` sia lo
   stesso numero del pacchetto. Se non lo e' dichiara fallita
   l'installazione — ed e' giusto, perche' quel caso di solito significa che
   il riavvio non ha avuto effetto e sta ancora girando il processo di prima.

   MA C'E' UN SECONDO MODO DI ARRIVARCI, ed e' quello che e' successo
   installando la 2.12: il servizio riavviato era quello nuovo, e il numero
   era rimasto indietro nel SORGENTE. Il messaggio parlava di riavvii, la
   causa era un `const` non toccato, e la si e' scoperta con l'installer
   davanti e il servizio giu' i secondi del riavvio.

   Questa prova sposta quella scoperta da «a fine installazione, sulla
   macchina vera» a «a `npm test`, dieci secondi». Legge i sorgenti perche' i
   tre numeri non hanno una sorgente unica: `vite.config.js` lo usa per
   nominare la cartella di consegna, `pathfinder-server.js` per rispondere a
   `/api/app-info`, `package.json` e' quello che npm vede. Farli discendere
   da uno solo vorrebbe dire che il servizio importa la configurazione della
   build, e il servizio non deve sapere che esiste una build.

   IL PACCHETTO PORTA DUE NUMERI, NON TRE: `package.json` ne ha tre —
   `2.12.0` — e gli altri due ne portano due, perche' una build definitiva si
   chiama cosi'. Si confrontano le prime due parti. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** `2.12.0` e `2.12` sono lo stesso numero: si confronta `<maggiore>.<minore>`. */
function dueNumeri(v) {
  const m = String(v ?? '').trim().match(/^(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

const pacchetto = JSON.parse(readFileSync('package.json', 'utf8')).version;
const build = (readFileSync('vite.config.js', 'utf8')
  .match(/^const VERSIONE = '([^']+)';/m) || [])[1];
const servizio = (readFileSync('server/pathfinder-server.js', 'utf8')
  .match(/^const VERSION = '([^']+)';/m) || [])[1];

describe('la versione si dichiara in tre file e deve combaciare', () => {
  it('i tre numeri esistono, e sono scritti come questa prova li cerca', () => {
    expect(dueNumeri(pacchetto), 'package.json → version').not.toBe(null);
    expect(dueNumeri(build), "vite.config.js → const VERSIONE").not.toBe(null);
    expect(dueNumeri(servizio), 'server/pathfinder-server.js → const VERSION').not.toBe(null);
  });

  it('LA BUILD dice il numero del pacchetto — o la cartella di consegna porta un nome sbagliato', () => {
    expect(dueNumeri(build)).toBe(dueNumeri(pacchetto));
  });

  /* Questa e' quella che e' costata un'installazione. */
  it('IL SERVIZIO dice il numero del pacchetto — o l’installazione fallisce parlando di riavvii', () => {
    expect(dueNumeri(servizio)).toBe(dueNumeri(pacchetto));
  });
});
