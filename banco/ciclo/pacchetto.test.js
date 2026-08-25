import { describe, it, expect, beforeAll } from 'vitest';
import { banco, identifica } from './banco.js';
import { riga, difetto } from './verbale.js';
import { tre } from './passi.js';

/* IL PACCHETTO — portarsi via il magazzino e rimetterlo dentro.

   È la funzione che nessuno usa finché non serve, e allora serve davvero:
   una macchina che muore, una presentazione su un portatile, un dubbio su un
   saldo di tre mesi fa. Il rischio non è che fallisca — se fallisce si vede
   — ma che riesca **perdendo per strada una collezione**, e che nessuno se
   ne accorga finché non va a cercare quel dato.

   DUE COSE SI GUARDANO, e sono diverse fra loro:

   1. **I conteggi.** Venti collezioni entrano, venti escono, con gli stessi
      numeri. `conta` e `verifica` stanno in `core/pacchetto.ts` apposta.
   2. **`_format` NON segue la versione dell'applicativo.** Descrive la FORMA
      del file, non con cosa è stato scritto: a muoversi è `_appVersion`. Se
      il formato seguisse la versione, il pacchetto di ieri smetterebbe di
      rileggersi oggi — e il giorno che serve è sempre ieri. */

describe('IL PACCHETTO DI EXPORT', () => {
  beforeAll(async () => { await banco(); await identifica('ANDS'); });

  it('il pacchetto porta tutto, e i conteggi sono quelli della cache', async () => {
    const { Store } = await banco();
    const { conta, verifica, FORMATO, VERSIONE_APP, COLLEZIONI_EXPORT } =
      await import('../../src/core/pacchetto.ts');
    riga('\n## Il pacchetto\n');

    const p = await Store.exportAll({ includeMovLog: true });
    const numeri = conta(p);
    const esito = verifica(p);

    riga(`\`_format\` **${p._format}** · \`_appVersion\` **${p._appVersion}** · collezioni previste ${COLLEZIONI_EXPORT.length}`);
    riga(`Verifica: ${esito.ok ? '**passa**' : '**NO** — ' + esito.problemi.join(' · ')}\n`);
    riga('| Collezione | nel pacchetto | in cache |');
    riga('|---|---:|---:|');

    const inCache = {
      sites: Store._cache.sites.length, zones: Store._cache.zones.length,
      articles: Store._cache.articles.length, inventory: Store._cache.inventory.length,
      operators: Store._cache.operators.length, tasks: Store._cache.tasks.length,
      wip: Store._cache.wip.length, udc: Store.getUdcList().length,
      storage_rules: Store.getStorageRules().length, recipients: Store.getRecipients().length,
    };
    const storte = [];
    for (const [col, attesi] of Object.entries(inCache)) {
      const dentro = numeri[col] ?? 0;
      riga(`| ${col} | ${dentro} | ${attesi} |`);
      if (dentro !== attesi) storte.push(`${col}: ${dentro} nel pacchetto, ${attesi} in cache`);
    }

    expect(esito.ok, `verifica del pacchetto fallita: ${esito.problemi.join(' · ')}`).toBe(true);
    if (storte.length) {
      difetto('PA1', 'grave', 'core/pacchetto.ts:componi',
        `Il pacchetto non porta quello che la cache ha: ${storte.join(' · ')}. Un export che riesce perdendo una collezione è peggio di uno che fallisce — nessuno se ne accorge finché non va a cercare quel dato.`,
        `${storte.length} collezioni su ${Object.keys(inCache).length}`);
    }

    /* IL FORMATO NON SEGUE LA VERSIONE. Se un giorno coincidessero sarebbe
       un caso, e il giorno dopo il pacchetto di ieri non si rileggerebbe. */
    if (p._format !== FORMATO) {
      difetto('PA2', 'grave', 'core/pacchetto.ts',
        `Il pacchetto dichiara \`_format\` «${p._format}» mentre il formato è «${FORMATO}»: chi rilegge un pacchetto lo rifiuta.`,
        'export appena composto');
    }
    if (p._format.includes(VERSIONE_APP)) {
      difetto('PA3', 'grave', 'core/pacchetto.ts',
        `\`_format\` porta dentro il numero di versione (${VERSIONE_APP}): il formato descrive la FORMA del file, e legandolo alla versione il pacchetto di ieri smette di rileggersi oggi. A muoversi è \`_appVersion\`.`,
        `_format = ${p._format}`);
    }
  });

  it('un pacchetto rotto viene RIFIUTATO, e il rifiuto dice cosa manca', async () => {
    const { Store } = await banco();
    const { verifica } = await import('../../src/core/pacchetto.ts');
    riga('\n### Un pacchetto che non sta in piedi\n');

    const buono = await Store.exportAll({ includeMovLog: false });
    const casi = {
      'senza _format': (() => { const c = { ...buono }; delete c._format; return c; })(),
      'con un _format di un altro applicativo': { ...buono, _format: 'qualcos-altro-v9' },
      'con una collezione che non è un elenco': { ...buono, sites: 'non un elenco' },
      'vuoto': {},
      'null': null,
    };
    riga('| Caso | esito |');
    riga('|---|---|');
    const passati = [];
    for (const [nome, caso] of Object.entries(casi)) {
      const e = verifica(caso);
      riga(`| ${nome} | ${e.ok ? '**PASSA**' : 'rifiutato — ' + (e.problemi[0] || 'senza motivo')} |`);
      if (e.ok) passati.push(nome);
      else if (!e.problemi.length) {
        difetto('PA4', 'grave', 'core/pacchetto.ts:verifica',
          `Un pacchetto è stato rifiutato senza dire perché (${nome}): chi lo rilegge non ha modo di capire se è il file o l'applicativo.`,
          nome);
      }
    }
    if (passati.length) {
      difetto('PA5', 'grave', 'core/pacchetto.ts:verifica',
        `Questi pacchetti rotti passano la verifica: ${passati.join(' · ')}. Un import che parte su un file storto riscrive il magazzino con quello che ha capito.`,
        `${passati.length} casi su ${Object.keys(casi).length}`);
    }
  });

  it('export → import: i numeri tornano quelli, e nessuna riga si sdoppia', async () => {
    const { Store } = await banco();
    riga('\n### Il giro completo\n');

    const prima = {
      giacenza: Store._cache.inventory.length,
      colli: Store._cache.inventory.reduce((s, x) => s + (x.qty || 0), 0),
      um: tre(Store._cache.inventory.reduce((s, x) => s + (x.qty_uom || 0), 0)),
      articoli: Store._cache.articles.length,
      operatori: Store._cache.operators.length,
      compiti: Store._cache.tasks.length,
      /* IL REGISTRO ENTRA NEL CONFRONTO — 2.4. Mancava, ed e' il motivo per
         cui il difetto e' passato di qui senza farsi vedere: il giro si fa
         apposta con `includeMovLog: false`, cioe' con un pacchetto che il
         registro non lo porta, e poi non lo si guardava. In produzione quel
         gesto ha cancellato 253 movimenti. */
      movimenti: Store.getMovLogTotal(),
    };
    const p = await Store.exportAll({ includeMovLog: false });

    /* `overwrite` è il modo con cui si rimette in piedi una macchina: quello
       che c'è dentro sparisce e prende il posto del pacchetto. Reimportare
       il pacchetto appena composto deve lasciare tutto com'era — se qualcosa
       si sdoppia, si sdoppierà anche il giorno che serve davvero. */
    await Store.importAll(p, 'overwrite');
    await Store.reloadCache();

    const dopo = {
      giacenza: Store._cache.inventory.length,
      colli: Store._cache.inventory.reduce((s, x) => s + (x.qty || 0), 0),
      um: tre(Store._cache.inventory.reduce((s, x) => s + (x.qty_uom || 0), 0)),
      articoli: Store._cache.articles.length,
      operatori: Store._cache.operators.length,
      compiti: Store._cache.tasks.length,
      movimenti: Store.getMovLogTotal(),
    };

    riga('| Voce | prima | dopo |');
    riga('|---|---:|---:|');
    const storte = [];
    for (const k of Object.keys(prima)) {
      riga(`| ${k} | ${prima[k]} | ${dopo[k]} |`);
      if (prima[k] !== dopo[k]) storte.push(`${k}: ${prima[k]} → ${dopo[k]}`);
    }
    if (storte.length) {
      difetto('PA6', 'grave', 'core/store.ts:importAll',
        `Reimportare il pacchetto appena composto cambia i numeri: ${storte.join(' · ')}. È il gesto con cui si rimette in piedi una macchina, e deve lasciare le cose com'erano.`,
        `import in modo overwrite`);
    }
  });
});
