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

/* UN'ICONA DENTRO UN ATTRIBUTO SPEZZA IL TAG, E IL CAMPO SMETTE DI FUNZIONARE.

   `_ico()` restituisce markup con le virgolette doppie. Interpolato dentro
   `placeholder="…"` il parser chiude l'attributo alla PRIMA virgoletta che
   incontra — quella di `class="ico"` — e chiude il tag `<input>` al primo
   `>`, che e' quello di `<use href="#i-search"/>`. Cio' che veniva dopo, cioe'
   l'`oninput`, non viene mai applicato: il campo mostra la scritta
   `<svg class=` e non filtra piu' niente.

   Ne sono uscite tre dalla migrazione delle emoji della 2.23 — registro,
   anagrafica articoli, prodotto finito — e sono rimaste rotte per quattro
   versioni, perche' un campo che non filtra sembra un campo vuoto. E' lo
   stesso difetto di `nessuna icona finisce dove si scrive testo`, con l'altra
   destinazione: li' l'icona esce come testo, qui si porta via il tag.

   Si distingue il caso vero dai settanta innocui guardando DOVE cade il
   `_ico(`: dentro il valore di un attributo e' un difetto, nel corpo del tag
   e' l'uso normale. */
test('nessuna icona finisce dentro il valore di un attributo', () => {
  const sorgenti = [path.join(RADICE, 'index.html')];
  (function raccogli(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) raccogli(p);
      else if (/\.(ts|js)$/.test(e.name)) sorgenti.push(p);
    }
  })(path.join(RADICE, 'src'));

  const guai = [];
  for (const file of sorgenti) {
    const testo = fs.readFileSync(file, 'utf8');
    /* Un attributo si apre con `nome="` preceduto da spazio, e si chiude
       alla virgoletta dopo: fra le due non ci va nessuna icona. */
    const apre = /\s([a-zA-Z-]+)="/g;
    let m;
    while ((m = apre.exec(testo))) {
      const dopo = m.index + m[0].length;
      const chiude = testo.indexOf('"', dopo);
      const valore = testo.slice(dopo, chiude === -1 ? testo.length : chiude);
      if (/ico\(/.test(valore)) {
        const riga = testo.slice(0, m.index).split('\n').length;
        guai.push(`${path.relative(RADICE, file).split(path.sep).join('/')}:${riga} — ${m[1]}`);
      }
      if (chiude !== -1) apre.lastIndex = chiude + 1;
    }
  }
  expect(guai).toEqual([]);
});

/* LE DUE FALLE DELLA RETE DELLA 2.27, TROVATE L'08/09.

   1. IL CONTROLLO GUARDAVA UNA RIGA SOLA. `this.toast(` a capo e il
      messaggio sulla riga dopo passavano: quattro messaggi — uno in
      Configurazione, tre in Stampa etichette — uscivano con la scritta
      `<svg class="ico"…>` davanti, perche' `toast` scrive con `textContent`
      (`ui/feedback.ts`). Quattro versioni, nessuno l'ha segnalato: un
      riscontro sbagliato si legge di sfuggita.

   2. UN'ICONA DENTRO UN `<option>` NON SI DISEGNA MAI. Il parser HTML in
      «in select» butta via i tag che non sono di una tendina: l'icona
      spariva e restava un doppio spazio. Verificato in browser: il DOM
      tiene l'`<svg>` e il `label` reso e' solo testo.

   Il controllo legge il LETTERALE che segue il richiamo, non la riga: cosi'
   non conta quante volte si va a capo, e non sbaglia su un `title:` che sta
   accanto a un campo HTML dove l'icona ci va davvero. */

/** Il letterale di stringa o modello che comincia a `da`, virgolette
    comprese. Torna '' se li' non ne comincia uno. */
const BARRA = String.fromCharCode(92);

