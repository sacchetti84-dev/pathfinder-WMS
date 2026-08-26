import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CAMPI_CODICE, CAMPI_TESTO, eCodice, maiuscola } from '../src/modules/maiuscole';

const require = createRequire(import.meta.url);
const { MAIUSCOLE, NAMES, normalizza } = require('../server/lib/schema.js');

/* QUESTA PROVA LEGGE I SORGENTI, e non è un ripiego.
   Un campo nuovo che nessuno ha classificato è un campo che verrà scritto in
   minuscolo da un terminale e in maiuscolo da un altro, e a database
   diventeranno due lotti. Il DOM non c'è per accorgersene, quindi ci si
   accorge qui — o non ci si accorge affatto. */

function campiDelleViste() {
  const file = readdirSync('src/ui/views').filter(f => f.endsWith('.ts')).map(f => `src/ui/views/${f}`);
  for (const extra of ['src/ui/app.ts', 'src/index.html']) if (existsSync(extra)) file.push(extra);

  const fuori = new Set(['select', 'checkbox', 'number', 'date', 'datetime-local',
    'password', 'textarea', 'radio', 'range', 'hidden']);
  const out = new Map();
  for (const f of file) {
    const s = readFileSync(f, 'utf8');
    const re = /<(input|select|textarea)\b([^>]*)>/g;
    let m;
    while ((m = re.exec(s))) {
      const attr = m[2];
      const id = (attr.match(/id="([^"]+)"/) || [])[1];
      if (!id) continue;
      const tipo = (attr.match(/type="([^"]*)"/) || [])[1] || m[1];
      if (fuori.has(tipo)) continue;
      /* Gli identificativi costruiti a runtime — `${id}`, `pp_${chiave}_code` —
         non sono un nome: li copre `FORME_CODICE`, o non li copre nessuno. */
      if (id.includes('${')) continue;
      if (!out.has(id)) out.set(id, f);
    }
  }
  return out;
}

describe('ogni campo di testo delle viste è classificato', () => {
  it('nessun campo resta senza una decisione', () => {
    const campi = campiDelleViste();
    const orfani = [];
    for (const [id, f] of campi)
      if (!CAMPI_CODICE.has(id) && !CAMPI_TESTO.has(id)) orfani.push(`${id} (${f})`);
    expect(orfani, 'campi da mettere in CAMPI_CODICE o CAMPI_TESTO di src/modules/maiuscole.ts').toEqual([]);
  });

  it('e nessun campo sta in tutti e due gli elenchi', () => {
    const doppi = [...CAMPI_CODICE].filter(id => CAMPI_TESTO.has(id));
    expect(doppi).toEqual([]);
  });
});

describe('quali campi si maiuscolano, e quali no', () => {
  it('un lotto e un\'ubicazione sì', () => {
    expect(eCodice('cnLot')).toBe(true);
    expect(eCodice('mInLoc')).toBe(true);
    expect(eCodice('rLot')).toBe(true);
  });

  /* Una casella che cerca anche nelle descrizioni, maiuscolata, smette di
     trovare le descrizioni. */
  it('una casella di ricerca no', () => {
    expect(eCodice('regFilterText')).toBe(false);
    expect(eCodice('arcText')).toBe(false);
    expect(eCodice('cpQuery')).toBe(false);
  });

  it('un nome proprio no: due grafie non fanno due persone', () => {
    expect(eCodice('opFirst')).toBe(false);
    expect(eCodice('rcName')).toBe(false);
  });

  it('una nota no', () => {
    expect(eCodice('cnNota')).toBe(false);
    expect(eCodice('udcQMotivo')).toBe(false);
  });

  it('gli identificativi costruiti a runtime li prende la forma', () => {
    expect(eCodice('pp_causali_code')).toBe(true);
    expect(eCodice('pp_causali_label')).toBe(false);
  });

  it('maiuscola non si rompe su quel che stringa non è', () => {
    expect(maiuscola('cl260854')).toBe('CL260854');
    expect(maiuscola('')).toBe('');
    expect(maiuscola(null)).toBe('');
    expect(maiuscola(undefined)).toBe('');
  });
});

/* IL CLIENT È LA COMODITÀ, IL SERVIZIO È LA GARANZIA — §6, «l'arbitro è il
   server». Le due parti devono però dire la stessa cosa sui campi che
   contano davvero, o l'operatore vede una cosa e a database ne finisce
   un'altra. */
