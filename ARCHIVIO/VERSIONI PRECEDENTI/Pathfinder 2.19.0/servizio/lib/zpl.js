'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   PATHFINDER — L'ETICHETTA IN ZPL — 2.19
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Entrano un record di giacenza (o un'unita' di carico), una stampante e un
   layout; esce una stringa ZPL. Nessun socket, nessun database, nessuno
   stato: quel che questo file produce si legge in un collaudo senza avere
   una stampante sotto, ed e' la ragione per cui sta separato da
   `stampa-zebra.js`, che invece il socket lo apre.

   PERCHE' LO ZPL LO SCRIVE IL SERVIZIO E NON IL CLIENT. Due ragioni, e
   nessuna e' di comodo. La prima: l'etichetta deve dire quel che sta a
   database, non quel che il browser dichiara. In regime GMP un'etichetta e'
   un documento, e un documento costruito dal client si falsifica scrivendo
   in una console. La seconda: l'indirizzo della stampante non deve mai
   arrivare dalla richiesta — il perche' sta in `stampa-zebra.js`.

   LE BARRE LE DISEGNA IL FIRMWARE. `^BC` e' il Code128 della stampante:
   `src/modules/code128.ts` resta quello che disegna l'SVG per l'A4 e non
   viene duplicato qui. La cifra di controllo non si riscrive due volte — la
   calcola la testina — e cio' che deve coincidere fra le due strade e' la
   sola stringa codificata, che e' `item_key` oppure `udc_id`.

   NON E' UN GS1-128, come non lo e' l'A4, e per la stessa ragione — voce 24.
   Il giorno che le etichette escono dal cancello si estende `^BC` con FNC1 e
   `(00)`, e si estende ANCHE `code128.ts`: due strade che codificano cose
   diverse sullo stesso pallet sono due verita'.

   MISURE IN MILLIMETRI; I PUNTI ESISTONO SOLO QUI DENTRO. §8: i documenti di
   stampa stanno in `pt` e `mm`. Chi configura ragiona in millimetri, la
   conversione in punti la fa `puntiPerMm`, e dipende dalla testina.

   COSA QUESTO FILE NON MANDA MAI ALLA STAMPANTE: `^MN` (tipo di supporto),
   `^MM` (strappo, spellicolatore, taglierina), `^MD` (calore), `^JUS`
   (salvataggio permanente). Sono la configurazione della MACCHINA, si fanno
   una volta col pannello e valgono per tutti. Il giorno che Pathfinder li
   spedisce a ogni etichetta, Pathfinder possiede la configurazione delle
   stampanti — e non deve.

   Collaudato da fermo in `server/test/collaudo-stampa.js`.
   ═══════════════════════════════════════════════════════════════════════ */

const MM_PER_POLLICE = 25.4;

/* Il margine bianco su tutti e quattro i lati, e lo spazio fra una riga e la
   successiva. Sono i due numeri che tengono il testo lontano dal bordo del
   supporto: una testina non stampa mai fino all'ultimo millimetro, e un dato
   tagliato a meta' su un'etichetta e' un dato che qualcuno legge male. */
const MARGINE_MM = 3;
const INTERLINEA_MM = 1;

/* La riga in chiaro che `^BC` stampa sotto le barre non entra nell'altezza
   dichiarata del simbolo: la aggiunge la testina, e se non la si tiene da
   conto il campo successivo ci finisce sopra. Tre millimetri e mezzo sono la
   misura del font di serie a 203 dpi con un po' d'aria. */
const INTERPRETAZIONE_MM = 3.5;

/* LA DIMENSIONE X MINIMA DI UN CODE128, IN MILLIMETRI.

   Sotto questa larghezza di modulo il simbolo si stampa lo stesso e non lo
   legge nessuno: le barre si fondono al primo calo di calore o alla prima
   etichetta un po' storta. 0,25 mm e' il valore che le linee guida GS1 danno
   come minimo per la scansione in magazzino — sotto si scende solo sapendo
   cosa si sta facendo, e qui non lo si fa.

   §8 lo dice gia' per l'A4: stampare l'etichetta senza barre e dirlo e'
   meglio che stampare barre che nessun lettore legge. Qui la regola diventa
   un rifiuto, perche' su un'etichetta termica non c'e' un ripiego a video. */
const MODULO_MINIMO_MM = 0.25;

