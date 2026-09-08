/* IL PRIMO ADMIN SI CREA E RESTA DENTRO — 2.29.1
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Trovato al banco l'08/09, a video, su un database con `operators` vuota.

   COS'È SUCCESSO. Il wizard di primo accesso chiamava `Store.addOperator`,
   che finisce con `_touchMeta()` — due chiavi di servizio su `meta`. Ma la
   scrittura dell'operatore col PIN è ESATTAMENTE il gesto che chiude la
   finestra di primo avvio del servizio (`finestraDiPrimoAvvio`, 2.11): la
   riga dopo partiva senza sessione e si prendeva un `401`. `addOperator`
   lanciava, e le righe che venivano dopo — `Auth.accedi`, l'attivazione
   dell'operatore, la chiusura del cancello, il codice di ripristino — non
   venivano eseguite.

   COSA VEDEVA CHI INSTALLA. Il wizard restava aperto con scritto «Sessione
   non valida: identificarsi», e l'Admin a database c'era, col PIN appena
   scelto. Riprovando usciva «Le iniziali sono già assegnate a un altro
   operatore»: un secondo messaggio, diverso, che non nomina la via d'uscita.
   Nessuna riga diceva di ricaricare la pagina ed entrare col PIN. Su una
   macchina di magazzino appena installata questo è il primissimo gesto, e
   sbaglia da solo.

   PERCHÉ LA PROVA GUARDA L'ORDINE E NON L'ESITO. Non c'è niente di rotto in
   nessuna delle due scritture prese da sole: sono giuste tutte e due, ed è
   giusto anche che il PIN chiuda la finestra. Quel che vale è che fra loro
   ci stia l'ingresso. Un esito si può far tornare verde spegnendo la
   finestra o allargando i permessi di `meta` — due modi di rimettere il
   difetto sotto un'altra forma. L'ordine no: o l'ingresso sta in mezzo, o
   non ci sta.

   VERIFICATA RIMETTENDO IL DIFETTO: togliendo `senzaMeta` o spostando
   `Auth.accedi` dopo `_touchMeta`, questi casi diventano rossi. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(RADICE, 'src', 'ui', 'app.ts'), 'utf8');
const STORE = fs.readFileSync(path.join(RADICE, 'src', 'core', 'store.ts'), 'utf8');

/* Il corpo della funzione, non tutto il file: `_touchMeta` compare in molti
   altri punti e un indice preso sul file intero non direbbe niente. */
function corpoConfermaPrimoAdmin() {
  const da = APP.indexOf('async _confirmFirstLeader()');
  expect(da, '_confirmFirstLeader non c\'è più: se è stata rinominata, questa prova va con lei')
    .toBeGreaterThan(-1);
  const a = APP.indexOf('\n  },', da);
  expect(a).toBeGreaterThan(da);
  return APP.slice(da, a);
}

describe('la creazione del primo Admin', () => {
  const corpo = corpoConfermaPrimoAdmin();

  test('chiede ad addOperator di NON toccare meta', () => {
    expect(corpo).toMatch(/addOperator\([\s\S]*senzaMeta:\s*true/);
  });

  test('prende la sessione dopo aver creato l\'operatore', () => {
    const creazione = corpo.indexOf('addOperator(');
    const ingresso = corpo.indexOf('Auth.accedi(');
    expect(creazione).toBeGreaterThan(-1);
    expect(ingresso).toBeGreaterThan(-1);
    expect(ingresso, 'l\'ingresso deve venire DOPO la creazione: prima non c\'è un PIN da presentare')
      .toBeGreaterThan(creazione);
  });

  test('e tocca meta solo DOPO essere entrata', () => {
    const ingresso = corpo.indexOf('Auth.accedi(');
    const meta = corpo.indexOf('_touchMeta(');
    expect(meta, 'se meta non si tocca più qui, la riga è tornata dentro addOperator')
      .toBeGreaterThan(-1);
    expect(meta, 'meta prima dell\'ingresso è il difetto dell\'08/09: 401 e wizard bloccato')
      .toBeGreaterThan(ingresso);
  });
});

describe('addOperator', () => {
  test('sa saltare meta, e di serie NON lo salta', () => {
    /* Il valore di serie conta: le altre diciassette chiamate non passano
       niente, e per loro `meta` si tocca come sempre. */
    expect(STORE).toMatch(/senzaMeta\s*=\s*false/);
    expect(STORE).toMatch(/if\s*\(!senzaMeta\)\s*await this\._touchMeta\(\)/);
  });

  test('scrive l\'operatore prima di guardare senzaMeta', () => {
    const da = STORE.indexOf('async addOperator(');
    const corpo = STORE.slice(da, STORE.indexOf('\n  },', da));
    const scrittura = corpo.indexOf("Persistence.add('operators'");
    const scelta = corpo.indexOf('if (!senzaMeta)');
    expect(scrittura).toBeGreaterThan(-1);
    expect(scelta).toBeGreaterThan(scrittura);
  });
});
