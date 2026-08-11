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
  ok('Quattordici collezioni dichiarate', salute.dati.collections.length === 14,
     salute.dati.collections.length + '');

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
