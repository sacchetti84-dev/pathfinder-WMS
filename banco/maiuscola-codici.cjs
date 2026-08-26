'use strict';

/* I CODICI GIA' SCRITTI, RADDRIZZATI IN MAIUSCOLO — 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   SI PASSA UNA VOLTA SOLA, E NON E' CODICE DELL'APPLICATIVO. Come
   `campo-fantasma.cjs`: da qui in poi normalizza il servizio a ogni
   scrittura (`MAIUSCOLE` in `server/lib/schema.js`), e questo file serve
   solo a mettere in pari quello che era stato scritto prima.

     node banco/maiuscola-codici.cjs --da "banco\\db\\pathfinder-<data>.db"
     node banco/maiuscola-codici.cjs --da "..." --scrivi

   SENZA `--scrivi` NON TOCCA NIENTE: apre in sola lettura, conta e stampa.
   E' il modo di sapere cosa cambierebbe prima di lasciarglielo cambiare.

   PERCHE' ESISTE. Il 26/08, in `MAG1-RAKA-01-05-C`, lo stesso lotto stava a
   scaffale due volte — `6001412#cl260854` con 5 pezzi e `6001412#CL260854`
   con 1 — perche' una volta era stato digitato in minuscolo. Il FEFO le
   ordinava separate e chi prelevava ne trovava una e non l'altra.

   LE FUSIONI SI SCRIVONO A REGISTRO. Sommare due righe cambia un saldo, e
   §6 dice che il registro e' la firma GMP di chi ha mosso la merce: fra sei
   anni chi guarda deve vedere una riga da 6 e la ragione accanto, non una
   riga da 6 e basta. Ogni fusione lascia un movimento `EDIT` con dentro le
   due chiavi di partenza. */

const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const { NAMES, COLLECTIONS, MAIUSCOLE, normalizza, materialize } = require(path.join(RADICE, 'server/lib/schema.js'));

function argomento(nome, ripiego = null) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : ripiego;
}

const SCRIVE = process.argv.includes('--scrivi');
const FIRMA = argomento('--firma', 'SISTEMA');

function apri(file, scrittura) {
  if (!file) { console.error('\n  ✗ Manca il database: --da "banco\\db\\pathfinder-<data>.db"\n'); process.exit(1); }
  if (!fs.existsSync(file)) { console.error(`\n  ✗ Il file ${file} non esiste\n`); process.exit(1); }
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(file, scrittura ? {} : { readOnly: true });
}

/* Le chiavi che due grafie diverse farebbero collidere. Sono gli indici
   unici dichiarati nello schema, piu' `inventory[location_code+item_key]`,
   che unico non e' — l'indice e' di ricerca — ma che il servizio si rifiuta
   comunque di far nascere doppio, e per una ragione: due righe con la stessa
   chiave nello stesso vano sono un saldo che cambia da solo. */
function chiaviDiCollisione(nome) {
  const col = COLLECTIONS[nome];
  const out = [];
  for (const f of (col.unique || [])) if (f !== col.pk) out.push([f]);
  for (const p of (col.compositeUnique || [])) out.push(p);
  if (nome === 'inventory') out.push(['location_code', 'item_key']);
  return out;
}

/* Il separatore e' un carattere di controllo apposta: nessun codice di
   magazzino lo contiene, quindi ['AB','C'] e ['A','BC'] non collidono. */
function valoreChiave(doc, campi) {
  return campi.map(c => String(doc[c] ?? '')).join('\u0001');
}

/* ── Analisi ─────────────────────────────────────────────────────────── */

function analizza(db) {
  const rapporto = { collezioni: {}, fusioni: [], scontri: [] };

  for (const nome of NAMES) {
    const col = COLLECTIONS[nome];
    const righe = db.prepare(`SELECT * FROM ${nome}`).all();
    const c = { righe: righe.length, cambiate: 0, campi: {}, chiaviCambiate: 0 };
    const dopo = [];

    for (const r of righe) {
      let doc;
      try { doc = JSON.parse(r.data); } catch { continue; }
      doc[col.pk] = r[col.pk];
      const n = normalizza(nome, doc);

      let cambia = false;
      for (const p of (MAIUSCOLE[nome] || [])) {
        const campo = p.split('.').pop();
        if (JSON.stringify(doc[campo]) !== JSON.stringify(n[campo])) { /* i nidificati li prende il confronto sotto */ }
      }
      if (JSON.stringify(doc) !== JSON.stringify(n)) {
        cambia = true;
        c.cambiate++;
        for (const k of Object.keys(n))
          if (typeof n[k] === 'string' && n[k] !== doc[k]) c.campi[k] = (c.campi[k] || 0) + 1;
        if (col.pkType === 'text' && String(n[col.pk]) !== String(doc[col.pk])) c.chiaviCambiate++;
      }
      dopo.push({ chiave: r[col.pk], prima: doc, dopo: n, cambia });
    }

    /* Le collisioni si contano SUL DOPO: prima non c'erano. */
    for (const campi of chiaviDiCollisione(nome)) {
      const gruppi = new Map();
      for (const x of dopo) {
        const k = valoreChiave(x.dopo, campi);
        if (!gruppi.has(k)) gruppi.set(k, []);
        gruppi.get(k).push(x);
      }
      for (const [k, v] of gruppi) {
        if (v.length < 2) continue;
        const voce = { collezione: nome, chiave: campi.join('+'), valore: k.replace(/\u0001/g, ' + '), righe: v };
        /* Due righe di giacenza nello stesso vano si SOMMANO: e' la stessa
           merce entrata due volte con due grafie. Tutto il resto no — fondere
           due operatori o due documenti vorrebbe dire decidere quale storia
           tenere, e non e' una decisione da script. */
        if (nome === 'inventory') rapporto.fusioni.push(voce);
        else rapporto.scontri.push(voce);
      }
    }

    rapporto.collezioni[nome] = c;
    c._dopo = dopo;
  }
  return rapporto;
}

