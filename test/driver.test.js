import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { DriverSqlite } = require('../server/lib/driver-sqlite.js');
const { leggiEnvLocale } = require('../server/lib/db.js');
const { NAMES } = require('../server/lib/schema.js');

/* LA STESSA BATTERIA SUI DUE DRIVER.

   E' il senso del doppio driver: se SQLite e PostgreSQL si comportano
   diversamente su una qualunque di queste, il collaudo lo dice qui invece
   di lasciarlo scoprire a un turno di magazzino. Le prove che tentano di
   ROMPERE stanno in fondo, e sono la parte che conta: quel che regge
   quando lo si usa bene lo si sa gia'.

   Senza `PATHFINDER_PG` gira il solo SQLite e le prove PostgreSQL si
   dichiarano saltate — un collaudo che tace su meta' del lavoro sarebbe
   peggio di uno che dice «questa meta' non l'ho vista». */

/* IL COLLAUDO HA UN DATABASE SUO, E NON PUÒ AVERNE UN ALTRO.

   Questa batteria fa `TRUNCATE` di tutti i tavoli a ogni corsa: puntata al
   database su cui qualcuno sta PROVANDO l'applicativo, gli porta via i dati
   sotto i piedi. È successo il 26/08 — una corsa di `npm test` ha svuotato
   `pathfinder_prova`, dove stavano gli 11.197 articoli appena migrati, e se
   n'è accorto solo chi è andato a guardare i conteggi.

   Si usa `PATHFINDER_PG_COLLAUDO`, e in mancanza NON si ripiega su
   `PATHFINDER_PG`: si salta, dicendo perché. Un ripiego silenzioso su un
   database di lavoro è esattamente il gesto che ha fatto il danno. */
const env = leggiEnvLocale(process.cwd());
const PG = process.env.PATHFINDER_PG_COLLAUDO || env.PATHFINDER_PG_COLLAUDO || null;

