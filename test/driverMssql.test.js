import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DriverMssql, segnaposti } = require('../server/lib/driver-mssql.js');

/* IL DRIVER SQL SERVER E' L'UNICO FILE DENTRO `lib/` CHE IL CONTROLLO DEI
   TIPI NON GUARDA, e per una ragione dichiarata: `require('mssql')` non
   compila finche' quel modulo non e' installato, e installarlo prima che SQL
   Server sia in servizio vorrebbe dire una dipendenza in piu' per tutti -
   §6. Vedi la nota in `tsconfig.server.json`.

   Un file senza controllo dei tipi e senza prove sarebbe pero' un file di
   cui nessuno sa niente finche' non lo si accende a magazzino aperto. Queste
   prove sono la sua rete: esercitano la parte che decide - la traduzione dei
   segnaposto e la forma del SQL - **senza aprire nessuna connessione**.
   Quello che resta fuori e' il viaggio di rete, e quello si prova su
   un'istanza vera. */

describe('la traduzione dei segnaposto', () => {
  it('`?` diventa @p1, @p2, in ordine', () => {
    const t = segnaposti('INSERT INTO [x] ([a], [b]) VALUES (?, ?)');
    expect(t.sql).toBe('INSERT INTO [x] ([a], [b]) VALUES (@p1, @p2)');
    expect(t.quanti).toBe(2);
  });

  /* LA TRAPPOLA, e non e' teorica: le descrizioni articolo sono testo
     scritto da chi compila l'anagrafica, e un punto interrogativo dentro una
     descrizione diventerebbe un parametro che nessuno ha passato. L'errore
     che ne uscirebbe parlerebbe d'altro. */
  it('un punto interrogativo dentro gli apici resta testo', () => {
    const t = segnaposti("SELECT * FROM [x] WHERE [d] = 'e adesso?' AND [id] = ?");
    expect(t.sql).toBe("SELECT * FROM [x] WHERE [d] = 'e adesso?' AND [id] = @p1");
    expect(t.quanti).toBe(1);
  });

  it('l\'ESCAPE di LIKE non viene scambiato per un parametro', () => {
    const t = segnaposti("SELECT * FROM [x] WHERE [c] LIKE ? ESCAPE '\\'");
    expect(t.quanti).toBe(1);
    expect(t.sql).toContain("ESCAPE '\\'");
  });

  it('senza segnaposto non cambia niente', () => {
    const sql = 'SELECT COUNT(*) AS c FROM [inventory]';
    expect(segnaposti(sql).sql).toBe(sql);
  });
});

describe('i pezzi di SQL che cambiano dal motore di riferimento', () => {
  /* Questi due metodi non toccano la connessione: si possono esercitare
     sull'oggetto nudo, che e' il motivo per cui stanno li' e non altrove. */
  const nudo = Object.create(DriverMssql.prototype);

  it('l\'upsert e\' un MERGE, e il punto e virgola in fondo non e\' facoltativo', () => {
    const sql = nudo.upsertSQL('inventory', '_id', ['location_code', 'item_key']);
    expect(sql).toContain('MERGE [inventory]');
    expect(sql.trimEnd().endsWith(';')).toBe(true);
  });

  /* Senza HOLDLOCK due terminali che scrivono la stessa chiave nello stesso
     istante possono inserirla tutti e due - ed e' esattamente il caso che §6
     affida al server invece che alla disciplina di chi scrive. */
  it('il MERGE prende il blocco, o non arbitra niente', () => {
    expect(nudo.upsertSQL('meta', 'key', [])).toContain('WITH (HOLDLOCK)');
  });

  it('l\'upsert quota ogni identificatore', () => {
    const sql = nudo.upsertSQL('meta', 'key', []);
    /* `key` e' riservata in T-SQL: nuda, questo MERGE non compila */
    expect(sql).toContain('[key]');
    expect(/(?<![[\w])key(?![\w\]])/.test(sql)).toBe(false);
  });

  it('la paginazione e\' OFFSET/FETCH, non LIMIT', () => {
    const p = nudo.paginazioneSQL(10, 20);
    expect(p.sql).toContain('OFFSET ? ROWS');
    expect(p.sql).toContain('FETCH NEXT ? ROWS ONLY');
    expect(p.sql).not.toContain('LIMIT');
    /* l'ordine degli argomenti segue quello dei segnaposto: prima l'offset */
    expect(p.args).toEqual([20, 10]);
  });

  it('senza limite ne\' scarto non aggiunge niente', () => {
    expect(nudo.paginazioneSQL(null, 0)).toEqual({ sql: '', args: [] });
  });

  it('solo lo scarto, senza limite, resta valido', () => {
    const p = nudo.paginazioneSQL(null, 5);
    expect(p.sql).toBe(' OFFSET ? ROWS');
    expect(p.args).toEqual([5]);
  });
});

describe('quello che il driver dice quando non puo\' fare una cosa', () => {
  it('il modulo mancante lo spiega, invece di dare un errore di richiesta', async () => {
    /* `mssql` non e' installato in questo albero, ed e' voluto: il messaggio
       deve dire cosa manca e cosa farci, non «Cannot find module». */
    await expect(DriverMssql.apri('Server=x;Database=y')).rejects.toThrow(/npm install mssql/);
  });

  it('senza stringa di connessione lo dice prima di provarci', async () => {
    await expect(DriverMssql.apri('')).rejects.toThrow();
  });

  /* IL BACKUP CAMBIA PADRONE, ed e' il punto in cui si vede. `POST
     /api/backup` copiava un file; con SQL Server il dato non e' piu' un file
     di questo servizio. Dirlo con un errore scritto e' meglio che scrivere
     un file vuoto e lasciar credere che una copia ci sia. */
  it('il backup non finge di esistere', async () => {
    const nudo = Object.create(DriverMssql.prototype);
    await expect(nudo.backupTo('/tmp/x.db')).rejects.toMatchObject({ status: 501 });
    await expect(nudo.backupTo('/tmp/x.db')).rejects.toThrow(/export JSON/);
  });
});
