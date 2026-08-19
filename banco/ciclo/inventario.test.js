import { describe, it, expect, beforeAll } from 'vitest';
import { banco, identifica } from './banco.js';
import { riga, difetto, quadra } from './verbale.js';
import { tre, sceltePer } from './passi.js';

/* L'INVENTARIO, E LA GIACENZA VISTA PER ARTICOLO (1.9).

   Due domande, e sono la stessa domanda vista da due lati:

   - **Per vano**: che cosa c'è dentro questo scaffale, e come lo si
     raddrizza quando non è quello che il sistema dice. Qui si rettificano
     molte righe in fila, e il rischio è che una rettifica riuscita su una
     riga ne lasci indietro un'altra.
   - **Per articolo**: dov'è questa merce, in quanti vani, e in che ordine
     conviene andare a contarla. La coda di conte esce **nell'ordine dello
     scaffale**, non in quello in cui si è spuntato: chi va a contare fa un
     giro solo, e il giro lo decide lo scaffale.

   LE UM NON SI SOMMANO FRA UNITÀ DIVERSE, mai. In un'ubicazione convivono
   una riga a KG e una a PZ, e sommarle sarebbe scrivere un numero che non
   significa niente. */

const VANO = 'M03-STK-04-01-T';
const VANO2 = 'M03-STK-04-01-A';
const VANO3 = 'M03-STK-04-02-T';
const ART = '6000037';
const DESC = 'AROMA ARANCIO 8358PV';

