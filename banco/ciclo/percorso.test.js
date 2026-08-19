import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { banco, identifica } from './banco.js';
import { riga, difetto, quadra } from './verbale.js';
import { tre, suddividi } from './passi.js';
import { RICETTA, ODP_ORIGINE } from './ricetta.js';

/* IL PERCORSO DI PRELIEVO, DALL'ODP VERO.

   Questo pezzo ha già pagato tre difetti, e sono tutti e tre difetti che
   `tsc` non vede e che un collaudo su dati finti non incontra:

   1. **260.594 KG di VITAMINA A** su una miscela da 380 kg in tutto: il
      numero di lotto letto come quantità. Finché Sage esportava i lotti come
      testo il primo numero della riga era davvero la quantità; un lotto
      tutto cifre esce numerico, e la colonna cambia significato.
   2. **Il percorso partiva dal primo dell'ordine di visita**, che sull'ODP
      vero era `MAG` — un magazzino dove quell'ordine non ha una riga: tutte
      e dieci le tappe risultavano «in un altro magazzino». Vero, e inutile.
   3. **Il compito di trasferimento diceva «44.42 coll.»** per 44,42 KG.

   Si legge il file vero, non una copia scritta a mano: un foglio finto non
   ha la cella che il difetto ha trovato. */

const ODP = 'ARCHIVIO/BACKUP E FILE DI TEST/07082026_gluc.xlsx';
const VANI_ODP = 'M03-STK';        // casa: sette tappe
const VANI_ALTROVE = 'MAG1-RAKA';  // l'altro magazzino, quello da farsi portare

