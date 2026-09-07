/* QUANTO SI TOLLERA OGGI — 2.23
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Questi numeri NON sono un obiettivo: sono la fotografia di com'è
   l'applicativo adesso, e la lista di lavoro dei blocchi che vengono dopo.
   Ogni blocco ne abbassa uno, e il collaudo suona nei due versi — se un
   numero sale è entrato un difetto nuovo; se scende senza che nessuno abbia
   toccato questo file, il lavoro è stato fatto e il conto va aggiornato nello
   stesso commit.

   È lo stesso patto di `superficie-app.dati.js`: NON si tocca per far tacere
   il collaudo. Si tocca quando il numero è cambiato DAVVERO.

   Chi misura è `stileCoerente.misure.js`. Chi confronta è
   `stileCoerente.test.js`.

   ─────────────────────────────────────────────────────────────────────────
   Dove finisce ciascuna, secondo il piano:

     variantiFantasma         a zero, e ci resta               — B0  fatto
     emojiNelMarkup           a zero                           — B2  fatto
     dichiarazioniMorte       a zero                           — B3  fatto
     raggiArbitrari           a zero                           — B4  fatto
     misureEColoriAMano       a zero                           — B4  fatto
     senzaSchedaDiTappa       a zero                           — B5  fatto
     senzaPulsanteDiConferma  a zero                           — B6  fatto
     selettoriDoppi           resta aperta, vedi la nota   — B7
     soglieNonDichiarate      a zero                           — C1  fatto
     coloriFuoriTavolozza     a zero                           — C3  fatto
     testoAMano               a zero                           — C4  fatto
   ───────────────────────────────────────────────────────────────────────── */

