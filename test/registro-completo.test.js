/* IL REGISTRO NON HA RIGHE MUTE — 2.2.

   Un movimento che muove merce e non dice quanta è una riga che a un
   controllo non serve: dice che qualcosa è successo, non cosa. Il 24/08 ne
   sono uscite quattro dal registro vero — il reso dal conto di produzione,
   la rimozione a mano di una riga, il rilascio dalla quarantena e la
   correzione dell'identificativo — più l'entrata nel vano WIP, che non era
   scritta affatto: la merce spariva dallo scaffale e ricompariva nel vano
   senza una riga che ce l'avesse portata.

   La regola: ogni `_logMov` con una causale che muove merce passa almeno
   fino a `qty_after`, cioè dodici argomenti. Le tre causali che NON muovono
   merce — la modifica dati, la purga del registro e il rinnovo del PIN —
   restano fuori: lì una quantità sarebbe inventata.

   Si legge il sorgente perché qui non c'è un DOM e Store non si monta: è la
   stessa strada di `modali.test.js`. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* 2.16 — `MOV.UDC` entra qui: il contenitore non e' merce. Nasce, si sposta
   e si chiude, e la merce che porta scrive le proprie righe — voce 34. */
const SENZA_MERCE = new Set(['MOV.EDIT', 'MOV.PURGE', 'MOV.PINRESET', 'MOV.UDC']);
/* type, art, desc, lot, loc, dest, user, note, docRef, before, delta, after, UM.
   2.2 — le UM sono la tredicesima: un trasferimento a peso che dice i colli e
   non i chili racconta meta' movimento. Dove non ce ne sono si passa `null`
   scritto, che e' un'assenza dichiarata e non una dimenticanza. */
const MINIMO = 13;
/* La barra rovescia scritta per codice: metterla fra apici dentro questa
   prova vorrebbe dire raddoppiarla, e si legge peggio di così. */
const ROVESCIA = String.fromCharCode(92);

