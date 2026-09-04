'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   PATHFINDER — IL REGISTRO DEL SERVIZIO — 2.18
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   PERCHE' ESISTE. Fino alla 2.17 il servizio parlava solo alla sua console,
   e la sua console non la legge nessuno: il processo gira come SYSTEM in
   sessione 0, dove non c'e' una finestra e non c'e' un utente. Dopo un
   incidente non restava niente da rileggere — non chi non e' riuscito a
   entrare, non quale rotta ha risposto 500, non a che ora il servizio si era
   acceso. Il `mov_log` non copre questo: registra i movimenti di merce
   RIUSCITI, non i tentativi di accesso al sistema.

   E' anche cio' che un audit di qualita' chiede a un sistema computerizzato
   che dichiara di stare in regime GMP (Annex 11).

   NIENTE LIBRERIE. `fs.appendFileSync` e un contatore di byte. Una
   dipendenza in piu' sul servizio e' una cosa che va aggiornata, collaudata
   e spiegata all'IT: per scrivere righe di testo non vale il prezzo.

   SCRIVE IN MODO SINCRONO, E VA BENE COSI'. Le righe sono poche — non c'e'
   una riga per richiesta riuscita — e una scrittura asincrona che si perde
   nel momento in cui il processo muore e' esattamente la riga che serviva.

   NON REGISTRA MAI: il PIN, le impronte, i corpi delle richieste, le
   stringhe di connessione. Un registro che porta un segreto e' un segreto in
   piu' da custodire, non una prova in piu'.

   SE IL DISCO E' PIENO NON SUCCEDE NIENTE. Ogni scrittura sta dentro un
   `try` che ingoia: un registro che ferma il magazzino e' peggio di nessun
   registro.
   ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const LIMITE_BYTE = 5 * 1024 * 1024;

const TENUTI = (() => {
  const v = Number(process.env.PATHFINDER_LOG_TENUTI);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 10;
})();

/* Il livello e' una parola sola e in colonna: `Select-String AVVISO` deve
   bastare, senza espressioni regolari e senza filtri di terze parti. */
const LIVELLI = new Set(['INFO', 'AVVISO', 'ERRORE']);

let file = null;
let byte = 0;
let spento = false;

/** Dove scrive, o `null` se il registro non e' stato acceso. */
function dove() { return file; }

/* La rotazione e' per DIMENSIONE e non per data: un servizio che nessuno
   tocca per una settimana non deve produrre sette file vuoti, e uno che ha
   una brutta giornata non deve scriverne uno da mezzo giga.
   I vecchi si chiamano `.1`, `.2`, ... e il piu' alto sparisce: cosi' il
   registro ha un tetto NOTO su disco, che e' l'unica proprieta' che conta
   su una macchina di magazzino con un disco solo. */
function ruota() {
  try {
    const ultimo = `${file}.${TENUTI}`;
    if (fs.existsSync(ultimo)) fs.rmSync(ultimo, { force: true });
    for (let n = TENUTI - 1; n >= 1; n--) {
      const da = n === 1 ? file : `${file}.${n}`;
      if (fs.existsSync(da)) fs.renameSync(da, `${file}.${n + 1}`);
    }
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.1`);
    byte = 0;
  } catch {
    /* Se la rotazione non riesce si continua a scrivere sul file grande:
       perdere le righe nuove per non superare un tetto sarebbe il compromesso
       sbagliato. */
  }
}

/**
 * Accende il registro. Si chiama una volta, all'avvio.
 * @param {string|null} percorso  file di destinazione; `null` lo lascia spento
 */
function apri(percorso) {
  spento = !percorso;
  if (spento) { file = null; return null; }
  try {
    file = path.resolve(percorso);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    byte = fs.existsSync(file) ? fs.statSync(file).size : 0;
    return file;
  } catch (err) {
    /* Un registro che non si apre lo si dice UNA volta sulla console, e poi
       si smette di provarci: non e' una ragione per non partire. */
    console.error('[pathfinder] registro non disponibile:', err.message);
    file = null; spento = true;
    return null;
  }
}

/**
 * Scrive una riga.
 * @param {'INFO'|'AVVISO'|'ERRORE'} livello
 * @param {string} evento   nome puntato e stabile: `auth.401`, `servizio.avvio`
 * @param {string} [nota]   testo libero, gia' ripulito da chi chiama
 */
function scrivi(livello, evento, nota = '') {
  if (spento || !file) return;
  const liv = LIVELLI.has(livello) ? livello : 'INFO';
  /* Gli a capo si appiattiscono: una riga di registro che ne contiene uno
     diventa due righe, e la seconda non ha ne' ora ne' livello. */
  const testo = String(nota).replace(/[\r\n]+/g, ' ').slice(0, 500);
  const riga = `${new Date().toISOString()}  ${liv.padEnd(6)}  ${evento}${testo ? '  ' + testo : ''}\n`;
  try {
    if (byte >= LIMITE_BYTE) ruota();
    fs.appendFileSync(file, riga, 'utf8');
    byte += Buffer.byteLength(riga);
  } catch {
    /* Vedi l'intestazione: si ingoia. */
  }
}

const info   = (evento, nota) => scrivi('INFO', evento, nota);
const avviso = (evento, nota) => scrivi('AVVISO', evento, nota);
const errore = (evento, nota) => scrivi('ERRORE', evento, nota);

module.exports = { apri, scrivi, info, avviso, errore, dove, LIMITE_BYTE, TENUTI };
