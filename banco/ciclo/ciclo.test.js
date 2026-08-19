import { describe, it, expect, beforeAll } from 'vitest';
import { banco, identifica } from './banco.js';
import { RICETTA, ORDINI, righeOrdine } from './ricetta.js';
import { riga, difetto, quadra, apriVerbale } from './verbale.js';
import { tre, suddividi, sceltePer } from './passi.js';

/* IL CICLO 2.0 — dal carico al consumo, sul magazzino vero.

   Una sequenza sola, nell'ordine in cui la merce si muove davvero:

     ① carico a scaffale, con la suddivisione dei colli dichiarata
     ② prelievo di produzione, che porta la merce nel vano WIP
     ③ reso a magazzino di quello che avanza
     ④ chiusura del conto: il residuo diventa consumo

   Ogni passo verifica DUE cose e non una: che l'operazione riesca, e che il
   numero che lascia dietro sia quello giusto — in colli e in UM. Un'operazione
   che riesce scrivendo un saldo sbagliato è peggio di una che fallisce. */

const stato = { vani: new Map(), carico: new Map() };

describe('CICLO 2.0 — dal carico al consumo', () => {
  beforeAll(async () => {
    apriVerbale('dal carico al consumo, su copia del magazzino vero');
    await banco();
    await identifica('ANDS');
  });

  /* ── ⓪ Il banco dice cosa ha davanti ─────────────────────────────── */

  it('⓪ il banco è acceso, i dati sono quelli veri, chi lavora ha un nome', async () => {
    const { Store } = await banco();
    riga('## ⓪ Il banco\n');
    riga(`Giacenza **${Store._cache.inventory.length}** righe · movimenti **${Store._cache.movLog.length}** · articoli **${Store._cache.articles.length}** · zone **${Store._cache.zones.length}**`);
    riga(`Area WIP: \`${Store.getAreaWip() || '—'}\``);
    expect(Store._cache.inventory.length).toBeGreaterThan(100);
    expect(Store.getCurrentIdentity().initials).toBe('ANDS');

    /* 2.0 — gli interruttori non ci sono piu': nessuna funzione si chiede il
       permesso, e `meta` non porta piu' ne' `features` ne' `featureLog`. */
    expect(Store.isFeatureOn).toBeUndefined();
    expect(Store._cache.meta.features).toBeUndefined();
  });

  it("⓪ i quindici componenti dell'ODP stanno in anagrafica", async () => {
    const { Store } = await banco();
    const mancanti = RICETTA.filter((r) => !Store.getArticle(r.code)).map((r) => r.code);
    expect(mancanti).toEqual([]);
    const discordi = RICETTA
      .map((r) => ({ code: r.code, um: Store.getArticle(r.code)?.unit }))
      .filter((x) => x.um !== 'KG');
    if (discordi.length) {
      difetto('D1', 'dato', 'anagrafica articoli',
        `L'ODP2603889 chiede questi componenti in KG, l'anagrafica li dichiara altrimenti: ${discordi.map((d) => `${d.code}=${d.um || 'vuota'}`).join(', ')}. Il magazzino conta pezzi dove la produzione pesa chili, e nessuna delle due parti se ne accorge.`,
        `riga ${discordi[0].code}: 0,468 KG richiesti su un articolo dichiarato ${discordi[0].um}`);
    }
    const senzaPpp = RICETTA.filter((r) => !Store.getArticle(r.code)?.pieces_per_pack).length;
    riga(`\nComponenti con unità discorde: **${discordi.length}**/15 · senza \`pieces_per_pack\`: **${senzaPpp}**/15\n`);
  });

  /* ── ① Il carico ─────────────────────────────────────────────────── */

  it('① i quindici componenti entrano a scaffale con la suddivisione dichiarata', async () => {
    const { Store } = await banco();
    riga('## ① Carico\n');
    riga('| Articolo | UM | KG a scaffale | colli | somma colli | riga letta |');
    riga('|---|---|---:|---:|---:|---|');

    /* Quanto serve in tutto: il carico deve bastare a TUTTI gli ordini,
       altrimenti l'ultimo prelievo fallisce per merce assente e il difetto
       che si legge non è quello vero. */
    const serve = new Map();
    for (const o of ORDINI) for (const r of righeOrdine(o.fattore)) {
      serve.set(r.code, tre((serve.get(r.code) || 0) + r.kg));
    }

    const liberi = Store.generateLocations('MAG1', 'RAKA')
      .map((l) => l.code).filter((c) => Store.getItemsAtLocation(c).length === 0);
    expect(liberi.length).toBeGreaterThanOrEqual(RICETTA.length);

    let i = 0;
    for (const r of RICETTA) {
      const art = Store.getArticle(r.code);
      const um = art?.unit || '';
      const totale = serve.get(r.code);
      const vano = liberi[i++];
      /* Un articolo a PEZZI non riceve una quantità con la virgola: si carica
         a colli interi e si va avanti, perché fermarsi qui vorrebbe dire non
         provare gli altri quattordici. Il difetto è già scritto. */
      const colli = um === 'PZ' ? suddividi(Math.max(1, Math.ceil(totale)), 25) : suddividi(totale);

      const res = await Store.addItem(vano, r.code, r.desc, r.lot, '', 'carico ciclo 2.0', colli.length, null, colli);
      expect(res.ok, `carico rifiutato su ${r.code}`).toBe(true);

      const letta = Store.getItemsAtLocation(vano).find((x) => x.item_key === `${r.code}#${r.lot}`);
      const somma = tre(colli.reduce((s, c) => s + c, 0));
      stato.vani.set(r.code, vano);
      stato.carico.set(r.code, { vano, colli, somma, um });
      riga(`| ${r.code} | ${um} | ${totale} | ${colli.length} | ${somma} | qty=${letta?.qty} qty_uom=${letta?.qty_uom} |`);

      if (letta?.qty !== colli.length) {
        difetto('C2', 'grave', 'Store.addItem',
          `I colli scritti non sono quanti se ne sono dichiarati: attesi ${colli.length}, letti ${letta?.qty}`, `${r.code}#${r.lot} in ${vano}`);
      }
      if (!quadra(somma, letta?.qty_uom)) {
        difetto('C1', 'grave', 'Store.addItem',
          `La riga non porta la somma dei colli: attesi ${somma}, letti ${letta?.qty_uom}`, `${r.code}#${r.lot} in ${vano}`);
      }
    }
  });

  /* ── ② Il prelievo di produzione ─────────────────────────────────── */

  it('② quattro ordini prelevano dallo scaffale e la merce entra nel conto WIP', async () => {
    const { Store } = await banco();
    const area = Store.getAreaWip();
    riga(`\n## ② Prelievo → WIP (area \`${area}\`)\n`);
    expect(area, 'area WIP non configurata').toBeTruthy();

    for (const o of ORDINI) {
      for (const r of righeOrdine(o.fattore)) {
        if (Store.getArticle(r.code)?.unit !== 'KG') continue;
        const itemKey = `${r.code}#${r.lot}`;
        const vano = stato.vani.get(r.code);
        const dove = Store.getItemsAtLocation(vano).find((x) => x.item_key === itemKey);
        expect(dove, `${itemKey} non è più in ${vano}`).toBeTruthy();

        const prima = tre(dove.qty_uom);
        const scelte = sceltePer(Store.colliDiRiga(dove), r.kg);
        const uscite = tre(scelte.reduce((s, x) => s + x.quantita, 0));

        const tolti = await Store.removeItem(vano, itemKey, null, null, scelte);
        expect(tolti, `removeItem ha detto no su ${itemKey}`).toBeTruthy();

        const rimasta = Store.getItemsAtLocation(vano).find((x) => x.item_key === itemKey);
        const calo = tre(prima - (rimasta ? tre(rimasta.qty_uom) : 0));
        if (!quadra(calo, uscite)) {
          difetto('P1', 'grave', 'Store.removeItem',
            `Lo scaffale non cala di quello che esce: uscite ${uscite} KG, calo ${calo} KG`,
            `${itemKey} in ${vano}, scelte ${JSON.stringify(scelte)}`);
        }

        /* Gli argomenti sono quelli che passa `prelievo.ts`, campo per campo:
           se una maschera ne scorda uno, il ciclo lo scopre qui. */
        await Store.entraInWip(o.odp, {
          item_key: itemKey, article_code: r.code, article_description: r.desc,
          lot_code: r.lot, expiry_date: '',
          qty: Math.abs(tolti._qty_delta || 1),
          qty_uom: Math.abs(tolti._qty_uom_delta ?? 0),
          uom: Store.getUomConfig(r.code, r.lot)?.uom ?? null,
          packs: tolti._packs_out ?? null,
        });
      }
    }

    riga('| Ordine | righe | chiesto KG | entrato KG | scarto | colli |');
    riga('|---|---:|---:|---:|---:|---:|');
    for (const o of ORDINI) {
      const c = Store.contoWip(o.odp);
      const chiesto = tre(righeOrdine(o.fattore).filter((r) => Store.getArticle(r.code)?.unit === 'KG')
        .reduce((s, r) => s + tre(r.kg), 0));
      const entrato = tre(c.righe.reduce((s, r) => s + (r.entrato_uom ?? 0), 0));
      riga(`| ${o.odp} | ${c.righe.length} | ${chiesto} | ${entrato} | ${tre(entrato - chiesto)} | ${c.entrato} |`);
      expect(c.incoerente, `il conto di ${o.odp} non sta in piedi`).toBe(false);
      if (!quadra(entrato, chiesto, 0.02)) {
        difetto('P3', 'grave', 'conto WIP',
          `${o.odp} chiedeva ${chiesto} KG e nel conto ne sono entrati ${entrato}`, `scarto ${tre(entrato - chiesto)} KG`);
      }
    }
  });

  it('② il conto degli ordini e la giacenza del vano WIP dicono lo stesso numero', async () => {
    const { Store } = await banco();
    const area = Store.getAreaWip();
    const conto = tre(ORDINI.reduce((s, o) =>
      s + Store.contoWip(o.odp).righe.reduce((t, r) => t + (r.entrato_uom ?? 0), 0), 0));
    const inVano = tre(Store.getItemsAtLocation(area)
      .filter((x) => RICETTA.some((r) => x.item_key === `${r.code}#${r.lot}`))
      .reduce((s, x) => s + (x.qty_uom || 0), 0));
    riga(`\nIn lavorazione secondo il conto: **${conto} KG** · in giacenza in \`${area}\`: **${inVano} KG**\n`);
    if (!quadra(conto, inVano, 0.05)) {
      difetto('P4', 'grave', 'area WIP',
        `Il conto degli ordini e la giacenza del vano WIP divergono: conto ${conto} KG, vano ${inVano} KG`, `vano ${area}`);
    }
  });

  /* ── ③ Il reso ───────────────────────────────────────────────────── */

  it('③ il reso a magazzino cala il conto e riporta la merce a scaffale', async () => {
    const { Store } = await banco();
    riga('\n## ③ Reso\n');
    riga('| Ordine | riga | resa | conto colli (entrato/reso/resta) | conto KG (entrato/reso/resta) |');
    riga('|---|---|---:|---|---|');

    /* Si rende su UN ordine solo, e una riga sola: il conto degli altri tre
       deve restare intatto, ed è la verifica che i conti siano davvero
       separati per ordine su un'area WIP unica. */
    const o = ORDINI[1];
    const r = RICETTA[0];
    const itemKey = `${r.code}#${r.lot}`;
    const c0 = Store.contoWip(o.odp).righe.find((x) => x.item_key === itemKey);
    expect(c0, 'la riga non è sul conto').toBeTruthy();

    const colliResi = Math.max(1, Math.floor(c0.residuo / 2));
    const vanoRientro = stato.vani.get(r.code);

    /* Gli argomenti sono quelli che passa `wip.ts` in `_wipRendi`: quali
       colli tornano, scelti sull'elenco che quest'ordine ha ancora fuori. */
    const area = Store.getAreaWip();
    const nelVano = Store.getItemsAtLocation(area).find((x) => x.item_key === itemKey);
    const fuori = Store.colliFuoriWip(o.odp, itemKey);
    const scelte = fuori.length ? Store.scelteDaColli(nelVano, fuori.slice(0, colliResi)) : null;

    const tolti = await Store.esceDaWip(o.odp, {
      item_key: itemKey, article_code: r.code, lot_code: r.lot,
      qty: colliResi, uom: c0.uom,
    }, scelte);
    await Store.addItem(vanoRientro, r.code, '', r.lot, '', `Reso da ordine ${o.odp}`,
      Math.abs(tolti._qty_delta ?? colliResi),
      typeof tolti._qty_uom_delta === 'number' ? Math.abs(tolti._qty_uom_delta) : null,
      tolti._packs_out ?? null);

    const c1 = Store.contoWip(o.odp).righe.find((x) => x.item_key === itemKey);
    riga(`| ${o.odp} | ${itemKey} | ${colliResi} coll. | ${c1.entrato}/${c1.tornato}/${c1.residuo} | ${c1.entrato_uom}/${c1.tornato_uom}/${c1.residuo_uom} |`);

    expect(c1.tornato).toBe(colliResi);

    /* IL PUNTO. Un reso che non porta le UM lascia il conto in KG fermo a
       quello che era entrato: i colli calano, i chili no. Su una miscela
       dove ogni componente è un peso, è il numero che serve. */
    if (c1.tornato_uom === null || c1.tornato_uom === 0) {
      difetto('W1', 'grave', 'ui/views/wip.ts:_wipRendi → Store.esceDaWip',
        `Il reso non scrive le UM sul conto: tornati ${c1.tornato} colli ma tornato_uom = ${c1.tornato_uom}. Il residuo in KG resta ${c1.residuo_uom} contro ${c1.entrato_uom} entrati, come se non fosse tornato niente. _wipRendi chiama esceDaWip senza qty_uom, e _scriviWip scrive null.`,
        `${o.odp} · ${itemKey}: resi ${colliResi} colli, tornato_uom=${c1.tornato_uom}`);
    }

    for (const altro of ORDINI.filter((x) => x.odp !== o.odp)) {
      expect(Store.contoWip(altro.odp).tornato, `il reso di ${o.odp} ha toccato ${altro.odp}`).toBe(0);
    }
  });

  /* ── ③-bis La causa, isolata ─────────────────────────────────────── */

  it('③-bis una riga a colli dichiarati non si scarica «a numero di colli»', async () => {
    const { Store } = await banco();
    const area = Store.getAreaWip();
    riga('\n### La riga del vano WIP, prima e dopo un prelievo «a numero di colli»\n');

    /* Ogni altra funzione che toglie merce passa le SCELTE — quali colli, e
       quanto da ognuno. `esceDaWip` no: chiede «togline tre». Questa prova
       guarda cosa resta scritto sulla riga quando nessuno dice quali. */
    const r = RICETTA[1];
    const itemKey = `${r.code}#${r.lot}`;
    const prima = Store.getItemsAtLocation(area).find((x) => x.item_key === itemKey);
    if (!prima) { riga('_(la riga non è nel vano: passo)_\n'); return; }

    const colliPrima = Store.colliDiRiga(prima);
    const uomPrima = tre(prima.qty_uom);
    const qtyPrima = prima.qty;
    if (!colliPrima) { riga('_(la riga non porta l\'elenco dei colli: passo)_\n'); return; }

    /* La prova è il RIFIUTO, e non si può essere gentili: se questa chiamata
       passa, la riga esce dicendo un numero di colli con l'elenco e il peso
       di prima, e il difetto non si vede più finché qualcuno non pesa lo
       scaffale. Quello che si guarda dopo è che la riga NON sia stata
       toccata: un rifiuto che scrive a metà è peggio del passaggio. */
    let rifiutato = null;
    try {
      await Store.removeItem(area, itemKey, 1, null, null);
    } catch (e) { rifiutato = e.message; }

    const dopo = Store.getItemsAtLocation(area).find((x) => x.item_key === itemKey);
    const colliDopo = dopo ? Store.colliDiRiga(dopo) : [];
    riga(`| | colli (qty) | elenco packs | qty_uom |`);
    riga(`|---|---:|---|---:|`);
    riga(`| prima | ${qtyPrima} | ${colliPrima.length} voci, somma ${tre(colliPrima.reduce((s, c) => s + c, 0))} | ${uomPrima} |`);
    riga(`| dopo il tentativo | ${dopo?.qty ?? 0} | ${colliDopo.length} voci, somma ${tre(colliDopo.reduce((s, c) => s + c, 0))} | ${tre(dopo?.qty_uom ?? 0)} |`);
    riga(`\nRifiuto: ${rifiutato ? '**' + rifiutato + '**' : '_nessuno — la chiamata è passata_'}\n`);

    if (!rifiutato) {
      difetto('W5', 'grave', 'core/store.ts:removeItem',
        `Tolto un collo senza dire QUALE, la riga resta incoerente con se stessa: qty passa da ${qtyPrima} a ${dopo?.qty}, ma l'elenco resta di ${colliDopo.length} voci e qty_uom resta ${tre(dopo?.qty_uom ?? 0)} contro ${uomPrima}. È la stessa incoerenza che la 1.8.4 ha chiuso su documenti, inventario e campionamento: un saldo scritto sopra un elenco rimasto indietro.`,
        `${itemKey} in ${area}: qty ${qtyPrima}→${dopo?.qty}, packs ${colliPrima.length}→${colliDopo.length} voci, qty_uom ${uomPrima}→${tre(dopo?.qty_uom ?? 0)}`);
    } else if (dopo?.qty !== qtyPrima || !quadra(tre(dopo?.qty_uom ?? 0), uomPrima) || colliDopo.length !== colliPrima.length) {
      difetto('W6', 'grave', 'core/store.ts:removeItem',
        `Il rifiuto ha comunque toccato la riga: qty ${qtyPrima}→${dopo?.qty}, qty_uom ${uomPrima}→${tre(dopo?.qty_uom ?? 0)}, elenco ${colliPrima.length}→${colliDopo.length} voci.`,
        `${itemKey} in ${area}`);
    }
  });

  /* ── ④ La chiusura ───────────────────────────────────────────────── */

  it('④ la chiusura dichiara il consumo e azzera il conto', async () => {
    const { Store } = await banco();
    const { consumo: consumoWip } = await import('../../src/modules/wip.ts');
    riga('\n## ④ Chiusura — il residuo diventa consumo\n');
    riga('| Ordine | righe chiuse | entrato | reso | consumato | resta | entrato KG | consumato KG |');
    riga('|---|---:|---:|---:|---:|---:|---:|---:|');

    for (const o of ORDINI) {
      const c = Store.contoWip(o.odp);
      const daChiudere = consumoWip(c, true) || [];
      for (const r of daChiudere) {
        await Store.esceDaWip(o.odp, {
          item_key: r.item_key, article_code: r.article_code, lot_code: r.lot_code,
          qty: r.residuo, qty_uom: r.residuo_uom, uom: r.uom,
        }, null, 'consumo');
      }
      const f = Store.contoWip(o.odp);
      const entratoKg = tre(f.righe.reduce((s, r) => s + (r.entrato_uom ?? 0), 0));
      const consumatoKg = tre(f.righe.reduce((s, r) => s + (r.consumato_uom ?? 0), 0));
      riga(`| ${o.odp} | ${daChiudere.length} | ${f.entrato} | ${f.tornato} | ${f.consumato} | ${f.residuo} | ${entratoKg} | ${consumatoKg} |`);

      expect(f.residuo, `${o.odp}: la chiusura non ha azzerato il conto in colli`).toBe(0);

      if (consumatoKg === 0 && entratoKg > 0) {
        difetto('W2', 'grave', 'ui/views/wip.ts:_wipChiudi → Store.esceDaWip',
          `La chiusura non scrive le UM del consumo: ${o.odp} ha consumato ${f.consumato} colli ma consumato_uom = ${consumatoKg}. Il consumo reale di produzione in KG — «l'unico numero che oggi non si può avere», dice il modulo — non finisce a registro. _wipChiudi chiama esceDaWip senza qty_uom.`,
          `${o.odp}: entrati ${entratoKg} KG, consumati ${consumatoKg} KG`);
      }
      if (!quadra(f.residuo_uom ?? 0, 0, 0.02)) {
        difetto('W3', 'grave', 'conto WIP',
          `${o.odp}: il conto è a zero in colli ma non in UM — restano ${tre(f.residuo_uom)} KG che nessuno ha né reso né consumato`,
          `entrato ${entratoKg} KG, reso ${tre(f.righe.reduce((s, r) => s + (r.tornato_uom ?? 0), 0))} KG, consumato ${consumatoKg} KG`);
      }
    }
  });

  it('④ il vano WIP resta vuoto di quello che il ciclo ci ha portato', async () => {
    const { Store } = await banco();
    const area = Store.getAreaWip();
    const restano = Store.getItemsAtLocation(area)
      .filter((x) => RICETTA.some((r) => x.item_key === `${r.code}#${r.lot}`));
    riga(`\nNel vano \`${area}\` restano **${restano.length}** righe del ciclo${restano.length ? ': ' + restano.map((x) => `${x.item_key}=${x.qty_uom}`).join(', ') : ''}\n`);
    if (restano.length) {
      difetto('W4', 'grave', 'area WIP',
        `Chiuso ogni conto, nel vano WIP resta merce del ciclo: ${restano.map((x) => `${x.item_key} ${x.qty} coll. ${x.qty_uom}`).join(' · ')}`,
        `vano ${area}`);
    }
  });

  /* ── ⑤ La quadratura ─────────────────────────────────────────────── */

  it('⑤ i chili caricati si ritrovano tutti: a scaffale, resi, o consumati', async () => {
    const { Store } = await banco();
    riga('\n## ⑤ La quadratura\n');
    riga('| Articolo | caricato KG | a scaffale KG | consumato KG | reso KG | scarto |');
    riga('|---|---:|---:|---:|---:|---:|');

    let scartoTotale = 0;
    for (const r of RICETTA) {
      const c = stato.carico.get(r.code);
      if (c.um !== 'KG') continue;
      const itemKey = `${r.code}#${r.lot}`;
      const scaffale = tre(Store._cache.inventory
        .filter((x) => x.item_key === itemKey && x.location_code.startsWith('MAG1-RAKA'))
        .reduce((s, x) => s + (x.qty_uom || 0), 0));
      let consumato = 0, reso = 0;
      for (const o of ORDINI) {
        const w = Store.contoWip(o.odp).righe.find((x) => x.item_key === itemKey);
        if (!w) continue;
        consumato += w.consumato_uom ?? 0;
        reso += w.tornato_uom ?? 0;
      }
      const scarto = tre(c.somma - scaffale - tre(consumato));
      scartoTotale += Math.abs(scarto);
      riga(`| ${r.code} | ${c.somma} | ${scaffale} | ${tre(consumato)} | ${tre(reso)} | ${scarto} |`);
    }
    riga(`\n**Scarto assoluto complessivo: ${tre(scartoTotale)} KG**\n`);
    if (scartoTotale > 0.05) {
      difetto('Q1', 'grave', 'quadratura del ciclo',
        `Alla fine del ciclo ${tre(scartoTotale)} KG non si ritrovano da nessuna parte: né a scaffale, né consumati, né resi.`,
        `somma degli scarti per articolo, tolleranza 0,05 KG`);
    }
  });

  /* ── ⑥ I KPI, sul magazzino vero e sul ciclo appena girato ────────── */

  it('⑥ i numeri delle persone escono dai movimenti che il ciclo ha appena scritto', async () => {
    const { Store } = await banco();
    const persone = await Store.kpiPersone();
    riga('\n## ⑥ KPI — le persone\n');
    riga('| Sigla | mov. | colli | UM mosse | giorni attivi | mov./giorno | compiti presi/chiusi/annull. | esec. min (mediana) | attesa min |');
    riga('|---|---:|---:|---|---:|---:|---|---:|---:|');
    for (const p of persone) {
      const um = Object.entries(p.uom).map(([u, n]) => `${tre(n)} ${u}`).join(' · ') || '—';
      riga(`| ${p.sigla} | ${p.movimenti} | ${p.colli} | ${um} | ${p.giorniAttivi} | ${p.movimentiAlGiorno} | ${p.compitiPresi}/${p.compitiChiusi}/${p.compitiAnnullati} | ${p.minutiEsecuzione ?? '—'} | ${p.minutiAttesa ?? '—'} |`);
    }
    expect(persone.length).toBeGreaterThan(0);

    /* Il ciclo ha lavorato con ANDS: se la sigla non compare, la firma non
       sta finendo sui movimenti, e senza firma il registro GMP è un buco. */
    const ands = persone.find((p) => p.sigla === 'ANDS');
    if (!ands) {
      difetto('K1', 'grave', 'core/store.ts:logMovement',
        'I movimenti del ciclo non portano la sigla di chi li ha fatti: nei KPI per persona ANDS non compare.',
        `sigle viste: ${persone.map((p) => p.sigla).join(', ') || 'nessuna'}`);
    }

    /* UNA SIGLA CHE NON È IN ANAGRAFICA È UNA FIRMA CHE NON RISPONDE.
       Il registro si tiene sei anni, e la domanda che ci si fa fra tre è
       «chi». Una sigla che non sta fra gli operatori non ha un nome dietro:
       o è un operatore cancellato, o è una sigla digitata a mano. */
    const inAnagrafica = new Set(Store._cache.operators.map((o) => String(o.initials).toUpperCase()));
    const orfane = persone.filter((p) => !inAnagrafica.has(p.sigla));
    riga(`\nSigle in anagrafica: ${[...inAnagrafica].join(', ')} · **orfane: ${orfane.length}**\n`);
    if (orfane.length) {
      difetto('K3', 'dato', 'registro movimenti / anagrafica operatori',
        `${orfane.length} sigle firmano movimenti ma non stanno fra gli operatori: ${orfane.map((o) => `${o.sigla} (${o.movimenti} mov.)`).join(', ')}. Fra tre anni quella firma non risponde a un nome — o è un operatore cancellato, o è una sigla digitata a mano.`,
        `operatori in anagrafica: ${[...inAnagrafica].join(', ')}`);
    }
  });

  it('⑥ i numeri dei movimenti, e i buchi che si vedono solo sommandoli', async () => {
    const { Store } = await banco();
    const m = await Store.kpiMovimenti();
    riga('\n## ⑥ KPI — i movimenti\n');
    riga(`Totale **${m.totale}** · colli mossi **${m.colli}** · UM: ${Object.entries(m.uom).map(([u, n]) => `**${tre(n)} ${u}**`).join(' · ') || '—'}`);
    riga(`Rettifiche **${m.rettifiche}** (${m.rettifichePct}%) · senza firma **${m.senzaFirma}** · senza quantità **${m.senzaQuantita}** (storici)\n`);
    riga('| Causale | quanti | | Sito | quanti |');
    riga('|---|---:|---|---|---:|');
    const cause = Object.entries(m.perCausale).sort((a, b) => b[1] - a[1]);
    const siti = Object.entries(m.perSito).sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < Math.max(cause.length, siti.length); i++) {
      riga(`| ${cause[i]?.[0] ?? ''} | ${cause[i]?.[1] ?? ''} | | ${siti[i]?.[0] ?? ''} | ${siti[i]?.[1] ?? ''} |`);
    }
    expect(m.totale).toBeGreaterThan(0);

    if (m.senzaFirma > 0) {
      difetto('K2', 'grave', 'registro movimenti',
        `${m.senzaFirma} movimenti su ${m.totale} non portano la sigla di chi li ha fatti. La firma è un requisito GMP e il registro si tiene sei anni: un movimento senza firma è una riga che fra tre anni non risponde a «chi».`,
        `KPI movimenti, campo senzaFirma`);
    }
  });

  it('⑥ i numeri degli articoli, e quanta anagrafica manca sotto la merce', async () => {
    const { Store } = await banco();
    const a = await Store.kpiArticoli({ giorniFermi: 90, giorniScadenza: 30 });
    riga('\n## ⑥ KPI — gli articoli\n');
    const c = a.copertura;
    riga(`Articoli a giacenza **${c.conGiacenza}** · righe ferme da oltre 90 giorni **${a.ferme}** · scadute **${a.scadute}** · in scadenza a 30 giorni **${a.inScadenza}**`);
    riga(`\nCopertura anagrafica sotto la merce che si muove: senza unità **${c.senzaUnita}** · senza quantità per collo **${c.senzaPerCollo}** · senza allergeni **${c.senzaAllergeni}** · senza classe di conservazione **${c.senzaConservazione}**\n`);
    riga('| Articolo | righe | vani | colli | UM | mov. | uscite | fermo da | prima scad. |');
    riga('|---|---:|---:|---:|---|---:|---:|---:|---|');
    for (const r of a.articoli.slice(0, 12)) {
      riga(`| ${r.article_code} | ${r.righe} | ${r.ubicazioni} | ${r.colli} | ${r.uom === null ? '—' : `${tre(r.uom)} ${r.unita ?? ''}`} | ${r.movimenti} | ${r.uscite} | ${r.giorniFermo ?? '—'} gg | ${r.primaScadenza ?? '—'} |`);
    }
    expect(a.articoli.length).toBeGreaterThan(0);
    expect(c.conGiacenza).toBeGreaterThan(0);
  });

  it('⑥ quello che oggi NON si può misurare sta scritto, e dice cosa servirebbe', async () => {
    const { NON_MISURABILE } = await import('../../src/modules/kpi.ts');
    riga('\n### Quello che il dato di oggi non regge\n');
    riga('| Non si può misurare | Perché | Servirebbe |');
    riga('|---|---|---|');
    for (const v of NON_MISURABILE) riga(`| ${v.cosa} | ${v.perche} | ${v.servirebbe} |`);
    expect(NON_MISURABILE.length).toBeGreaterThan(0);
  });
});
