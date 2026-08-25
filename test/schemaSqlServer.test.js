import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COLLECTIONS, NAMES } = require('../server/lib/schema.js');
const ms = require('../server/sqlserver/schema-sqlserver.js');

/* IL RAMO SQL SERVER E' PARALLELO, MA NON E' SCOLLEGATO.

   Stessa ragione per cui `schemaPostgres` gira a ogni `npm test`: il giorno
   che qualcuno lo prova, lo schema deve descrivere le stesse venti
   collezioni che il servizio usa OGGI - non quelle di quando e' stato
   scritto. Una collezione aggiunta a `lib/schema.js` e dimenticata qui
   sarebbe un tavolo che non esiste, e lo si scoprirebbe a meta' migrazione.

   Qui pero' c'e' qualcosa in piu', e sono le tre trappole di T-SQL che
   SQLite e PostgreSQL non hanno. Non sono ipotesi: due delle tre morderebbero
   gia' adesso, su questo schema. */

describe('lo schema SQL Server segue quello vero, non una copia', () => {
  it('copre TUTTE le collezioni, e nessuna in piu\'', () => {
    const create = ms.schemaCompleto().filter(s => s.includes('CREATE TABLE'));
    expect(create).toHaveLength(NAMES.length);
    for (const nome of NAMES) {
      expect(ms.createTableSQL(nome)).toContain(`CREATE TABLE [${nome}] (`);
    }
  });

  it('porta ogni colonna indicizzata dichiarata in `lib/schema.js`', () => {
    for (const nome of NAMES) {
      const col = COLLECTIONS[nome];
      const ddl = ms.createTableSQL(nome);
      for (const f of col.indexed) expect(ddl).toContain(`[${f}]`);
    }
  });

  it('genera gli stessi indici, semplici e composti', () => {
    for (const nome of NAMES) {
      const col = COLLECTIONS[nome];
      const attesi = col.indexed.filter(f => f !== col.pk).length
        + (col.composite || []).length
        + (col.compositeUnique || []).length;
      expect(ms.createIndexSQL(nome)).toHaveLength(attesi);
    }
  });

  it('rispetta gli UNIQUE dichiarati, e non ne inventa', () => {
    for (const nome of NAMES) {
      const col = COLLECTIONS[nome];
      for (const f of col.indexed) {
        if (f === col.pk) continue;
        const riga = ms.createIndexSQL(nome).find(s => s.includes(`[ix_${nome}_${f}]`));
        expect(riga).toBeTruthy();
        expect(/CREATE UNIQUE INDEX/.test(riga)).toBe((col.unique || []).includes(f));
      }
    }
  });
});

describe('le tre trappole di T-SQL', () => {
  /* TRAPPOLA 1, e non e' teorica: `meta` ha una colonna che si chiama `key`,
     che in T-SQL e' una parola RISERVATA. Senza le parentesi quadre quel
     CREATE TABLE non compila. */
  it('`meta.key` esiste davvero, ed e\' quotato', () => {
    expect(COLLECTIONS.meta.pk).toBe('key');
    expect(ms.createTableSQL('meta')).toContain('[key] NVARCHAR');
  });

  /* La guardia davanti all'istruzione interroga `sys.indexes`, e li' `name`
     e' una colonna di sistema: sta bene nuda, e va tolta prima di guardare.
     Quel che si controlla e' il CORPO - la CREATE vera. */
  const corpo = (sql) => sql
    .replace(/^IF OBJECT_ID\([^)]*\) IS NULL /, '')
    .replace(/^IF NOT EXISTS \(SELECT 1 FROM sys\.indexes WHERE name = N'[^']*' AND object_id = OBJECT_ID\([^)]*\)\) /, '');

  it('nessun identificatore resta nudo nel corpo dell\'istruzione', () => {
    const nudi = [];
    for (const nome of NAMES) {
      const col = COLLECTIONS[nome];
      for (const sql of ms.createSQL(nome)) {
        const c = corpo(sql);
        if (sql.includes('CREATE TABLE')) expect(c).toContain(`CREATE TABLE [${nome}]`);
        else expect(c).toContain(`ON [${nome}](`);
        /* un nome preceduto da `[` o attaccato a un altro carattere di parola
           - dentro `ix_zones_site_id`, per dire - non e' un identificatore
           nudo. Lo e' solo se sta li' da solo. */
        for (const f of [nome, ...col.indexed]) {
          const nudo = new RegExp(`(?<![\\[\\w_])${f}(?![\\w_\\]])`);
          if (nudo.test(c)) nudi.push(`${nome}: ${f} in «${c.slice(0, 70)}…»`);
        }
      }
    }
    expect(nudi).toEqual([]);
  });

  /* TRAPPOLA 2, e questa morderebbe su OGNI tabella: una chiave di indice non
     puo' essere NVARCHAR(MAX), e su SQLite quelle colonne sono TEXT senza
     limite e indicizzate tutte. */
  it('nessuna colonna indicizzata nasce senza limite', () => {
    for (const nome of NAMES) {
      const ddl = ms.createTableSQL(nome);
      /* l'unico MAX ammesso e' il documento, che non si indicizza */
      const max = ddl.match(/\[(\w+)\] NVARCHAR\(MAX\)/g) || [];
      expect(max).toEqual(['[data] NVARCHAR(MAX)']);
    }
  });

  it('la larghezza sta larga sul valore piu\' lungo che lo schema produce', () => {
    /* `item_key` e' `ARTICOLO#LOTTO`: trenta piu' trenta piu' il separatore */
    expect(ms.LARGHEZZA).toBeGreaterThan(30 + 1 + 30);
    /* e sotto il limite della chiave di indice, che si misura in byte */
    expect(ms.LARGHEZZA * 2).toBeLessThan(1700);
  });

  /* TRAPPOLA 3: `IF NOT EXISTS` non esiste su CREATE TABLE ne' su CREATE
     INDEX. Lo schema si rilancia sopra un database che gia' esiste, e senza
     guardia il secondo giro muore. */
  it('ogni istruzione e\' ripetibile', () => {
    for (const sql of ms.schemaCompleto()) {
      const guardata = sql.startsWith('IF OBJECT_ID(') || sql.startsWith('IF NOT EXISTS (SELECT 1 FROM sys.indexes');
      expect(guardata).toBe(true);
    }
  });
});

