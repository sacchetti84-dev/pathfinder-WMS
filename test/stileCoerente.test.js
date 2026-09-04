/* LA COERENZA DELLO STILE — 2.23
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   La rete dell'intervento sullo stile. Non giudica il gusto: misura otto
   cose che si contano, e le confronta col conto di `stileCoerente.dati.js`.

   PERCHÉ UN CONTO E NON UNO ZERO. Un collaudo che pretende zero da subito
   nasce rosso, e un collaudo rosso in `npm test` viene spento entro due
   giorni. Un collaudo che parte dal numero di oggi invece è verde stasera e
   suona domani, in tutti e due i versi: se il numero SALE è entrato un
   difetto nuovo, se SCENDE il lavoro è stato fatto e il conto va abbassato
   nello stesso commit. L'elenco delle eccezioni non può marcire, perché
   un'eccezione che non è più vera fa suonare il collaudo come una che è
   peggiorata.

   È la strada di `superficie-app.dati.js`, applicata al CSS. */
import { test, expect } from 'vitest';
import { MISURE, VISTE_A_SCAFFALE } from './stileCoerente.misure.js';
import { TOLLERATO } from './stileCoerente.dati.js';

/** Il conto di una misura: le liste per lunghezza, le mappe per somma. */
const quante = (r) => (Array.isArray(r) ? r.length : Object.values(r).reduce((a, b) => a + b, 0));

/** Il messaggio che si legge quando suona. Deve dire da solo cosa fare, e
    da quale parte è cambiato il numero. */
function racconta(nome, oggi, atteso) {
  const a = quante(oggi);
  const b = quante(atteso);
  if (a === b) return '';
  const verso = a > b
    ? `SALITO da ${b} a ${a}: è entrato un difetto nuovo.`
    : `SCESO da ${b} a ${a}: il lavoro è stato fatto — abbassa il conto in `
      + `test/stileCoerente.dati.js, nello stesso commit.`;
  return `${nome} ${verso}`;
}

for (const [nome, misura] of Object.entries(MISURE)) {
  test(`${nome} — il conto è quello dichiarato`, () => {
    const oggi = misura();
    const atteso = TOLLERATO[nome];
    expect(atteso, `manca ${nome} in stileCoerente.dati.js`).toBeDefined();
    expect(oggi, racconta(nome, oggi, atteso)).toEqual(atteso);
  });
}

/* ═══ Le due che NON hanno un conto, perché a zero ci sono già ═══════════ */

/* Una classe citata e mai definita non è un errore per nessuno: non per il
   compilatore, non per il browser, non per un collaudo che guarda il DOM.
   Esce un elemento con lo stile di base e nient'altro, e in una tabella di
   stati vuol dire due righe diverse che si vedono uguali. Da B0 in poi
   questo resta vuoto: è l'unica invariante dura di questo file. */
test('nessuna classe citata nel markup è senza definizione', () => {
  expect(MISURE.variantiFantasma()).toEqual([]);
});

/* L'elenco delle viste che stanno davanti a un vano è un dato, non una
   deduzione: se una vista nuova ci entra, deve entrarci di proposito. Vale
   la pena controllarne l'esistenza, perché un nome sbagliato qui
   spegnerebbe due misure in silenzio. */
test('le viste dichiarate a scaffale esistono tutte', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { RADICE } = await import('./stileCoerente.misure.js');
  const mancanti = VISTE_A_SCAFFALE.filter(
    (v) => !fs.existsSync(path.join(RADICE, 'src', 'ui', 'views', `${v}.ts`)));
  expect(mancanti).toEqual([]);
});
