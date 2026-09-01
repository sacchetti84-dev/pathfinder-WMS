/* NESSUN FILE TRACCIATO PORTA L'IMPRONTA DI UN PIN — 2.16
   © Andrea Sacchetti — Dietopack S.r.l.

   Due volte la stessa falla, e la seconda ha insegnato come si chiude.

   Il 31/08 (voce 72) un dump del magazzino con `pin_hash` e `pin_salt` di
   persone vere è entrato nel repository dal commit che dichiarava di lasciare
   fuori i segreti: la regola diceva «i file di database», il `.gitignore`
   diceva `*.db`, e un dump di PostgreSQL si chiama `.dump`. Si aggiunsero le
   estensioni mancanti.

   Il 02/09 sono saltati fuori SEI export JSON, tracciati, con dentro le
   stesse cose. Perché **un export JSON è un database**, e nessuna estensione
   lo diceva.

   Da qui la regola vera: una regola scritta in prosa e un filtro scritto per
   estensione non sono la stessa regola. Il filtro non basta e non basterà —
   la prossima volta il segreto arriverà in un formato che oggi non esiste.
   Quello che regge è **guardare dentro**.

   COSA GUARDA: i file `.json` tracciati che nominano un'impronta, e dentro
   quelli, gli operatori. I sorgenti e i pacchetti nominano `pin_hash` come
   IDENTIFICATORE e non come dato: per questo si parla di JSON e si legge la
   collezione, invece di cercare la parola.

   L'export resta utile senza le impronte: un backup senza PIN riapre la
   finestra del primo avvio, che è il modo giusto di partire su una versione
   nuova — §8. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const IMPRONTE = ['pin_hash', 'pin_salt', 'rec_hash', 'rec_salt'];

function tracciati() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(Boolean);
  } catch {
    return null;   // niente git: si dichiara, non si tace
  }
}

test('nessun file tracciato porta l\'impronta del PIN di qualcuno', () => {
  const file = tracciati();
  if (file === null) {
    /* Non si finge di aver controllato: si dice che non si è potuto. */
    console.warn('  saltata: `git ls-files` non risponde — fuori da un repository?');
    return;
  }

  const colpevoli = [];
  for (const f of file) {
    if (!f.endsWith('.json')) continue;
    let testo;
    try { testo = fs.readFileSync(f, 'utf8'); } catch { continue; }
    /* Il taglio veloce: se non nomina nessuna impronta non si analizza. */
    if (!IMPRONTE.some((k) => testo.includes(k))) continue;

    let dati;
    try { dati = JSON.parse(testo); } catch { continue; }
    const ops = dati?.operators;
    if (!Array.isArray(ops)) continue;

    for (const o of ops) {
      if (!o || typeof o !== 'object') continue;
      const con = IMPRONTE.filter((k) => typeof o[k] === 'string' && o[k].length > 0);
      if (con.length) colpevoli.push(`${f} — ${o.initials || o.op_id}: ${con.join(', ')}`);
    }
  }

  expect(colpevoli, colpevoli.length
    ? 'Impronte di PIN dentro file tracciati:\n  ' + colpevoli.join('\n  ')
      + '\n\nSi tolgono dal file: non servono a una prova, e un backup senza PIN'
      + '\nriapre la finestra del primo avvio — che è il modo giusto di partire.'
    : '').toEqual([]);
});
