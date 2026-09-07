/* LE OTTO MISURE DELLO STILE — 2.23
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Qui si MISURA, e basta. Il giudizio — quanti sono tollerati oggi — sta in
   `stileCoerente.dati.js`, e il confronto in `stileCoerente.test.js`. Sono
   separati apposta: la misura non cambia mentre il lavoro procede, il numero
   tollerato scende a ogni blocco, e chi legge il diff vede subito quale dei
   due si è mosso.

   Si legge il sorgente. Qui non c'è un DOM, ed è la strada che questo
   progetto ha già preso con `emojiVestite`, `registro-completo` e
   `superficie-app`. */
import fs from 'node:fs';
import path from 'node:path';

export const RADICE = path.resolve(import.meta.dirname, '..');

/** LE NOVE VISTE CHE STANNO DAVANTI A UN VANO.

    Non sono «le viste operative» in senso largo: sono quelle in cui qualcuno
    è in piedi davanti a uno scaffale, scansiona un codice e conferma un
    gesto. `spedizioni` compila una testata da scrivania e `campionamento`
    sceglie da un elenco: fanno un altro mestiere. */
export const VISTE_A_SCAFFALE = [
  'caricoSpedizione', 'inventario', 'percorso', 'posiziona', 'prelievo',
  'prodottoFinito', 'quarantena', 'smaltimento', 'udc',
];

/** LE CINQUE IN CUI IL SISTEMA DICE DOVE ANDARE.

    È il sottoinsieme che ha diritto alla scheda della tappa, e la differenza
    non è di forma: la scheda si apre col VANO grande in monospaziato, perché
    quella è la domanda con cui comincia il gesto — dove devo andare.

    Nelle altre quattro il vano non lo sa il sistema: lo DECIDE l'operatore.
    In `posiziona` sceglie dove mettere la merce, in `prodottoFinito` dove ha
    posato il bancale, in `prelievo` quale riga prendere da una ricerca, e
    `udc` lavora dentro dei modali. Metterci una scheda che annuncia un vano
    vorrebbe dire scrivere in grande un dato che ancora non esiste — e su una
    schermata di magazzino un dato in grande si crede.

    Perciò questa lista è cinque e non nove. È un restringimento dichiarato di
    quello che il piano diceva all'inizio, non una svista. */
export const VISTE_CON_TAPPA = [
  'caricoSpedizione', 'inventario', 'percorso', 'quarantena', 'smaltimento',
];

/* Frecce e simboli che restano testo: congiunzioni tipografiche dentro la
   banda del flusso e marcatori di riga dentro tabelle dense. Da icone
   peserebbero più di quel che accompagnano — la regola è quella che
   `emojiVestite.test.js` teneva già per `↔ ▶ ↩`. */
const RESTANO_TESTO = new Set([...'→↔↩↺↻↷↳←↑↓↥↧➜★▶']);
const PITTOGRAMMI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/gu;

export function sorgenti(dir, estensioni = /\.(ts|js)$/) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sorgenti(p, estensioni));
    else if (estensioni.test(e.name)) out.push(p);
  }
  return out;
}

export const rel = (p) => path.relative(RADICE, p).replace(/\\/g, '/');
const leggi = (p) => fs.readFileSync(p, 'utf8');

/** Toglie i commenti. Grezzo di proposito: serve a separare la PROSA dal
    MARKUP, non a compilare. Un'emoji in un commento è una frase, e si
    riscrive quando si riscrive la frase. */
export function soloMarkup(testo) {
  return testo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length))
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Conta per file, saltando i file a zero: un elenco di zeri è rumore. */
function perFile(files, conta) {
  const out = {};
  for (const f of files) {
    const n = conta(leggi(f), f);
    if (n) out[rel(f)] = n;
  }
  return out;
}

const VISTE = () => sorgenti(path.join(RADICE, 'src', 'ui'));
const TUTTO_SRC = () => [...sorgenti(path.join(RADICE, 'src')), path.join(RADICE, 'index.html')];
const FOGLI = () => sorgenti(path.join(RADICE, 'src', 'styles'), /\.css$/);

/* ═══ 1 · Ogni variante citata esiste ═══════════════════════════════════
   `badge-success` non è mai esistito: usciva un badge grigio, e lo stato del
   bancale non si distingueva da quello accanto. Un nome di classe sbagliato
   non è un errore per nessuno — non per il compilatore, non per il browser,
   non per un collaudo che guarda il DOM. */