describe('IL PERCORSO DALL ODP VERO', () => {
  let letto = null;

  beforeAll(async () => {
    await banco();
    await identifica('ANDS');
    const { OdpParser } = await import('../../src/modules/odpParser.ts');
    const XLSX = await import('xlsx');
    OdpParser.usaXLSX(XLSX);
    const buf = readFileSync(ODP);
    letto = OdpParser.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  });

  it('l ODP si legge, e le quantità sono quelle della ricetta — non i numeri di lotto', async () => {
    riga('\n## Il percorso — lettura dell ODP\n');
    expect(letto.ok, `lettura fallita: ${letto.error}`).toBe(true);
    riga(`Ordine \`${letto.header.odp_num}\` · articolo ${letto.header.article_code} lotto ${letto.header.lot}`);
    riga(`Righe lette: **${letto.lines.length}** · avvisi: ${letto.warnings.length ? letto.warnings.join(' · ') : 'nessuno'}\n`);

    expect(letto.header.odp_num).toBe(ODP_ORIGINE);
    expect(letto.lines.length).toBe(RICETTA.length);

    riga('| Articolo | letto KG | atteso KG | lotto letto | lotto atteso |');
    riga('|---|---:|---:|---|---|');
    let storte = [];
    for (const attesa of RICETTA) {
      const l = letto.lines.find((x) => String(x.article_code).trim() === attesa.code);
      const lotto = l?.lots?.[0]?.lot_code ?? '—';
      const qta = tre(l?.lots?.[0]?.qty ?? l?.total_qty ?? 0);
      riga(`| ${attesa.code} | ${qta} | ${tre(attesa.kg)} | ${lotto} | ${attesa.lot} |`);
      if (!l) { storte.push(`${attesa.code} assente`); continue; }
      /* Il foglio porta DUE numeri per componente: il totale di riga
         (44,420805) e la quantità impegnata sul lotto (44,42), già
         arrotondata da Sage. Il parser restituisce la seconda, ed è giusto
         così — è quella che l'ordine impegna. Si confronta con la tolleranza
         dell'arrotondamento, non con l'uguaglianza. */
      if (!quadra(qta, tre(attesa.kg), 0.005)) storte.push(`${attesa.code}: letto ${qta}, atteso ${tre(attesa.kg)}`);
      if (String(lotto).trim() !== attesa.lot) storte.push(`${attesa.code}: lotto ${lotto} invece di ${attesa.lot}`);
    }

    /* IL DIFETTO DEI 260.594 KG: un lotto tutto cifre letto come quantità.
       Su questa miscela vale 0,315 kg, e il numero sbagliato è mille volte
       il totale dell'ordine. Se una riga sola sfora, si vede subito. */
    const assurde = letto.lines.filter((l) => (l.lots?.[0]?.qty ?? 0) > 500);
    if (assurde.length) {
      difetto('PR1', 'grave', 'modules/odpParser.ts',
        `Una riga chiede più di 500 KG su una miscela da 380: ${assurde.map((l) => `${l.article_code}=${l.lots[0].qty}`).join(', ')}. È il numero di lotto letto come quantità — la colonna del lotto va saltata, e un lotto tutto cifre esce numerico da Sage.`,
        `${ODP}, riga ${assurde[0].article_code}`);
    }
    if (storte.length) {
      difetto('PR2', 'grave', 'modules/odpParser.ts',
        `L'ODP si legge con numeri o lotti diversi da quelli scritti sul foglio: ${storte.slice(0, 4).join(' · ')}${storte.length > 4 ? ` · e altre ${storte.length - 4}` : ''}.`,
        ODP);
    }

    const somma = tre(letto.lines.reduce((s, l) => s + (l.lots?.[0]?.qty ?? 0), 0));
    riga(`\nSomma delle quindici righe: **${somma} KG** — l'ordine dichiara **380.25**\n`);
    /* Sei grammi di scarto, e non sono dell'applicativo: sono gli
       arrotondamenti che Sage fa sui quindici lotti. Vale la pena saperlo —
       chi somma i componenti di un ODP non ritrova mai la testata al
       milligrammo — ma qui dentro non c'è niente da correggere. */
    if (!quadra(somma, 380.25, 0.05)) {
      difetto('PR3', 'grave', 'modules/odpParser.ts',
        `I quindici componenti letti sommano ${somma} KG e l'ordine ne dichiara 380,25: la ricetta non chiude.`,
        ODP);
    }
  });

  it('il percorso nasce, e casa è il magazzino con più prelievi — non il primo dell ordine di visita', async () => {
    const { Store } = await banco();
    const { PickRoute } = await import('../../src/modules/pickRoute.ts');
    const { sitoDiCasa, tappeAltrove } = await import('../../src/modules/trasferimentiOdp.ts');
    riga('\n## Il percorso — costruzione\n');

    /* La merce si mette a scaffale in DUE magazzini: senza un altrove, la
       regola di casa non ha niente da decidere e la prova non prova niente.
       Le prime dodici righe vanno in M03, le ultime tre in MAG1. */
    const vaniM03 = Store.generateLocations('M03', 'STK').map((l) => l.code)
      .filter((c) => !Store.getItemsAtLocation(c).length);
    const vaniMag1 = Store.generateLocations('MAG1', 'RAKA').map((l) => l.code)
      .filter((c) => !Store.getItemsAtLocation(c).length);
    expect(vaniM03.length + vaniMag1.length).toBeGreaterThan(RICETTA.length);

    let iM = 0, iG = 0;
    for (const [n, r] of RICETTA.entries()) {
      const vano = n < 12 ? vaniM03[iM++] : vaniMag1[iG++];
      await Store.addItem(vano, r.code, r.desc, r.lot, '', 'percorso 2.0', 0, null, suddividi(tre(r.kg) * 2));
    }

    const p = PickRoute.build(letto.lines);
    riga(`Tappe **${p.stops.length}** · fuori percorso ${p.offroute.length} · note ${p.notes.length}`);
    expect(p.stops.length, 'il percorso non ha nessuna tappa').toBeGreaterThan(0);

    const perSito = {};
    for (const t of p.stops) perSito[t.site_id] = (perSito[t.site_id] || 0) + 1;
    const casa = sitoDiCasa(p.stops, PickRoute.getSiteOrder());
    const altrove = tappeAltrove(p.stops, casa, (id) => Store.getSite(id)?.name || id);
    riga(`Tappe per sito: ${Object.entries(perSito).map(([s, n]) => `${s}=${n}`).join(' · ')}`);
    riga(`**Casa: \`${casa}\`** · tappe in un altro magazzino: **${altrove.length}**\n`);

    /* IL GIRO COMINCIA DA CASA. Fino alla 2.0 l'ordine delle tappe lo dava
       il solo ordine di visita: sull'ODP vero la prima tappa era in MAG per
       una riga sola, e le tredici di M03 venivano dopo. */
    riga(`Prima tappa: \`${p.stops[0].location_code}\` (sito ${p.stops[0].site_id})`);
    if (p.stops[0].site_id !== casa) {
      difetto('PR13', 'grave', 'modules/pickRoute.ts:build',
        `Il giro comincia in ${p.stops[0].site_id} mentre casa è ${casa}: la prima tappa manda in un capannone dove l'ordine ha ${perSito[p.stops[0].site_id]} riga/e, e le ${perSito[casa]} di casa vengono dopo.`,
        `tappe per sito: ${JSON.stringify(perSito)}`);
    }

    const piuTappe = Object.entries(perSito).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (casa !== piuTappe) {
      difetto('PR4', 'grave', 'modules/trasferimentiOdp.ts:sitoDiCasa',
        `Casa è ${casa} ma il magazzino con più prelievi è ${piuTappe}: il percorso comincia dove l'ordine non ha lavoro, e ogni tappa risulta «in un altro magazzino».`,
        `tappe per sito: ${JSON.stringify(perSito)}`);
    }
    /* Un avviso che si accende su TUTTO non dice niente: è il difetto del
       19/08, dieci tappe su dieci fuori sito. */
    if (altrove.length === p.stops.length && p.stops.length > 1) {
      difetto('PR5', 'grave', 'modules/trasferimentiOdp.ts',
        `Tutte e ${p.stops.length} le tappe risultano in un altro magazzino: un avviso che si accende su tutto non dice niente.`,
        `casa ${casa}`);
    }
    for (const a of altrove) {
      if (!a.site_name || a.site_name === a.site_id) {
        difetto('PR6', 'dato', 'anteprima del percorso',
          `La tappa fuori sito porta l'id «${a.site_id}» invece del nome del magazzino in chiaro: chi legge deve sapere DOVE, non il codice.`,
          `tappa ${a.tappa.location_code}`);
        break;
      }
    }
  });

  it('la serpentina non fa tornare indietro, e le tappe di casa vengono prima', async () => {
    const { PickRoute } = await import('../../src/modules/pickRoute.ts');
    const p = PickRoute.build(letto.lines);
    riga('\n### L ordine delle tappe\n');
    riga('| # | sito | ubicazione | articolo | KG |');
    riga('|---:|---|---|---|---:|');
    for (const t of p.stops) riga(`| ${t.seq} | ${t.site_id} | ${t.location_code} | ${t.article_code} | ${tre(t.kg_required)} |`);

    /* `seq` è il numero che l'operatore legge: se non è progressivo, due
       tappe portano lo stesso numero e il foglio in mano non si segue. */
    const seq = p.stops.map((t) => t.seq);
    const progressivo = seq.every((n, i) => n === i + 1);
    if (!progressivo) {
      difetto('PR7', 'grave', 'modules/pickRoute.ts',
        `I numeri di tappa non sono progressivi: ${seq.join(', ')}. È il numero che l'operatore legge sul foglio.`,
        `${p.stops.length} tappe`);
    }

    /* Un sito che si lascia e a cui si torna è un viaggio in più fra due
       capannoni. Le tappe di uno stesso sito devono stare tutte insieme. */
    const blocchi = [];
    for (const t of p.stops) if (blocchi[blocchi.length - 1] !== t.site_id) blocchi.push(t.site_id);
    riga(`\nOrdine dei magazzini: ${blocchi.join(' → ')} · siti distinti ${new Set(blocchi).size}\n`);
    if (blocchi.length !== new Set(blocchi).size) {
      difetto('PR8', 'grave', 'modules/pickRoute.ts',
        `Il percorso lascia un magazzino e ci torna: ${blocchi.join(' → ')}. Fra due capannoni è un viaggio in più, e nessuno lo fa — si finisce per prelevare fuori ordine.`,
        `${p.stops.length} tappe`);
    }
  });

  it('il trasferimento chiesto dall ordine porta la sua unità, non «colli»', async () => {
    const { Store } = await banco();
    const { PickRoute } = await import('../../src/modules/pickRoute.ts');
    const { sitoDiCasa, tappeAltrove, richiestaTrasferimento, tappaInAttesa } =
      await import('../../src/modules/trasferimentiOdp.ts');
    riga('\n## Il trasferimento chiesto dall ordine (1.10)\n');

    const p = PickRoute.build(letto.lines);
    const casa = sitoDiCasa(p.stops, PickRoute.getSiteOrder());
    const altrove = tappeAltrove(p.stops, casa, (id) => Store.getSite(id)?.name || id);
    if (!altrove.length) { riga('_(nessuna tappa fuori sito: niente da trasferire)_\n'); return; }

    const a = altrove[0];
    const dove = 'M03-TRA-01';
    const richiesta = richiestaTrasferimento(a.tappa, dove, { odp_num: letto.header.odp_num, priorita: 2 });
    expect(richiesta, 'la richiesta di trasferimento non è nata').toBeTruthy();
    riga(`Da \`${a.tappa.location_code}\` (${a.site_name}) a \`${dove}\` · payload: \`${JSON.stringify(richiesta.payload)}\``);

    /* IL DIFETTO DEL 19/08: «44.42 coll.» per 44,42 KG. Un ordine di
       produzione chiede chili, e il payload portava quel numero sotto il
       nome dei colli. */
    const pl = richiesta.payload || {};
    const um = pl.uom ?? pl.um ?? null;
    if (typeof pl.qty_uom !== 'number' || !um) {
      difetto('PR9', 'grave', 'modules/trasferimentiOdp.ts:richiestaTrasferimento',
        `Il compito di trasferimento non porta la quantità con la sua unità: payload ${JSON.stringify(pl)}. Un ordine di produzione chiede ${tre(a.tappa.kg_required)} ${a.tappa.um}, e scriverli sotto il nome dei colli è il difetto del 19/08 — «44.42 coll.» per 44,42 KG.`,
        `tappa ${a.tappa.location_code}`);
    } else if (!quadra(pl.qty_uom, tre(a.tappa.kg_required), 0.002)) {
      difetto('PR10', 'grave', 'modules/trasferimentiOdp.ts:richiestaTrasferimento',
        `Il trasferimento chiede ${pl.qty_uom} ${um} mentre la tappa ne vuole ${tre(a.tappa.kg_required)} ${a.tappa.um}.`,
        `tappa ${a.tappa.location_code}`);
    }

    const compito = await Store.createTask(richiesta);
    expect(compito.task_id).toBeTruthy();
    riga(`Compito \`${compito.task_id}\` in coda, stato ${compito.status}`);

    /* La tappa si sposta sull'ubicazione di ricezione, e il vano di arrivo
       resta vuoto finché il compito non è eseguito: è scritto nella maschera
       e dev'essere vero anche qui. */
    const spostata = tappaInAttesa(a.tappa, dove, compito.task_id);
    riga(`La tappa si sposta: \`${a.tappa.location_code}\` → \`${spostata.location_code}\` · resta un prelievo: ${spostata.status !== 'done' ? 'sì' : 'no'}`);
    if (spostata.location_code !== dove) {
      difetto('PR11', 'grave', 'modules/trasferimentiOdp.ts:tappaInAttesa',
        `La tappa non si è spostata sull'ubicazione di ricezione: resta ${spostata.location_code} invece di ${dove}. Il percorso manderebbe a prelevare nell'altro capannone, che è la richiesta che viveva a voce.`,
        `tappa ${a.tappa.location_code}`);
    }
    const inArrivo = Store.getItemsAtLocation(dove).filter((x) => x.item_key === a.tappa.item_key);
    if (inArrivo.length) {
      difetto('PR12', 'grave', 'trasferimento da ODP',
        `Il vano di arrivo ${dove} porta già la merce prima che qualcuno abbia eseguito il compito: la merce non si muove da qui.`,
        `${a.tappa.item_key} in ${dove}`);
    }
  });

  it('le richieste già fatte sopravvivono alla ricostruzione del percorso', async () => {
    const { PickRoute } = await import('../../src/modules/pickRoute.ts');
    const { sitoDiCasa, tappeAltrove, tappaInAttesa } = await import('../../src/modules/trasferimentiOdp.ts');
    riga('\n### La memoria delle richieste\n');

    const p = PickRoute.build(letto.lines);
    const casa = sitoDiCasa(p.stops, PickRoute.getSiteOrder());
    const altrove = tappeAltrove(p.stops, casa, (id) => id);
    if (!altrove.length) { riga('_(niente fuori sito)_\n'); return; }

    /* Cambiare l'ordine di visita rifà `build` da zero. Senza memoria, una
       tappa già spostata tornerebbe nell'altro magazzino con il compito già
       in coda: due volte la stessa merce. */
    const spostate = new Map(altrove.map((a) => [a.tappa.item_key, tappaInAttesa(a.tappa, 'M03-TRA-01', 'TA-FINTO')]));
    const ordinePrima = PickRoute.getSiteOrder();
    PickRoute.setSiteOrder([...ordinePrima].reverse());
    const p2 = PickRoute.build(letto.lines);
    PickRoute.setSiteOrder(ordinePrima);

    const tornate = p2.stops.filter((t) => spostate.has(t.item_key) && t.location_code !== 'M03-TRA-01');
    riga(`Ordine di visita rovesciato: ${spostate.size} tappe erano state spostate, ${tornate.length} sono tornate dov'erano`);
    riga(`\n> La memoria delle richieste NON sta in \`pickRoute\`: la tiene la vista. Questa prova misura il rischio, non lo corregge.\n`);
    /* Non è un difetto del modulo puro — `build` deve ricostruire — ma è il
       punto dove la vista deve rimettere le richieste, e serve saperlo. */
    expect(p2.stops.length).toBe(p.stops.length);
  });
});
