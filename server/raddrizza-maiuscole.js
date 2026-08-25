'use strict';

/* LE RIGHE SCRITTE MINUSCOLE, RADDRIZZATE - 2.2.
   (c) Andrea Sacchetti - Dietopack S.r.l. (Naturacare Group)

   NON GIRA DA SOLO E NON LO CHIAMA NESSUNO. Chiude la meta' «dato» della
   voce 38: il codice dalla 2.2 scrive maiuscolo, ma `item_key` e' un campo
   SCRITTO e le righe di prima portano ancora la grafia con cui sono nate.

     node server/raddrizza-maiuscole.js --da "banco\db\pathfinder-<data>.db"

   Cosi' com'e' CONTA E BASTA, e non scrive niente: e' il modo di sapere
   quante righe sono storte, e soprattutto quante si FONDEREBBERO, prima di
   aver toccato qualcosa. Per scrivere davvero serve `--sul-serio`.

   SI LAVORA SU UNA COPIA, MAI SUL DATABASE IN SERVIZIO. La copia la scrive
   il servizio, a caldo:

     Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup `
       -ContentType 'application/json' -Body (@{dir="$PWD\banco\db"} | ConvertTo-Json)

   PERCHE' NON BASTA UNA UPDATE. Alzare `item_key` su una riga dove nello
   stesso vano esiste GIA' la grafia maiuscola non e' una correzione: e' una
   fusione di due righe di giacenza in una, cioe' una somma di colli che
   nessun movimento ha mai fatto. Il registro si tiene sei anni e quella
   somma non avrebbe una riga che la spiega. Quelle NON si toccano: si
   elencano una per una e lo script si ferma. Le decide Andrea, e la
   decisione e' un movimento vero, non una UPDATE.

   COSA TOCCA, E COSA NO. Tocca le collezioni che portano articolo e lotto
   come dato vivo - `inventory`, `lots`, `quarantine`, `wip` - piu' il
   registro (`mov_log`, `disposal_archive`) e i riferimenti dentro `tasks`.
   NON tocca i documenti: §6 dice che le ristampe partono dallo snapshot
   archiviato, e uno snapshot e' il documento com'era il giorno che e'
   uscito. Riscriverlo sarebbe rifare un documento gia' emesso.

   Il registro si alza perche' la domanda che ci si fa fra tre anni e' «quale
   lotto», e due grafie sono due risposte. Quantita', data e firma non le
   tocca niente. */

const fs = require('node:fs');
const { NAMES, COLLECTIONS, materialize } = require('./lib/schema');

/* -- La parte pura, che il collaudo esercita senza aprire niente --------- */

/** I campi che portano un codice, per collezione. `item_key` e' `ART#LOTTO`
    e si alza intero: il separatore non e' una lettera. */
const CAMPI = {
  inventory:        ['item_key', 'article_code', 'lot_code'],
  lots:             ['article_code', 'lot_code'],
  quarantine:       ['item_key', 'article_code', 'lot_code'],
  wip:              ['item_key', 'article_code', 'lot_code'],
  mov_log:          ['article_code', 'lot_code'],
  disposal_archive: ['article_code', 'lot_code'],
  tasks:            ['article_code', 'lot_code'],
};

/** Storto = c'e' una minuscola dove dovrebbe essere tutto alto. Si guarda il
    valore, non il tipo: un campo assente non e' storto, e' assente. */
function storto(valore) {
  return typeof valore === 'string' && valore !== valore.toUpperCase();
}

/** Quali campi di questo record sono storti. Vuoto = la riga va bene. */
function campiStorti(collezione, record) {
  return (CAMPI[collezione] || []).filter(c => storto(record[c]));
}

/** Il record raddrizzato. L'originale non si tocca: chi lo legge una volta e
    lo riscrive in due posti non deve trovarselo cambiato sotto. */
function raddrizza(collezione, record) {
  const out = { ...record };
  for (const c of CAMPI[collezione] || []) {
    if (typeof out[c] === 'string') out[c] = out[c].toUpperCase();
  }
  return out;
}

/** LE FUSIONI. Due righe che dopo l'alzata avrebbero la stessa chiave nello
    stesso vano sono la stessa merce scritta in due modi. Torna un gruppo per
    ogni collisione, e solo quelle DAVVERO di grafia diversa: due righe gia'
    identiche non sono una collisione, sono un altro problema. */
function collisioni(righe, chiave) {
  const per = new Map();
  for (const r of righe) {
    const k = chiave(r).toUpperCase();
    if (!per.has(k)) per.set(k, []);
    per.get(k).push(r);
  }
  const out = [];
  for (const [k, gruppo] of per) {
    if (gruppo.length < 2) continue;
    if (new Set(gruppo.map(chiave)).size < 2) continue;
    out.push({ chiave: k, righe: gruppo });
  }
  return out;
}

module.exports = { CAMPI, storto, campiStorti, raddrizza, collisioni };

