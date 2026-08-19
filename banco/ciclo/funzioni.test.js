import { describe, it, expect, beforeAll } from 'vitest';
import { banco, identifica } from './banco.js';
import { riga, difetto, quadra } from './verbale.js';
import { tre, sceltePer } from './passi.js';

/* LE ALTRE FUNZIONI, sullo stesso magazzino e con la stessa domanda.

   Il ciclo carico → consumo prova una strada sola. Qui si provano le altre
   nove, e la domanda non cambia: l'operazione riesce, e il numero che lascia
   dietro è quello giusto? Le funzioni che tolgono merce sono sette, e ognuna
   ha la sua maschera: un difetto che sta in una non sta necessariamente
   nelle altre — la 1.8.4 ne trovò tre identici in tre posti diversi.

   OGNI PROVA SI PREPARA LA MERCE DA SOLA, in un vano suo. Non dipende dal
   ciclo e non gli lascia niente in mezzo ai piedi: due file di prove che si
   passano lo stato sono due file il cui esito dipende da chi gira prima. */

const VANI = {
  udcA: 'MAG1-RAKA-02-01-T', udcB: 'MAG1-RAKA-02-01-A',
  quar: 'MAG1-RAKA-02-02-T', camp: 'MAG1-RAKA-02-02-A',
  conta: 'MAG1-RAKA-02-03-T', ddt: 'MAG1-RAKA-02-03-A',
  smalt: 'MAG1-RAKA-02-04-T', sposta: 'MAG1-RAKA-02-04-A',
};

const ART = '6000242';
const DESC = 'VITAMINA C (ACIDO ASCORBICO)';

/** Mette a scaffale una riga con la suddivisione dichiarata, e la restituisce. */
async function metti(Store, vano, lotto, colli) {
  const res = await Store.addItem(vano, ART, DESC, lotto, '2027-12-31', 'prova funzioni 2.0', colli.length, null, colli);
  expect(res.ok, `carico rifiutato in ${vano}`).toBe(true);
  return Store.getItemsAtLocation(vano).find((x) => x.item_key === `${ART}#${lotto}`);
}

