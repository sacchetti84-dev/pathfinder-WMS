/* GENERA LO SPRITE DELLE ICONE — 2.23
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Legge `src/icone/vocabolario.json` e i .svg accanto, e riscrive in
   `index.html` il blocco fra i due marcatori. Si lancia a mano quando il
   vocabolario cambia: non è un passo della build, perché lo sprite è un file
   sorgente che si legge nel diff.

       node strumenti/genera-icone.mjs

   PERCHÉ UNO SPRITE E NON UN FONT. Un font di icone chiede un file binario,
   una @font-face e un CDN o un base64 dentro la build a file solo; e finché
   non è sceso disegna quadratini. Uno <symbol> è markup: sta nell'HTML che c'è
   già, non fa richieste, e su una rete interna senza uscita è l'unica forma
   che non può fallire a metà.

   PERCHÉ GLI ATTRIBUTI STANNO SUL <symbol> E NON SULL'<svg> DELLO SPRITE.
   `<use>` clona il symbol in uno shadow tree, e l'ereditarietà lì dentro
   riparte dall'elemento che lo usa: quel che sta sull'<svg> nascosto non
   arriva mai all'istanza disegnata. Messi sul symbol, invece, viaggiano col
   clone. Costa 110 byte per icona e non si vede nel gzip.

   E UN SELETTORE SCRITTO FUORI NON ENTRA. Vale la pena scriverlo perché è la
   trappola che si paga una volta sola: `.ico path { … }` sull'istanza di uno
   `<use>` non fa niente — sulle regole esterne il confine dello shadow tree è
   chiuso. Quel che lo attraversa è l'EREDITARIETÀ. Perciò il colore di
   un'icona si cambia con `color` sul contenitore, mai con un selettore che
   punta ai tratti. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARTELLA = path.join(RADICE, 'src', 'icone');
const PAGINA = path.join(RADICE, 'index.html');
const MODULO = path.join(RADICE, 'src', 'ui', 'icone.ts');
const APRI = '<!-- ICONE: generato da strumenti/genera-icone.mjs — non si scrive a mano -->';
const CHIUDI = '<!-- /ICONE -->';
const APRI_TS = '/* ICONE-INIZIO: generato da strumenti/genera-icone.mjs — non si scrive a mano */';
const CHIUDI_TS = '/* ICONE-FINE */';

/* Tabler disegna su griglia 24 con tratto 2 e capi tondi, e mette questi
   attributi sull'<svg> di ogni file. Qui vanno sul symbol, una volta sola.

   IL TRATTO RESTA 2, e non si assottiglia. A 1,15em su un testo da 13px il
   disegno esce a 15px, e lì un tratto sotto 1,3px scompare sul vetro sporco
   di un terminale in corsia. Chi vuole un'icona più leggera la fa più
   piccola, non più magra. */
const VIEWBOX = '0 0 24 24';
const COMUNI = 'fill="none" stroke="currentColor"'
  + ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"';
const RIPETUTI = [
  'fill="none"', 'stroke="currentColor"',
  'stroke-linecap="round"', 'stroke-linejoin="round"', 'stroke-width="2"',
];

export function nomiDelVocabolario() {
  const voc = JSON.parse(fs.readFileSync(path.join(CARTELLA, 'vocabolario.json'), 'utf8'));
  const nomi = [];
  for (const [gruppo, voci] of Object.entries(voc)) {
    if (gruppo === '_') continue;
    nomi.push(...Object.keys(voci));
  }
  return nomi;
}

