'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), `pathfinder-collaudo-${Date.now()}.db`);
process.env.PATHFINDER_DB = TMP;
process.env.PATHFINDER_PORT = '4199';

const { app, db, server } = require('../pathfinder-server.js');

const BASE = 'http://127.0.0.1:4199';
let passate = 0, fallite = 0;

const ok = (nome, cond, nota = '') => {
  if (cond) { passate++; console.log(`  PASSA   ${nome}${nota ? ' — ' + nota : ''}`); }
  else { fallite++; console.log(`  FALLISCE ${nome}${nota ? ' — ' + nota : ''}`); }
};

const call = async (metodo, url, corpo, cliente = 'T1') => {
  const r = await fetch(BASE + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Pathfinder-Client': cliente },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  const testo = await r.text();
  let dati = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch { dati = testo; }
  return { stato: r.status, dati };
};

(async () => {
  console.log('\n  COLLAUDO DEL SERVIZIO DATI\n');
  await new Promise(r => setTimeout(r, 300));

  // ── Salute ────────────────────────────────────────────────────────
  const salute = await call('GET', '/api/health');
  ok('Servizio risponde', salute.stato === 200 && salute.dati.ok);
  /* Quattordici fino alla 1.2, diciannove dalla 1.4.0: le cinque nuove
     nascono vuote in Fase 0 perche' lo schema si muova una volta sola. Che
     i nomi siano quelli che il client si aspetta lo prova il tipo in
     `lib/schema.js`, non questo conteggio. */
  const NUOVE_14 = ['lots', 'udc', 'tasks', 'wip', 'storage_rules'];
  ok('Diciannove collezioni dichiarate', salute.dati.collections.length === 19,
     salute.dati.collections.length + '');
  ok('le cinque collezioni della 1.4 ci sono e sono vuote',
     NUOVE_14.every(c => salute.dati.collections.includes(c))
       && NUOVE_14.every(c => (salute.dati.counts?.[c] ?? 0) === 0),
     NUOVE_14.join(' · '));

  // ── Chiave autoincrementale ───────────────────────────────────────
  const a1 = await call('POST', '/api/c/articles',
    { code: 'MP-1', description: 'Maltodestrine', category: 'MP', weight_net_kg: 2.5 });
  ok('add restituisce la chiave generata', a1.stato === 200 && typeof a1.dati.key === 'number',
     'key=' + a1.dati.key);

  const a1letto = await call('GET', '/api/c/articles/' + a1.dati.key);
  ok('get rilegge il documento intero', a1letto.dati.description === 'Maltodestrine' && a1letto.dati.weight_net_kg === 2.5);
  ok('la chiave torna dentro il documento', a1letto.dati._id === a1.dati.key);

  // ── Unicita' ──────────────────────────────────────────────────────
  const dup = await call('POST', '/api/c/articles', { code: 'MP-1', description: 'Doppione' });
  ok('chiave duplicata respinta con 409, non 500', dup.stato === 409, 'stato ' + dup.stato);

  // ── Campo nuovo mai dichiarato ────────────────────────────────────
  const a2 = await call('POST', '/api/c/articles',
    { code: 'MP-2', description: 'Proteine', campo_inventato_domani: 'valore' });
  const a2letto = await call('GET', '/api/c/articles/' + a2.dati.key);
  ok('un campo nuovo entra senza migrazione', a2letto.dati.campo_inventato_domani === 'valore');

  // ── Chiave naturale ───────────────────────────────────────────────
  await call('PUT', '/api/c/operators/OP-1',
    { op_id: 'OP-1', initials: 'ANDS', first_name: 'Andrea', role: 'leader', active: true });
  const op = await call('GET', '/api/c/operators/OP-1');
  ok('chiave naturale di testo', op.dati.initials === 'ANDS');

  // ── Modifica parziale ─────────────────────────────────────────────
  await call('PATCH', '/api/c/operators/OP-1', { role: 'operator' });
  const opMod = await call('GET', '/api/c/operators/OP-1');
  ok('PATCH cambia un campo e lascia gli altri',
     opMod.dati.role === 'operator' && opMod.dati.first_name === 'Andrea');

  // ── Criteri dichiarativi ──────────────────────────────────────────
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', article_code: 'MP-1', lot_code: 'L1', qty: 40 },
    { location_code: 'DP-A-01-02-T', item_key: 'MP-1#L2', article_code: 'MP-1', lot_code: 'L2', qty: 25 },
    { location_code: 'DP-B-01-01',   item_key: 'MP-2#L3', article_code: 'MP-2', lot_code: 'L3', qty: 12 }
  ]);
  const perPrefisso = await call('GET',
    '/api/c/inventory/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'location_code', op: 'startsWith', value: 'DP-A' })));
  ok('criterio startsWith', perPrefisso.dati.length === 2, perPrefisso.dati.length + ' righe');

  const conta = await call('GET',
    '/api/c/inventory/count?criteria=' + encodeURIComponent(JSON.stringify({ field: 'article_code', op: 'equals', value: 'MP-1' })));
  ok('criterio equals con conteggio', conta.dati.count === 2);

  const campoNonIndicizzato = await call('GET',
    '/api/c/inventory/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'qty', op: 'equals', value: 40 })));
  ok('filtrare su un campo non indicizzato viene respinto con un motivo',
     campoNonIndicizzato.stato === 400, campoNonIndicizzato.dati.error);

  // ── Registro e finestra temporale ─────────────────────────────────
  const ora = Date.now();
  await call('POST', '/api/c/mov_log/bulk', [
    { ts: ora - 400 * 86400e3, type: 'IN',  article_code: 'MP-1', lot_code: 'L1', location_code: 'DP-A-01-01-T' },
    { ts: ora - 10 * 86400e3,  type: 'OUT', article_code: 'MP-1', lot_code: 'L1', location_code: 'DP-A-01-01-T' },
    { ts: ora,                 type: 'IN',  article_code: 'MP-2', lot_code: 'L3', location_code: 'DP-B-01-01' }
  ]);
  const finestra = await call('GET', '/api/load?movLogFrom=' + (ora - 120 * 86400e3));
  ok('la finestra del registro esclude il vecchio', finestra.dati.mov_log.length === 2,
     finestra.dati.mov_log.length + ' in finestra');
  ok('il totale a database resta quello vero', finestra.dati._movLogTotal === 3);
  ok('load porta tutte le collezioni in una chiamata',
     Array.isArray(finestra.dati.articles) && Array.isArray(finestra.dati.inventory) && Array.isArray(finestra.dati.operators));

  // ── Lotto atomico ─────────────────────────────────────────────────
  const revPrima = (await call('GET', '/api/health')).dati.revision;
  const tx = await call('POST', '/api/tx', {
    collections: ['sites', 'zones'],
    ops: [
      { op: 'add', collection: 'sites', record: { id: 'DP', name: 'Deposito Principale' } },
      { op: 'add', collection: 'zones', record: { site_id: 'DP', id: 'A', name: 'Corsia A', type: 'RACK' } }
    ]
  });
  ok('lotto atomico eseguito', tx.stato === 200 && tx.dati.ok);
  const revDopo = (await call('GET', '/api/health')).dati.revision;
  ok('il lotto conta come UNA revisione, non due', revDopo === revPrima + 1,
     revPrima + ' → ' + revDopo);

  // ── Il lotto fallisce tutto insieme ───────────────────────────────
  const sitiPrima = (await call('GET', '/api/c/sites')).dati.length;
  const txKo = await call('POST', '/api/tx', {
    collections: ['sites'],
    ops: [
      { op: 'add', collection: 'sites', record: { id: 'DP2', name: 'Secondo' } },
      { op: 'add', collection: 'sites', record: { id: 'DP', name: 'Doppione che deve far fallire tutto' } }
    ]
  });
  const sitiDopo = (await call('GET', '/api/c/sites')).dati.length;
  ok('se una operazione del lotto fallisce, non passa nessuna',
     txKo.stato === 409 && sitiDopo === sitiPrima, `stato ${txKo.stato}, siti ${sitiPrima}→${sitiDopo}`);

  // ── Operazione di dominio: scarico con controllo ──────────────────
  const scarico = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 5 });
  ok('scarico parziale', scarico.stato === 200 && scarico.dati._qty_after === 35,
     'saldo ' + scarico.dati._qty_after);
  ok('lo scarico dichiara il prima e il dopo',
     scarico.dati._qty_before === 40 && scarico.dati._qty_delta === -5 && scarico.dati._mode === 'partial');

  const troppo = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 999 });
  ok('scarico oltre la giacenza respinto', troppo.stato === 409, troppo.dati.error);

  // ── LA PROVA CHE CONTA: due terminali sullo stesso collo ──────────
  const [t1, t2] = await Promise.all([
    call('POST', '/api/op/removeItem', { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 20 }, 'TERMINALE-1'),
    call('POST', '/api/op/removeItem', { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 20 }, 'TERMINALE-2')
  ]);
  const passati = [t1, t2].filter(r => r.stato === 200).length;
  const respinti = [t1, t2].filter(r => r.stato === 409).length;
  const resto = (await call('GET',
    '/api/c/inventory/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'item_key', op: 'equals', value: 'MP-1#L1' })))).dati[0];
  ok('contesa fra due terminali: passa uno solo', passati === 1 && respinti === 1,
     `${passati} passati, ${respinti} respinti`);
  ok('la giacenza non va mai sotto zero', resto && resto.qty === 15, 'saldo ' + (resto ? resto.qty : 'riga sparita'));

  // ── Scarico totale ────────────────────────────────────────────────
  const totale = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 15 });
  const sparito = (await call('GET',
    '/api/c/inventory/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'item_key', op: 'equals', value: 'MP-1#L1' })))).dati;
  ok('scarico totale rimuove la riga', totale.dati._mode === 'full' && sparito.length === 0);

  // ── Tappa di prelievo ─────────────────────────────────────────────
  const tappa = await call('POST', '/api/op/commitPickStop', {
    location_code: 'DP-A-01-02-T', item_key: 'MP-1#L2', qty: 5,
    movement: { type: 'PICK', article_code: 'MP-1', lot_code: 'L2',
                location_code: 'DP-A-01-02-T', user: 'ANDS', doc_ref: 'ODP-1' },
    session: { session_id: 'S1', status: 'active', created_at: Date.now(), stops: [] }
  });
  ok('tappa di prelievo: scarico, movimento e sessione insieme',
     tappa.stato === 200 && tappa.dati.movement_id > 0 && tappa.dati.removed._qty_after === 20,
     'saldo ' + tappa.dati.removed._qty_after);
  const sess = await call('GET', '/api/c/pick_session/S1');
  ok('la sessione di prelievo e\' stata salvata nella stessa transazione', sess.dati?.session_id === 'S1');

  /* ── 1.4.2 — le UM escono dentro la stessa transazione dei colli ────
     La ragione per cui queste rotte composte esistono e' che due terminali
     prelevano lo stesso lotto nello stesso pomeriggio. Dalla 1.4.2 i numeri
     da tenere insieme sono due, e valgono le stesse regole: chi tocca l'uno
     tocca l'altro, o nessuno dei due. */
  const RIGA = (q) => '/api/c/inventory/query?criteria=' + encodeURIComponent(
    JSON.stringify({ field: 'item_key', op: 'equals', value: q }));
  const leggiRiga = async (k) => (await call('GET', RIGA(k))).dati[0];

  await call('POST', '/api/c/inventory/bulk', [
    /* L'esempio del piano §4.2: 10.100 pz da 1.000 per collo. */
    { location_code: 'DP-C-01-01', item_key: 'MP-3#L4', article_code: 'MP-3', lot_code: 'L4', qty: 11, qty_uom: 10100 },
    { location_code: 'DP-C-01-02', item_key: 'MP-3#L5', article_code: 'MP-3', lot_code: 'L5', qty: 11 },
    { location_code: 'DP-C-01-03', item_key: 'MP-3#L6', article_code: 'MP-3', lot_code: 'L6', qty: 40, qty_uom: 40000 },
    { location_code: 'DP-C-01-04', item_key: 'MP-3#L7', article_code: 'MP-3', lot_code: 'L7', qty: 10 },
    { location_code: 'DP-C-01-05', item_key: 'MP-3#L8', article_code: 'MP-3', lot_code: 'L8', qty: 10, qty_uom: 0.3 },
    { location_code: 'DP-C-01-06', item_key: 'MP-3#L9', article_code: 'MP-3', lot_code: 'L9', qty: 10, qty_uom: 100 }
  ]);

  /* Il caso di tutti i giorni finche' non si accende l'interruttore: una riga
     a soli colli resta a soli colli. Il servizio non inventa un qty_uom. */
  const soliColli = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-04', item_key: 'MP-3#L7', qty: 2 });
  const l7 = await leggiRiga('MP-3#L7');
  ok('senza UM il servizio non ne inventa: la riga resta a soli colli',
     soliColli.dati._qty_uom_after === undefined && l7.qty === 8 && l7.qty_uom === undefined,
     'qty ' + l7.qty);

  const conUm = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-01', item_key: 'MP-3#L4', qty: 1, qty_uom: 1000, qty_uom_before: 10100 });
  const l4 = await leggiRiga('MP-3#L4');
  ok('colli e UM scendono insieme, nella stessa transazione',
     l4.qty === 10 && l4.qty_uom === 9100 && conUm.dati._qty_uom_delta === -1000,
     `${l4.qty} colli · ${l4.qty_uom} pz`);

  /* Il seme: una riga posizionata prima della 1.4.2 non ha nessun qty_uom, e
     il primo che la muove porta la propria derivazione. Vale UNA volta. */
  const seme = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-02', item_key: 'MP-3#L5', qty: 1, qty_uom: 1000, qty_uom_before: 11000 });
  const l5 = await leggiRiga('MP-3#L5');
  ok('la riga che non ha mai avuto UM le prende dal primo che la muove',
     l5.qty_uom === 10000 && seme.dati._qty_uom_before === 11000, 'saldo ' + l5.qty_uom);

  /* LA PROVA CHE CONTA PIU' DI TUTTE: il servizio legge il PROPRIO saldo, non
     quello che gli dice il client. Se cosi' non fosse, il secondo terminale
     riscriverebbe il numero del primo con una fotografia vecchia. */
  const bugia = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-01', item_key: 'MP-3#L4', qty: 1, qty_uom: 1000, qty_uom_before: 999999 });
  const l4bis = await leggiRiga('MP-3#L4');
  ok('il servizio legge il proprio saldo in UM, non quello del client',
     bugia.dati._qty_uom_before === 9100 && l4bis.qty_uom === 8100, 'saldo ' + l4bis.qty_uom);

  /* Un saldo negativo in un magazzino e' peggio di un prelievo rifiutato:
     si tronca a cio' che c'e'. */
  const troppeUm = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-02', item_key: 'MP-3#L5', qty: 1, qty_uom: 99999, qty_uom_before: 0 });
  const l5bis = await leggiRiga('MP-3#L5');
  ok('le UM non scendono mai sotto zero: si troncano a cio\' che c\'e\'',
     l5bis.qty_uom === 0 && troppeUm.dati._qty_uom_delta === -10000, 'saldo ' + l5bis.qty_uom);

  /* Lo scarico totale porta via tutto, e lo dichiara anche se il client non
     ha mandato nessun numero: la riga sparisce, il conto no. */
  const tuttoFuori = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-01', item_key: 'MP-3#L4', qty: 9 });
  ok('lo scarico totale dichiara quante UM sono uscite',
     tuttoFuori.dati._mode === 'full' && tuttoFuori.dati._qty_uom_delta === -8100
       && tuttoFuori.dati._qty_uom_after === 0,
     'uscite ' + tuttoFuori.dati._qty_uom_delta);

  const [u1, u2] = await Promise.all([
    call('POST', '/api/op/removeItem',
      { location_code: 'DP-C-01-03', item_key: 'MP-3#L6', qty: 25, qty_uom: 25000 }, 'TERMINALE-1'),
    call('POST', '/api/op/removeItem',
      { location_code: 'DP-C-01-03', item_key: 'MP-3#L6', qty: 25, qty_uom: 25000 }, 'TERMINALE-2')
  ]);
  const l6 = await leggiRiga('MP-3#L6');
  ok('contesa sulle UM: passa un terminale solo, e i due saldi restano coerenti',
     [u1, u2].filter(r => r.stato === 200).length === 1 && l6.qty === 15 && l6.qty_uom === 15000,
     `${l6.qty} colli · ${l6.qty_uom} UM`);

  /* L'arrotondamento e' quello di modules/misure.ts, riscritto qui perche' il
     servizio resta JavaScript. I numeri di questa prova NON sono a caso:
     `0,3 − 0,1` in virgola mobile vale 0,19999999999999998, e un saldo cosi'
     non si azzera mai. Quasi tutte le altre coppie di decimali cadono esatte
     e non proverebbero niente — vedi trappola 17. */
  await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-05', item_key: 'MP-3#L8', qty: 1, qty_uom: 0.1 });
  const l8 = await leggiRiga('MP-3#L8');
  ok('i decimali non lasciano code: 0,3 meno 0,1 fa 0,2 e non 0,19999999999999998',
     l8.qty_uom === 0.2, 'saldo ' + l8.qty_uom);

  const tappaUm = await call('POST', '/api/op/commitPickStop', {
    location_code: 'DP-C-01-06', item_key: 'MP-3#L9', qty: 2, qty_uom: 20,
    movement: { type: 'PICK', article_code: 'MP-3', lot_code: 'L9',
                location_code: 'DP-C-01-06', user: 'ANDS', doc_ref: 'ODP-2' },
    session: { session_id: 'S2', status: 'active', created_at: Date.now(), stops: [] }
  });
  const movUm = (await call('GET',
    '/api/c/mov_log/query?criteria=' + encodeURIComponent(
      JSON.stringify({ field: 'lot_code', op: 'equals', value: 'L9' })))).dati[0];
  const l9 = await leggiRiga('MP-3#L9');
  ok('la tappa di prelievo scrive il delta in UM nel registro, non solo i colli',
     tappaUm.stato === 200 && movUm?.qty_uom_delta === -20 && l9.qty_uom === 80,
     `registro ${movUm?.qty_uom_delta} · saldo ${l9.qty_uom}`);


  /* ── 1.4.2.1 — il campionamento: il collo resta, cala cio' che c'e' dentro ──
     Un campione esce dal magazzino ma il sacco da 25 kg torna a scaffale: i
     colli non calano. E' la ragione per cui questa rotta esiste separata da
     removeItem, che una quantita' sotto l'uno la rifiuta — e fa bene. */
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', article_code: 'MP-4', lot_code: 'C1', qty: 11, qty_uom: 275 },
    { location_code: 'DP-D-01-02', item_key: 'MP-4#C2', article_code: 'MP-4', lot_code: 'C2', qty: 4 }
  ]);

  const camp = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 0.05 });
  const c1 = await leggiRiga('MP-4#C1');
  ok('il campione cala dalle UM e NON dai colli',
     camp.stato === 200 && c1.qty === 11 && c1.qty_uom === 274.95,
     `${c1.qty} colli · ${c1.qty_uom} UM`);

  ok('la rotta dichiara il prima, il dopo e quanto e\' uscito',
     camp.dati.qty_uom_before === 275 && camp.dati.qty_uom_after === 274.95
       && camp.dati.qty_uom_delta === -0.05);

  /* Un campione piu' grosso di cio' che c'e' e' un numero sbagliato, e un
     numero DICHIARATO da chi ha la merce in mano si convalida: si rifiuta. */
  const troppoGrosso = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 9999 });
  ok('un campione piu\' grande della giacenza viene respinto, non troncato',
     troppoGrosso.stato === 409, troppoGrosso.dati.error);

  const zero = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 0 });
  ok('un campione da zero non e\' un campione', zero.stato === 400, 'stato ' + zero.stato);

  /* La riga a soli colli non ha niente da cui prelevare: si dice, non si
     inventa un saldo. */
  const senzaUm = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-02', item_key: 'MP-4#C2', qty_uom: 1 });
  ok('senza quantita\' in UM il campione viene respinto con un motivo',
     senzaUm.stato === 409, senzaUm.dati.error);

  /* Il seme vale una volta, come per removeItem: la riga che un qty_uom non
     lo ha mai avuto lo prende dal primo che la tocca. */
  const conSeme = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-02', item_key: 'MP-4#C2', qty_uom: 2, qty_uom_before: 100 });
  const c2 = await leggiRiga('MP-4#C2');
  ok('la riga senza UM le prende dal seme, e i colli restano quelli',
     conSeme.stato === 200 && c2.qty_uom === 98 && c2.qty === 4,
     `${c2.qty} colli · ${c2.qty_uom} UM`);

  const [s1, s2] = await Promise.all([
    call('POST', '/api/op/sampleItem', { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 0.5 }, 'TERMINALE-1'),
    call('POST', '/api/op/sampleItem', { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 0.5 }, 'TERMINALE-2')
  ]);
  const c1bis = await leggiRiga('MP-4#C1');
  ok('due campioni insieme scalano tutti e due, dentro la transazione',
     s1.stato === 200 && s2.stato === 200 && c1bis.qty_uom === 273.95,
     'saldo ' + c1bis.qty_uom);

  /* ── 1.4.1 — le attivita' passano dal servizio come tutto il resto ──
     Lo schedulatore non ha rotte sue: e' una collezione a chiave di testo,
     e le due domande che la coda fa davvero — «cosa e' aperto» e «cosa ho
     io» — devono poter girare su un indice e non su una scansione. */
  const compito = {
    task_id: 'TA-1', type: 'TRANSFER', priority: 4, status: 'requested',
    requested_by: 'ANDS', requested_at: Date.now(), assigned_to: null,
    payload: { article_code: 'MP-2', lot_code: 'L3', qty: 12, a: 'DP-A-01-02-T' }
  };
  const tc = await call('POST', '/api/c/tasks', compito);
  ok('un\'attivita\' entra con la sua chiave di testo', tc.stato === 200 && tc.dati.key === 'TA-1',
     'key=' + tc.dati.key);

  const tcLetto = await call('GET', '/api/c/tasks/TA-1');
  ok('il payload dell\'attivita\' rientra intero, senza schema',
     tcLetto.dati?.payload?.qty === 12 && tcLetto.dati.payload.a === 'DP-A-01-02-T');

  await call('POST', '/api/c/tasks', { ...compito, task_id: 'TA-2', priority: 2, status: 'done' });
  const aperte = await call('GET',
    '/api/c/tasks/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'status', op: 'equals', value: 'requested' })));
  ok('la coda si interroga per stato su un indice', aperte.dati.length === 1 && aperte.dati[0].task_id === 'TA-1',
     aperte.dati.length + ' aperte');

  await call('PATCH', '/api/c/tasks/TA-1', { status: 'in_progress', assigned_to: 'ANDS', started_at: Date.now() });
  const mie = await call('GET',
    '/api/c/tasks/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'assigned_to', op: 'equals', value: 'ANDS' })));
  ok('presa in carico: lo stato cambia e la sigla diventa interrogabile',
     mie.dati.length === 1 && mie.dati[0].status === 'in_progress' && mie.dati[0].payload.qty === 12);

  /* ── 1.4.2.1 — il residuo e i movimenti che l'hanno prodotto ──
     `qty_done` e `mov_ids` non hanno una colonna: vivono nel documento JSON,
     ed e' la ragione per cui un campo nuovo non e' una migrazione. Ma il
     registro delle attivita' li rilegge, quindi devono tornare interi — un
     array di numeri compreso. */
  await call('PATCH', '/api/c/tasks/TA-1', { qty_done: 5, mov_ids: [101, 102] });
  const parziale = await call('GET', '/api/c/tasks/TA-1');
  ok('un parziale resta in corso e porta con se\' il conto',
     parziale.dati?.qty_done === 5 && parziale.dati.status === 'in_progress'
     && parziale.dati.payload.qty === 12,
     'qty_done=' + parziale.dati?.qty_done);
  ok('gli identificativi dei movimenti rientrano come array di numeri',
     Array.isArray(parziale.dati?.mov_ids) && parziale.dati.mov_ids.length === 2
     && parziale.dati.mov_ids[1] === 102);

  await call('PATCH', '/api/c/tasks/TA-1', { qty_done: 12, mov_ids: [101, 102, 103], status: 'done', completed_at: Date.now() });
  const chiuso = await call('GET', '/api/c/tasks/TA-1');
  ok('a residuo zero il compito e\' chiuso, e dice con che cosa',
     chiuso.dati?.status === 'done' && chiuso.dati.qty_done === 12 && chiuso.dati.mov_ids.length === 3);

  /* La richiesta non cambia mai: `payload.qty` e' quello che si e' chiesto,
     ed e' storia. Chi lo riscrivesse ai colli mossi cancellerebbe il perche'
     di ogni parziale mai registrato. */
  ok('il richiesto resta il richiesto anche a compito chiuso',
     chiuso.dati?.payload?.qty === 12 && chiuso.dati.payload.article_code === 'MP-2');

  // ── Notifica ai terminali ─────────────────────────────────────────
  const eventi = [];
  const es = await fetch(BASE + '/api/events?client=TERMINALE-2', { headers: { Accept: 'text/event-stream' } });
  const lettore = es.body.getReader();
  const dec = new TextDecoder();
  (async () => {
    try {
      while (true) {
        const { value, done } = await lettore.read();
        if (done) break;
        const t = dec.decode(value);
        for (const blocco of t.split('\n\n')) {
          const m = blocco.match(/event: (\w+)\ndata: (.+)/);
          if (m) eventi.push({ tipo: m[1], dati: JSON.parse(m[2]) });
        }
      }
    } catch {}
  })();
  await new Promise(r => setTimeout(r, 200));

  await call('POST', '/api/c/articles', { code: 'MP-9', description: 'Fatto dal terminale 1' }, 'TERMINALE-1');
  await new Promise(r => setTimeout(r, 250));
  const cambi = eventi.filter(e => e.tipo === 'change');
  ok('il terminale 2 viene avvisato della scrittura del terminale 1',
     cambi.length === 1 && cambi[0].dati.collections.includes('articles'),
     cambi.length + ' notifiche');

  await call('POST', '/api/c/articles', { code: 'MP-10', description: 'Fatto dal terminale 2' }, 'TERMINALE-2');
  await new Promise(r => setTimeout(r, 250));
  ok('un terminale NON viene avvisato di cio\' che ha fatto lui',
     eventi.filter(e => e.tipo === 'change').length === 1,
     eventi.filter(e => e.tipo === 'change').length + ' notifiche totali');
  try { await lettore.cancel(); } catch {}

  // ── Backup a caldo ────────────────────────────────────────────────
  const dirBackup = path.join(os.tmpdir(), 'pathfinder-backup-' + Date.now());
  const bk = await call('POST', '/api/backup', { dir: dirBackup });
  ok('backup a caldo del database', bk.stato === 200 && fs.existsSync(bk.dati.file),
     bk.dati.file ? path.basename(bk.dati.file) : bk.dati.error);

  // ── Chiusura ──────────────────────────────────────────────────────
  console.log(`\n  ${passate} passate, ${fallite} fallite\n`);
  server.close();
  db.close();
  try { fs.unlinkSync(TMP); fs.rmSync(dirBackup, { recursive: true, force: true }); } catch {}
  process.exit(fallite ? 1 : 0);
})().catch(err => {
  console.error('\n  COLLAUDO INTERROTTO:', err);
  process.exit(1);
});