function sorgenti(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sorgenti(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Gli argomenti al primo livello: le parentesi annidate, le stringhe e i
    template non contano, o `${a, b}` diventerebbe una virgola vera. */
function argomenti(src, da) {
  let liv = 0, cur = '', quota = null;
  const out = [];
  for (let i = da; i < src.length; i++) {
    const c = src[i];
    if (quota) {
      if (c === ROVESCIA) { cur += src[i] + (src[i + 1] ?? ''); i++; continue; }
      if (c === quota) quota = null;
      cur += c;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { quota = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { liv++; if (liv > 1) cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') {
      liv--;
      if (liv === 0) { out.push(cur.trim()); return out; }
      cur += c; continue;
    }
    if (c === ',' && liv === 1) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  return out;
}

const chiamate = [];
for (const file of sorgenti('src/ui')) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/_logMov\(/g)) {
    if (src.slice(Math.max(0, m.index - 30), m.index + 10).includes('async _logMov')) continue;
    const args = argomenti(src, m.index + m[0].length - 1);
    chiamate.push({
      file, riga: src.slice(0, m.index).split('\n').length,
      causale: args[0] ?? '?', quanti: args.length,
    });
  }
}

test('ogni movimento di merce scrive anche le quantità', () => {
  const mute = chiamate
    .filter(c => !SENZA_MERCE.has(c.causale) && c.quanti < MINIMO)
    .map(c => `${c.file}:${c.riga} ${c.causale} (${c.quanti} argomenti)`);
  expect(mute).toEqual([]);
});

test('le chiamate al registro si trovano ancora', () => {
  /* Se il conteggio crolla, il primo sospetto è che la ricerca non trovi
     più niente e la prova qui sopra passi a vuoto. */
  expect(chiamate.length).toBeGreaterThan(30);
});

test('la merce che entra nel vano WIP passa dal registro', () => {
  /* Le due strade che portano merce in lavorazione: il prelievo guidato da
     ODP e il carrello. Tutte e due scrivono l'arrivo, e lo scrivono DOPO
     che il conto è riuscito — un conto fallito non ha portato niente. */
  for (const f of ['src/ui/views/percorso.ts', 'src/ui/views/prelievo.ts']) {
    const src = fs.readFileSync(f, 'utf8');
    const i = src.indexOf('Store.entraInWip(');
    expect(i, `${f}: entraInWip non c'è più`).toBeGreaterThan(-1);
    const dopo = src.slice(i, i + 2000);
    expect(dopo, `${f}: l'entrata nel vano non va a registro`).toContain('MOV.IN');
  }
});

/* ── 2.16 · voce 33 — E NON HA NEMMENO RIGHE CHE MENTONO ──────────────────
   Una riga muta dice «e' successo qualcosa». Una riga che si contraddice e'
   peggio: dice un numero, e il numero e' sbagliato. Tre forme riproducibili
   stavano nel registro vero — un `MOVE` di riga intera con `qty_delta: 0`,
   un `PICK` con `null` fra before 10 e after 9, un `SAMPLE` con 0. Adesso il
   punto di scrittura ricalcola, e questa prova gira la funzione. */
import { quantoSiEMosso, quantitaMossa } from '../src/modules/registro.ts';

test('con i due estremi la variazione e\' la loro differenza', () => {
  expect(quantoSiEMosso({ qty_before: 10, qty_after: 9, qty_delta: null })).toBe(-1);
  expect(quantoSiEMosso({ qty_before: 10, qty_after: 0,  qty_delta: 0 })).toBe(-10);
  expect(quantoSiEMosso({ qty_before: 0,  qty_after: 6,  qty_delta: null })).toBe(6);
});

test('e l\'aritmetica batte il numero passato dal chiamante', () => {
  expect(quantoSiEMosso({ qty_before: 4, qty_after: 1, qty_delta: 99 })).toBe(-3);
});

test('una riga che non muove niente resta a zero, e zero e\' un fatto', () => {
  expect(quantoSiEMosso({ qty_before: 7, qty_after: 7, qty_delta: 0 })).toBe(0);
});

test('senza uno dei due estremi resta quel che ha dichiarato il chiamante', () => {
  expect(quantoSiEMosso({ qty_before: 10, qty_after: null, qty_delta: -1 })).toBe(-1);
  expect(quantoSiEMosso({ qty_before: null, qty_after: 9, qty_delta: -1 })).toBe(-1);
});

test('e senza estremi e senza dichiarazione resta null — il movimento storico', () => {
  expect(quantoSiEMosso({})).toBe(null);
  expect(quantoSiEMosso({ qty_before: null, qty_after: null, qty_delta: null })).toBe(null);
});

/* ── 2.16 · voce 33 — E QUANTI COLLI HANNO CAMBIATO POSTO ─────────────────
   Non e' la stessa domanda. Sul dump del 31/08, 22 trasferimenti veri
   portavano `qty_delta: 0` con before e after uguali: la riga intera cambia
   vano e la quantita' resta quella. Chi leggeva `Math.abs(qty_delta)` — KPI,
   cruscotto, registro attivita' — contava zero colli mossi. */
test('un trasferimento di riga intera muove tutti i colli che porta', () => {
  expect(quantitaMossa({ qty_delta: 0, qty_before: 26, dest_location: 'MAG1-RAKA-03-02-B' })).toBe(26);
  expect(quantitaMossa({ qty_delta: 0, qty_before: 2,  dest_location: 'MAG1-RAKA-02-04-C' })).toBe(2);
});

test('un trasferimento parziale muove quel che dice la variazione', () => {
  expect(quantitaMossa({ qty_delta: -1, qty_before: 1, dest_location: 'MAG1-RAKA-01-01-A' })).toBe(1);
  expect(quantitaMossa({ qty_delta: -4, qty_before: 10, dest_location: 'X' })).toBe(4);
});

test('senza destinazione lo zero resta zero, e non diventa la riga intera', () => {
  expect(quantitaMossa({ qty_delta: 0, qty_before: 7, dest_location: null })).toBe(0);
});

test('e una riga che non dice la variazione non dice nemmeno quanto — null, non zero', () => {
  expect(quantitaMossa({ qty_delta: null, qty_before: 5, dest_location: 'X' })).toBe(null);
  expect(quantitaMossa({ qty_delta: 0, qty_before: null, dest_location: 'X' })).toBe(0);
});