function simbolo(nome) {
  const file = path.join(CARTELLA, 'svg', `${nome}.svg`);
  if (!fs.existsSync(file)) throw new Error(`manca src/icone/svg/${nome}.svg`);
  const testo = fs.readFileSync(file, 'utf8');

  if (!testo.includes(`viewBox="${VIEWBOX}"`)) throw new Error(`${nome}: viewBox non è ${VIEWBOX}`);
  /* I file Tabler si aprono con un commento di catalogo — parole chiave,
     categoria, il punto di codice del font. Nello sprite non serve. */
  const dentro = /<svg[\s\S]*?>([\s\S]*)<\/svg>/.exec(testo);
  if (!dentro) throw new Error(`${nome}: non è un SVG che questo strumento sappia leggere`);
  const corpo = dentro[1].trim();

  const tratti = corpo.match(/<(?:path|rect|circle|line|polyline|polygon|ellipse)\b[^>]*\/>/g) || [];
  /* Se rimettendo insieme i pezzi non torna il corpo, il file porta qualcosa
     che questo strumento non sa leggere — un <g>, una maschera — e tacere
     vorrebbe dire perdere un disegno per strada. */
  if (tratti.join('') !== corpo.replace(/>\s+</g, '><')) {
    throw new Error(`${nome}: contiene elementi non previsti`);
  }

  const puliti = tratti.map((t) => {
    /* Tabler ripete gli attributi comuni solo sull'<svg>, non sui tratti:
       questa passata serve alle poche icone che li riscrivono a mano. */
    const senza = RIPETUTI.reduce((s, a) => s.replaceAll(` ${a}`, ''), t);
    /* Un tratto che dichiara un `fill` suo lo tiene — è un pieno voluto, e
       senza si vedrebbe il buco. */
    return senza;
  });

  return `<symbol id="i-${nome}" viewBox="${VIEWBOX}" ${COMUNI}>${puliti.join('')}</symbol>`;
}

/** Rimette in mezzo ai due marcatori il testo nuovo, e lascia il resto dov'è.

    IL FINE RIGA È QUELLO DEL FILE, non quello di chi scrive. `.gitattributes`
    dice `* -text`: git tiene i byte come li trova, e questo repository è
    misto — `index.html` va a CRLF, `icone.ts` a LF. Uno strumento che scrive
    `\n` dentro un file CRLF cambia due righe e ne fa vedere duemila nel diff.
    Succede una volta e si perde mezz'ora a capirlo. */
function fraIMarcatori(file, apri, chiudi, dentro) {
  const testo = fs.readFileSync(file, 'utf8');
  const a = testo.indexOf(apri);
  const b = testo.indexOf(chiudi);
  if (a < 0 || b < 0) throw new Error(`in ${path.basename(file)} mancano i marcatori`);
  const aCapo = testo.includes('\r\n') ? '\r\n' : '\n';
  const nuovo = testo.slice(0, a + apri.length) + aCapo + dentro + aCapo + testo.slice(b);
  if (nuovo !== testo) fs.writeFileSync(file, nuovo);
  return nuovo !== testo;
}

/** L'elenco dei nomi, a righe da ottanta colonne come il resto dei sorgenti. */
function elencoTs(nomi) {
  const righe = [];
  let riga = ' ';
  for (const n of nomi) {
    const pezzo = ` '${n}',`;
    if ((riga + pezzo).length > 80) { righe.push(riga); riga = ' '; }
    riga += pezzo;
  }
  if (riga.trim()) righe.push(riga);
  return `export const ICONE = [\n${righe.join('\n')}\n] as const;`;
}

function principale() {
  const nomi = nomiDelVocabolario();
  const doppi = nomi.filter((n, i) => nomi.indexOf(n) !== i);
  if (doppi.length) throw new Error(`nomi ripetuti nel vocabolario: ${doppi.join(', ')}`);
  nomi.sort();

  const sprite = `<svg id="pfIcone" width="0" height="0" aria-hidden="true" focusable="false"`
    + ` style="position:absolute;overflow:hidden">${nomi.map(simbolo).join('')}</svg>`;

  const cambiaPagina = fraIMarcatori(PAGINA, APRI, CHIUDI, sprite);
  const cambiaModulo = fraIMarcatori(MODULO, APRI_TS, CHIUDI_TS, elencoTs(nomi));

  const byte = Buffer.byteLength(sprite);
  console.log(`${nomi.length} icone · ${byte.toLocaleString('it-IT')} byte nello sprite`);
  console.log(`index.html ${cambiaPagina ? 'riscritto' : 'era già a posto'}`
    + ` · src/ui/icone.ts ${cambiaModulo ? 'riscritto' : 'era già a posto'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principale();