/** Quanti punti stampa la testina in un millimetro. */
function puntiPerMm(dpi) {
  const d = Number(dpi);
  if (!Number.isFinite(d) || d <= 0) throw new Error('dpi non valido');
  return d / MM_PER_POLLICE;
}

/** Millimetri in punti, arrotondati: un punto e' l'unita' minima della
    testina e mezzo punto non esiste. */
function punti(mm, dpi) {
  return Math.round(Number(mm) * puntiPerMm(dpi));
}

/* La larghezza di modulo piu' piccola che resta sopra il minimo di
   scansione: 2 punti a 203 dpi (0,25 mm), 3 a 300 (0,254 mm). Sotto non si
   scende, sopra si sale solo se il codice ci sta lo stesso. */
function moduloMinimo(dpi) {
  return Math.max(1, Math.ceil(MODULO_MINIMO_MM * puntiPerMm(dpi)));
}

/* ── I QUATTRO CARATTERI CHE ROMPONO UNO ZPL ──────────────────────────────

   `^` e `~` aprono un comando, `\` e `_` sono indicatori di escape. Una
   descrizione d'articolo che ne contenga uno — e l'anagrafica arriva da SAGE
   X3, dove nessuno ha promesso niente — non stampa un carattere storto:
   spezza il campo, e da li' in poi la testina legge come comandi i byte del
   testo. E' la stessa famiglia di difetti dell'iniezione SQL, su un altro
   linguaggio.

   Si risolve con `^FH`, che accende gli escape esadecimali per il campo
   successivo: `_5E` e' un accento circonflesso e non un comando. Il testo
   resta quello che era — nessun carattere sparisce e nessuno viene
   sostituito con un simile — e questo conta, perche' un'etichetta GMP che
   riscrive in silenzio il dato che porta e' peggio di una che non esce.

   Gli accenti passano come sono: `^CI28` mette la testina in UTF-8, e il
   socket scrive UTF-8. */
const FUGA = { _: '_5F', '^': '_5E', '~': '_7E', '\\': '_5C' };

function testoZpl(v) {
  return String(v ?? '')
    /* A capo e tabulazioni non hanno senso dentro un campo a riga singola, e
       dentro un `^FB` li rende il blocco: diventano spazi. */
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[_^~\\]/g, (c) => FUGA[c])
    .trim();
}

/* ── I DATI CHE UN'ETICHETTA PUO' PORTARE ─────────────────────────────────

   Un campo qui dentro e' una cosa che il servizio sa leggere da un record di
   giacenza. Chi configura sceglie QUALI, in che ordine e quanto grandi; non
   puo' inventarne uno che non c'e', ed e' il motivo per cui questa tabella
   sta nel codice e il layout sta nei dati. */

/** `2027-03-15` diventa `15/03/2027`. Una data che non e' una data resta
    com'e': su un'etichetta un dato incomprensibile va mostrato, non nascosto. */
