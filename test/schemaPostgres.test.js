import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COLLECTIONS, NAMES } = require('../server/lib/schema.js');
const pg = require('../server/azure/schema-postgres.js');

/* IL RAMO AZURE È PARALLELO, MA NON È SCOLLEGATO.

   È l'unica parte del ramo che gira a ogni `npm test`, e serve a una cosa
   sola: che il giorno che qualcuno decide di provarlo, lo schema
   PostgreSQL descriva le stesse venti collezioni che il servizio usa
   oggi — non quelle di quando è stato scritto. Una collezione aggiunta a
   `lib/schema.js` e dimenticata qui sarebbe un tavolo che non esiste, e lo
   si scoprirebbe a metà migrazione. */

describe('lo schema PostgreSQL segue quello vero, non una copia', () => {
  it('copre TUTTE le collezioni, e nessuna in più', () => {
    const dichiarate = NAMES.length;
    const create = pg.schemaCompleto().filter(s => s.startsWith('CREATE TABLE'));
    expect(create).toHaveLength(dichiarate);
    for (const nome of NAMES) {
      expect(pg.createTableSQL(nome)).toContain(`CREATE TABLE IF NOT EXISTS ${nome} (`);
    }
  });

  it('il documento è JSONB, ed è la sola ragione tecnica del cambio', () => {
    for (const nome of NAMES) {
      expect(pg.createTableSQL(nome)).toContain('data JSONB NOT NULL');
    }
  });

  it('la chiave automatica diventa BIGSERIAL, quella testuale resta TEXT', () => {
    expect(pg.createTableSQL('inventory')).toContain('_id BIGSERIAL PRIMARY KEY');
    expect(pg.createTableSQL('operators')).toContain('op_id TEXT PRIMARY KEY');
  });

  it('LE COLONNE MATERIALIZZATE SONO LE STESSE, una per una', () => {
    for (const nome of NAMES) {
      const col = COLLECTIONS[nome];
      const sql = pg.createTableSQL(nome);
      for (const f of col.indexed) {
        if (f === col.pk) continue;
        expect(sql).toContain(`${f} ${pg.colTypePg(col, f)}`);
      }
    }
  });

  it('una colonna numerica diventa BIGINT: `ts` di mov_log ci sta stretto in INTEGER', () => {
    expect(pg.colTypePg(COLLECTIONS.mov_log, 'ts')).toBe('BIGINT');
    expect(pg.colTypePg(COLLECTIONS.mov_log, 'type')).toBe('TEXT');
  });

  it('gli indici unici restano unici, e i composti restano composti', () => {
    const idx = pg.createIndexSQL('articles').join('\n');
    expect(idx).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ix_articles_code');
    const zone = pg.createIndexSQL('zones').join('\n');
    expect(zone).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_zones_site_id_id ON zones(site_id, id)');
    const inv = pg.createIndexSQL('inventory').join('\n');
    expect(inv).toContain('ix_inventory_location_code_item_key ON inventory(location_code, item_key)');
  });

  it('ogni tavolo porta l’indice GIN sul documento', () => {
    for (const nome of NAMES) {
      expect(pg.createIndexSQL(nome).join('\n')).toContain(`GIN (data jsonb_path_ops)`);
    }
  });

  /* PostGIS è nominato nella richiesta per «le coordinate della mappa», ma
     le ubicazioni non hanno coordinate: `core/geometria.ts` le genera da
     corsie, campate e livelli. Un'estensione spaziale su dati che spaziali
     non sono è una dipendenza in più e nessuna query in meno. */
  it('e NON chiede PostGIS, che qui non avrebbe niente da indicizzare', () => {
    const tutto = pg.schemaCompleto().join('\n');
    expect(tutto).not.toMatch(/postgis|geometry|geography/i);
  });
});