/* -- Da qui in giu' si apre il file, e solo se lo script e' lanciato ----- */

if (require.main === module) main();

function main() {
  const argomento = (nome, ripiego = null) => {
    const i = process.argv.indexOf(nome);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : ripiego;
  };
  const esci = (messaggio) => { console.error('\n  ' + messaggio + '\n'); process.exit(1); };

  const DA = argomento('--da', process.env.PATHFINDER_DB || null);
  const SUL_SERIO = process.argv.includes('--sul-serio');

  if (!DA) esci('Serve --da con il percorso di una COPIA del database.');
  /* Prima di tutto il resto, e non dopo: la copia si riconosce dal fatto che
     non sta dove sta quello in servizio. Non e' una difesa contro chi vuole
     aggirarla - e' una difesa contro le otto di sera. */
  if (/[\\/]Pathfinder[\\/]data[\\/]/i.test(DA)) {
    esci("Quello e' il database in servizio. Si lavora su una copia - vedi la testa di questo file.");
  }
  if (!fs.existsSync(DA)) esci('Non trovo il file: ' + DA);

  let Database;
  try { Database = require('better-sqlite3'); }
  catch { esci("Manca `better-sqlite3`: si lancia da dentro `server/`, dove e' installato."); }

  const db = new Database(DA, { readonly: !SUL_SERIO });
  const leggi = (nome) => db.prepare('SELECT * FROM ' + nome).all()
    .map(r => ({ _riga: r, doc: JSON.parse(r.data) }));

  console.log('\n  Database:  ' + DA);
  console.log('  Modo:      ' + (SUL_SERIO ? 'SCRIVE' : 'conta e basta (--sul-serio per scrivere)') + '\n');

  /* 1. Quante righe sono storte, collezione per collezione. */
  const storte = new Map();
  let totale = 0;
  for (const nome of NAMES) {
    if (!CAMPI[nome]) continue;
    const righe = leggi(nome).filter(({ doc }) => campiStorti(nome, doc).length);
    if (righe.length) { storte.set(nome, righe); totale += righe.length; }
    console.log('  ' + nome.padEnd(18) + String(righe.length).padStart(6) + ' righe da raddrizzare');
  }

  if (!totale) {
    console.log('\n  Niente da raddrizzare: zero righe portano una minuscola.\n');
    return;
  }

  /* 2. Le fusioni, che sono la ragione per cui questo script conta prima. */
  const fusioni = collisioni(leggi('inventory').map(({ doc }) => doc),
                             g => g.location_code + ' ' + g.item_key);
  const lottiDoppi = collisioni(leggi('lots').map(({ doc }) => doc),
                                l => l.article_code + '#' + l.lot_code);

  if (fusioni.length || lottiDoppi.length) {
    console.log('\n  ' + fusioni.length + ' giacenze e ' + lottiDoppi.length + ' lotti si FONDEREBBERO:\n');
    for (const { righe } of fusioni) {
      console.log('    ' + righe[0].location_code + ': '
        + righe.map(r => r.item_key + ' (' + (r.qty || 0) + ' colli)').join('  +  '));
    }
    for (const { righe } of lottiDoppi) {
      console.log('    lotto: ' + righe.map(r => r.article_code + '#' + r.lot_code).join('  +  '));
    }
    console.log("\n  Queste NON si toccano: sommare due righe e' un movimento, non una");
    console.log('  correzione di grafia, e il registro vuole la riga che lo spiega.');
    console.log('  Si sistemano a mano da Movimenta, poi si rilancia questo script.\n');
    process.exit(1);
  }

  console.log('\n  ' + totale + ' righe da raddrizzare, nessuna fusione.\n');

  if (!SUL_SERIO) {
    console.log("  Solo conteggio: non e' stato scritto niente. Con --sul-serio si raddrizza.\n");
    return;
  }

  /* 3. Si scrive, e tutto in una transazione sola: un raddrizzamento che
        finisce a meta' lascia i riferimenti appesi, che e' peggio del
        difetto da cui si era partiti. */
  db.transaction(() => {
    for (const [nome, righe] of storte) {
      const col = COLLECTIONS[nome];
      const cols = col.indexed.filter(c => c !== col.pk);
      const stmt = db.prepare('UPDATE ' + nome + ' SET '
        + [...cols, 'data'].map(c => c + '=?').join(', ') + ' WHERE ' + col.pk + '=?');
      for (const { _riga, doc } of righe) {
        const nuovo = raddrizza(nome, doc);
        const mat = materialize(nome, nuovo);
        stmt.run(...cols.map(c => mat[c]), JSON.stringify(nuovo), _riga[col.pk]);
      }
      console.log('  ' + nome.padEnd(18) + String(righe.length).padStart(6) + ' raddrizzate');
    }
  })();

  console.log('\n  Fatto. Il servizio va riavviato: la cache sta in memoria.\n');
}
