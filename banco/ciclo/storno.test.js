import { describe, it, expect, beforeAll } from 'vitest';
import { banco, identifica } from './banco.js';
import { riga, difetto, quadra } from './verbale.js';
import { tre, sceltePer } from './passi.js';

/* LO STORNO — rimettere a posto quello che si è appena fatto.

   È l'unica funzione che scrive DUE volte sulla stessa riga a distanza di
   secondi, e per questo è il posto dove un elenco di colli rimasto indietro
   si vede subito: si preleva, si storna, e la riga deve tornare esattamente
   com'era — colli, misure, e totale in UM.

   TRE COSE DEVONO ESSERE VERE:

   1. **Si rimettono i colli che erano usciti**, non colli pieni. Prelevando
      10 KG da un collo da 25 esce un pezzo di collo: rimetterne uno intero
      farebbe guadagnare 15 KG al magazzino nel giro di un annullamento.
   2. **Si tolgono i colli che erano entrati**, ritrovati per MISURA. Un
      indice non regge: fra il gesto e il ripensamento un altro terminale
      può aver mosso la riga.
   3. **Se uno di quei colli non c'è più, lo storno si ferma e lo dice** —
      invece di portarne via un altro della stessa misura comoda.

   Qui si esercitano gli argomenti che le quattro maschere passano a
   `_pushUndo`, campo per campo: se una ne scorda uno, si vede. */

const VANO = 'MAG1-RAKA-03-01-T';
const RIENTRO = 'MAG1-RAKA-03-01-A';
const ART = '6000004';
const DESC = 'ACIDO CITRICO ANIDRO E330';

/** Come lo storno rimette la merce, esattamente come lo fa `_undoLast`:
    se l'azione sa com'era la riga la RIDICHIARA, se no accoda. */
async function stornaAdd(Store, azione) {
  const { rettifica } = await import('../../src/modules/colli.ts');
  const riga = Store.getItemsAtLocation(azione.loc).find((x) => x.item_key === `${azione.art}#${azione.lot}`);
  const cfg = azione.packs_prima ? Store.getUomConfig(azione.art, azione.lot) : null;
  const elencoOra = cfg && riga ? Store.colliDiRiga(riga) : null;
  const diff = (cfg && elencoOra) ? rettifica(elencoOra, azione.packs_prima, cfg.uom) : null;
  if (!diff) {
    return await Store.addItem(azione.loc, azione.art, azione.desc || '', azione.lot,
      azione.exp || '', azione.notes || '', azione.qty, azione.qty_uom ?? null, azione.packs ?? null);
  }
  if (diff.uscite.length) await Store.removeItem(azione.loc, `${azione.art}#${azione.lot}`, null, null, Store.scelteDaUscite(riga, diff.uscite));
  if (diff.entrate.length) await Store.addItem(azione.loc, azione.art, azione.desc || '', azione.lot, azione.exp || '', azione.notes || '', diff.entrate.length, null, diff.entrate);
  return { ok: true };
}

