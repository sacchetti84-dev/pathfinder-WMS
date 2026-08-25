/* ARTICOLO E LOTTO SONO MAIUSCOLI, SEMPRE — voce 38 dell'INDEX.

   Il lettore di barcode in azienda restituisce le lettere del codice in
   minuscolo. `item_key` e' `ARTICOLO#LOTTO` e il confronto e' fra stringhe:
   `6000366B#abc` e `6000366B#ABC` sono due righe diverse nello stesso vano —
   l'indice composto `[location_code+item_key]` le fa convivere — e chi
   preleva non trova la merce che vede a scaffale.

   PERCHE' QUESTE PROVE GUARDANO IL SORGENTE. Il difetto non era una riga
   sbagliata: era una regola applicata a meta'. Ogni lettura di ARTICOLO
   portava `Validate.clean(v, true)`, e nessuna delle diciassette letture di
   LOTTO lo portava. Una prova che esercita una maschera sola non avrebbe
   visto niente, perche' presa da sola ogni maschera era coerente con se
   stessa. Quel che va sorvegliato e' l'insieme, ed e' anche l'unica difesa
   contro il modo in cui questo difetto torna: una maschera NUOVA che si
   dimentica il `true`. Le viste non hanno un DOM in collaudo — stessa
   ragione di `modali.test.js` — quindi si legge il testo. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { chiaveLotto } from '../src/core/cache.ts';
import { Validate } from '../src/modules/validate.ts';

const VISTE = fs.readdirSync('src/ui/views')
  .filter(f => f.endsWith('.ts'))
  .map(f => [f, fs.readFileSync(path.join('src/ui/views', f), 'utf8')]);

const sorgente = (p) => fs.readFileSync(p, 'utf8');

describe('la chiave si compone maiuscola', () => {
  it('chiaveLotto alza articolo e lotto', () => {
    expect(chiaveLotto(' 6000366b ', ' abc123 ')).toBe('6000366B#ABC123');
  });

  it('chiaveLotto fa coincidere le due grafie dello stesso lotto', () => {
    expect(chiaveLotto('700', 'l1')).toBe(chiaveLotto('700', 'L1'));
  });

  /* `pickRoute` alzava l'articolo e lasciava stare il lotto: un percorso nato
     dall'ODP non riagganciava la riga di giacenza. */
  it('pickRoute alza tutti e due i lati della chiave', () => {
    const riga = sorgente('src/modules/pickRoute.ts')
      .split('\n').find(l => l.includes('const itemKey ='));
    expect(riga).toBeTruthy();
    const alzate = riga.match(/toUpperCase\(\)/g) || [];
    expect(alzate).toHaveLength(2);
  });

  /* `addItem` e' l'unica strada per cui una riga di giacenza viene al mondo:
     normalizzare li' vuol dire che nessun chiamante puo' scrivere una chiave
     storta per distrazione. */
  it('addItem normalizza PRIMA di comporre item_key', () => {
    const src = sorgente('src/core/store.ts');
    const inizio = src.indexOf('async addItem(');
    expect(inizio).toBeGreaterThan(-1);
    const componeChiave = src.indexOf('const itemKey = `${articleCode}#${lotCode}`', inizio);
    const alzaArticolo = src.indexOf('articleCode = String(articleCode', inizio);
    const alzaLotto = src.indexOf('lotCode = String(lotCode', inizio);
    expect(alzaArticolo).toBeGreaterThan(-1);
    expect(alzaLotto).toBeGreaterThan(-1);
    expect(alzaArticolo).toBeLessThan(componeChiave);
    expect(alzaLotto).toBeLessThan(componeChiave);
  });
});

describe('le maschere leggono il lotto come leggono l\'articolo', () => {
  /* La riga che chiude il difetto: zero letture di lotto senza `true`. */
  it('nessuna lettura di lotto senza il `true`', () => {
    const senzaTrue = /Validate\.clean\(\$\('[A-Za-z]*[Ll]ot[A-Za-z]*'\)[?.]*value\)/g;
    const colpevoli = [];
    for (const [nome, testo] of VISTE) {
      for (const m of testo.match(senzaTrue) || []) colpevoli.push(`${nome}: ${m}`);
    }
    expect(colpevoli).toEqual([]);
  });

  it('le diciassette letture di lotto ci sono ancora, e alzano', () => {
    const conTrue = /Validate\.clean\(\$\('[A-Za-z]*[Ll]ot[A-Za-z]*'\)[?.]*value, true\)/g;
    const quante = VISTE.reduce((n, [, t]) => n + (t.match(conTrue) || []).length, 0);
    expect(quante).toBe(17);
  });
});