function letteraleDa(testo, da) {
  let i = da;
  while (i < testo.length && /\s/.test(testo[i])) i++;
  const apre = testo[i];
  if (apre !== '`' && apre !== "'" && apre !== '"') return '';
  const inizio = i;
  let annidati = 0;
  for (i++; i < testo.length; i++) {
    const c = testo[i];
    if (c === BARRA) { i++; continue; }   // la barra rovesciata, che sfugge il carattere dopo
    if (apre === '`' && c === '$' && testo[i + 1] === '{') { annidati++; i++; continue; }
    if (apre === '`' && c === '}' && annidati > 0) { annidati--; continue; }
    if (c === apre && annidati === 0) return testo.slice(inizio, i + 1);
    if (apre !== '`' && c === '\n') return testo.slice(inizio, i);
  }
  return testo.slice(inizio);
}

function sorgentiTs(radice) {
  const out = [];
  (function raccogli(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) raccogli(p);
      else if (/\.ts$/.test(e.name)) out.push(p);
    }
  })(path.join(radice, 'src'));
  return out;
}

const rigaDi = (testo, i) => testo.slice(0, i).split('\n').length;

test('nessuna icona nel messaggio di un riscontro, nemmeno se va a capo', () => {
  /* I punti che scrivono con `textContent`. `Dialog.kv` prende una lista di
     coppie: li' il letterale che segue e' la prima chiave, e basta. */
  const scrive = /\.toast\(|\.textContent\s*=\s*|\bmessage:\s*|\btitle:\s*/g;
  const guai = [];
  for (const file of sorgentiTs(RADICE)) {
    const testo = fs.readFileSync(file, 'utf8');
    for (const m of testo.matchAll(scrive)) {
      const lett = letteraleDa(testo, m.index + m[0].length);
      if (/_ico\(/.test(lett)) {
        guai.push(`${path.relative(RADICE, file).split(path.sep).join('/')}:${rigaDi(testo, m.index)} — ${m[0].trim()}`);
      }
    }
  }
  expect(guai).toEqual([]);
});

test('nessuna icona dentro un <option>: la tendina la butta via', () => {
  const guai = [];
  for (const file of sorgentiTs(RADICE)) {
    const testo = fs.readFileSync(file, 'utf8');
    for (const m of testo.matchAll(/<option\b[\s\S]*?<\/option>/g)) {
      const corpo = m[0].slice(m[0].indexOf('>') + 1);
      if (/_ico\(/.test(corpo)) {
        guai.push(`${path.relative(RADICE, file).split(path.sep).join('/')}:${rigaDi(testo, m.index)}`);
      }
    }
  }
  expect(guai).toEqual([]);
});

/* LA TERZA STRADA PER CUI UN'ICONA ESCE COME TESTO — 2.29.2
   Trovata a video da Andrea nella scheda Archivio, e su OGNI Cartello NC.

   Le due prove qui sopra guardano i punti che scrivono con `textContent` e
   l'interno degli `<option>`. Questa guarda il terzo: una stringa che si
   COSTRUISCE con `_ico()` e che poi qualcuno passa a `_esc()`. `_esc` fa
   esattamente il suo mestiere — scappa il markup perché quella stringa porta
   testo che arriva dal database — e il risultato a video è
   `<svg class="ico" aria-hidden="true"...` scritto per esteso.

   NON SI RISOLVE TOGLIENDO `_esc`. In `archivio.ts` il campo `sub` porta
   ubicazione, motivo e operatore: costruirlo già scappato vorrebbe dire che
   ogni produttore si ricorda di scappare i suoi pezzi, e il prossimo scritto
   fra un mese se ne dimentica. L'escape resta in un punto solo. Quel che non
   ci sta è l'icona.

   COME GUARDA. Raccoglie i nomi — proprietà o variabili — il cui letterale di
   modello contiene `_ico(`, e poi cerca `_esc(quel nome)` nello stesso file.
   Segue le parentesi graffe annidate invece di fermarsi al primo backtick,
   altrimenti un `${a ? `x` : `y`}` dentro il valore chiuderebbe il letterale
   troppo presto e i nomi lunghi sfuggirebbero.

   Verificata rimettendo il difetto: con l'`_ico('map-pin')` al suo posto
   dentro `sub`, questa prova diventa rossa e nomina file, riga e campo. */
/* La barra rovescia scritta col suo codice: un letterale `'\\'` dentro questo
   file e' passato per troppe mani — script di modifica, heredoc, editor — e
   ognuna puo' mangiarne una. Il codice 92 non se lo mangia nessuno. */
const ROVESCIA = String.fromCharCode(92);

function nomiCostruitiConIcona(testo) {
  const nomi = new Set();
  const assegna = /(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=|([A-Za-z_$][\w$]*)\s*:)\s*`/g;
  for (const m of testo.matchAll(assegna)) {
    let i = m.index + m[0].length - 1;   // il backtick di apertura
    let liv = 0, j = i + 1;
    while (j < testo.length) {
      const c = testo[j];
      if (c === ROVESCIA) { j += 2; continue; }
      if (c === '`' && liv === 0) break;
      if (testo.startsWith('${', j)) { liv++; j += 2; continue; }
      if (c === '}' && liv) liv--;
      j++;
    }
    if (testo.slice(i, j).includes('_ico(')) nomi.add(m[1] || m[2]);
  }
  return nomi;
}

test('nessuna icona in una stringa che poi passa da _esc', () => {
  const guai = [];
  for (const file of sorgentiTs(RADICE)) {
    const testo = fs.readFileSync(file, 'utf8');
    const nomi = nomiCostruitiConIcona(testo);
    if (!nomi.size) continue;
    for (const m of testo.matchAll(/_esc\(\s*([A-Za-z_$][\w$.]*)\s*\)/g)) {
      const base = m[1].split('.').pop();
      if (nomi.has(base)) {
        const rel = path.relative(RADICE, file).split(path.sep).join('/');
        guai.push(`${rel}:${rigaDi(testo, m.index)} — _esc(${m[1]}), e «${base}» è costruito con _ico()`);
      }
    }
  }
  expect(guai, guai.join('\n')).toEqual([]);
});

/* LA QUARTA STRADA — 2.29.2, e la piu' grossa delle quattro.
   Trovata a video nello stesso giro dell'Archivio, in Configurazione →
   Anagrafica Articoli: i pulsanti Modifica ed Elimina mostravano
   `<svg class="ico" role="img" aria-label="Modifica">...` scritto per esteso
   su TUTTE E 11.181 LE RIGHE. Lo stesso sul pulsante di stampa del registro.

   La causa e' `_h`, il costruttore di nodi di `core/utils.ts`: un figlio
   stringa lo aggiunge con `createTextNode`, che e' esattamente quel che deve
   fare — di li' passano descrizioni di articolo e motivi di quarantena, cioe'
   testo che arriva dal database. Il difetto non e' in `_h`: e' aver passato
   markup a un costruttore che tratta le stringhe come testo.

   Il rimedio e' `icoNodo` in `ui/icone.ts`, che l'icona la costruisce come
   NODO — e un nodo `_h` lo aggiunge come nodo.

   Verificata rimettendo il difetto: con `[this._ico('pencil', 'Modifica')]`
   al suo posto, questa prova diventa rossa e nomina file e riga. */
test('nessuna icona come stringa dentro _h: la aggiungerebbe come testo', () => {
  const guai = [];
  for (const file of sorgentiTs(RADICE)) {
    const testo = fs.readFileSync(file, 'utf8');
    /* Il figlio di `_h` e' il terzo argomento, quasi sempre un elenco fra
       parentesi quadre. Si guarda quello, non tutta la chiamata: `_h('span',
       { title: qualcosa }, [...])` puo' avere `_ico` in un attributo, e li'
       il markup non ci arriva mai. */
    for (const m of testo.matchAll(/\[\s*(?:this\.)?_ico\(/g)) {
      const rel = path.relative(RADICE, file).split(path.sep).join('/');
      guai.push(`${rel}:${rigaDi(testo, m.index)} — _ico() come figlio: serve icoNodo()`);
    }
  }
  expect(guai, guai.join('\n')).toEqual([]);
});