/* ── Scrittura ───────────────────────────────────────────────────────── */

function scrivi(db, rapporto) {
  const ora = Date.now();
  let aggiornate = 0, fuse = 0, movimenti = 0;

  db.exec('BEGIN');
  try {
    if (rapporto.fusioni.length) assicuraFirma(db, ora);
    /* Prima le fusioni, poi la normalizzazione: fondere due righe gia'
       maiuscolate vorrebbe dire violare l'indice a meta' strada. */
    for (const f of rapporto.fusioni) {
      const ordinate = f.righe.slice().sort((a, b) => (a.dopo.placed_at || 0) - (b.dopo.placed_at || 0));
      const tenuta = ordinate[0];
      const altre = ordinate.slice(1);

      const qtaPrima = Number(tenuta.dopo.qty) || 0;
      const somma = ordinate.reduce((s, x) => s + (Number(x.dopo.qty) || 0), 0);
      const colli = ordinate.flatMap(x => Array.isArray(x.dopo.packs) ? x.dopo.packs : []);

      const unita = { ...tenuta.dopo, qty: somma, last_updated_at: ora };
      if (colli.length) unita.packs = colli;
      unita.placed_at = Math.min(...ordinate.map(x => Number(x.dopo.placed_at) || ora));

      for (const a of altre) db.prepare('DELETE FROM inventory WHERE _id = ?').run(a.chiave);
      salva(db, 'inventory', tenuta.chiave, unita);
      fuse += altre.length;

      /* IL SALDO CAMBIA, E IL REGISTRO DEVE POTERLO SPIEGARE FRA SEI ANNI. */
      const mov = normalizza('mov_log', {
        ts: ora, type: 'EDIT',
        article_code: unita.article_code, article_description: unita.article_description || '',
        lot_code: unita.lot_code, location_code: unita.location_code, dest_location: null,
        user: FIRMA, doc_ref: '',
        notes: `2.6 normalizzazione maiuscole: fuse ${ordinate.length} righe dello stesso lotto scritto con grafie diverse — ${ordinate.map(x => `${x.prima.item_key}(${x.prima.qty})`).join(' + ')}`,
        qty_before: qtaPrima, qty_delta: somma - qtaPrima, qty_after: somma,
        qty_uom_delta: null, uom: unita.uom || null,
      });
      const mat = materialize('mov_log', mov);
      const cols = Object.keys(mat);
      db.prepare(`INSERT INTO mov_log (${[...cols, 'data'].join(', ')}) VALUES (${[...cols, 'data'].map(() => '?').join(', ')})`)
        .run(...cols.map(c => mat[c]), JSON.stringify(mov));
      movimenti++;
    }

    const fuseVia = new Set(rapporto.fusioni.flatMap(f =>
      f.righe.slice().sort((a, b) => (a.dopo.placed_at || 0) - (b.dopo.placed_at || 0)).map(x => `inventory\u0001${x.chiave}`)));

    for (const nome of NAMES) {
      for (const x of rapporto.collezioni[nome]._dopo) {
        if (!x.cambia) continue;
        if (fuseVia.has(`${nome}\u0001${x.chiave}`)) continue;   // ci ha gia' pensato la fusione
        salva(db, nome, x.chiave, x.dopo);
        aggiornate++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { aggiornate, fuse, movimenti };
}

/* NESSUNA FIRMA ORFANA — voce 18, e la voce 46 dice come si fa.
   Un movimento porta la sigla di chi l'ha fatto, e quella sigla deve avere
   un nome dietro: e' la domanda — «chi» — che il registro deve saper reggere
   per sei anni. Le fusioni le fa questo script, e allora la sua sigla entra
   in anagrafica come ci sono entrati gli operatori storici: DISATTIVATA e
   SENZA PIN, cioe' incapace di operare, esistente solo perche' il registro
   la nomina. */
function assicuraFirma(db, ora) {
  const c = db.prepare('SELECT COUNT(*) AS c FROM operators WHERE initials = ?').get(FIRMA);
  if (c && c.c) return;
  const op = normalizza('operators', {
    op_id: `OP-${FIRMA}`, first_name: 'Normalizzazione', last_name: 'automatica 2.6',
    initials: FIRMA, role: 'operator', pin_hash: null, pin_salt: null, pin_set_at: null,
    active: false, created_at: ora, updated_at: ora,
    notes: "Non e una persona: e la firma delle fusioni scritte da banco/maiuscola-codici.cjs. Disattivata e senza PIN, non puo operare: esiste perche il registro la nomina (voci 18 e 46).",
  });
  const mat = materialize('operators', op);
  const cols = Object.keys(mat);
  const tutte = ['op_id', ...cols, 'data'];
  db.prepare(`INSERT INTO operators (${tutte.join(', ')}) VALUES (${tutte.map(() => '?').join(', ')})`)
    .run(op.op_id, ...cols.map(x => mat[x]), JSON.stringify(op));
}

/* Riscrive una riga: colonne materializzate e documento insieme. Se la
   chiave testuale e' cambiata di grafia, la riga cambia nome — si cancella
   e si riscrive, perche' una PRIMARY KEY non si aggiorna in luogo. */
function salva(db, nome, chiaveVecchia, doc) {
  const col = COLLECTIONS[nome];
  const mat = materialize(nome, doc);
  const cols = Object.keys(mat);
  const chiaveNuova = col.pkType === 'auto' ? Number(chiaveVecchia) : String(doc[col.pk]);

  if (col.pkType === 'text' && String(chiaveVecchia) !== chiaveNuova) {
    db.prepare(`DELETE FROM ${nome} WHERE ${col.pk} = ?`).run(String(chiaveVecchia));
    const tutte = [col.pk, ...cols, 'data'];
    db.prepare(`INSERT INTO ${nome} (${tutte.join(', ')}) VALUES (${tutte.map(() => '?').join(', ')})`)
      .run(chiaveNuova, ...cols.map(c => mat[c]), JSON.stringify(doc));
    return;
  }
  const { [col.pk]: _via, ...senzaChiave } = doc;
  const corpo = col.pkType === 'auto' ? senzaChiave : doc;
  const set = [...cols.map(c => `${c} = ?`), 'data = ?'].join(', ');
  db.prepare(`UPDATE ${nome} SET ${set} WHERE ${col.pk} = ?`)
    .run(...cols.map(c => mat[c]), JSON.stringify(corpo), chiaveNuova);
}

/* ── Resa ────────────────────────────────────────────────────────────── */

function principale() {
  const file = argomento('--da', null);
  const db = apri(file, SCRIVE);
  const r = analizza(db);

  console.log(`\n  MAIUSCOLA I CODICI — ${SCRIVE ? 'SCRIVE' : 'PROVA, non tocca niente'}`);
  console.log(`  ${file}\n`);

  let totale = 0;
  for (const [nome, c] of Object.entries(r.collezioni)) {
    if (!c.cambiate) continue;
    totale += c.cambiate;
    const campi = Object.entries(c.campi).map(([k, n]) => `${k}×${n}`).join(' ');
    console.log(`    ${nome.padEnd(18)} ${String(c.cambiate).padStart(5)} righe su ${String(c.righe).padStart(6)}  — ${campi}` +
      (c.chiaviCambiate ? `  · CHIAVI riscritte: ${c.chiaviCambiate}` : ''));
  }
  if (!totale) console.log('    nessuna riga da cambiare: i codici sono gia\' tutti maiuscoli');

  if (r.fusioni.length) {
    console.log('\n  RIGHE CHE SI FONDONO — stesso lotto, stesso vano, due grafie');
    for (const f of r.fusioni) {
      const s = f.righe.map(x => `${x.prima.item_key} (${x.prima.qty})`).join('  +  ');
      const somma = f.righe.reduce((a, x) => a + (Number(x.dopo.qty) || 0), 0);
      console.log(`    ${f.valore.split(' + ')[0]}: ${s}  =  ${somma}`);
    }
    console.log('    ogni fusione lascia un movimento EDIT a registro, con dentro le chiavi di partenza');
  }

  if (r.scontri.length) {
    console.log('\n  ⚠ SCONTRI CHE NON SI FONDONO DA SOLI — vanno guardati a mano');
    for (const s of r.scontri)
      console.log(`    ${s.collezione} [${s.chiave}] ${s.valore}: ${s.righe.length} righe`);
    console.log('    fondere due operatori o due documenti vuol dire scegliere quale storia tenere, e non e\' da script');
  }

  if (!SCRIVE) {
    console.log('\n  Niente e\' stato scritto. Per applicare:  --scrivi\n');
    if (typeof db.close === 'function') db.close();
    process.exit(r.scontri.length ? 1 : 0);
  }

  if (r.scontri.length) {
    console.error('\n  ✗ Ci sono scontri da guardare a mano: non scrivo niente.\n');
    if (typeof db.close === 'function') db.close();
    process.exit(1);
  }

  const esito = scrivi(db, r);
  console.log(`\n  ✓ ${esito.aggiornate} righe riscritte · ${esito.fuse} fuse · ${esito.movimenti} movimenti a registro\n`);
  if (typeof db.close === 'function') db.close();
}

if (require.main === module) principale();

module.exports = { analizza, scrivi, chiaviDiCollisione };