export function variantiFantasma() {
  const definite = new Set();
  for (const f of FOGLI()) {
    for (const m of leggi(f).matchAll(/\.((?:badge|btn|mov-preview|route)-[a-z0-9-]+)\b/g)) {
      definite.add(m[1]);
    }
  }
  const fuori = [];
  for (const f of TUTTO_SRC()) {
    for (const m of soloMarkup(leggi(f)).matchAll(/class="([^"$]*)"/g)) {
      for (const c of m[1].split(/\s+/)) {
        if (/^(badge|btn|mov-preview)-/.test(c) && !definite.has(c)) fuori.push(`${rel(f)} — ${c}`);
      }
    }
  }
  return [...new Set(fuori)].sort();
}

/* ═══ 2 · Nessun pittogramma nel markup ═════════════════════════════════ */
export function emojiNelMarkup() {
  return perFile(TUTTO_SRC(), (t) =>
    [...soloMarkup(t).matchAll(PITTOGRAMMI)].filter((m) => !RESTANO_TESTO.has(m[0])).length);
}

/* ═══ 3 · I raggi vanno per numero ══════════════════════════════════════
   `rounded-1`…`rounded-7` esistono già nel tema: `rounded-[var(--radius-md)]`
   è più lungo dello `style=` che ha sostituito, e rimette un valore dove il
   tema aveva messo un nome. */
export function raggiArbitrari() {
  return perFile(TUTTO_SRC(), (t) => (soloMarkup(t).match(/\brounded-\[[^\]]*\]/g) || []).length);
}

/* ═══ 4 · Nessuna misura e nessun colore scritti a mano ═════════════════
   §8: «Nessun `font-size` fuori dai token MD3», e la tavolozza di serie è
   spenta perché un colore che il sistema non ha non deve compilare. */
