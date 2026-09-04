/* LE ICONE — 2.23
   © Andrea Sacchetti — Dietopack S.r.l.

   Un'icona vive in tre posti che devono dire la stessa cosa: il vocabolario
   (`src/icone/vocabolario.json`), il file scaricato (`src/icone/svg/`) e lo
   sprite dentro `index.html`. Chi ne aggiunge una e dimentica il generatore
   NON rompe niente a compilazione: `<use href="#i-qualcosa">` che non trova
   il symbol non è un errore, è un buco bianco. Su un terminale in corsia un
   buco bianco al posto dell'avviso è il difetto che nessuno segnala perché
   sembra un carattere mancante.

   Si legge il sorgente, come `emojiVestite.test.js` e `superficie-app`. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ICONE } from '../src/ui/icone.ts';
import { nomiDelVocabolario } from '../strumenti/genera-icone.mjs';

const RADICE = path.resolve(import.meta.dirname, '..');
const pagina = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');

test('il vocabolario, l\'elenco del modulo e lo sprite dicono gli stessi nomi', () => {
  const vocabolario = nomiDelVocabolario().sort();
  expect([...ICONE].sort()).toEqual(vocabolario);

  const nelloSprite = [...pagina.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)]
    .map((m) => m[1]).sort();
  expect(nelloSprite).toEqual(vocabolario);
});

test('ogni icona dichiarata ha il suo file, e ogni file è dichiarato', () => {
  const cartella = path.join(RADICE, 'src', 'icone', 'svg');
  const suDisco = fs.readdirSync(cartella)
    .filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
  expect(suDisco).toEqual(nomiDelVocabolario().sort());
});

test('lo sprite è a griglia 24 e a tratto 2, su tutte', () => {
  const simboli = pagina.match(/<symbol id="i-[a-z0-9-]+"[^>]*>/g) || [];
  expect(simboli.length).toBe(ICONE.length);
  for (const s of simboli) {
    expect(s, s).toContain('viewBox="0 0 24 24"');
    expect(s, s).toContain('stroke="currentColor"');
    expect(s, s).toContain('stroke-width="2"');
  }
});

/* IL COLORE NON SI SCRIVE DENTRO L'ICONA. Un `fill` o uno `stroke` con un
   colore vero al posto di `currentColor` è un'icona che non ubbidisce alla
   tessera che la contiene: è il difetto che avevano le emoji — 🚫 restava
   rossa dentro una tessera viola — e riportarlo dentro di nascosto sarebbe
   peggio, perché stavolta sembrerebbe voluto. */
test('nessuna icona si porta dietro un colore suo', () => {
  const dentro = /<!-- ICONE:[\s\S]*?<!-- \/ICONE -->/.exec(pagina)[0];
  const colori = dentro.match(/(?:fill|stroke)="(?!none|currentColor)[^"]*"/g) || [];
  expect(colori).toEqual([]);
});

/* UN `${…}` DENTRO UNA STRINGA AD APICI NON INTERPOLA, E NESSUNO LO DICE.

   Scritto in `'…${this._ico('x')}…'` il segnaposto resta testo: a video
   compare la scritta `${this._ico(` invece dell'icona. E l'apice del nome
   chiude la stringa, quindi a volte è un errore di sintassi e a volte no —
   dipende da cosa c'è dopo. Le due volte in cui NON lo è, esce del codice a
   video su una schermata di magazzino.

   Il controllo segue lo stato delle virgolette invece di cercare uno schema:
   dentro un letterale di modello un apice è solo un carattere, e un controllo
   che non lo sappia segnala trecento righe sane. */
function segnapostiMorti(testo) {
  const morti = [];
  /* La pila: un letterale di modello puo' contenere un `${}` che contiene un
     altro modello, e senza pila il primo `}` di un oggetto destrutturato
     chiuderebbe il segnaposto sbagliato. `graffe` conta le parentesi aperte
     DENTRO il segnaposto, cosi' `({ sito, zona }) => …` non lo chiude. */
  const pila = [];
  const cima = () => pila[pila.length - 1];
  let riga = 1;
  let precedente = '';  // ultimo carattere significativo, per riconoscere una regex

  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (c === '\n') { riga++; }
    if (c === '\\') { i++; continue; }

    const stato = cima();

    /* Dentro una stringa o un commento si guarda solo come si esce. */
    if (stato && stato.t === "'" || stato && stato.t === '"') {
      if (c === stato.t || c === '\n') pila.pop();
      else if (c === '$' && testo[i + 1] === '{') { morti.push(riga); i++; }
      continue;
    }
    if (stato && stato.t === '`') {
      if (c === '`') pila.pop();
      else if (c === '$' && testo[i + 1] === '{') { pila.push({ t: 'code', graffe: 0 }); i++; }
      continue;
    }
    if (stato && stato.t === 'regex') {
      if (c === '/' || c === '\n') pila.pop();
      continue;
    }
    if (stato && stato.t === 'riga') { if (c === '\n') pila.pop(); continue; }
    if (stato && stato.t === 'blocco') {
      if (c === '*' && testo[i + 1] === '/') { pila.pop(); i++; }
      continue;
    }

    /* Qui siamo in codice — al livello del file, o dentro un `${}`. */
    if (c === '/' && testo[i + 1] === '/') { pila.push({ t: 'riga' }); i++; continue; }
    if (c === '/' && testo[i + 1] === '*') { pila.push({ t: 'blocco' }); i++; continue; }
    if (c === '/' && '(,=:[!&|?{};+~*%<>^\n'.includes(precedente)) {
      /* Una barra dopo un operatore apre una regex, non una divisione. Serve
         perche' `/"/g` contiene una virgoletta che altrimenti passerebbe per
         l'inizio di una stringa, e da li' in poi tutto slitta. */
      pila.push({ t: 'regex' });
      precedente = c;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { pila.push({ t: c }); precedente = c; continue; }
    if (stato && stato.t === 'code') {
      if (c === '{') stato.graffe++;
      else if (c === '}') {
        if (stato.graffe === 0) pila.pop();   // il segnaposto finisce qui
        else stato.graffe--;
      }
    }
    if (!/\s/.test(c)) precedente = c;
  }
  return morti;
}