export const TOLLERATO = {

  /* Classi citate nel markup che nessun foglio definisce. `badge-success` e
     `badge-warning` in `caricoSpedizione` uscivano grigi tutti e due: un
     bancale in baia non si distingueva da uno saltato. Chiuse in B0, e da
     li' in poi questo elenco resta vuoto. */
  variantiFantasma: [],

  /* Erano 68 glifi in 680 punti. Un'emoji la disegna il sistema operativo —
     Segoe UI Emoji su Windows, Noto sul terminale Android — e non ubbidisce
     a `currentColor`. Uscite in B2. Le frecce non contano: restano testo. */
  emojiNelMarkup: {},

  /* `rounded-[var(--radius-md)]` dove il tema ha gia' `rounded-2`: piu' lungo
     dello `style=` che ha sostituito, e rimette un valore dove c'era un
     nome. */
  raggiArbitrari: {},

  /* `text-[1.4rem]` e `text-[#999]`. §8: nessun `font-size` fuori dai token
     MD3, e la tavolozza di serie e' spenta apposta. Quelli dentro il markup
     di stampa restano — la carta non si migra. */
  misureEColoriAMano: {},

  /* Token `--sx-*` che portano ancora un VALORE invece di un rimando.
     `01-tokens.css` li dichiarava tutti DUE volte — in cima col valore, in
     fondo come rimando a M3 — e vinceva il secondo: i colori scritti in cima
     erano morti, ed erano quelli che si leggevano aprendo il file. Tolti in
     B3, a video non e' cambiato un pixel. */
  dichiarazioniMorte: {},

  /* Le viste che stanno davanti a un vano e non hanno la scheda della tappa.
     `caricoSpedizione` e' il caso peggiore: e' un giro di prelievo, e la
     tappa corrente e' una riga di tabella. */
  senzaSchedaDiTappa: [],

  /* Il gesto che chiude un'operazione ha otto forme, e su sei schermate su
     nove resta a 40px invece dei 48 dichiarati da `--md-touch`. Col guanto
     quella differenza si sente. */
  senzaPulsanteDiConferma: [],

  /* Ventisette selettori dichiarati due volte fuori da `@media`: la
     definizione di base, e piu' sotto il blocco «MD3 REFINEMENTS».

     RESTA APERTA, ED E' UNA DECISIONE. Fondere i doppioni NON e'
     un'operazione meccanica: i blocchi si alternano con altre regole della
     STESSA specificita', e chi vince dipende dall'ordine esatto. `.btn` sta
     alle righe 15, 407, 432 e 447; `.btn-primary` alle 38 e 454, e la
     seconda serve proprio a rimettere il colore che il `.btn` di riga 447
     gli aveva tolto. Spostare uno qualunque di quei blocchi cambia il
     risultato — provato leggendo l'interleaving, non supposto.

     Il valore che B7 doveva dare — una definizione sola per componente —
     si ottiene DECIDENDO com'e' fatto ogni componente, con gli stili
     calcolati di oggi come specifica. E' una riscrittura dello strato dei
     componenti, non una fusione, e va fatta a occhi aperti su una vista per
     volta. Il conto resta qui a dire quanto manca. */
  selettoriDoppi: {
    "src/styles/01-components.css": 13,
    "src/styles/01-layout.css": 9,
    "src/styles/01-views.css": 5
  },

  /* Larghezze usate in una `@media` e non dichiarate nel tema. Erano cinque
     su undici: vivevano solo dentro una regola, e chi cercava «a che punto
     l'interfaccia cambia forma» doveva leggere quattromila righe. NON si
     potevano spostare sulle sei della griglia — ognuna ha una ragione
     misurata sul contenuto — e nemmeno leggere da li': una `@media` non
     accetta una variabile CSS. Restano dove sono, in un elenco solo. */
  soglieNonDichiarate: [],

  /* Colori scritti dentro una regola, che nessuna tavolozza puo' cambiare.
     Erano 32: undici volte l'inchiostro della superficie ricopiato a mano,
     cinque un rosso che non stava in nessuna tavolozza, quattro veli diversi
     per la stessa cosa, tre ombre di un colore uscito dalla tavolozza con la
     2.23. Adesso passano tutti da un token. */
  coloriFuoriTavolozza: {},

  /* `font-size` fuori dai token MD3, §8. Il testo dentro un SVG col
     `viewBox` non conta: e' geometria, non tipografia. */
  testoAMano: {},

  /* 2.27 — LA SCALA DELLA STAMPA, DICHIARATA. Non e' un difetto da portare a
     zero come le altre: e' un OGGETTO, l'elenco dei corpi che i documenti
     usano sulla carta, e sta qui perche' in stampa i punti si scrivono a mano
     (vedi la misura 12) e senza un posto in cui leggerli la scala si
     dimentica. Se un numero cambia, il collaudo suona: e' il solo modo di
     accorgersi che un corpo nuovo e' entrato di straforo.

     LA 2.27 L'HA ABBASSATA DEL 10%, arrotondando a 0,25 pt — a 0,5 pt il
     fattore reale sbanda del ±3% proprio sui corpi piccoli, che sono i due
     terzi — con PAVIMENTO a 6,5 pt, che e' il piu' piccolo che questo
     progetto avesse gia' scelto due volte. Sotto, un foglio in mano davanti a
     uno scaffale non si legge. Il pavimento costa un gradino: 7 e 6,5
     atterrano tutti e due su 6,5, e due gerarchie collassano. Accettato.

     QUATTRO ESCLUSIONI, e sono le voci alte che restano qui sopra:
       · 22, 20, 16, 15, 14, 9, 8, 7,5 e uno dei 7 pt — le ETICHETTE adesive
         100x80 e 100x60 mm: supporto a misura fissa, rimpicciolire non
         recupera un millimetro e allontana il codice a barre dal lettore;
       · 46 pt — la filigrana BOZZA, che e' un velo tarato sulla diagonale
         del foglio, non un testo;
       · 20 pt — la fascia del cartellino di non conformita', che si legge da
         due metri su un bancale in quarantena: e' un segnale;
       · 7 pt — il numero di pagina, che vive nel margine e non toglie spazio
         a nessuno. */
  scalaDiStampa: {
    '6.5pt': 12, '6.75pt': 11, '6.8pt': 1, '7pt': 3, '7.25pt': 6,
    '7.5pt': 1, '7.75pt': 6, '8pt': 1, '8.25pt': 8, '8.5pt': 4,
    '9pt': 6, '9.5pt': 2, '10pt': 3, '10.75pt': 1, '11.25pt': 1,
    '11.75pt': 1, '12.5pt': 2, '13.5pt': 2, '14pt': 1, '15pt': 1,
    '16pt': 1, '20pt': 2, '22pt': 1, '46pt': 1,
  },
};
