/* UNA PREPARAZIONE CHIEDE COLLI, E QUELLI CHE IL DOCUMENTO HA SCELTO — 2.38.1
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   IL DIFETTO, e perche' nessuna prova lo vedeva.

   `kg_required` su una tappa porta due grandezze diverse a seconda di chi ha
   costruito il percorso: su un prelievo da ordine sono UNITA' DI MISURA — la
   distinta chiede 150 KG — e su una preparazione sono COLLI, perche' e' cosi'
   che un documento di uscita conta.

   `_routeConfirmStop` passava lo stesso fabbisogno per tutti e due:

       { uom: st.kg_required }

   cioe' «riempi fino a 6 unita' di misura» su una riga che ne chiedeva 6
   COLLI. Su colli da 25 KG, `riempiFabbisogno` proponeva **un collo** invece
   di sei: chi confermava senza rifare il conto a mano mandava un sesto della
   merce che il DDT promette. E la domanda secca di ripiego proponeva `avail`,
   cioe' TUTTO quel che c'era nel vano — otto colli su sei chiesti.

   Segnalato da Andrea il 09/09 sulla 2.38, che ha ereditato il difetto dalla
   2.31 senza vederlo: al banco l'articolo di prova non dichiarava le UM,
   `_chiediColli` usciva subito e la maschera che sbagliava non si apriva mai.

   E C'E' UN TERZO PEZZO, che non e' un difetto di calcolo ma di merce: dalla
   1.8.4 il DDT registra QUALI colli escono — `packs_out` — e l'evasione li
   riprende senza chiedere. La preparazione li richiedeva da capo, e su un
   lotto con colli di misure diverse «sei colli qualunque» e «questi sei
   colli» sono due merci diverse.

   PERCHE' UNA PROVA CHE LEGGE IL SORGENTE. La regola vive dentro una maschera
   che vuole un DOM, una giacenza e un documento pendente: provarla
   eseguendola vuol dire il banco, e il banco non gira a `npm test`. Quel che
   si puo' fissare da fermi e' che quei punti non tornino a confondere le due
   grandezze — ed e' esattamente il difetto, non un suo contorno. Le parti
   calcolabili stanno gia' da ferme: `preselezioneDaUscite` in
   `test/colli.test.js`, la forma della tappa in
   `test/percorsoPreparazione.test.js`. */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RADICE = path.resolve(import.meta.dirname, '..');
const percorso = fs.readFileSync(path.join(RADICE, 'src/ui/views/percorso.ts'), 'utf8');

/** I COMMENTI NON SONO CODICE, e qui la differenza conta: questi metodi
    spiegano il difetto CITANDOLO, e una prova che cerca la scritta
    troverebbe la spiegazione e chiamerebbe difetto il racconto del difetto.
    Si toglie tutto quel che sta fra `/*` e `*​/` e dopo `//`. */
function senzaCommenti(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Il corpo di un metodo, dalla sua firma alla riga che lo chiude. Serve a
    non far passare per buona una riga che sta in un altro metodo. */
function corpo(sorgente, firma) {
  const inizio = sorgente.indexOf(firma);
  expect(inizio, `metodo non trovato: ${firma}`).toBeGreaterThan(-1);
  const fine = sorgente.indexOf('\n  },', inizio);
  expect(fine).toBeGreaterThan(inizio);
  return senzaCommenti(sorgente.slice(inizio, fine));
}

const conferma = corpo(percorso, 'async _routeConfirmStop()');

describe('la tappa di preparazione chiede COLLI', () => {
  /* IL DIFETTO ESATTO, e la forma in cui si difende.

     `{ uom: st.kg_required }` non e' sbagliato di per se': sul prelievo da
     ordine e' GIUSTO, perche' li' quel numero e' davvero in unita' di
     misura. Sbagliato e' passarlo SENZA DISTINGUERE. Quindi la prova non
     vieta quella scritta: pretende che ogni volta che compare sia il ramo
     `else` di una scelta che nell'altro ramo conta colli. */
  it('il fabbisogno in UM esiste SOLO come ramo del prelievo da ordine', () => {
    const inUom = [...conferma.matchAll(/\{\s*uom:\s*st\.kg_required\s*\}/g)];
    expect(inUom.length, 'il fabbisogno in UM deve esistere ancora, per gli ODP').toBe(1);
    const prima = conferma.slice(0, inUom[0].index);
    expect(prima).toMatch(/\?\s*\{\s*colli:\s*st\.kg_required\s*\}\s*:\s*$/);
  });

  it('su una preparazione il fabbisogno e in colli', () => {
    expect(conferma).toMatch(/\{\s*colli:\s*st\.kg_required\s*\}/);
  });

  /* Le due grandezze si distinguono guardando la sessione, non la tappa: e'
     il percorso a essere di un genere o dell'altro. */
  it('e la distinzione la fa la sessione, non un indovinello sulla tappa', () => {
    expect(conferma).toMatch(/prep_doc_id/);
  });

  /* §1.8.4 — i colli li ha gia' scelti chi ha scritto il documento. */
  it('la scelta del documento arriva alla maschera dei colli', () => {
    expect(conferma).toMatch(/packs_doc/);
  });

  /* La domanda secca di ripiego — quella dei lotti che i colli non li
     dichiarano — deve proporre quel che il DDT chiede, non il vano intero. */
  it('la domanda secca propone i colli del documento, non tutto il vano', () => {
    expect(conferma).toMatch(/Math\.min\(Number\(st\.kg_required\), avail\)/);
  });
});

/* ═══ E L'USCITA RAPIDA NON CHIUDE UNA SPEDIZIONE ══════════════════════

   Il secondo difetto segnalato lo stesso giorno, ed e' una dimenticanza
   della 2.38: le uscite dal percorso sono DUE — «Chiudi e stampa report» e
   il pulsante rosso «Chiudi percorso» — e la 2.38 ne aveva insegnata una
   sola.

   Di qui, su una preparazione, non si vedeva mai la domanda
   dell'imballaggio, e `_chiudiCompitoDelPercorso` CHIUDEVA l'attivita'
   invece di rimetterla in coda: la spedizione spariva dall'elenco con la
   merce ancora al banco d'imballo, e nessuno sapeva di doverla imballare.

   Resta l'uscita rapida — non chiede niente — ma restituisce. */
const abbandono = corpo(percorso, 'async _routeAbandon()');

describe('«Chiudi percorso» su una preparazione', () => {
  it('NON chiude l attivita: la rimette in coda', () => {
    expect(abbandono).toMatch(/rimettiInCodaSpedizione/);
  });

  it('e la chiusura del compito resta per il solo prelievo da ordine', () => {
    const i = abbandono.indexOf('_chiudiCompitoDelPercorso');
    expect(i, 'la chiusura deve esserci ancora, per gli ODP').toBeGreaterThan(-1);
    /* Sta nel ramo `else`: se ci finisse anche una preparazione, il difetto
       sarebbe tornato. */
    expect(abbandono.slice(0, i)).toMatch(/if\s*\(prep\)/);
  });

  it('e riconosce una preparazione dalla sessione', () => {
    expect(abbandono).toMatch(/prep_doc_id/);
  });
});