describe('il servizio normalizza quello che il client mostra', () => {
  it('ogni collezione ha una riga in MAIUSCOLE, anche se vuota', () => {
    for (const nome of NAMES) expect(MAIUSCOLE[nome], nome).toBeDefined();
  });

  it('il lotto e la chiave della riga di giacenza si maiuscolano insieme', () => {
    const d = normalizza('inventory', {
      item_key: '6001412#cl260854', lot_code: 'cl260854',
      article_code: '6001412', location_code: 'mag1-raka-01-05-c', qty: 5,
    });
    expect(d.item_key).toBe('6001412#CL260854');
    expect(d.lot_code).toBe('CL260854');
    expect(d.location_code).toBe('MAG1-RAKA-01-05-C');
  });

  /* Il PIN è base64: maiuscolarlo lo distrugge, e nessun operatore riesce
     più a firmare niente. */
  it('IL PIN NON SI TOCCA', () => {
    const d = normalizza('operators', {
      op_id: 'OP-1', initials: 'dp', first_name: 'Daniele', last_name: 'Pedrazzi',
      pin_hash: 'aBcD+/12xyz=', pin_salt: 'QwErTy+/0=', role: 'operator', active: true,
    });
    expect(d.pin_hash).toBe('aBcD+/12xyz=');
    expect(d.pin_salt).toBe('QwErTy+/0=');
    expect(d.initials).toBe('DP');
    expect(d.first_name).toBe('Daniele');
    expect(d.role).toBe('operator');
  });

  /* `meta` porta chiavi in camelCase: `areaWip`, `udcPrefissoGS1`.
     Maiuscolarle vorrebbe dire perdere ogni configurazione del magazzino. */
  it('LE CHIAVI DI CONFIGURAZIONE NON SI TOCCANO', () => {
    const d = normalizza('meta', { key: 'areaWip', value: 'MAG1-WIP-01' });
    expect(d.key).toBe('areaWip');
    expect(MAIUSCOLE.meta).toEqual([]);
  });

  it('gli enum restano minuscoli: il codice li confronta alla lettera', () => {
    expect(normalizza('udc', { udc_id: '0123', status: 'empty', type: 'pallet' }).status).toBe('empty');
    expect(normalizza('wip', { wip_id: 'W1', status: 'open', verso: 'in' }).verso).toBe('in');
  });

  it('scende dentro gli oggetti annidati e dentro gli elenchi', () => {
    const t = normalizza('tasks', { task_id: 'TA-1', payload: { article_code: 'x1', lot_code: 'cl9' } });
    expect(t.payload.article_code).toBe('X1');
    expect(t.payload.lot_code).toBe('CL9');
    const p = normalizza('pick_archive', { doc_id: 'D1', stops: [{ lot_code: 'cl1' }, { lot_code: 'CL2' }] });
    expect(p.stops.map(s => s.lot_code)).toEqual(['CL1', 'CL2']);
  });

  /* UNA GUARDIA, NON UNA PROVA DI COMPORTAMENTO.
     Aggiungere `pin_hash` a `MAIUSCOLE` toglierebbe il PIN a ogni operatore
     del magazzino, e `meta.key` cancellerebbe ogni configurazione. Sono due
     righe che nessuno scriverebbe apposta e che qualcuno potrebbe scrivere
     per completezza, un mese da adesso, senza sapere cosa sono. */
  it('IL PIN E LE CHIAVI DI CONFIGURAZIONE non possono entrare nell’elenco', () => {
    const vietati = ['pin_hash', 'pin_salt', 'key', 'status', 'type', 'role', 'verso', 'kind',
      'description', 'article_description', 'name', 'first_name', 'last_name', 'notes'];
    for (const [collezione, campi] of Object.entries(MAIUSCOLE)) {
      for (const percorso of campi) {
        const foglia = percorso.split('.').pop().replace('[]', '');
        expect(vietati, `${collezione}.${percorso}`).not.toContain(foglia);
      }
    }
  });

  it('non riscrive il record che gli è stato passato', () => {
    const originale = { lot_code: 'cl9', article_code: '600' };
    normalizza('lots', originale);
    expect(originale.lot_code).toBe('cl9');
  });
});

/* LA STRINGA DI CONNESSIONE NON ENTRA NEL REPOSITORY — §6, e Azure Key Vault
   per il servizio vero. Al banco sta in `.env.local`, e la sola cosa che
   tiene quel file fuori da git è una riga di `.gitignore`: una riga che
   qualcuno può cancellare riordinando. */
describe('le stringhe di connessione restano fuori dal repository', () => {
  it('`.gitignore` esclude i file di ambiente', () => {
    const g = readFileSync('.gitignore', 'utf8');
    for (const riga of ['.env', '.env.local']) {
      expect(g.split(String.fromCharCode(10)).map(r => r.trim())).toContain(riga);
    }
  });
});
