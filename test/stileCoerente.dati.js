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
};