describe('INVENTARIO E GIACENZA PER ARTICOLO', () => {
  beforeAll(async () => { await banco(); await identifica('ANDS'); });

  it('per articolo — i lotti si raggruppano, i totali si fanno per unità, l ordine è FEFO', async () => {
    const { Store } = await banco();
    const { perLotto, riepiloga } = await import('../../src/modules/giacenzaArticolo.ts');
    riga('\n## Giacenza per articolo (1.9)\n');

    /* Lo stesso articolo in tre vani, due lotti, scadenze diverse: è la
       situazione in cui il raggruppamento serve. */
    await Store.addItem(VANO, ART, DESC, 'INV-TARDI', '2028-06-30', '', 0, null, [25, 5]);
    await Store.addItem(VANO2, ART, DESC, 'INV-TARDI', '2028-06-30', '', 0, null, [25]);
    await Store.addItem(VANO3, ART, DESC, 'INV-PRESTO', '2026-10-15', '', 0, null, [10, 2.5]);

    /* Le UM arrivano risolte da `Store.righeLette`: due letture della stessa
       riga sono due saldi, e qui se ne vuole una sola. */
    const righe = Store.righeLette(Store._cache.inventory.filter((x) => x.article_code === ART));
    const lotti = perLotto(righe);
    const r = riepiloga(righe);

    riga('| Lotto | scadenza | vani | colli | UM |');
    riga('|---|---|---:|---:|---|');
    for (const l of lotti) riga(`| ${l.lot_code} | ${l.expiry_date || '—'} | ${l.righe.length} | ${l.colli} | ${l.uom_qty === null ? '—' : `${tre(l.uom_qty)} ${l.uom ?? ''}`} |`);
    riga(`\nTotali per unità: ${r.totali.map((t) => `**${tre(t.quantita)} ${t.uom}**`).join(' · ') || '—'} · colli ${r.colli} · righe ${r.righe}\n`);

    expect(lotti.length).toBeGreaterThanOrEqual(2);

    /* FEFO: chi scade prima si conta prima, perché è quello che esce prima. */
    const conScadenza = lotti.filter((l) => l.expiry_date);
    const ordinati = [...conScadenza].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    if (conScadenza.map((l) => l.lot_code).join() !== ordinati.map((l) => l.lot_code).join()) {
      difetto('IN1', 'grave', 'modules/giacenzaArticolo.ts:perLotto',
        `I lotti non escono in ordine FEFO: ${conScadenza.map((l) => `${l.lot_code}(${l.expiry_date})`).join(', ')}. Chi legge questa pagina decide cosa contare, e conta per primo quello che esce per primo.`,
        `articolo ${ART}`);
    }

    /* Il totale di un lotto è la somma dei suoi vani: se non lo è, la pagina
       dice un numero e lo scaffale un altro. */
    for (const l of lotti) {
      const somma = tre(l.righe.reduce((s, x) => s + (x.uom_qty ?? 0), 0));
      if (l.uom_qty !== null && !quadra(l.uom_qty, somma)) {
        difetto('IN2', 'grave', 'modules/giacenzaArticolo.ts:perLotto',
          `Il totale del lotto ${l.lot_code} dice ${tre(l.uom_qty)} e le sue righe sommano ${somma}.`,
          `articolo ${ART}, ${l.righe.length} righe`);
      }
    }

    /* DUE UNITÀ NON SI SOMMANO. Si mette a scaffale merce vera a PEZZI
       accanto a quella a chili — è la situazione dell'ubicazione dove
       convivono una riga in KG e una in PZ — e si guarda che il riepilogo
       tenga due righe e non una. La riga a PZ è vera, non costruita a mano:
       una riga finta senza confezione non porta UM e non prova niente. */
    const ART_PZ = '3502551';
    await Store.addItem(VANO, ART_PZ, 'articolo a pezzi', 'INV-PZ', '', '', 0, null, [100, 100]);
    const misto = Store.righeLette(
      Store._cache.inventory.filter((x) => x.article_code === ART || x.article_code === ART_PZ));
    const unita = new Set(misto.map((x) => x.uom).filter(Boolean));
    const rMisto = riepiloga(misto);
    riga(`Unità presenti: ${[...unita].join(', ')} · riepilogo: ${rMisto.totali.map((t) => `${tre(t.quantita)} ${t.uom}`).join(' · ')}`);
    if (unita.size > 1 && rMisto.totali.length < unita.size) {
      difetto('IN3', 'grave', 'modules/giacenzaArticolo.ts:riepiloga',
        `Ci sono ${unita.size} unità (${[...unita].join(', ')}) e il riepilogo ne dichiara ${rMisto.totali.length}: ${JSON.stringify(rMisto.totali)}. Sommare KG e PZ scrive un numero che non significa niente.`,
        'riepilogo su righe miste');
    }
  });

  it('per articolo — la coda di conte esce nell ordine dello scaffale, non in quello in cui si è spuntato', async () => {
    const { Store } = await banco();
    const { codaDiConta, chiaveRiga } = await import('../../src/modules/giacenzaArticolo.ts');
    riga('\n### La coda di conte\n');

    const righe = Store.righeLette(Store._cache.inventory.filter((x) => x.article_code === ART));
    /* SI SPUNTA IN UN ORDINE CHE NON È QUELLO DELLO SCAFFALE — qui il puro
       ordine di ubicazione, che il raggruppamento per lotto rompe di
       proposito. Rovesciare e basta non prova niente: può capitare che il
       rovescio coincida con la coda giusta, ed è successo al primo giro. */
    const chiavi = [...righe].map(chiaveRiga).sort();
    const coda = codaDiConta(righe, chiavi);
    riga(`Spuntate in quest'ordine: ${chiavi.join(' · ')}`);
    riga(`La coda esce: ${coda.map(chiaveRiga).join(' · ')}\n`);

    expect(coda.length).toBe(chiavi.length);
    /* La coda deve raggruppare per lotto e mettere davanti chi scade prima:
       è il giro dello scaffale, non l'ordine della spunta. */
    const lottiInCoda = [];
    for (const r of coda) if (lottiInCoda[lottiInCoda.length - 1] !== r.lot_code) lottiInCoda.push(r.lot_code);
    riga(`Lotti nella coda: ${lottiInCoda.join(' → ')}`);
    if (lottiInCoda.length !== new Set(lottiInCoda).size) {
      difetto('IN4', 'grave', 'modules/giacenzaArticolo.ts:codaDiConta',
        `La coda salta da un lotto all'altro e ci torna: ${lottiInCoda.join(' → ')}. Chi va a contare fa un giro solo.`,
        `${chiavi.length} righe spuntate in ordine di ubicazione`);
    }
    if (coda.map(chiaveRiga).join() === chiavi.join() && chiavi.length > 1) {
      difetto('IN4b', 'grave', 'modules/giacenzaArticolo.ts:codaDiConta',
        'La coda di conte esce nell\'ordine in cui si è spuntato invece che in quello dello scaffale.',
        `spuntate: ${chiavi.join(' · ')}`);
    }

    /* Una riga uscita fra la spunta e la conferma si scarta in silenzio:
       fermare tutto per una riga sparita vuol dire rifare la selezione. */
    const conFantasma = codaDiConta(righe, [...chiavi, 'VANO-CHE-NON-CE|X#Y']);
    if (conFantasma.length !== coda.length) {
      difetto('IN5', 'grave', 'modules/giacenzaArticolo.ts:codaDiConta',
        `Una chiave che non trova più la sua riga ha cambiato la coda: ${conFantasma.length} invece di ${coda.length}.`,
        'chiave inesistente in coda');
    }
  });

  it('inventario di vano — si rettificano più righe in fila e nessuna resta indietro', async () => {
    const { Store } = await banco();
    const { rettifica } = await import('../../src/modules/colli.ts');
    riga('\n## Inventario di vano\n');

    /* Tre righe nello stesso vano, e si dichiara com'è fatto lo scaffale per
       tutte e tre: è il gesto dell'inventario, e il rischio è che la prima
       rettifica riuscita lasci indietro la seconda. */
    const vano = 'M03-STK-04-03-T';
    await Store.addItem(vano, ART, DESC, 'INV-A', '', '', 0, null, [25, 25]);
    await Store.addItem(vano, '6000004', 'ACIDO CITRICO ANIDRO E330', 'INV-B', '', '', 0, null, [20, 5]);
    await Store.addItem(vano, '6000006', 'BIOSSIDO DI SILICIO (SYLOID 244)', 'INV-C', '', '', 0, null, [10]);

    const dichiarato = {
      [`${ART}#INV-A`]: [25, 24],            // un collo più leggero
      ['6000004#INV-B']: [20, 5, 5],         // un collo trovato in più
      ['6000006#INV-C']: [],                 // il vano è vuoto di questa riga
    };

    riga('| Riga | com era | come è | esito |');
    riga('|---|---|---|---|');
    for (const [key, comeE] of Object.entries(dichiarato)) {
      const it = Store.getItemsAtLocation(vano).find((x) => x.item_key === key);
      expect(it, `${key} non è in ${vano}`).toBeTruthy();
      const cfg = Store.getUomConfig(it.article_code, it.lot_code);
      const comeEra = Store.colliDiRiga(it);
      const diff = rettifica(comeEra, comeE, cfg.uom);

      if (diff.uscite.length) {
        const tolti = await Store.removeItem(vano, key, null, null, Store.scelteDaUscite(it, diff.uscite));
        expect(tolti, `rettifica in uscita rifiutata su ${key}`).toBeTruthy();
      }
      if (diff.entrate.length) {
        const res = await Store.addItem(vano, it.article_code, it.article_description, it.lot_code, '', 'inventario', diff.entrate.length, null, diff.entrate);
        expect(res.ok, `rettifica in entrata rifiutata su ${key}`).toBe(true);
      }

      const dopo = Store.getItemsAtLocation(vano).find((x) => x.item_key === key);
      const elenco = dopo ? Store.colliDiRiga(dopo) : [];
      const atteso = tre(comeE.reduce((s, c) => s + c, 0));
      const letto = tre(dopo?.qty_uom ?? 0);
      riga(`| ${key} | [${comeEra.join(',')}] | [${comeE.join(',')}] | ${dopo ? `${dopo.qty} coll. · ${letto} · [${elenco.join(',')}]` : 'riga sparita'} |`);

      if (!quadra(letto, atteso) || (dopo && dopo.qty !== elenco.length)) {
        difetto('IN6', 'grave', 'inventario di vano',
          `Rettificando ${key} la riga non dice quello che è stato dichiarato: attesi ${comeE.length} colli per ${atteso}, letti ${dopo?.qty ?? 0} per ${letto}.`,
          `${vano}, da [${comeEra.join(',')}] a [${comeE.join(',')}]`);
      }
    }

    /* IL COLLO PIÙ LEGGERO È UN'USCITA PARZIALE DALLO STESSO COLLO, non uno
       che se ne va e un altro che arriva: il 24 si accoppia col 25 sceso di
       uno. Se `rettifica` sbagliasse l'accoppiamento il saldo tornerebbe
       comunque, e a registro resterebbero due movimenti al posto di uno. */
    const movRecenti = Store.getMovLog().filter((m) => m.location_code === vano);
    const perTipo = {};
    for (const m of movRecenti) perTipo[m.type] = (perTipo[m.type] || 0) + 1;
    riga(`\nMovimenti scritti in ${vano}: ${Object.entries(perTipo).map(([t, n]) => `${t}=${n}`).join(' · ') || 'nessuno'}\n`);
  });

  it('inventario di vano — la riga mancante del tutto esce, e il vano resta pulito', async () => {
    const { Store } = await banco();
    riga('\n### La riga che non c è più\n');
    const vano = 'M03-STK-04-03-T';
    const restano = Store.getItemsAtLocation(vano).map((x) => `${x.item_key}=${x.qty} coll.`);
    riga(`In ${vano} restano: ${restano.join(' · ') || 'niente'}`);
    const fantasma = Store.getItemsAtLocation(vano).find((x) => x.item_key === '6000006#INV-C');
    if (fantasma) {
      difetto('IN7', 'grave', 'inventario di vano',
        `Dichiarato vuoto, il vano tiene ancora ${fantasma.item_key} con ${fantasma.qty} colli e ${tre(fantasma.qty_uom ?? 0)} UM.`,
        vano);
    }
  });
});