export function misureEColoriAMano() {
  return perFile(TUTTO_SRC(), (t) =>
    (soloMarkup(t).match(/\btext-\[(?:#|[0-9])[^\]]*\]/g) || []).length);
}

/* ═══ 5 · Nessun token dichiarato due volte ═════════════════════════════
   NON si contano gli USI di `--sx-*`: sono 583, e non sono un difetto. I nomi
   restano, e restano comodi — riscriverli tutti sarebbe un diff illeggibile
   su regole collaudate.

   Il difetto era un altro, e stava in un posto solo. `01-tokens.css`
   dichiarava CINQUANTUNO token due volte: in cima con un valore
   (`--sx-danger: #a82c26`, `--radius: 2px`) e più in basso come rimando ai
   ruoli M3 (`#BA1A1A`, `4px`). Vince chi viene dopo, quindi le dichiarazioni
   in cima erano MORTE: non disegnavano niente — ma erano quelle che si
   leggevano aprendo il file, e quelle che si sarebbero cambiate volendo
   cambiare una tinta o stringere un angolo.

   Non è una questione di stile: è un file che mente a chi lo legge. */
export function dichiarazioniMorte() {
  return perFile(FOGLI(), (t) => {
    /* Fuori dai commenti, e fuori da `@media`: là dentro la stessa proprietà
       a due larghezze diverse è il mestiere di un foglio di stile. */
    const nudo = t.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@(media|supports|container)[^{]*\{[\s\S]*?\n\}/g, '');
    const visti = new Map();
    for (const m of nudo.matchAll(/^[ \t]*(--[a-z0-9-]+):[^;]*;/gm)) {
      visti.set(m[1], (visti.get(m[1]) || 0) + 1);
    }
    return [...visti.values()].filter((n) => n > 1).length;
  });
}

/* ═══ 6 · La scheda della tappa è una ═══════════════════════════════════
   Quattro viste ce l'avevano dalla 2.5; `caricoSpedizione` no, e mostrava la
   tappa da fare come una RIGA DI TABELLA in mezzo a quelle già fatte — su un
   giro da otto bancali, chi carica doveva cercarsela. */
export function senzaSchedaDiTappa() {
  const senza = [];
  for (const v of VISTE_CON_TAPPA) {
    const f = path.join(RADICE, 'src', 'ui', 'views', `${v}.ts`);
    if (!leggi(f).includes('route-stop-card')) senza.push(v);
  }
  return senza.sort();
}

/* ═══ 7 · Il gesto che chiude ha una forma sola ═════════════════════════
   Oggi ne ha otto, e su sei schermate su nove il pulsante di conferma resta
   a 40px: `.btn` MD3 dichiara `min-height: 40px` e `p-5.5` non arriva a 48.
   Col guanto quella differenza si sente. */
export function senzaPulsanteDiConferma() {
  const senza = [];
  for (const v of VISTE_A_SCAFFALE) {
    const f = path.join(RADICE, 'src', 'ui', 'views', `${v}.ts`);
    if (!leggi(f).includes('btn-conferma')) senza.push(v);
  }
  return senza.sort();
}

/* ═══ 8 · Nessun selettore dichiarato due volte ═════════════════════════
   146 selettori hanno due definizioni: quella di base e quella del blocco
   «MD3 REFINEMENTS» che le sta sopra. Per sapere com'è fatto un componente
   bisogna leggere due punti del file, e `.form-group label` dice
   `text-transform: uppercase` in un posto e `none` nell'altro.

   Le ridichiarazioni dentro `@media` non contano: quelle sono la stessa
   regola a un'altra larghezza, ed è il mestiere di un foglio di stile. */
export function selettoriDoppi() {
  const out = {};
  for (const f of FOGLI()) {
    const testo = leggi(f);
    const visti = new Map();
    let profonditaMedia = 0;
    let profondita = 0;
    for (const riga of testo.split('\n')) {
      const nudo = riga.replace(/\/\*.*?\*\//g, '');
      const apre = (nudo.match(/\{/g) || []).length;
      const chiude = (nudo.match(/\}/g) || []).length;
      if (/^\s*@(media|supports|container)/.test(nudo)) profonditaMedia = profondita + 1;
      const sel = /^\s*([.#][a-zA-Z][^{,]*?)\s*\{\s*$/.exec(nudo);
      if (sel && !profonditaMedia) {
        const chiave = sel[1].trim();
        visti.set(chiave, (visti.get(chiave) || 0) + 1);
      }
      profondita += apre - chiude;
      if (profonditaMedia && profondita < profonditaMedia) profonditaMedia = 0;
    }
    const doppi = [...visti.values()].filter((n) => n > 1).length;
    if (doppi) out[rel(f)] = doppi;
  }
  return out;
}

/* ═══ 9 · Ogni soglia è dichiarata ══════════════════════════════════════
   `@media` non accetta una variabile CSS, quindi una sorgente unica vera non
   esiste: quel che si può avere è un ELENCO SOLO — quello in `00-tailwind.css`
   — e un collaudo che rifiuta una larghezza che non ci sia passata.

   Fino alla 2.22 il tema ne dichiarava sei e i fogli ne usavano undici:
   cinque larghezze vivevano solo dentro una `@media`, e chi cercava «a che
   punto l'interfaccia cambia forma» doveva leggere quattromila righe. */
export function soglieNonDichiarate() {
  const tema = leggi(path.join(RADICE, 'src', 'styles', '00-tailwind.css'));
  const dichiarate = new Set();
  for (const m of tema.matchAll(/^[ \t]*--breakpoint-[\w-]+:\s*([\d.]+rem)\s*;/gm)) {
    dichiarate.add(parseFloat(m[1]));
  }
  /* Le due soglie di sistema non sono larghezze e non stanno nel tema. */
  const NON_SONO_LARGHEZZE = /prefers-|print|forced-colors|hover|pointer/;
  const fuori = [];
  for (const f of FOGLI()) {
    const t = leggi(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of t.matchAll(/@media([^{]*)/g)) {
      if (NON_SONO_LARGHEZZE.test(m[1])) continue;
      for (const w of m[1].matchAll(/(?:max|min)-width:\s*([\d.]+)(px|rem)/g)) {
        const rem = w[2] === 'px' ? parseFloat(w[1]) / 16 : parseFloat(w[1]);
        if (!dichiarate.has(rem)) fuori.push(`${rel(f)} — ${w[1]}${w[2]}`);
      }
    }
  }
  return [...new Set(fuori)].sort();
}

/* ═══ 10 · Nessun colore fuori dalle tavolozze ══════════════════════════
   Un colore scritto a mano dentro una regola è un colore che nessuno trova
   quando cerca una tinta, e che nessun tema può cambiare.

   QUATTRO ECCEZIONI, e sono quattro mestieri diversi:
   · `01-tokens.css` è il posto dove i valori DEVONO stare;
   · `@media print` e `05-pick-report.css` sono la carta, che non si migra
     (§8) e che si misura in altre unità;
   · il bianco e il nero puri, e i bianchi e neri trasparenti: non sono
     tinte, sono opacità sopra un fondo qualunque;
   · `02-dash-charts.css` porta una tavolozza CATEGORIALE, che è un altro
     mestiere da una tavolozza di stati. Una tinta di stato deve dire «va
     bene» o «guarda qui», ed è la stessa ovunque compaia; una categoriale
     deve solo distinguersi dalle altre undici in una ciambella da
     centonovantasei pixel. Le quattro che coincidevano esattamente con un
     token sono diventate rimandi nella 2.23 — quelle erano un valore
     scritto due volte. Le otto che restano sono il grafico, e stanno lì. */
export function coloriFuoriTavolozza() {
  const NEUTRI = /^(#fff|#ffffff|#000|#000000|transparent|currentColor)$/i;
  return perFile(FOGLI(), (t, f) => {
    if (/01-tokens|05-pick-report|02-dash-charts/.test(f)) return 0;
    const schermo = senzaAtRule(t.replace(/\/\*[\s\S]*?\*\//g, ''), /print/);
    let n = 0;
    for (const m of schermo.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g)) {
      const v = m[0];
      if (NEUTRI.test(v)) continue;
      /* Bianchi e neri trasparenti: veli, ombre, righe sopra una superficie.
         Non sono tinte — dicono «quanto», non «quale». */
      if (/^rgba?\(\s*(255,\s*255,\s*255|0,\s*0,\s*0)/.test(v.replace(/\s+/g, ' '))) continue;
      n++;
    }
    return n;
  });
}

/* ═══ 11 · Nessuna misura di testo scritta a mano ═══════════════════════
   §8: «Nessun `font-size` fuori dai token MD3».

   DUE ECCEZIONI. Il testo dentro un SVG con `viewBox` non è tipografia: è
   GEOMETRIA, misurata nelle unità del disegno, e portarla sulla scala in rem
   sfonderebbe il grafico. E un `calc()` su un token è ancora quel token. */
export function testoAMano() {
  return perFile(FOGLI(), (t, f) => {
    if (/05-pick-report/.test(f)) return 0;
    const schermo = senzaAtRule(t.replace(/\/\*[\s\S]*?\*\//g, ''), /print/);
    let n = 0;
    for (const m of schermo.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      if (/\.chart\b/.test(m[1])) continue;           // geometria dentro un viewBox
      for (const p of m[2].matchAll(/font-size:([^;]+);/g)) {
        const v = p[1].trim();
        if (v.startsWith('var(') || v === 'inherit' || v.startsWith('calc(')) continue;
        n++;
      }
    }
    return n;
  });
}

/** Toglie i blocchi at-rule il cui prologo passa la prova, contando le
    graffe. Una regex non golosa si ferma alla prima `}` — cioè alla fine
    della PRIMA regola dentro il blocco — e lascia dentro tutto il resto:
    è così che un conto di dodici era diventato duecentottantaquattro. */
function senzaAtRule(t, prova) {
  let out = '', i = 0;
  while (i < t.length) {
    if (t[i] === '@') {
      const fine = t.slice(i).search(/[{;]/);
      const prologo = t.slice(i, i + fine);
      if (fine > 0 && t[i + fine] === '{' && prova.test(prologo)) {
        let j = i + fine, d = 0;
        for (; j < t.length; j++) {
          if (t[j] === '{') d++;
          else if (t[j] === '}' && !--d) { j++; break; }
        }
        i = j;
        continue;
      }
    }
    out += t[i++];
  }
  return out;
}

/* ═══ 12 · La scala tipografica della stampa ═══════════════════════════
   2.27 — L'ALTRA META' DELLA MISURA 11.

   `testoAMano` esclude apposta i blocchi `print` e tutto `05-pick-report`: in
   stampa la carta si misura in punti, e un `var(--doc-fs-xs)` nasconderebbe
   il dato proprio dove il dato E' l'argomento — «sotto i 6,5 pt, in corsia,
   con un foglio in mano sotto un neon, non si legge». Quindi i punti si
   scrivono a mano, e restano a mano.

   Il prezzo di quella scelta e' che fra sei mesi nessuno sappia piu' che una
   scala esiste. Lo paga questa misura, non una variabile CSS: i gradini sono
   DICHIARATI in `stileCoerente.dati.js`, e uno nuovo — o uno che si muove —
   fa suonare `npm test` col messaggio gia' scritto. Le quattro dichiarazioni
   in linea nelle viste entrano nel conto per la stessa ragione: un punto
   scritto dentro un `style=` e' un gradino che la prossima scala si scorda.

   Il conto e' piatto — valore → quante volte — e non per file: e' la SCALA a
   essere un oggetto solo, e spezzarla per file la renderebbe illeggibile. */
export function scalaDiStampa() {
  const conti = {};
  const fonti = [...FOGLI(), ...VISTE()];
  for (const f of fonti) {
    const t = leggi(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of t.matchAll(/font-size:\s*([\d.]+)pt/g)) {
      const k = `${m[1]}pt`;
      conti[k] = (conti[k] || 0) + 1;
    }
  }
  /* In ordine di corpo: una scala si legge dal basso, non in ordine
     alfabetico, dove «10pt» verrebbe prima di «6.5pt». */
  return Object.fromEntries(Object.entries(conti).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])));
}

export const MISURE = {
  variantiFantasma,
  emojiNelMarkup,
  raggiArbitrari,
  misureEColoriAMano,
  dichiarazioniMorte,
  senzaSchedaDiTappa,
  senzaPulsanteDiConferma,
  selettoriDoppi,
  soglieNonDichiarate,
  coloriFuoriTavolozza,
  testoAMano,
  scalaDiStampa,
};