describe('il documento', () => {
  it('e\' NVARCHAR(MAX) con il controllo di validita\'', () => {
    for (const nome of NAMES) {
      const ddl = ms.createTableSQL(nome);
      expect(ddl).toContain('[data] NVARCHAR(MAX) NOT NULL');
      expect(ddl).toContain(`CONSTRAINT [ck_${nome}_data_json] CHECK (ISJSON([data]) = 1)`);
    }
  });

  /* NVARCHAR e mai VARCHAR: descrizioni articolo, nomi operatore e ragioni
     sociali sono italiani e portano le accentate. VARCHAR sotto una collation
     non Unicode le storpia in silenzio, e un dato storpiato non da' errore -
     da' un punto interrogativo dentro una descrizione, per sei anni. */
  it('non usa mai VARCHAR non Unicode', () => {
    for (const sql of ms.schemaCompleto()) {
      expect(/(?<!N)VARCHAR/.test(sql.replace(/NVARCHAR/g, ''))).toBe(false);
    }
  });

  /* NON c'e' un indice sul documento, ed e' una scelta: SQL Server non ha un
     equivalente del GIN su JSONB - si promuove un campo a colonna calcolata
     persistita e si indicizza quella. Questa prova esiste perche' nessuno
     ricopi dal ramo PostgreSQL una riga che qui non vuol dire niente. */
  it('non porta indici sul documento copiati dal ramo PostgreSQL', () => {
    const tutto = ms.schemaCompleto().join('\n');
    expect(tutto).not.toContain('JSONB');
    expect(tutto).not.toContain('jsonb_path_ops');
    /* `\bGIN\b` e non `'GIN'`: la sottostringa sta dentro BI**GIN**T, e una
       prova che fallisce per un tipo legittimo insegna solo a disattivarla. */
    expect(/\bGIN\b/.test(tutto)).toBe(false);
  });
});

describe('la chiave primaria', () => {
  it('automatica e\' IDENTITY, testuale e\' NVARCHAR NOT NULL', () => {
    for (const nome of NAMES) {
      const col = COLLECTIONS[nome];
      const ddl = ms.createTableSQL(nome);
      if (col.pkType === 'auto') {
        expect(ddl).toContain(`[${col.pk}] BIGINT IDENTITY(1,1) PRIMARY KEY`);
      } else {
        expect(ddl).toContain(`[${col.pk}] NVARCHAR(${ms.LARGHEZZA}) NOT NULL PRIMARY KEY`);
      }
    }
  });

  /* `_id` si preserva e non si rigenera - `tasks.mov_ids` e i riferimenti
     degli archivi puntano a quei numeri. Su una colonna IDENTITY questo
     chiede SET IDENTITY_INSERT in migrazione, e il RESEED dopo: se lo script
     perdesse uno dei due, la prima scrittura nuova sbatterebbe contro la
     chiave primaria a magazzino aperto. */
  it('la migrazione sa che IDENTITY va acceso e poi riallineato', () => {
    const src = require('node:fs').readFileSync('server/sqlserver/migra-sqlite-sqlserver.js', 'utf8');
    expect(src).toContain('SET IDENTITY_INSERT [${nome}] ON');
    expect(src).toContain('SET IDENTITY_INSERT [${nome}] OFF');
    expect(src).toContain('DBCC CHECKIDENT');
    /* e che si spegne anche se la scrittura fallisce */
    expect(src).toMatch(/finally \{\s*if \(identita\) await pool\.request\(\)\.query\(`SET IDENTITY_INSERT/);
  });
});
