/* IL TASTO STAMPATO È IL TASTO CHE FUNZIONA — 2.29.1
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Trovato al banco l'08/09 guardando il cruscotto: DUE schede portavano
   scritto «F3». Trasferimento e Prelievo ordini.

   E F3 non faceva né l'una né l'altra. La tabella dei tasti diceva
   `F3: ['pick', null]` e chiamava `startMov('pick', null)`, che apre il
   prelievo senza dire su quale scheda — cioè sull'ULTIMA USATA, perché
   `_pickSubMode` è appiccicoso e resta dove l'operatore l'ha lasciato. Chi
   aveva prelevato una volta per la produzione, premendo F3 per fare un
   trasferimento, atterrava sul prelievo di produzione. In corsia lo schermo
   si guarda un istante e poi si battono codici: la maschera sbagliata la si
   scopre dopo, con la merce già in mano.

   Nello stesso momento F4, F6, F7 e F8 esistevano e nessuna scheda lo
   diceva: quattro scorciatoie che l'operatore non poteva sapere di avere.

   PERCHÉ ERANO DUE ELENCHI. Uno in `ui/app.ts` per ascoltare la tastiera,
   uno accanto a ogni scheda in `ui/views/cruscotto.ts` per stamparne il
   nome. Due elenchi della stessa cosa divergono — non «possono»: lo fanno,
   e qui l'hanno fatto in silenzio, perché niente li confrontava. Adesso ce
   n'è uno, in `modules/cruscotto.ts`, e la scheda gli CHIEDE il suo tasto.

   COSA GUARDA QUESTA PROVA. Non che il tasto sia F3 — quello è una scelta e
   può cambiare. Guarda le tre cose che non devono più poter succedere: due
   schede sullo stesso tasto, una scheda che annuncia un tasto che porta
   altrove, e un tasto che dimentica la sottoscheda. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASTI_FUNZIONE, tastoPer } from '../src/modules/cruscotto';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VISTA = fs.readFileSync(path.join(RADICE, 'src', 'ui', 'views', 'cruscotto.ts'), 'utf8');
const APP = fs.readFileSync(path.join(RADICE, 'src', 'ui', 'app.ts'), 'utf8');

describe('tastoPer', () => {
  test('trova il tasto solo se combaciano modo E sottoscheda', () => {
    expect(tastoPer('io', 'in')).toBe('F2');
    expect(tastoPer('io', 'out')).toBe('F6');
    /* Il caso che ha generato il difetto: stesso modo, sottoscheda diversa. */
    expect(tastoPer('pick', 'cambio')).toBe('F3');
    expect(tastoPer('pick', 'produzione')).toBe('');
    expect(tastoPer('pick', null)).toBe('');
  });

  test('un modo che non ha tasto non ne inventa uno', () => {
    expect(tastoPer('sampling', null)).toBe('');
    expect(tastoPer('pf', null)).toBe('');
    expect(tastoPer('', null)).toBe('');
  });

  test('«senza sottoscheda» e «sottoscheda assente» sono la stessa cosa', () => {
    expect(tastoPer('inv')).toBe('F4');
    expect(tastoPer('inv', null)).toBe('F4');
    expect(tastoPer('inv', undefined)).toBe('F4');
  });
});

describe('la tabella', () => {
  test('nessun tasto porta a due posti', () => {
    const tasti = Object.keys(TASTI_FUNZIONE);
    expect(new Set(tasti).size).toBe(tasti.length);
  });

  test('e nessuna destinazione ha due tasti', () => {
    const dove = Object.values(TASTI_FUNZIONE).map((c) => `${c.mode}#${c.sub ?? ''}`);
    expect(new Set(dove).size, `due tasti sulla stessa maschera: ${dove.join(', ')}`)
      .toBe(dove.length);
  });

  test('ogni voce dice il modo, e la sottoscheda la dichiara anche quando è nessuna', () => {
    for (const [tasto, c] of Object.entries(TASTI_FUNZIONE)) {
      expect(c.mode, `${tasto} senza modo`).toBeTruthy();
      expect('sub' in c, `${tasto} non dichiara la sottoscheda`).toBe(true);
    }
  });
});

describe('le due parti non possono più divergere', () => {
  test('nessuna scheda del cruscotto scrive un tasto a mano', () => {
    /* La riga che ha creato il difetto era `key: 'F3'` dentro il catalogo.
       Se torna, torna il difetto. */
    expect(VISTA, "una scheda scrive di nuovo il suo tasto invece di chiederlo a tastoPer")
      .not.toMatch(/key:\s*['"]F\d/);
  });

  test('il catalogo chiede il tasto a tastoPer, con modo e sottoscheda', () => {
    expect(VISTA).toMatch(/tastoPer\(\s*o\.mode\s*,\s*o\.sub\s*\)/);
  });

  test('chi ascolta la tastiera legge la stessa tabella', () => {
    expect(APP).toMatch(/import\s*\{\s*TASTI_FUNZIONE\s*\}\s*from\s*'\.\.\/modules\/cruscotto'/);
    expect(APP, 'la tabella è stata riscritta a mano dentro app.ts')
      .not.toMatch(/const fnMap\s*=/);
  });

  test('e apre la sottoscheda, invece di lasciare quella di prima', () => {
    /* `startMov` non sa niente di sottoschede: chiamandola, F3 atterrava
       sull'ultima usata. Chi le apre è `_goOp`. */
    const da = APP.indexOf('const combinazione = TASTI_FUNZIONE');
    expect(da, 'la lettura della tabella non c\'è più').toBeGreaterThan(-1);
    const corpo = APP.slice(da, da + 400);
    expect(corpo).toMatch(/_goOp\(\s*combinazione\.mode\s*,\s*combinazione\.sub\s*\)/);
    expect(corpo, 'startMov non apre la sottoscheda: è il difetto dell\'08/09')
      .not.toMatch(/startMov\(/);
  });
});