test('nessun segnaposto ${…} sepolto in una stringa che non interpola', () => {
  const sorgenti = [];
  (function raccogli(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) raccogli(p);
      else if (/\.(ts|js)$/.test(e.name)) sorgenti.push(p);
    }
  })(path.join(RADICE, 'src'));

  const morti = [];
  for (const file of sorgenti) {
    for (const riga of segnapostiMorti(fs.readFileSync(file, 'utf8'))) {
      morti.push(`${path.relative(RADICE, file).replace(/\\/g, '/')}:${riga}`);
    }
  }
  expect(morti).toEqual([]);
});

/* UN'ICONA DOVE FINISCE DEL TESTO SI LEGGE, NON SI DISEGNA.

   `Feedback` scrive titolo e dettaglio del riscontro con `textContent`, e
   così i titoli di `Dialog`, i suoi `message:` e le righe di `Dialog.kv`:
   sono i punti in cui un codice arrivato da un campo non deve poter portare
   markup. Bene per la sicurezza, e fatale per un `<svg>` — che lì esce come
   la stringa `<svg class="ico"…`, a video, su una schermata di magazzino.

   Non serve nemmeno: il riscontro ha GIÀ la sua icona, scelta dal genere —
   `ok`, `warn`, `error`, `info` — e `Dialog` ha il suo `icon`. Quella davanti
   al messaggio era una ripetizione già quando era un'emoji.

   Ne sono finite 69 in altrettanti punti durante la migrazione delle emoji,
   perché chi convertiva vedeva un letterale di modello e non sapeva dove
   sarebbe andato a finire. */
test('nessuna icona finisce dove si scrive testo', () => {
  const sorgenti = [];
  (function raccogli(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) raccogli(p);
      else if (/\.ts$/.test(e.name)) sorgenti.push(p);
    }
  })(path.join(RADICE, 'src'));

  const scriveTesto = /\.toast\(|\.textContent\s*=|\bmessage:\s|\btitle:\s|Dialog\.kv\(/;
  const guai = [];
  for (const file of sorgenti) {
    const righe = fs.readFileSync(file, 'utf8').split('\n');
    righe.forEach((r, n) => {
      if (scriveTesto.test(r) && /_ico\(/.test(r)) {
        guai.push(`${path.relative(RADICE, file).replace(/\\/g, '/')}:${n + 1}`);
      }
    });
  }
  expect(guai).toEqual([]);
});

/* Ogni `App._ico('qualcosa')` scritto dentro una stringa deve trovare
   un'icona. TypeScript lo controlla dove il nome è una costante, ma nelle
   viste il nome viaggia dentro un template: lì il compilatore non guarda. */
test('ogni nome citato nelle viste esiste', () => {
  const sorgenti = [];
  (function raccogli(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) raccogli(p);
      else if (/\.(ts|js|html)$/.test(e.name)) sorgenti.push(p);
    }
  })(path.join(RADICE, 'src'));

  const noti = new Set(ICONE);
  const sconosciuti = [];
  for (const file of sorgenti) {
    const testo = fs.readFileSync(file, 'utf8');
    for (const m of testo.matchAll(/_ico\(\s*'([^']+)'/g)) {
      if (!noti.has(m[1])) sconosciuti.push(`${path.relative(RADICE, file)} — ${m[1]}`);
    }
    for (const m of testo.matchAll(/href="#i-([a-z0-9-]+)"/g)) {
      if (!noti.has(m[1])) sconosciuti.push(`${path.relative(RADICE, file)} — #i-${m[1]}`);
    }
  }
  expect(sconosciuti).toEqual([]);
});
