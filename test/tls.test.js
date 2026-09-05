/* IL CERTIFICATO, LETTO DALL'AMBIENTE — 2.26
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   `server/lib/tls.js` decide una cosa sola: quale delle tre strade è quella
   dichiarata. È puro apposta — aprire un socket per sapere se una variabile
   è scritta a metà vorrebbe dire un collaudo che non gira in `npm test`.

   IL CASO CHE CONTA È IL TERZO. Una dichiarazione a metà — `CERT` senza
   `KEY`, o le due strade accese insieme — NON deve ripiegare in chiaro: un
   servizio che parte in chiaro «perché il certificato non si leggeva» è il
   modo in cui il PIN di un operatore finisce sulla rete senza che nessuno
   se ne accorga. Si ferma, e dice di cosa. */
import { test, expect, describe } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decidiTls, eSalutoTLS } = require('../server/lib/tls.js');

describe('quale strada', () => {
  test('un ambiente vuoto parla in chiaro, e lo dice', () => {
    expect(decidiTls({}).modo).toBe('chiaro');
    expect(decidiTls(null).modo).toBe('chiaro');
  });

  test('il PFX porta con sé la sua password', () => {
    const d = decidiTls({ PATHFINDER_TLS_PFX: 'C:\\x.pfx', PATHFINDER_TLS_PFX_PASSWORD: 'ab12' });
    expect(d.modo).toBe('pfx');
    expect(d.pfx).toBe('C:\\x.pfx');
    expect(d.password).toBe('ab12');
  });

  test('un PFX senza password resta un PFX: la password vuota è legittima', () => {
    const d = decidiTls({ PATHFINDER_TLS_PFX: 'C:\\x.pfx' });
    expect(d.modo).toBe('pfx');
    expect(d.password).toBe('');
  });

  test('la coppia PEM è la strada per un certificato che arriva dall\'IT', () => {
    const d = decidiTls({ PATHFINDER_TLS_CERT: 'c.pem', PATHFINDER_TLS_KEY: 'k.pem' });
    expect(d).toEqual({ modo: 'pem', cert: 'c.pem', key: 'k.pem' });
  });

  test('mezza coppia PEM è un errore, non un ripiego in chiaro', () => {
    for (const env of [{ PATHFINDER_TLS_CERT: 'c.pem' }, { PATHFINDER_TLS_KEY: 'k.pem' }]) {
      const d = decidiTls(env);
      expect(d.modo).toBe('errore');
      expect(d.motivo).toMatch(/PATHFINDER_TLS_CERT/);
    }
  });

  test('le due strade accese insieme non si scelgono da sole', () => {
    const d = decidiTls({ PATHFINDER_TLS_PFX: 'x.pfx', PATHFINDER_TLS_CERT: 'c.pem' });
    expect(d.modo).toBe('errore');
  });
});

describe('chi bussa alla porta', () => {
  test('0x16 è un saluto TLS', () => {
    expect(eSalutoTLS(Buffer.from([0x16, 0x03, 0x01]))).toBe(true);
  });

  test('i metodi HTTP non lo sono, e vanno al 301', () => {
    for (const m of ['GET / HTTP/1.1', 'POST /api', 'HEAD /', 'OPTIONS *']) {
      expect(eSalutoTLS(Buffer.from(m))).toBe(false);
    }
  });

  test('niente in mano non è un saluto TLS', () => {
    expect(eSalutoTLS(Buffer.alloc(0))).toBe(false);
    expect(eSalutoTLS(null)).toBe(false);
  });
});