describe('LO STORNO', () => {
  beforeAll(async () => { await banco(); await identifica('ANDS'); });

  it('storno di un prelievo — la riga torna esattamente com era, colli compresi', async () => {
    const { Store } = await banco();
    riga('\n## Storno di un prelievo\n');

    await Store.addItem(VANO, ART, DESC, 'STO-L1', '', '', 0, null, [25, 25, 6]);
    const prima = Store.getItemsAtLocation(VANO).find((x) => x.item_key === `${ART}#STO-L1`);
    const elencoPrima = [...Store.colliDiRiga(prima)];
    const umPrima = tre(prima.qty_uom);

    /* Un prelievo che APRE un collo: 10 KG dal collo da 25. È il caso in cui
       rimettere colli pieni farebbe guadagnare merce al magazzino. */
    const scelte = sceltePer(elencoPrima, 10);
    const tolti = await Store.removeItem(VANO, `${ART}#STO-L1`, null, null, scelte);
    const dopoPrelievo = Store.getItemsAtLocation(VANO).find((x) => x.item_key === `${ART}#STO-L1`);
    riga(`Prima: [${elencoPrima.join(',')}] = ${umPrima} KG`);
    riga(`Dopo aver preso 10 KG: [${Store.colliDiRiga(dopoPrelievo).join(',')}] = ${tre(dopoPrelievo.qty_uom)} KG · usciti [${(tolti._packs_out || []).join(',')}]`);

    /* L'AZIONE COM'È SCRITTA DALLA MASCHERA. `smaltimento.ts` è quella che
       la scrive per intero — colli, misure e quantità presa dall'elenco — ed
       è il metro con cui si guardano le altre tre. */
    const azione = {
      op: 'add', loc: VANO, art: ART, desc: DESC, lot: 'STO-L1', exp: '', notes: '',
      qty: (tolti._packs_out || []).length || Math.abs(tolti._qty_delta || 1),
      qty_uom: Math.abs(tolti._qty_uom_delta ?? 0),
      packs: tolti._packs_out ?? null,
      packs_prima: tolti._packs_before ?? null,
    };
    await stornaAdd(Store, azione);

    const dopoStorno = Store.getItemsAtLocation(VANO).find((x) => x.item_key === `${ART}#STO-L1`);
    const elencoDopo = Store.colliDiRiga(dopoStorno);
    riga(`Dopo lo storno: [${elencoDopo.join(',')}] = ${tre(dopoStorno.qty_uom)} KG\n`);

    if (!quadra(tre(dopoStorno.qty_uom), umPrima)) {
      difetto('SO1', 'grave', 'storno di un prelievo',
        `Lo storno non riporta il totale di prima: ${umPrima} KG prima, ${tre(dopoStorno.qty_uom)} dopo.`,
        `${ART}#STO-L1 in ${VANO}, prelevati 10 KG da un collo da 25`);
    }
    const sommaPrima = [...elencoPrima].sort((a, b) => a - b).join(',');
    const sommaDopo = [...elencoDopo].sort((a, b) => a - b).join(',');
    if (sommaPrima !== sommaDopo) {
      difetto('SO2', 'grave', 'storno di un prelievo',
        `Lo storno riporta il peso giusto ma un elenco di colli diverso: [${sommaPrima}] prima, [${sommaDopo}] dopo. Il collo aperto è tornato intero, o si è spezzato in due.`,
        `${ART}#STO-L1 in ${VANO}`);
    }
    if (dopoStorno.qty !== elencoDopo.length) {
      difetto('SO3', 'grave', 'storno di un prelievo',
        `Dopo lo storno la riga dice ${dopoStorno.qty} colli e l'elenco ne porta ${elencoDopo.length}.`,
        `${ART}#STO-L1 in ${VANO}`);
    }
  });

  it('LE QUATTRO MASCHERE scrivono l azione di storno nello stesso modo?', async () => {
    riga('\n### Chi scrive cosa nell azione di annullamento\n');
    const { readFileSync } = await import('node:fs');
    const fonti = {
      'posiziona.ts (op: remove)': 'src/ui/views/posiziona.ts',
      'prelievo.ts — carrello di produzione': 'src/ui/views/prelievo.ts',
      'percorso.ts — tappa del prelievo guidato': 'src/ui/views/percorso.ts',
      'smaltimento.ts': 'src/ui/views/smaltimento.ts',
    };
    riga('| Maschera | `qty` da | `qty_uom` | `packs` |');
    riga('|---|---|---|---|');
    const mancanti = [];
    for (const [nome, file] of Object.entries(fonti)) {
      const src = readFileSync(file, 'utf8');
      const i = src.indexOf('_pushUndo(');
      const blocco = src.slice(i, i + 900);
      const conUom = /qty_uom\s*:/.test(blocco);
      const conPacks = /packs\s*:/.test(blocco);
      const daDelta = /_qty_delta/.test(blocco);
      riga(`| ${nome} | ${daDelta ? 'calo dello scaffale' : "l'elenco"} | ${conUom ? 'sì' : '**NO**'} | ${conPacks ? 'sì' : '**NO**'} |`);
      if (!conUom || !conPacks) mancanti.push(`${nome}${conUom ? '' : ' senza qty_uom'}${conPacks ? '' : ' senza packs'}`);
    }

    /* Un'azione senza `packs` rimette colli PIENI su una riga che i colli li
       dichiara: `addItem` incrementa `qty` e `qty_uom` e lascia `packs` dov'era.
       È la stessa incoerenza chiusa nel conto di produzione — un saldo scritto
       sopra un elenco rimasto indietro — e qui rientra dall'annulla. */
    if (mancanti.length) {
      difetto('SO4', 'grave', 'ui/views — l azione di annullamento',
        `Queste maschere scrivono un'azione di storno incompleta: ${mancanti.join(' · ')}. Senza \`packs\` lo storno rimette colli pieni su una riga che l'elenco lo dichiara: \`addItem\` alza \`qty\` e \`qty_uom\` e lascia \`packs\` com'era, e da lì in poi la riga dice un numero e l'elenco un altro. Senza \`qty_uom\` le UM si derivano dai colli pieni, e un collo aperto torna pieno. \`smaltimento.ts\` le scrive tutte e due, ed è il metro.`,
        `${mancanti.length} maschere su 4`);
    }
  });

  it('storno di un posizionamento — toglie i colli che erano entrati, per misura', async () => {
    const { Store } = await banco();
    riga('\n## Storno di un posizionamento\n');

    /* Si posiziona su una riga che ESISTE GIÀ: l'elenco si accoda, e lo
       storno deve ritrovare i suoi e non quelli di prima. */
    await Store.addItem(RIENTRO, ART, DESC, 'STO-L2', '', '', 0, null, [20, 20]);
    const entrati = [15, 7];
    await Store.addItem(RIENTRO, ART, DESC, 'STO-L2', '', '', 0, null, entrati);
    const dopoCarico = Store.getItemsAtLocation(RIENTRO).find((x) => x.item_key === `${ART}#STO-L2`);
    riga(`Riga dopo il secondo carico: [${Store.colliDiRiga(dopoCarico).join(',')}] = ${tre(dopoCarico.qty_uom)} KG`);

    const scelte = Store.scelteDaColli(dopoCarico, entrati);
    expect(scelte, 'i colli entrati non si ritrovano sulla riga').toBeTruthy();
    await Store.removeItem(RIENTRO, `${ART}#STO-L2`, null, null, scelte);

    const dopoStorno = Store.getItemsAtLocation(RIENTRO).find((x) => x.item_key === `${ART}#STO-L2`);
    const elenco = Store.colliDiRiga(dopoStorno);
    riga(`Dopo lo storno: [${elenco.join(',')}] = ${tre(dopoStorno.qty_uom)} KG (attesi [20,20] = 40)\n`);
    if (!quadra(tre(dopoStorno.qty_uom), 40) || elenco.sort((a, b) => a - b).join(',') !== '20,20') {
      difetto('SO5', 'grave', 'storno di un posizionamento',
        `Lo storno non ha tolto i colli entrati ma altri: resta [${elenco.join(',')}] = ${tre(dopoStorno.qty_uom)} KG invece di [20,20] = 40.`,
        `${ART}#STO-L2 in ${RIENTRO}, entrati [${entrati.join(',')}]`);
    }
  });

  it('storno — se uno dei colli non c è più, si ferma e lo dice', async () => {
    const { Store } = await banco();
    riga('\n### Il collo che non c è più\n');

    await Store.addItem(RIENTRO, ART, DESC, 'STO-L3', '', '', 0, null, [12, 9]);
    const r = Store.getItemsAtLocation(RIENTRO).find((x) => x.item_key === `${ART}#STO-L3`);
    /* Qualcun altro porta via il collo da 9 fra il gesto e il ripensamento. */
    await Store.removeItem(RIENTRO, `${ART}#STO-L3`, null, null, Store.scelteDaColli(r, [9]));

    const ora = Store.getItemsAtLocation(RIENTRO).find((x) => x.item_key === `${ART}#STO-L3`);
    let scelte = null, errore = null;
    try { scelte = Store.scelteDaColli(ora, [12, 9]); } catch (e) { errore = e.message; }
    riga(`Storno di [12,9] su una riga che porta [${Store.colliDiRiga(ora).join(',')}]: ${errore ? '**si ferma** — ' + errore : `scelte ${JSON.stringify(scelte)}`}`);

    if (!errore && scelte) {
      /* Nessun errore: allora almeno non deve aver scelto un collo diverso
         della stessa misura comoda. Con [12] a scaffale, due scelte sono
         una scelta di troppo. */
      if (scelte.length > 1) {
        difetto('SO6', 'grave', 'core/store.ts:scelteDaColli',
          `Lo storno di [12,9] su una riga che porta solo [12] ha prodotto ${scelte.length} scelte: sta portando via un collo che non era quello.`,
          `${ART}#STO-L3 in ${RIENTRO}`);
      } else {
        riga('_(non lancia: restituisce le scelte per i soli colli che ha ritrovato)_\n');
      }
    }
  });
});