describe('i campi a schermo sono maiuscoli nel dato, non solo a vedersi', () => {
  /* `class="uppercase"` e' `text-transform`: cambia come il campo si VEDE e
     non tocca `input.value`. Da sola era il difetto travestito da soluzione —
     a schermo maiuscolo, nel dato quel che aveva battuto l'operatore. Vale
     solo insieme al gestore delegato qui sotto, che e' quello che alza il
     valore: le due cose si tengono, e questa prova le tiene insieme. */
  /* NON E' UN CODICE, E NON SI ALZA. Sono campi che parlano DELL'articolo
     invece di identificarlo: una descrizione, un fornitore, una nota o una
     categoria scritti tutti maiuscoli sarebbero un dato peggiore, non piu'
     pulito — e §6 dice che la categoria si prende com'e' scritta, perche'
     arriva dall'anagrafica di chi la manda. `ntLot` e' readonly e rispecchia
     una riga gia' a scaffale: la mostra com'e', che durante la transizione e'
     l'unica lettura onesta. */
  const NON_CODICI = new Set([
    'artFilterInput', 'artCategory', 'artDesc', 'artSupplier', 'artNotes', 'ntLot',
  ]);

  it('ogni campo che porta un codice articolo o lotto porta la classe `uppercase`', () => {
    const nudi = [];
    for (const [nome, testo] of VISTE) {
      for (const tag of testo.match(/<input[^>]*>/g) || []) {
        const id = (tag.match(/id="([^"]*)"/) || [])[1] || '';
        if (!/(^|[^a-zA-Z])(art|lot)/i.test(id)) continue;
        if (/type="(checkbox|radio|number)"/.test(tag)) continue;
        if (NON_CODICI.has(id)) continue;
        if (!/\buppercase\b/.test(tag)) nudi.push(`${nome}: ${id}`);
      }
    }
    expect(nudi).toEqual([]);
  });

  /* La lista delle eccezioni non deve diventare il posto dove si insabbia un
     campo dimenticato: se un id sparisce dalle viste, sparisce anche di li'. */
  it('ogni eccezione dichiarata esiste ancora nelle viste', () => {
    const tutti = VISTE.map(([, t]) => t).join('\n');
    for (const id of NON_CODICI) expect(tutti).toContain(`id="${id}"`);
  });

  it('il gestore delegato esiste, alza il valore e rimette il cursore', () => {
    const app = sorgente('src/ui/app.ts');
    expect(app).toContain('_uppercaseFix(e: Event)');
    expect(app).toMatch(/classList\.contains\('uppercase'\)/);
    expect(app).toMatch(/t\.value = su/);
    expect(app).toMatch(/setSelectionRange\(da, a\)/);
  });

  it('il gestore e\' registrato sul documento', () => {
    expect(sorgente('src/ui/app.ts'))
      .toMatch(/addEventListener\('input', \(e\) => this\._uppercaseFix\(e\)/);
  });

  /* Il campo gia' maiuscolo non deve pagare niente: senza questa uscita
     anticipata ogni battuta riscriverebbe `value` e il cursore ballerebbe. */
  it('il gestore non tocca il campo se non cambia niente', () => {
    expect(sorgente('src/ui/app.ts')).toMatch(/if \(su === t\.value\) return;/);
  });
});

describe('la convalida non accetta piu\' un lotto minuscolo', () => {
  /* A monte alza tutto: un lotto minuscolo che arriva fin qui non e' piu' un
     dato dell'operatore, e' un difetto, e va detto invece che scritto. */
  it('il lotto minuscolo viene rifiutato', () => {
    expect(Validate.lot('abc123')).toBeTruthy();
    expect(Validate.lot('ABC123')).toBeNull();
  });

  it('l\'articolo si comportava gia\' cosi\', e continua', () => {
    expect(Validate.article('mp-001')).toBeTruthy();
    expect(Validate.article('MP-001')).toBeNull();
  });

  it('`clean` con `true` e\' la strada per arrivarci', () => {
    expect(Validate.clean('  abc123  ', true)).toBe('ABC123');
    expect(Validate.lot(Validate.clean(' abc123 ', true))).toBeNull();
  });
});

/* LO SCRIPT CHE RADDRIZZA IL DATO — l'altra meta' della voce 38.

   Il codice dalla 2.2 scrive maiuscolo, ma `item_key` e' un campo SCRITTO:
   le righe di prima portano la grafia con cui sono nate. Qui si esercita la
   parte pura di `server/raddrizza-maiuscole.js` — quella che decide cosa e'
   storto e cosa si fonderebbe — senza aprire nessun file. Stessa ragione per
   cui `schemaPostgres` gira a ogni `npm test`: uno script di manutenzione
   che nessuno esercita e' uno script che il giorno che serve non funziona. */
describe('raddrizzare le righe scritte prima della 2.2', () => {
  const req = createRequire(import.meta.url);
  const R = req('../server/raddrizza-maiuscole.js');

  it('storto guarda il valore, non il tipo', () => {
    expect(R.storto('abc')).toBe(true);
    expect(R.storto('ABC')).toBe(false);
    expect(R.storto('700-A')).toBe(false);   // niente lettere, niente da alzare
    expect(R.storto(undefined)).toBe(false); // assente non e' storto
    expect(R.storto(42)).toBe(false);
  });

  it('dice QUALI campi sono storti, non solo che lo sono', () => {
    expect(R.campiStorti('inventory', { item_key: '700#abc', article_code: '700', lot_code: 'abc' }))
      .toEqual(['item_key', 'lot_code']);
    expect(R.campiStorti('inventory', { item_key: '700#ABC', article_code: '700', lot_code: 'ABC' }))
      .toEqual([]);
  });

  it('raddrizza senza toccare l\'originale, e senza toccare il resto', () => {
    const prima = { item_key: '700#abc', article_code: '700', lot_code: 'abc', qty: 3, placed_by: 'as' };
    const dopo = R.raddrizza('inventory', prima);
    expect(dopo.item_key).toBe('700#ABC');
    expect(dopo.lot_code).toBe('ABC');
    expect(prima.item_key).toBe('700#abc');          // l'originale sta fermo
    expect(dopo.qty).toBe(3);                        // la quantita' non e' un codice
    expect(dopo.placed_by).toBe('as');               // e nemmeno la firma
  });

  /* LA RAGIONE PER CUI LO SCRIPT CONTA PRIMA DI SCRIVERE. Due righe che dopo
     l'alzata avrebbero la stessa chiave nello stesso vano non si sommano con
     una UPDATE: sarebbe una somma di colli che nessun movimento ha fatto. */
  it('trova le righe che si fonderebbero', () => {
    const righe = [
      { location_code: 'MAG-01', item_key: '700#abc', qty: 3 },
      { location_code: 'MAG-01', item_key: '700#ABC', qty: 5 },
      { location_code: 'MAG-02', item_key: '700#abc', qty: 1 },
    ];
    const trovate = R.collisioni(righe, g => `${g.location_code} ${g.item_key}`);
    expect(trovate).toHaveLength(1);
    expect(trovate[0].righe.map(r => r.qty).sort()).toEqual([3, 5]);
  });

  it('due righe gia\' identiche non sono una fusione di grafia', () => {
    const righe = [
      { location_code: 'MAG-01', item_key: '700#ABC' },
      { location_code: 'MAG-01', item_key: '700#ABC' },
    ];
    expect(R.collisioni(righe, g => `${g.location_code} ${g.item_key}`)).toEqual([]);
  });

  /* I documenti NON si raddrizzano: §6 dice che le ristampe partono dallo
     snapshot archiviato, e uno snapshot e' il documento com'era il giorno
     che e' uscito. Questa prova e' il guardiano di quel confine. */
  it('non tocca i documenti archiviati', () => {
    expect(R.CAMPI.shipment_archive).toBeUndefined();
    expect(R.CAMPI.pending_outbound).toBeUndefined();
    expect(R.CAMPI.inventory).toBeTruthy();
  });
});