describe('LE ALTRE FUNZIONI', () => {
  beforeAll(async () => { await banco(); await identifica('ANDS'); });

  /* ── Unità di carico ─────────────────────────────────────────────── */

  it('UDC — nasce, si carica, si sposta intera, e muore da sola', async () => {
    const { Store } = await banco();
    riga('\n## Unità di carico\n');
    const r = await metti(Store, VANI.udcA, 'UDC-L1', [25, 25, 8]);
    const prima = tre(r.qty_uom);

    const u = await Store.createUdc({ location_code: VANI.udcA, site_id: 'MAG1' });
    expect(u.udc_id).toBeTruthy();
    await Store.assegnaAUdc(VANI.udcA, r.item_key, u.udc_id);
    expect(Store.righeDiUdc(u.udc_id).map((x) => x.item_key)).toEqual([r.item_key]);

    /* LO SPOSTAMENTO È UNA TRANSAZIONE SOLA: l'unità e le sue righe cambiano
       ubicazione insieme, o non cambia niente. */
    await Store.moveUdc(u.udc_id, VANI.udcB);
    const dopo = Store.getItemsAtLocation(VANI.udcB).find((x) => x.item_key === r.item_key);
    riga(`\`${u.udc_id}\` · ${VANI.udcA} → ${VANI.udcB} · ${prima} KG prima, ${tre(dopo?.qty_uom ?? 0)} KG dopo · colli [${(dopo?.packs || []).join(',')}]`);

    expect(Store.getItemsAtLocation(VANI.udcA).find((x) => x.item_key === r.item_key)).toBeUndefined();
    expect(dopo, 'la riga non è arrivata a destinazione').toBeTruthy();
    expect(Store.getUdc(u.udc_id).location_code).toBe(VANI.udcB);

    if (!quadra(prima, tre(dopo.qty_uom)) || (dopo.packs || []).length !== 3) {
      difetto('U1', 'grave', 'core/store.ts:moveUdc',
        `Spostando l'unità di carico la riga cambia peso o perde l'elenco: ${prima} KG e 3 colli prima, ${tre(dopo.qty_uom)} KG e ${(dopo.packs || []).length} colli dopo.`,
        `${u.udc_id} da ${VANI.udcA} a ${VANI.udcB}`);
    }

    /* MUORE DA SOLA, e senza che nessuno gliela chiuda: uscita l'ultima
       riga — prelevata, spedita, smaltita — il contenitore si chiude, sparisce
       dall'elenco delle unità in giro, e il record resta come storia. */
    await Store.removeItem(VANI.udcB, r.item_key);
    const chiusa = Store.getUdc(u.udc_id);
    const inGiro = Store.getUdcAperte().some((x) => x.udc_id === u.udc_id);
    riga(`Svuotata prelevando l'ultima riga: stato \`${chiusa?.status}\` · ancora fra le aperte: ${inGiro ? 'SÌ' : 'no'}`);
    if (chiusa?.status !== 'empty' || inGiro) {
      difetto('U2', 'grave', 'core/store.ts:removeItem → chiudiUdcSeVuota',
        `Un'unità svuotata prelevandone l'ultima riga non si è chiusa: stato «${chiusa?.status}»${inGiro ? ', e resta contata fra le unità in giro' : ''}. Resta spostabile senza avere più niente sopra.`,
        u.udc_id);
    }
  });

  it('UDC — il codice non si riusa mai, e cambia forma col prefisso GS1', async () => {
    const { Store } = await banco();
    const a = await Store.createUdc({ location_code: VANI.udcA, site_id: 'MAG1' });
    const b = await Store.createUdc({ location_code: VANI.udcA, site_id: 'MAG1' });
    riga(`\nCodici interni consecutivi: \`${a.udc_id}\` → \`${b.udc_id}\``);
    expect(a.udc_id).not.toBe(b.udc_id);

    const prima = Store.getPrefissoGS1();
    await Store.setPrefissoGS1('0712345');
    const sscc = await Store.createUdc({ location_code: VANI.udcA, site_id: 'MAG1' });
    riga(`Con prefisso GS1 \`0712345\`: \`${sscc.udc_id}\` (${String(sscc.udc_id).length} cifre)`);

    /* La cifra di controllo si rifà qui, non si chiede al modulo che l'ha
       scritta: due letture dello stesso conto sono due conti. */
    const cifre = String(sscc.udc_id);
    if (/^\d{18}$/.test(cifre)) {
      let somma = 0;
      for (let i = 0; i < 18; i++) somma += Number(cifre[i]) * (i % 2 === 0 ? 3 : 1);
      riga(`Somma pesata: ${somma} — ${somma % 10 === 0 ? 'chiude a multiplo di dieci' : 'NON chiude'}`);
      if (somma % 10 !== 0) {
        difetto('U3', 'grave', 'modules/udc.ts',
          `L'SSCC generato non ha una cifra di controllo valida: la somma pesata fa ${somma}, che non è multiplo di dieci. Un cliente che legge quel codice lo rifiuta.`,
          `codice ${cifre}`);
      }
    } else {
      difetto('U4', 'grave', 'modules/udc.ts',
        `Col prefisso GS1 compilato il codice dovrebbe essere un SSCC a 18 cifre: è uscito «${cifre}».`, 'prefisso 0712345');
    }
    await Store.setPrefissoGS1(prima);
  });

  /* ── Quarantena ──────────────────────────────────────────────────── */

  it('quarantena — il blocco parziale porta via i colli scelti, e il rilascio li riporta', async () => {
    const { Store } = await banco();
    riga('\n## Quarantena\n');
    const r = await metti(Store, VANI.quar, 'QUAR-L1', [25, 25, 12]);
    const prima = tre(r.qty_uom);
    const scelte = sceltePer(Store.colliDiRiga(r), 25);

    const tolti = await Store.removeItem(VANI.quar, r.item_key, null, null, scelte);
    const bloccato = await Store.addItem('M03-CTQ-01', ART, DESC, 'QUAR-L1', '', 'quarantena prova',
      Math.abs(tolti._qty_delta), Math.abs(tolti._qty_uom_delta), tolti._packs_out);
    expect(bloccato.ok).toBe(true);

    const resta = Store.getItemsAtLocation(VANI.quar).find((x) => x.item_key === r.item_key);
    const inCella = Store.getItemsAtLocation('M03-CTQ-01').find((x) => x.item_key === r.item_key);
    riga(`Origine ${prima} → ${tre(resta.qty_uom)} KG · cella di blocco ${tre(inCella.qty_uom)} KG · somma ${tre(tre(resta.qty_uom) + tre(inCella.qty_uom))}`);
    if (!quadra(prima, tre(resta.qty_uom) + tre(inCella.qty_uom))) {
      difetto('QU1', 'grave', 'quarantena',
        `Il blocco parziale non conserva il peso: ${prima} KG prima, ${tre(tre(resta.qty_uom) + tre(inCella.qty_uom))} KG fra origine e cella.`,
        `${r.item_key} da ${VANI.quar}`);
    }
  });

  /* ── Campionamento ───────────────────────────────────────────────── */

  it('campionamento — i colli non calano mai, e un collo non si svuota', async () => {
    const { Store } = await banco();
    riga('\n## Campionamento\n');
    const r = await metti(Store, VANI.camp, 'CAMP-L1', [25, 10]);
    const colliPrima = r.qty, umPrima = tre(r.qty_uom);

    await Store.sampleItem(VANI.camp, r.item_key, 0.05, 10);
    const dopo = Store.getItemsAtLocation(VANI.camp).find((x) => x.item_key === r.item_key);
    riga(`Prelevati 0,05 KG dal collo da 10: colli ${colliPrima} → ${dopo.qty} · UM ${umPrima} → ${tre(dopo.qty_uom)} · elenco [${(dopo.packs || []).join(',')}]`);

    expect(dopo.qty, 'i colli sono calati: un campione non è un prelievo').toBe(colliPrima);
    if (!quadra(tre(dopo.qty_uom), umPrima - 0.05)) {
      difetto('CA1', 'grave', 'core/store.ts:sampleItem',
        `Il campione non ha scalato le UM come doveva: attesi ${tre(umPrima - 0.05)} KG, letti ${tre(dopo.qty_uom)}.`,
        `${r.item_key} in ${VANI.camp}, campione 0,05 KG dal collo da 10`);
    }
    /* 1.8.4 — il campione esce da UN COLLO PRECISO, e l'elenco lo deve dire. */
    if (!(dopo.packs || []).some((c) => quadra(c, 9.95))) {
      difetto('CA2', 'grave', 'core/store.ts:sampleItem',
        `Il campione ha scalato il totale senza toccare l'elenco dei colli: dopo 0,05 KG dal collo da 10 l'elenco dovrebbe portare 9,95, e porta [${(dopo.packs || []).join(',')}]. È l'incoerenza vista su MAG-SCA-01-03-B.`,
        `${r.item_key} in ${VANI.camp}`);
    }

    /* Svuotare un collo non è campionare: è prelevarlo, e si rifiuta. */
    let rifiuto = null;
    try { await Store.sampleItem(VANI.camp, r.item_key, 25, 25); } catch (e) { rifiuto = e.message; }
    riga(`Tentativo di svuotare un collo intero: ${rifiuto ? '**rifiutato** — ' + rifiuto : '_passato_'}`);
    if (!rifiuto) {
      difetto('CA3', 'grave', 'core/store.ts:sampleItem',
        'Un campione che svuota il collo è passato: svuotare un collo non è campionare, è prelevarlo, e la rotta deve rifiutarsi.',
        `${r.item_key}, campione da 25 KG su un collo da 25`);
    }
  });

  /* ── Conta e rettifica ───────────────────────────────────────────── */

  it('conta — si ridichiara com è fatto lo scaffale, e la differenza diventa movimenti', async () => {
    const { Store } = await banco();
    const { rettifica } = await import('../../src/modules/colli.ts');
    riga('\n## Conta mirata\n');
    const r = await metti(Store, VANI.conta, 'CONTA-L1', [25, 25, 25]);
    const cfg = Store.getUomConfig(ART, 'CONTA-L1');

    /* Chi conta non toglie e non aggiunge: dichiara. Un collo più leggero è
       un'uscita PARZIALE dallo stesso collo — il 24 si accoppia col 25 sceso
       di uno, non col 25 che se ne va e un 24 che arriva. */
    const comeE = [25, 24, 25, 6];
    const diff = rettifica(Store.colliDiRiga(r), comeE, cfg.uom);
    riga(`Da [25,25,25] a [${comeE.join(',')}] · uscite [${diff.uscite.join(',')}] · entrate [${diff.entrate.join(',')}]`);

    if (diff.uscite.length) {
      await Store.removeItem(VANI.conta, r.item_key, null, null, Store.scelteDaUscite(r, diff.uscite));
    }
    if (diff.entrate.length) {
      const dopoUscite = Store.getItemsAtLocation(VANI.conta).find((x) => x.item_key === r.item_key);
      await Store.addItem(VANI.conta, ART, DESC, 'CONTA-L1', '', 'conta', diff.entrate.length, null, diff.entrate);
    }
    const finale = Store.getItemsAtLocation(VANI.conta).find((x) => x.item_key === r.item_key);
    const elenco = Store.colliDiRiga(finale);
    riga(`Riga dopo la rettifica: ${finale.qty} colli · ${tre(finale.qty_uom)} KG · [${elenco.join(',')}]`);

    const atteso = tre(comeE.reduce((s, c) => s + c, 0));
    if (!quadra(tre(finale.qty_uom), atteso) || finale.qty !== comeE.length) {
      difetto('CO1', 'grave', 'rettifica di conta',
        `Dopo la rettifica la riga non dice quello che è stato contato: dichiarati ${comeE.length} colli per ${atteso} KG, la riga porta ${finale.qty} colli per ${tre(finale.qty_uom)} KG.`,
        `${r.item_key} in ${VANI.conta}, da [25,25,25] a [${comeE.join(',')}]`);
    }
  });

  /* ── DDT: il documento prenota, l'evasione esegue ─────────────────── */

  it('DDT — un documento pendente PRENOTA e non toglie, e l evasione toglie quei colli', async () => {
    const { Store } = await banco();
    riga('\n## DDT — prenotazione ed evasione\n');
    const r = await metti(Store, VANI.ddt, 'DDT-L1', [25, 25, 9]);
    const prima = tre(r.qty_uom);
    const scelte = sceltePer(Store.colliDiRiga(r), 25);
    const uscite = Store.colliDiRiga(r).map((c, i) => ({ da: c, quantita: scelte.find((s) => s.indice === i)?.quantita }))
      .filter((x) => x.quantita !== undefined);

    const doc = await Store.savePendingOutbound({
      kind: 'ship', status: 'pending', ddt_num: 'PROVA-2.0',
      recipient_name: 'Prova', created_at: Date.now(),
      lines: [{ location_code: VANI.ddt, item_key: r.item_key, article_code: ART,
                article_description: DESC, lot_code: 'DDT-L1', qty: 1,
                packs_out: uscite, qty_uom: 25, uom: 'KG' }],
    });
    const idDoc = doc?.doc_id ?? doc;

    const dopoDoc = Store.getItemsAtLocation(VANI.ddt).find((x) => x.item_key === r.item_key);
    const fisico = Store.getPhysicalQty(VANI.ddt, r.item_key);
    const disponibile = Store.getAvailableQty(VANI.ddt, r.item_key);
    riga(`Documento \`${idDoc}\` registrato · giacenza ${tre(dopoDoc.qty_uom)} KG (invariata) · fisici ${fisico} coll., disponibili ${disponibile}`);

    if (!quadra(tre(dopoDoc.qty_uom), prima)) {
      difetto('DD1', 'grave', 'core/store.ts:savePendingOutbound',
        `Registrare un DDT ha già tolto merce: la giacenza è passata da ${prima} a ${tre(dopoDoc.qty_uom)} KG. Un documento pendente prenota, non toglie — la merce esce all'evasione.`,
        `documento ${idDoc}`);
    }
    if (disponibile >= fisico) {
      difetto('DD2', 'grave', 'core/store.ts:getAvailableQty',
        `Il documento non ha prenotato niente: fisici ${fisico}, disponibili ${disponibile}. Chi scrive il documento dopo può impegnare la stessa merce due volte.`,
        `documento ${idDoc} su ${r.item_key}`);
    }

    /* I COLLI SI RITROVANO PER MISURA, non per indice: fra il documento e il
       vettore passano giorni, e un altro terminale può aver mosso la riga. */
    const before = Store.getItemsAtLocation(VANI.ddt).find((x) => x.item_key === r.item_key);
    const scelteEvasione = Store.scelteDaUscite(before, uscite);
    riga(`Alla evasione i colli si ritrovano per misura: ${JSON.stringify(scelteEvasione)}`);
    expect(scelteEvasione, 'le uscite scritte a documento non si ritrovano sulla riga').toBeTruthy();

    const tolti = await Store.removeItem(VANI.ddt, r.item_key, null, null, scelteEvasione);
    await Store.updatePendingStatus(idDoc, 'shipped');
    const finale = Store.getItemsAtLocation(VANI.ddt).find((x) => x.item_key === r.item_key);
    riga(`Evaso: ${prima} → ${tre(finale.qty_uom)} KG (usciti ${tre(Math.abs(tolti._qty_uom_delta))})`);
    if (!quadra(tre(finale.qty_uom), prima - 25)) {
      difetto('DD3', 'grave', 'evasione DDT',
        `L'evasione non ha tolto quello che il documento diceva: attesi ${tre(prima - 25)} KG a scaffale, letti ${tre(finale.qty_uom)}.`,
        `documento ${idDoc}`);
    }
  });

  /* ── Spostamento e smaltimento ───────────────────────────────────── */

  it('spostamento — i colli scelti arrivano interi dall altra parte', async () => {
    const { Store } = await banco();
    riga('\n## Spostamento\n');
    const r = await metti(Store, VANI.sposta, 'SPO-L1', [25, 7.5]);
    const scelte = sceltePer(Store.colliDiRiga(r), 25);
    const tolti = await Store.removeItem(VANI.sposta, r.item_key, null, null, scelte);
    await Store.addItem(VANI.udcA, ART, DESC, 'SPO-L1', '', 'spostamento prova',
      Math.abs(tolti._qty_delta), Math.abs(tolti._qty_uom_delta), tolti._packs_out);

    const arrivata = Store.getItemsAtLocation(VANI.udcA).find((x) => x.item_key === r.item_key);
    riga(`25 KG spostati: a destinazione ${tre(arrivata.qty_uom)} KG, colli [${(arrivata.packs || []).join(',')}]`);
    if (!quadra(tre(arrivata.qty_uom), 25)) {
      difetto('SP1', 'grave', 'spostamento',
        `Nel passaggio da uno scaffale all'altro il peso è cambiato: 25 KG partiti, ${tre(arrivata.qty_uom)} arrivati.`,
        `${r.item_key} da ${VANI.sposta} a ${VANI.udcA}`);
    }
  });

  it('smaltimento — quello che si butta esce, e il resto resta con la sua misura', async () => {
    const { Store } = await banco();
    riga('\n## Smaltimento\n');
    const r = await metti(Store, VANI.smalt, 'SMA-L1', [25, 25, 3]);
    const prima = tre(r.qty_uom);
    const scelte = sceltePer(Store.colliDiRiga(r), 28);
    const tolti = await Store.removeItem(VANI.smalt, r.item_key, null, null, scelte);
    const resta = Store.getItemsAtLocation(VANI.smalt).find((x) => x.item_key === r.item_key);
    riga(`Smaltiti 28 KG su ${prima}: resta ${tre(resta.qty_uom)} KG in ${resta.qty} coll. [${(resta.packs || []).join(',')}]`);
    if (!quadra(tre(resta.qty_uom), prima - 28) || resta.qty !== (resta.packs || []).length) {
      difetto('SM1', 'grave', 'smaltimento',
        `Dopo lo smaltimento la riga non torna: attesi ${tre(prima - 28)} KG, letti ${tre(resta.qty_uom)}; colli ${resta.qty} contro ${(resta.packs || []).length} voci nell'elenco.`,
        `${r.item_key} in ${VANI.smalt}`);
    }
  });

  /* ── Attività ────────────────────────────────────────────────────── */

  it('attività — un compito si chiude perché un movimento è stato confermato, mai a mano', async () => {
    const { Store } = await banco();
    riga('\n## Attività\n');
    const t = await Store.createTask({
      type: 'TRANSFER', priority: 2,
      payload: { location_code: VANI.smalt, item_key: `${ART}#SMA-L1`, qty: 3 },
      note: 'prova 2.0',
    });
    expect(t.task_id).toBeTruthy();
    await Store.assignTask(t.task_id, 'ANDS');
    await Store.startTask(t.task_id, 'ANDS');
    let dopo = Store.getTask(t.task_id);
    riga(`\`${t.task_id}\` · stato ${dopo.status} · preso da ${dopo.assigned_to} · avviato ${dopo.started_at ? 'sì' : 'no'}`);
    expect(dopo.status).toBe('in_progress');

    /* I parziali lasciano il residuo: 3 chiesti, 1 mosso, restano 2. */
    await Store.advanceTask(t.task_id, 1);
    dopo = Store.getTask(t.task_id);
    riga(`Dopo un movimento da 1 collo su 3 chiesti: stato ${dopo.status}, mossi ${dopo.qty_done}`);
    if (dopo.status !== 'in_progress') {
      difetto('CP1', 'grave', 'core/store.ts:advanceTask',
        `Un compito a residuo si è chiuso con un parziale: 3 chiesti, 1 mosso, stato «${dopo.status}».`, t.task_id);
    }
    await Store.advanceTask(t.task_id, 2);
    dopo = Store.getTask(t.task_id);
    riga(`Dopo i 2 rimanenti: stato ${dopo.status}`);
    if (dopo.status !== 'done') {
      difetto('CP2', 'grave', 'core/store.ts:advanceTask',
        `Mossi tutti i colli chiesti, il compito non si è chiuso da solo: stato «${dopo.status}».`, t.task_id);
    }

    /* Da uno stato chiuso non esce nessuna transizione. */
    let bloccato = null;
    try { await Store.startTask(t.task_id, 'ANDS'); } catch (e) { bloccato = e.message; }
    riga(`Riavvio di un compito chiuso: ${bloccato ? '**rifiutato**' : '_passato_'}`);
    if (!bloccato) {
      difetto('CP3', 'grave', 'core/store.ts:startTask',
        'Un compito chiuso si è riaperto: da uno stato chiuso non esce nessuna transizione — se si è sbagliato se ne apre un altro.',
        t.task_id);
    }

    /* Un annullamento pretende il motivo. */
    const t2 = await Store.createTask({ type: 'COUNT', priority: 1, payload: { location_code: VANI.conta }, note: 'prova' });
    let senzaMotivo = null;
    try { await Store.cancelTask(t2.task_id, ''); } catch (e) { senzaMotivo = e.message; }
    riga(`Annullamento senza motivo: ${senzaMotivo ? '**rifiutato**' : '_passato_'}`);
    if (!senzaMotivo) {
      difetto('CP4', 'grave', 'core/store.ts:cancelTask',
        'Un compito si è annullato senza motivo: il motivo è il solo dato che fra sei mesi dice perché quel lavoro non è stato fatto.',
        t2.task_id);
    }
  });

  /* ── Motore di stoccaggio ────────────────────────────────────────── */

  it('stoccaggio — il motore propone, dice perché, ed elenca gli esclusi col motivo', async () => {
    const { Store } = await banco();
    riga('\n## Motore di stoccaggio\n');
    const t = Date.now();
    const p = Store.proponiStoccaggio(ART, 'CAMP-L1', 2);
    const ms = Date.now() - t;
    expect(p, 'il motore non ha risposto').toBeTruthy();
    riga(`Valutate **${(p.proposte?.length ?? 0) + (p.esclusi?.length ?? 0)}** ubicazioni in **${ms} ms** · proposte ${p.proposte?.length ?? 0} · escluse ${p.esclusi?.length ?? 0}`);
    if (p.proposte?.length) {
      const prima = p.proposte[0];
      riga(`Prima proposta: \`${prima.location_code}\` — ${(prima.perche || []).join('; ') || 'nessun perché'}`);
      if (!(prima.perche || []).length) {
        difetto('ST1', 'grave', 'modules/stoccaggio.ts',
          'Una proposta senza il perché è un ordine: chi ha la merce in mano deve poter vedere su cosa si basa prima di accettarla.',
          `proposta ${prima.location_code}`);
      }
    }
    if (p.esclusi?.length) {
      const e = p.esclusi[0];
      riga(`Primo escluso: \`${e.location_code}\` — ${e.motivo || 'NESSUN MOTIVO'}`);
      if (!e.motivo) {
        difetto('ST2', 'grave', 'modules/stoccaggio.ts',
          'Un vano escluso senza motivo non si può contestare: è il dato che fra tre mesi dirà se le regole valgono.',
          `escluso ${e.location_code}`);
      }
    }
    /* 274 ubicazioni in 2 ms, dice l'INDEX: qui basta che non faccia
       aspettare chi sta scansionando. */
    if (ms > 250) {
      difetto('ST3', 'grave', 'modules/stoccaggio.ts',
        `Il motore ci ha messo ${ms} ms: gira mentre qualcuno scansiona, e sopra il quarto di secondo si sente.`,
        `${(p.proposte?.length ?? 0) + (p.esclusi?.length ?? 0)} ubicazioni valutate`);
    }
  });

  /* ── FEFO e ricerca ──────────────────────────────────────────────── */

  it('FEFO — a parità di articolo esce prima quello che scade prima', async () => {
    const { Store } = await banco();
    riga('\n## FEFO\n');
    await Store.addItem(VANI.udcB, ART, DESC, 'FEFO-TARDI', '2028-01-01', '', 1, null, [5]);
    await Store.addItem(VANI.udcB, ART, DESC, 'FEFO-PRESTO', '2026-09-01', '', 1, null, [5]);
    const fefo = Store.getFEFOItemForArticle(ART);
    riga(`Primo in FEFO per ${ART}: lotto **${fefo?.lot_code}** con scadenza ${fefo?.expiry_date || '—'}`);
    expect(fefo, 'FEFO non ha trovato niente').toBeTruthy();
    if (fefo.expiry_date && fefo.expiry_date > '2026-09-01') {
      difetto('FE1', 'grave', 'core/giacenza.ts',
        `FEFO ha proposto il lotto ${fefo.lot_code} con scadenza ${fefo.expiry_date} mentre ce n'è uno che scade il 2026-09-01.`,
        `articolo ${ART}`);
    }
  });
});