function dataIT(iso) {
  const v = String(iso ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

/* Le cinque unita' di `src/modules/misure.ts`, e quali di esse sono un peso.
   La differenza serve a UNA cosa: come si intitola la riga. Scrivere «Peso»
   sopra un numero di pezzi e' una bugia stampata, e un'etichetta si legge
   per mesi. */
const UNITA_DI_PESO = new Set(['KG', 'GR']);

/* Gli stessi decimali di `UNITA_MISURA` sul client: PZ e GR a numero intero,
   il resto a tre. Un peso stampato con quindici decimali non e' piu' preciso,
   e' solo illeggibile. */
const DECIMALI = { PZ: 0, GR: 0, MT: 3, LT: 3, KG: 3 };

/* Quantita' in UM, scritta all'italiana. Il separatore delle migliaia si
   chiede sempre: un magazzino conta a colli da mille, e l'italiano di CLDR a
   quattro cifre non lo mette da solo. E' la stessa regola di
   `formattaQuantita` sul client, e per la stessa ragione. */
function quantitaIT(n, uom) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  const dec = DECIMALI[String(uom ?? '').toUpperCase()] ?? 3;
  return v.toLocaleString('it-IT', { maximumFractionDigits: dec, useGrouping: true });
}

const CAMPI = {
  articolo: {
    etichetta: 'Codice articolo',
    valore: (d) => d.article_code,
  },
  descrizione: {
    etichetta: 'Descrizione',
    valore: (d) => d.article_description,
  },
  /* Il simbolo porta `item_key`, cioe' `ARTICOLO#LOTTO`: e' esattamente la
     stringa che le maschere di Movimenta cercano, ed e' la stessa che
     l'etichetta A4 mette nel suo SVG. Chi passa il lettore ritrova la riga. */
  barcode: {
    etichetta: 'Codice a barre',
    barre: true,
    valore: (d) => d.item_key,
  },
  lotto: {
    etichetta: 'Lotto',
    prefisso: 'Lotto ',
    valore: (d) => d.lot_code,
  },
  scadenza: {
    etichetta: 'Scadenza',
    prefisso: 'Scad. ',
    valore: (d) => dataIT(d.expiry_date),
  },
  /* IL «PESO» E' LA QUANTITA' IN UNITA' DI MISURA, e si intitola per quello
     che e'. Su un articolo in KG o GR la riga dice «Peso», su uno in PZ, MT o
     LT dice «Quantita'»: il numero e' lo stesso campo — `qty_uom` — ma il
     nome sopra cambia, perche' un'etichetta che chiama peso dei pezzi manda
     fuori strada chi la legge sei mesi dopo.

     Riga vuota quando l'unita' non c'e': una parte dell'anagrafica non la
     porta ancora (voce 52), e un peso senza unita' non e' un peso. */
  peso: {
    etichetta: 'Peso / quantità in UM',
    valore: (d) => {
      const uom = String(d.uom ?? '').toUpperCase();
      if (!uom) return '';
      const n = quantitaIT(d.qty_uom, uom);
      if (!n) return '';
      return `${UNITA_DI_PESO.has(uom) ? 'Peso' : 'Quantità'} ${n} ${uom}`;
    },
  },
  colli: {
    etichetta: 'Colli',
    prefisso: 'Colli ',
    valore: (d) => (Number.isFinite(Number(d.qty)) ? String(Number(d.qty)) : ''),
  },
  /* L'UNICO CAMPO CHE INVECCHIA, e per questo si intitola da se'. §8: un
     pallet si sposta, e un'ubicazione stampata resta incollata alla merce a
     dire una cosa che non e' piu' vera. Chi lo accende deve sapere cosa
     accende, ed e' spento di serie. */
  ubicazione: {
    etichetta: 'Ubicazione (invecchia)',
    prefisso: 'Ub. alla stampa: ',
    valore: (d) => d.location_code,
  },
};

/** I campi che una riga di layout puo' nominare. Il client li usa per
    disegnare la scheda di configurazione: l'elenco sta qui una volta sola. */
const CAMPI_AMMESSI = Object.keys(CAMPI);

/* ── IL LAYOUT DI SERIE ───────────────────────────────────────────────────
   I quattro dati che l'etichetta della merce deve portare — barre,
   descrizione, scadenza, peso — piu' i due che la rendono leggibile senza
   lettore: il codice articolo in testa e il lotto. Colli e ubicazione
   esistono e nascono spenti.

   TARATO SUL SUPPORTO VERO: adesive staccate 100 x 80. Occupa 68,5 mm degli
   80, e gli 11,5 che restano non sono spazio sprecato — su un'etichetta
   staccata il registro balla di un millimetro o due a ogni avanzamento, e un
   campo a filo del bordo e' un campo che prima o poi si taglia.

   E' lo stesso elenco di `src/modules/stampanti.ts`, che lo usa per disegnare
   la scheda di configurazione: `test/stampanti.test.js` confronta i due conti
   riga per riga, perche' due copie che divergono in silenzio sono due
   verita'. */
const LAYOUT_DI_SERIE = Object.freeze({
  righe: Object.freeze([
    { campo: 'articolo',    attivo: true,  altezza_mm: 6.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'descrizione', attivo: true,  altezza_mm: 4,   allineamento: 'L', righe_testo: 2 },
    { campo: 'barcode',     attivo: true,  altezza_mm: 22,  allineamento: 'C', righe_testo: 1 },
    { campo: 'lotto',       attivo: true,  altezza_mm: 5.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'scadenza',    attivo: true,  altezza_mm: 5.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'peso',        attivo: true,  altezza_mm: 6.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'colli',       attivo: false, altezza_mm: 5,   allineamento: 'L', righe_testo: 1 },
    { campo: 'ubicazione',  attivo: false, altezza_mm: 3.2, allineamento: 'R', righe_testo: 1 },
  ]),
});

const ALLINEAMENTI = new Set(['L', 'C', 'R']);

/** Una riga di layout ripulita e completata coi valori di serie: un layout
    salvato da una versione precedente non deve far mancare le chiavi
    aggiunte dopo. E' la stessa regola di `getDocConfig` sul client. */
function leggiRiga(r) {
  const campo = String(r?.campo ?? '');
  if (!CAMPI[campo]) return null;
  const alta = Number(r?.altezza_mm);
  const quante = Math.trunc(Number(r?.righe_testo));
  return {
    campo,
    attivo: r?.attivo !== false,
    altezza_mm: Number.isFinite(alta) && alta > 0 ? alta : 4,
    allineamento: ALLINEAMENTI.has(r?.allineamento) ? r.allineamento : 'L',
    righe_testo: Number.isFinite(quante) && quante > 0 ? Math.min(quante, 4) : 1,
  };
}

/** Il layout com'e' scritto nei dati, o quello di serie se non c'e'. Un
    layout senza nemmeno una riga valida non e' un layout: si ripiega. */
function leggiLayout(salvato) {
  const righe = (Array.isArray(salvato?.righe) ? salvato.righe : [])
    .map(leggiRiga)
    .filter(Boolean);
  return righe.length ? { righe } : { righe: LAYOUT_DI_SERIE.righe.map(leggiRiga) };
}

/* ── DOVE FINISCE OGNI RIGA ───────────────────────────────────────────────

   Le righe si impilano dall'alto, ognuna occupa la sua altezza e lascia
   l'interlinea a quella dopo. Il conto sta in una funzione sua perche' lo
   fanno in due: la scheda di configurazione, per dire a chi guarda quanti
   millimetri sta occupando mentre li sceglie, e il costruttore dello ZPL,
   che deve rifiutare un layout piu' alto del supporto.

   RIFIUTARE E NON TAGLIARE. Un'etichetta troncata esce dalla stampante con
   l'aria di essere giusta e le manca l'ultima riga — che nel layout di serie
   e' il peso. Chi la incolla non ha modo di accorgersene. Un rifiuto in
   corsia e' una seccatura; un'etichetta che tace un dato e' merce con
   addosso un'informazione sbagliata, e sono due cose diverse. */
function disponi(layout, altezzaSupportoMm) {
  const righe = leggiLayout(layout).righe;
  const blocchi = [];
  let y = MARGINE_MM;
  for (const r of righe) {
    if (!r.attivo) continue;
    /* La riga in chiaro sotto le barre e' spazio che la testina occupa e che
       il layout non ha chiesto: va contata qui, o il campo dopo ci finisce
       sopra. */
    const alta = CAMPI[r.campo].barre
      ? r.altezza_mm + INTERPRETAZIONE_MM
      : r.altezza_mm * r.righe_testo;
    blocchi.push({ ...r, y_mm: y, alta_mm: alta });
    y += alta + INTERLINEA_MM;
  }
  /* L'ultima riga non lascia interlinea dietro di se', il margine di sotto
     invece c'e'. Senza righe accese l'altezza usata sono i due margini. */
  const usato = blocchi.length ? y - INTERLINEA_MM + MARGINE_MM : MARGINE_MM * 2;
  const disponibile = Number(altezzaSupportoMm);
  return {
    blocchi,
    usato_mm: Math.round(usato * 10) / 10,
    disponibile_mm: Number.isFinite(disponibile) ? disponibile : null,
    /* Il mezzo decimo di tolleranza assorbe l'arrotondamento del decimo, non
       un millimetro di troppo. */
    ci_sta: Number.isFinite(disponibile) ? usato <= disponibile + 0.05 : true,
  };
}

/* ── QUANTO E' LARGO UN CODE128 ───────────────────────────────────────────

   Serve a due cose: centrarlo, e sapere PRIMA di stamparlo se ci sta.

   Il conto e' quello del set B, l'unico che `code128.ts` scrive: start 11
   moduli, 11 per carattere, 11 di checksum, 13 di stop. E' una stima e non
   una misura — la testina puo' passare al set C su una corsa di cifre e
   venire piu' stretta — ma sbagliare per ECCESSO e' il verso giusto: al
   massimo il simbolo esce un po' piu' stretto di quanto lo spazio
   consentirebbe, mai fuori dal bordo. */
function moduliCode128(testo) {
  return 11 * (String(testo ?? '').length + 2) + 13;
}

/* ── LA COSTRUZIONE ───────────────────────────────────────────────────── */

/** Un campo di testo: posizione, font, blocco per l'allineamento e la
    mandata a capo, escape acceso, dato, fine campo. */
function campoTesto(testo, { x, y, altezza, larghezza, allineamento, righe }, dpi) {
  return `^FO${punti(x, dpi)},${punti(y, dpi)}`
       + `^A0N,${punti(altezza, dpi)},${punti(altezza, dpi)}`
       + `^FB${punti(larghezza, dpi)},${righe},0,${allineamento}`
       + `^FH^FD${testoZpl(testo)}^FS`;
}

/** Il simbolo, con la riga in chiaro sotto — che non e' un dato in piu': e'
    la rappresentazione leggibile che lo standard chiede, e lascia un numero
    da digitare a chi ha il pallet davanti quando il lettore non legge. */
function campoBarre(dato, { y, altezza, larghezzaStampa, margine }, dpi) {
  const modulo = moduloMinimo(dpi);
  const largheMm = (moduliCode128(dato) * modulo) / puntiPerMm(dpi);
  if (largheMm > larghezzaStampa) {
    throw Object.assign(new Error(
      `Il codice «${dato}» in Code128 occupa ${largheMm.toFixed(1)} mm e sull'etichetta `
      + `ce ne sono ${larghezzaStampa.toFixed(1)}: alla larghezza minima di modulo non ci sta. `
      + 'Serve un supporto piu’ largo, o un codice piu’ corto.'), { status: 422 });
  }
  const x = margine + Math.max(0, (larghezzaStampa - largheMm) / 2);
  return `^BY${modulo},3,${punti(altezza, dpi)}`
       + `^FO${punti(x, dpi)},${punti(y, dpi)}`
       + `^BCN,${punti(altezza, dpi)},Y,N,N`
       + `^FH^FD${testoZpl(dato)}^FS`;
}

/** L'apertura e la chiusura, uguali per ogni etichetta. `^CI28` mette la
    testina in UTF-8, e senza quello una vocale accentata esce come un glifo
    sbagliato. `^LH0,0` azzera l'origine, perche' un'origine lasciata dov'era
    da un lavoro precedente sposta tutta l'etichetta. */
function involucro(corpo, stampante, copie) {
  const dpi = stampante.dpi;
  const n = Math.max(1, Math.trunc(Number(copie) || 1));
  return '^XA'
       + '^CI28'
       + `^PW${punti(stampante.larghezza_mm, dpi)}`
       + `^LL${punti(stampante.altezza_mm, dpi)}`
       + '^LH0,0^LT0'
       + corpo.join('')
       + `^PQ${n}`
       + '^XZ';
}

/**
 * L'etichetta della merce: una riga di giacenza, il layout scelto, la
 * stampante che la stampa. `dati` porta i campi gia' letti dal database —
 * questo file non sa cos'e' un database.
 */
function etichettaMerce(dati, stampante, layout, copie = 1) {
  const dpi = stampante.dpi;
  const margine = MARGINE_MM;
  const larghezzaStampa = stampante.larghezza_mm - margine * 2;
  const posa = disponi(layout, stampante.altezza_mm);

  if (!posa.blocchi.length) {
    throw Object.assign(new Error(
      'Il layout dell’etichetta non ha nemmeno un campo acceso: si configura in '
      + 'Configurazione → Stampanti.'), { status: 422 });
  }
  if (!posa.ci_sta) {
    throw Object.assign(new Error(
      `Il layout occupa ${posa.usato_mm} mm e l'etichetta e' alta ${stampante.altezza_mm}: `
      + 'non ci sta. Si spegne un campo o se ne riduce l’altezza in '
      + 'Configurazione → Stampanti.'), { status: 422 });
  }

  const corpo = [];
  for (const b of posa.blocchi) {
    const def = CAMPI[b.campo];
    if (def.barre) {
      const dato = String(def.valore(dati) ?? '').trim();
      /* Un simbolo che codifica il nulla si scansiona lo stesso e
         restituisce il nulla: e' la stessa regola di `_docBarcodeHTML`. */
      if (!dato) continue;
      corpo.push(campoBarre(dato, {
        y: b.y_mm, altezza: b.altezza_mm, larghezzaStampa, margine,
      }, dpi));
      continue;
    }
    const grezzo = String(def.valore(dati) ?? '').trim();
    /* Una riga senza dato non lascia un buco: lo spazio l'ha gia' preso
       `disponi`, e riempirlo con un trattino vorrebbe dire stampare
       un'assenza. La riga esce vuota e il resto resta dov'era — che e'
       quel che serve perche' due etichette dello stesso articolo si leggano
       nello stesso posto. */
    if (!grezzo) continue;
    corpo.push(campoTesto((def.prefisso || '') + grezzo, {
      x: margine, y: b.y_mm, altezza: b.altezza_mm,
      larghezza: larghezzaStampa, allineamento: b.allineamento,
      righe: b.righe_testo,
    }, dpi));
  }

  return involucro(corpo, stampante, copie);
}

/**
 * L'etichetta dell'unita' di carico.
 *
 * NON HA UN LAYOUT, ED E' UNA DECISIONE. §8: «un'etichetta porta solo quello
 * che non invecchia, e sull'UDC l'unico dato che non invecchia e' il numero,
 * che non si riusa mai». Un pallet porta N righe di N articoli diversi:
 * descrizione, scadenza e peso non sono nemmeno definiti per un'unita' di
 * carico, e la prima volta che qualcuno ci carica sopra una seconda partita
 * quel che c'e' scritto diventa falso — incollato al legno, e letto da chi
 * passa. Tutto il resto lo dice il sistema, che lo sa adesso e non alla
 * stampa.
 *
 * Quel che si configura e' il SUPPORTO — larghezza, altezza, dpi — che sta
 * sulla stampante. Il contenuto no.
 */
function etichettaUdc(udc, stampante, copie = 1) {
  const dpi = stampante.dpi;
  const margine = MARGINE_MM;
  const larghezzaStampa = stampante.larghezza_mm - margine * 2;
  const codice = String(udc?.udc_id ?? '').trim();
  if (!codice) {
    throw Object.assign(
      new Error('Unità di carico senza codice: non c’è niente da stampare'),
      { status: 422 });
  }

  /* Le barre al centro dell'etichetta con aria intorno, e sotto la sola riga
     che dice di che forma e' il codice. La zona di rispetto del simbolo se la
     disegna il modulo; questa e' quella del muletto. I sei millimetri sono la
     riga della forma piu' la sua interlinea. */
  const CODA_MM = 6;
  const utile = stampante.altezza_mm - margine * 2;
  const altezzaBarre = Math.max(8, utile - INTERPRETAZIONE_MM - CODA_MM);
  const yBarre = margine + Math.max(0,
    (utile - (altezzaBarre + INTERPRETAZIONE_MM + CODA_MM)) / 2);

  const corpo = [
    campoBarre(codice, { y: yBarre, altezza: altezzaBarre, larghezzaStampa, margine }, dpi),
    campoTesto(udc?.sscc ? 'SSCC (GS1)' : 'Codice interno', {
      x: margine, y: yBarre + altezzaBarre + INTERPRETAZIONE_MM + 1,
      altezza: 3, larghezza: larghezzaStampa, allineamento: 'C', righe: 1,
    }, dpi),
  ];
  return involucro(corpo, stampante, copie);
}

/**
 * L'etichetta di prova: dice chi e' la stampante e che il collegamento c'e'.
 * Non porta dati di magazzino di proposito — una prova che stampa merce vera
 * e' un'etichetta vera che gira per il reparto senza merce sotto.
 */
function etichettaProva(stampante) {
  const dpi = stampante.dpi;
  const margine = MARGINE_MM;
  const larghezza = stampante.larghezza_mm - margine * 2;
  const riga = (testo, y, alta) => campoTesto(testo, {
    x: margine, y, altezza: alta, larghezza, allineamento: 'C', righe: 1,
  }, dpi);
  return involucro([
    riga('PATHFINDER — PROVA DI STAMPA', margine, 4),
    riga(String(stampante.nome || stampante.printer_id || ''), margine + 6, 3.2),
    riga(`${stampante.host}:${stampante.porta} · ${dpi} dpi`, margine + 10.5, 3),
    riga(`${stampante.larghezza_mm} × ${stampante.altezza_mm} mm`, margine + 14.5, 3),
    riga(new Date().toLocaleString('it-IT'), margine + 18.5, 2.8),
  ], stampante, 1);
}

module.exports = {
  etichettaMerce, etichettaUdc, etichettaProva,
  disponi, leggiLayout, testoZpl, punti, puntiPerMm, moduloMinimo, moduliCode128,
  CAMPI, CAMPI_AMMESSI, LAYOUT_DI_SERIE,
  MARGINE_MM, INTERLINEA_MM, INTERPRETAZIONE_MM, MODULO_MINIMO_MM,
};
