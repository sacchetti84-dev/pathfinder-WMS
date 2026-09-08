/* UN BANCO NON EREDITA L'AMBIENTE DELLA MACCHINA — 2.29.1
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Su questa macchina sette `PATHFINDER_*` stanno a livello MACCHINA: le
   eredita ogni processo node che parte, banchi compresi. Un banco esiste per
   provare una versione SENZA toccare quel che gira: se eredita, prova
   un'altra cosa e lo dice con la voce di quella giusta.

   È già costato due volte.

   Il 26/08 `PATHFINDER_PG` ereditata ha portato un banco sul PostgreSQL di
   lavoro e un `TRUNCATE` si è preso gli 11.197 articoli appena migrati. Da lì
   la riga che si legge in §5 dell'INDEX: «`PATHFINDER_PG=''` apre la riga e
   non è un ornamento». `banco\prova-corrente.cjs` quella riga non ce l'aveva.

   Dalla 2.26 al 08/09 sono state le due `PATHFINDER_TLS_*`. Il banco partiva
   in HTTPS mentre le sue prove parlavano in chiaro sulla stessa porta,
   incassava il `301` della 2.26, e `fetch` degradava ogni POST a GET. Non
   moriva: rispondeva. Passavano le prove in lettura e fallivano le altre,
   accusando il servizio di buchi che non ha — `test\collaudo.js` 28 rosse,
   `banco\gerarchia.cjs` 36 rosse con tre «VICOLO CIECO» e una «LA PORTA È
   RESTATA APERTA», tutte false. E sotto quel rosso è rimasta nascosta per tre
   versioni una prova scaduta alla 2.13.

   PERCHÉ QUESTA PROVA LEGGE I SORGENTI. La regola non è «ricordarsi delle
   variabili di oggi»: la prossima arriverà con una funzione nuova, come
   `PATHFINDER_TLS_PFX` è arrivata con la 2.26 dentro un file scritto quando
   non esisteva. Quel che regge è che ogni file che accende
   `pathfinder-server.js` dichiari il proprio ambiente invece di ereditarlo —
   e questo si vede solo guardando dentro i file, uno per uno, compresi quelli
   che nasceranno dopo. Per questo l'elenco non è scritto a mano. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scollegaTls, VARIABILI_TLS } = require('../server/lib/tls.js');

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('scollegaTls', () => {
  test('toglie le quattro dichiarazioni del certificato e non tocca il resto', () => {
    const env = {
      PATHFINDER_TLS_PFX: 'C:\\Pathfinder\\tls\\pathfinder.pfx',
      PATHFINDER_TLS_PFX_PASSWORD: 'segreto',
      PATHFINDER_TLS_CERT: 'c.pem',
      PATHFINDER_TLS_KEY: 'k.pem',
      PATHFINDER_PORT: '4199',
      PATH: 'C:\\Windows',
    };
    scollegaTls(env);
    for (const v of VARIABILI_TLS) expect(v in env).toBe(false);
    expect(env.PATHFINDER_PORT).toBe('4199');
    expect(env.PATH).toBe('C:\\Windows');
  });

  test('le toglie davvero, non le mette a stringa vuota', () => {
    /* `decidiTls` guarda la verità del valore, quindi `''` basterebbe. Ma un
       `''` che passa per `spawn` arriva al figlio come variabile ESISTENTE e
       vuota, e la prossima riga che facesse `?? valore_di_scorta` la
       leggerebbe come una dichiarazione. Si toglie. */
    const env = { PATHFINDER_TLS_PFX: 'x.pfx' };
    scollegaTls(env);
    expect(Object.keys(env)).toHaveLength(0);
  });

  test('un ambiente vuoto o assente non fa saltare niente', () => {
    expect(() => scollegaTls({})).not.toThrow();
    expect(() => scollegaTls(null)).not.toThrow();
    expect(() => scollegaTls(undefined)).not.toThrow();
  });

  test('l\'ambiente scollegato fa decidere «chiaro»', () => {
    const { decidiTls } = require('../server/lib/tls.js');
    const env = { PATHFINDER_TLS_PFX: 'C:\\x.pfx', PATHFINDER_TLS_PFX_PASSWORD: 'p' };
    expect(decidiTls(env).modo).toBe('pfx');
    expect(decidiTls(scollegaTls(env)).modo).toBe('chiaro');
  });
});

/* I file candidati: si cercano, non si elencano. Un banco nuovo che nascesse
   domani senza la riga cadrebbe qui il giorno stesso. */
function candidati() {
  const dove = [path.join(RADICE, 'banco'), path.join(RADICE, 'server', 'test')];
  const fuori = [];
  for (const dir of dove) {
    if (!fs.existsSync(dir)) continue;
    for (const nome of fs.readdirSync(dir)) {
      if (!/\.(cjs|mjs|js)$/.test(nome)) continue;
      const percorso = path.join(dir, nome);
      if (!fs.statSync(percorso).isFile()) continue;
      const testo = fs.readFileSync(percorso, 'utf8');
      /* Accende il servizio: o lo richiede in questo processo, o lo lancia in
         un figlio. Nominare il file non basta — `collaudo-installazione.js` ne
         scrive uno finto dentro un pacchetto di prova e non accende niente. */
      const acceso = /require\([^)]*pathfinder-server\.js/.test(testo)
                  || /spawn\([\s\S]{0,240}pathfinder-server\.js/.test(testo);
      if (!acceso) continue;
      fuori.push({ nome: path.relative(RADICE, percorso), testo });
    }
  }
  return fuori;
}

describe('i banchi dichiarano il loro ambiente', () => {
  const files = candidati();

  test('ce ne sono, altrimenti questa prova non sta guardando niente', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  test.each(files.map((f) => [f.nome, f]))('%s scollega il certificato', (_nome, f) => {
    expect(f.testo).toMatch(/scollegaTls\s*\(/);
  });

  test.each(files.map((f) => [f.nome, f]))('%s dichiara PATHFINDER_PG', (_nome, f) => {
    /* Presente e assegnata: `PATHFINDER_PG: ''` dentro un `spawn`, oppure
       `process.env.PATHFINDER_PG = …` in questo processo. Nominarla in un
       commento non conta — il 26/08 il commento c'era. */
    expect(f.testo).toMatch(/PATHFINDER_PG\s*(:|=)\s*[^=]/);
  });
});

/* IL `301` NON DEVE PIÙ POTER PASSARE PER UNA RISPOSTA. Anche scollegato
   l'ambiente, un domani qualcuno rimetterà un banco davanti a un servizio
   cifrato. Il modo in cui il difetto si è nascosto per tre versioni è che
   `fetch` SEGUE il redirect e cambia il metodo: la risposta arriva 200 e la
   prova conclude che il servizio ha risposto male, non che ha risposto a
   un'altra domanda. Qui si fissa il comportamento, così chi legge una prova
   rossa sa che cosa cercare. */
describe('perché un banco in chiaro contro un servizio cifrato mente', () => {
  test('fetch segue il 301 e degrada la POST a GET', async () => {
    const http = await import('node:http');
    const srv = http.createServer((req, res) => {
      if (req.url === '/parti') {
        res.writeHead(301, { Location: `http://127.0.0.1:${porta}/arrivo` });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ metodo: req.method }));
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const porta = srv.address().port;
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/parti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chiave: 'X' }),
      });
      expect(r.status).toBe(200);            // non un errore: una risposta
      expect((await r.json()).metodo).toBe('GET');   // ma a un'altra domanda
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });
});