/** Il nome del database in fondo alla stringa di connessione. */
function nomeDatabase(stringa) {
  try { return new URL(stringa).pathname.replace(/^\//, ''); } catch { return ''; }
}

function batteria(etichetta, apri, chiudi) {
  describe(etichetta, () => {
    /** @type {any} */ let db;
    beforeAll(async () => { db = await apri(); });
    afterAll(async () => { if (db) await chiudi(db); });

    /* ── Il giro normale ──────────────────────────────────────────── */

    it('scrive una riga e la rilegge uguale', async () => {
      const id = await db.add('inventory', {
        item_key: '6001412#CL260854', article_code: '6001412', lot_code: 'CL260854',
        location_code: 'MAG1-RAKA-01-05-C', qty: 5, notes: 'prova',
      });
      const r = await db.get('inventory', id);
      expect(r.qty).toBe(5);
      expect(r.item_key).toBe('6001412#CL260854');
      expect(r._id).toBe(Number(id));
    });

    /* Era il difetto che il 26/08 ha tinto di rosso 28 prove del servizio:
       senza la chiave nella INSERT, l'ON CONFLICT non scatta e ogni
       salvataggio inserisce una riga nuova. Il saldo non scende mai. */
    it('AGGIORNA invece di inserire una riga nuova', async () => {
      const id = await db.add('inventory', { item_key: 'A#1', location_code: 'L1', qty: 10 });
      const r = await db.get('inventory', id);
      await db.put('inventory', { ...r, qty: 3 });
      expect((await db.get('inventory', id)).qty).toBe(3);
      const tutte = await db.query('inventory', { criteria: { field: 'item_key', op: 'equals', value: 'A#1' } });
      expect(tutte).toHaveLength(1);
    });

    it('una collezione a chiave testuale si aggiorna sulla sua chiave', async () => {
      await db.put('operators', { op_id: 'OP-T1', initials: 'T1', role: 'operator', active: true });
      await db.put('operators', { op_id: 'OP-T1', initials: 'T1', role: 'lead', active: true });
      expect(await db.count('operators', { field: 'initials', op: 'equals', value: 'T1' })).toBe(1);
      expect((await db.get('operators', 'OP-T1')).role).toBe('lead');
    });

    it('update fonde e non sostituisce', async () => {
      const id = await db.add('lots', { article_code: 'A9', lot_code: 'L9', uom: 'KG', uom_per_collo: 25 });
      await db.update('lots', id, { uom_per_collo: 10 });
      const r = await db.get('lots', id);
      expect(r.uom).toBe('KG');
      expect(r.uom_per_collo).toBe(10);
    });

    it('update su una riga che non c’è non inventa niente', async () => {
      expect(await db.update('lots', 999999, { uom: 'PZ' })).toBe(0);
    });

    it('cancella, e dice quante righe ha tolto', async () => {
      const id = await db.add('disabled', { location_code: 'DA-CANCELLARE' });
      expect(await db.delete('disabled', id)).toBe(1);
      expect(await db.delete('disabled', id)).toBe(0);
      expect(await db.get('disabled', id)).toBeNull();
    });

    /* ── I codici in maiuscolo ────────────────────────────────────── */

    it('il lotto minuscolo entra maiuscolo, e si trova con tutte e due le grafie', async () => {
      const id = await db.add('inventory', {
        item_key: '6001412#cl999', article_code: '6001412', lot_code: 'cl999',
        location_code: 'mag1-raka-02-01-a', qty: 1,
      });
      const r = await db.get('inventory', id);
      expect(r.lot_code).toBe('CL999');
      expect(r.location_code).toBe('MAG1-RAKA-02-01-A');
      expect(await db.count('inventory', { field: 'lot_code', op: 'equals', value: 'cl999' })).toBe(1);
      expect(await db.count('inventory', { field: 'lot_code', op: 'equals', value: 'CL999' })).toBe(1);
    });

    it('IL PIN NON SI TOCCA nemmeno passando dal database', async () => {
      await db.put('operators', { op_id: 'OP-PIN', initials: 'pn', pin_hash: 'aBcD+/12=', pin_salt: 'QwEr+/0=', active: true });
      const r = await db.get('operators', 'OP-PIN');
      expect(r.pin_hash).toBe('aBcD+/12=');
      expect(r.initials).toBe('PN');
    });

    it('le chiavi di configurazione restano in camelCase', async () => {
      await db.put('meta', { key: 'areaWip', value: 'MAG1-WIP-01' });
      expect((await db.get('meta', 'areaWip')).value).toBe('MAG1-WIP-01');
    });

    /* ── I lotti di scrittura ─────────────────────────────────────── */

    it('scrive tremila righe, e le ritrova tutte', async () => {
      const righe = Array.from({ length: 3000 }, (_, i) => ({ code: `BULK${i}`, category: 'MP', description: `riga ${i}` }));
      const chiavi = await db.bulkAdd('articles', righe);
      expect(chiavi).toHaveLength(3000);
      expect(new Set(chiavi.map(String)).size).toBe(3000);
      expect(await db.count('articles', { field: 'category', op: 'equals', value: 'MP' })).toBe(3000);
    });

    it('un bulkPut con righe nuove E righe che esistono già le tratta per quel che sono', async () => {
      const a = await db.add('lots', { article_code: 'MIX', lot_code: 'L1', uom: 'KG' });
      const prima = await db.get('lots', a);
      const chiavi = await db.bulkPut('lots', [
        { ...prima, uom: 'PZ' },                       // esiste
        { article_code: 'MIX', lot_code: 'L2', uom: 'KG' },  // nuova
      ]);
      expect(chiavi).toHaveLength(2);
      expect(Number(chiavi[0])).toBe(Number(a));
      expect((await db.get('lots', a)).uom).toBe('PZ');
      expect(await db.count('lots', { field: 'article_code', op: 'equals', value: 'MIX' })).toBe(2);
    });

    it('un elenco vuoto non scrive niente e non si rompe', async () => {
      expect(await db.bulkAdd('articles', [])).toEqual([]);
      expect(await db.bulkPut('articles', [])).toEqual([]);
    });

    /* ── I filtri ─────────────────────────────────────────────────── */

    /* Nello SQL `startsWith` e' esatto — `substr(col,1,N) = ?`, uguale nei
       due database. Su un campo-CODICE il termine cercato viene pero'
       maiuscolato prima, come il dato: cercare `zona-` trova `ZONA-`, ed e'
       quel che serve a chi digita. Le due cose insieme fanno la ricerca che
       il magazzino si aspetta, senza dipendere dal `LIKE` di nessuno. */
    it('startsWith su un campo-codice trova con tutte e due le grafie', async () => {
      await db.bulkAdd('disabled', [{ location_code: 'ZONA-A-01' }, { location_code: 'ZONA-A-02' }, { location_code: 'ZONB-A-01' }]);
      expect(await db.query('disabled', { criteria: { field: 'location_code', op: 'startsWith', value: 'ZONA-' } })).toHaveLength(2);
      expect(await db.query('disabled', { criteria: { field: 'location_code', op: 'startsWith', value: 'zona-' } })).toHaveLength(2);
    });

    /* Su un campo che codice NON e' — `type` e' un enum — non c'e' nessuna
       normalizzazione a coprire, e li' si vede che lo SQL e' esatto: e'
       questa la differenza che il `LIKE` di SQLite nascondeva. */
    it('e su un campo che codice non è resta esatto: il LIKE di SQLite qui sbagliava', async () => {
      await db.bulkAdd('mov_log', [{ ts: 1, type: 'PICK' }, { ts: 2, type: 'PICK' }]);
      expect(await db.count('mov_log', { field: 'type', op: 'startsWith', value: 'PIC' })).toBe(2);
      expect(await db.count('mov_log', { field: 'type', op: 'startsWith', value: 'pic' })).toBe(0);
    });

    it('between, anyOf e gli estremi', async () => {
      await db.bulkAdd('mov_log', [10, 20, 30, 40].map(ts => ({ ts, type: 'MOVE', lot_code: 'X' })));
      expect(await db.count('mov_log', { field: 'ts', op: 'between', value: [20, 30] })).toBe(2);
      expect(await db.count('mov_log', { field: 'ts', op: 'above', value: 30 })).toBe(1);
      expect(await db.count('mov_log', { field: 'ts', op: 'aboveOrEqual', value: 30 })).toBe(2);
      expect(await db.count('mov_log', { field: 'ts', op: 'anyOf', value: [10, 40] })).toBe(2);
      expect(await db.count('mov_log', { field: 'ts', op: 'anyOf', value: [] })).toBe(0);
    });

    it('ordina, limita e salta', async () => {
      const r = await db.query('mov_log', { criteria: { field: 'type', op: 'equals', value: 'MOVE' }, orderBy: 'ts', reverse: true, limit: 2 });
      expect(r.map(x => x.ts)).toEqual([40, 30]);
      const s = await db.query('mov_log', { criteria: { field: 'type', op: 'equals', value: 'MOVE' }, orderBy: 'ts', reverse: false, limit: 2, offset: 1 });
      expect(s.map(x => x.ts)).toEqual([20, 30]);
    });

    /* LA COLLAZIONE E' LA DIVERGENZA CHE NON SI VEDE FINCHE' NON SI GUARDA.
       SQLite confronta il testo byte per byte. PostgreSQL usa quella del
       database, e con `it_IT` o `en_US` la punteggiatura pesa meno e le
       maiuscole si mescolano alle minuscole: `ORDER BY location_code` e' quel
       che il client legge per disegnare una corsia, e due ordini diversi
       vogliono dire un magazzino che si vede rimescolato cambiando database.

       In ordine di byte: `-` sta a 0x2D, `A` a 0x41, `_` a 0x5F, `a` a 0x61.
       Un ordinamento linguistico non li mette cosi'. Si usa `status`, che
       codice non e' e quindi non viene maiuscolato: su un campo-codice la
       differenza fra `A` e `a` sparirebbe prima di arrivare al database.

       Se questa prova fallisce su PostgreSQL, il database non e' stato creato
       con `LC_COLLATE 'C'` e le colonne non portano `COLLATE "C"`. */
    it('IL TESTO SI ORDINA BYTE PER BYTE, uguale nei due database', async () => {
      const codici = ['Z_1', 'Za', 'Z-1', 'ZA'];
      await db.bulkAdd('loc_status', codici.map((c, i) => ({ location_code: `ORD-${i}`, status: c, updated_at: i })));
      const letti = (await db.query('loc_status', {
        criteria: { field: 'status', op: 'startsWith', value: 'Z' }, orderBy: 'status',
      })).map(r => r.status);
      expect(letti).toEqual(['Z-1', 'ZA', 'Z_1', 'Za']);
    });

    it('countAll conta tutte le collezioni in un colpo', async () => {
      const c = await db.countAll();
      expect(Object.keys(c).sort()).toEqual([...NAMES].sort());
      expect(c.articles).toBe(3000);
    });

    /* ── Le transazioni ───────────────────────────────────────────── */

    it('una transazione che fallisce non lascia niente dietro', async () => {
      const prima = await db.count('disposal_archive');
      await expect(db.transaction(['disposal_archive'], async () => {
        await db.put('disposal_archive', { doc_id: 'SMA-X1', created_at: 1, article_code: 'A' });
        throw new Error('a metà strada');
      })).rejects.toThrow('a metà strada');
      expect(await db.count('disposal_archive')).toBe(prima);
      expect(await db.get('disposal_archive', 'SMA-X1')).toBeNull();
    });

    it('e una che riesce lascia tutto', async () => {
      await db.transaction(['disposal_archive'], async () => {
        await db.put('disposal_archive', { doc_id: 'SMA-X2', created_at: 2, article_code: 'A' });
        await db.put('disposal_archive', { doc_id: 'SMA-X3', created_at: 3, article_code: 'B' });
      });
      expect(await db.get('disposal_archive', 'SMA-X2')).not.toBeNull();
      expect(await db.get('disposal_archive', 'SMA-X3')).not.toBeNull();
    });

    /* Il difetto che la coda esiste per chiudere: con `await` dentro una
       transazione il ciclo degli eventi passa il turno, e senza coda una
       seconda transazione si infilerebbe DENTRO la prima. */
    it('due transazioni insieme non si intrecciano', async () => {
      const ordine = [];
      const uno = db.transaction(['loc_status'], async () => {
        ordine.push('1-inizio');
        await db.put('loc_status', { location_code: 'TX-1', status: 'x', updated_at: 1 });
        await new Promise(r => setTimeout(r, 25));
        ordine.push('1-fine');
      });
      const due = db.transaction(['loc_status'], async () => {
        ordine.push('2-inizio');
        await db.put('loc_status', { location_code: 'TX-2', status: 'y', updated_at: 2 });
        ordine.push('2-fine');
      });
      await Promise.all([uno, due]);
      expect(ordine).toEqual(['1-inizio', '1-fine', '2-inizio', '2-fine']);
    });

    /* Una transazione fallita non deve avvelenare la coda, o da lì in poi
       ogni scrittura resterebbe appesa a una promessa già rifiutata. */
    it('una transazione fallita non blocca quelle dopo', async () => {
      await expect(db.transaction(['loc_status'], async () => { throw new Error('rotta'); })).rejects.toThrow();
      await db.transaction(['loc_status'], async () => {
        await db.put('loc_status', { location_code: 'TX-3', status: 'z', updated_at: 3 });
      });
      expect(await db.count('loc_status', { field: 'location_code', op: 'equals', value: 'TX-3' })).toBe(1);
    });

    it('la revisione sale a ogni scrittura, e l’avviso dice quali collezioni', async () => {
      const visti = [];
      const stacca = db.onChange(ev => visti.push(ev));
      const prima = await db.currentRevision();
      await db.transaction(['lots', 'udc'], async () => {
        await db.add('lots', { article_code: 'REV', lot_code: 'R1' });
        await db.put('udc', { udc_id: 'UDC-REV', status: 'empty', location_code: 'L' });
      });
      stacca();
      expect(await db.currentRevision()).toBeGreaterThan(prima);
      expect(visti).toHaveLength(1);
      expect([...visti[0].collections].sort()).toEqual(['lots', 'udc']);
    });

    /* ── I tentativi di rottura ───────────────────────────────────── */

    it('una collezione che non esiste è un 400, non SQL eseguito', async () => {
      await expect(db.all('inventory; DROP TABLE inventory')).rejects.toMatchObject({ status: 400 });
      await expect(db.count('non_esiste')).rejects.toMatchObject({ status: 400 });
      expect(await db.count('inventory')).toBeGreaterThan(0);
    });

    it('un campo non indicizzato non filtra, e non finisce nello SQL', async () => {
      await expect(db.query('inventory', { criteria: { field: 'notes', op: 'equals', value: 'x' } }))
        .rejects.toMatchObject({ status: 400 });
      await expect(db.query('inventory', { criteria: { field: "qty=1 OR '1'='1", op: 'equals', value: 'x' } }))
        .rejects.toMatchObject({ status: 400 });
    });

    it('un orderBy ostile ripiega sulla chiave invece di eseguire', async () => {
      const r = await db.query('lots', { orderBy: 'lot_code; DELETE FROM lots --', limit: 1 });
      expect(Array.isArray(r)).toBe(true);
      expect(await db.count('lots')).toBeGreaterThan(0);
    });

    it('un valore ostile è un valore, non SQL', async () => {
      const ostile = "'; DROP TABLE inventory; --";
      const id = await db.add('inventory', { item_key: ostile, location_code: 'X', qty: 1 });
      const r = await db.get('inventory', id);
      expect(r.item_key).toBe(ostile.toUpperCase());
      expect(await db.count('inventory')).toBeGreaterThan(0);
    });

    it('un documento con dentro di tutto sopravvive al giro', async () => {
      const strano = {
        item_key: 'STRANO#1', location_code: 'X', qty: 1,
        notes: 'apostrofo \' virgolette " barra \\ ritorno \n tab \t emoji 🧊 accenti àèìòù',
        annidato: { elenco: [1, 'due', null, { tre: true }], vuoto: {}, nulla: null },
      };
      const id = await db.add('inventory', strano);
      const r = await db.get('inventory', id);
      expect(r.notes).toBe(strano.notes);
      expect(r.annidato).toEqual(strano.annidato);
    });

    it('una chiave testuale mancante è un 400, non una riga senza nome', async () => {
      await expect(db.add('operators', { initials: 'ZZ' })).rejects.toMatchObject({ status: 400 });
    });

    it('un anyOf smisurato viene respinto invece di sfondare il limite di argomenti', async () => {
      const troppi = Array.from({ length: 80000 }, (_, i) => i);
      await expect(db.count('mov_log', { field: 'ts', op: 'anyOf', value: troppi }))
        .rejects.toMatchObject({ status: 400 });
    });

    /* IL BACKUP E' LA META' DEL RIPRISTINO, E VA PROVATO COME TALE.
       Su SQLite e' una copia coerente del file; su PostgreSQL un `pg_dump`
       in formato custom. In tutti e due i casi la prova non guarda che il
       file esista — un file esiste anche quando dentro non c'e' niente —
       ma che pesi, e che porti l'estensione che il driver dichiara. */
    it('scrive un backup, e il backup non e vuoto', async () => {
      const dir = join(tmpdir(), `pathfinder-bk-${process.pid}-${Date.now()}`);
      const dest = join(dir, `copia${db.estensioneBackup}`);
      await db.backupTo(dest);
      const st = statSync(dest);
      expect(st.size).toBeGreaterThan(1024);
      rmSync(dir, { recursive: true, force: true });
    });

    /* MEGLIO NESSUN BACKUP CHE UNO CHE SEMBRA UN BACKUP.
       Se la rilettura fallisce, il file NON deve restare li' a farsi contare
       da chi guarda la cartella e conclude che le copie ci sono. Si prova
       facendo fallire `pg_restore` apposta. Vale solo per PostgreSQL: su
       SQLite la copia la fa il motore, e non c'e' un secondo processo da
       far sbagliare. */
    it('un dump che non si rilegge viene cancellato, non tenuto', async () => {
      if (db.dialetto !== 'postgres') return;
      const dir = join(tmpdir(), `pathfinder-bk-rotto-${process.pid}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const dest = join(dir, 'copia.dump');
      const prima = process.env.PATHFINDER_PG_RESTORE;
      process.env.PATHFINDER_PG_RESTORE = join(dir, 'non-esiste-questo.exe');
      try {
        await expect(db.backupTo(dest)).rejects.toThrow(/non si rilegge/);
        expect(existsSync(dest)).toBe(false);
      } finally {
        if (prima === undefined) delete process.env.PATHFINDER_PG_RESTORE;
        else process.env.PATHFINDER_PG_RESTORE = prima;
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('e dichiara l estensione giusta per il database che ha dietro', () => {
      expect(db.estensioneBackup).toMatch(/^\.(db|dump)$/);
    });

    it('chiedere una riga con una chiave assurda non esplode', async () => {
      expect(await db.get('inventory', 'non-un-numero')).toBeNull();
      expect(await db.get('operators', '')).toBeNull();
    });
  });
}

/* ── SQLite: gira sempre ──────────────────────────────────────────── */

const fileSqlite = join(tmpdir(), `pathfinder-driver-${process.pid}.db`);
batteria('driver SQLite',
  async () => {
    for (const s of ['', '-wal', '-shm']) { try { rmSync(fileSqlite + s); } catch { /* non c'era */ } }
    return new DriverSqlite(fileSqlite);
  },
  async (db) => {
    await db.close();
    for (const s of ['', '-wal', '-shm']) { try { rmSync(fileSqlite + s); } catch { /* gia' tolto */ } }
  });

/* ── PostgreSQL: solo se c'è un'istanza ───────────────────────────── */

/* SI PROVA A COLLEGARSI UNA VOLTA, PRIMA DI DICHIARARE.
   Un `beforeAll` che non riesce a connettersi tinge di rosso tutta la
   batteria e non dice perche'; qui si guarda prima, e la riga saltata porta
   il motivo. Un collaudo che tace su meta' del lavoro sarebbe peggio di uno
   che dice «questa meta' non l'ho vista, ed ecco perche'». */
async function raggiungibile(stringa) {
  if (!stringa) return 'PATHFINDER_PG_COLLAUDO non impostata';
  /* La cintura, oltre alle bretelle: anche se qualcuno impostasse
     `PATHFINDER_PG_COLLAUDO` sul database sbagliato, il nome deve dirlo. */
  const nome = nomeDatabase(stringa);
  if (!/_collaudo$/.test(nome))
    return `il database si chiama "${nome}" e non finisce per "_collaudo": ` +
           'questa batteria svuota i tavoli, e non lo fa su un database di lavoro';
  try {
    const { DriverPostgres } = require('../server/lib/driver-postgres.js');
    const d = new DriverPostgres(stringa);
    await d.pool.query('SELECT 1');
    await d.close();
    return null;
  } catch (e) { return e.message; }
}

const perche = await raggiungibile(PG);

if (!perche) {
  const { DriverPostgres } = require('../server/lib/driver-postgres.js');
  batteria('driver PostgreSQL',
    async () => {
      const db = new DriverPostgres(PG);
      await db.pronto();
      /* Si parte da vuoto, o le prove leggerebbero quel che ha lasciato la
         corsa di prima. `TRUNCATE ... RESTART IDENTITY` rimette anche le
         sequenze, che e' quel che le prove sulle chiavi si aspettano. */
      await db.pool.query(`TRUNCATE ${[...NAMES, '_revision'].join(', ')} RESTART IDENTITY CASCADE`);
      return db;
    },
    async (db) => { await db.close(); });
} else {
  describe.skip(`driver PostgreSQL — NON PROVATO: ${perche}`, () => {
    it('si accende impostando PATHFINDER_PG in .env.local', () => { /* saltato */ });
  });
}
