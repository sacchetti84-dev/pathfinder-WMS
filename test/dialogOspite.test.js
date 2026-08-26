/* L'OSPITE DEI DIALOGHI NON PUO' MANCARE IN SILENZIO — 2.9.

   `#dlgOverlay` e' un div vuoto dichiarato in `index.html`: il pavimento su
   cui ogni finestra di dialogo si monta. Fino alla 2.8, se non c'era,
   `Dialog._open` usciva con `Promise.resolve(null)` — e `null` e' la stessa
   risposta che da' chi preme «Annulla».

   COSA VOLEVA DIRE. Ogni conferma del magazzino si comportava come un
   annullamento: `_routeConfirmStop` legge `if (qty === null) return`, e
   tornava indietro senza una parola. Nessun errore in consolle, nessun
   messaggio a video, nessuna traccia nel registro — da fuori, un tasto che
   non fa niente. E non riguardava UNA maschera: prelievo, conta,
   smaltimento, quarantena e spedizione passano tutte da li'.

   Trovato il 27/08 al banco, e trovato per caso.

   PERCHE' UN DOM SCRITTO A MANO E NON JSDOM. Le prove di questo progetto
   girano in Node, e `test/ambiente.js` sostituisce `location` e
   `localStorage` a mano per lo stesso motivo: una dipendenza in piu' e'
   una decisione, e `_overlay` ha bisogno di cinque funzioni in croce —
   `getElementById`, `createElement`, `setAttribute`, `appendChild` e
   `remove`. Scriverle costa meno che portarsi dentro jsdom. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';

/* ── Il DOM minimo che `_overlay` tocca, e nient'altro ─────────────── */
function nodo(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    id: '',
    _attr: new Map(),
    _figli: [],
    setAttribute(k, v) { this._attr.set(k, String(v)); },
    getAttribute(k) { return this._attr.has(k) ? this._attr.get(k) : null; },
    appendChild(f) { this._figli.push(f); f._padre = this; return f; },
    remove() {
      const p = this._padre;
      if (!p) return;
      p._figli = p._figli.filter((x) => x !== this);
      this._padre = null;
    },
  };
}

function documentoFinto() {
  const body = nodo('body');
  const tutti = (n, out = []) => {
    for (const f of n._figli) { out.push(f); tutti(f, out); }
    return out;
  };
  return {
    body,
    createElement: (tag) => nodo(tag),
    getElementById: (id) => tutti(body).find((n) => n.id === id) || null,
    quanti: (id) => tutti(body).filter((n) => n.id === id).length,
  };
}

describe('#dlgOverlay che manca', () => {
  let errori;
  let doc;

  beforeEach(() => {
    doc = documentoFinto();
    globalThis.document = doc;
    errori = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errori.push(a.join(' ')));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.document;
  });

  it('si ricostruisce invece di far sparire il dialogo', async () => {
    const { Dialog } = await import('../src/ui/dialog');
    Dialog._ospiteRicostruito = false;
    expect(doc.getElementById('dlgOverlay')).toBeNull();

    const ospite = Dialog._overlay();

    expect(ospite).toBeTruthy();
    expect(doc.getElementById('dlgOverlay')).toBe(ospite);
  });

  /* Il lettore di schermo deve trovare quel che troverebbe se il div non
     fosse mai mancato: gli attributi sono quelli di `index.html`, letti da
     li' e non ricopiati — cosi' il giorno che cambiano, cambia la prova. */
  it('lo rimette con gli stessi attributi di index.html', async () => {
    const { Dialog } = await import('../src/ui/dialog');
    Dialog._ospiteRicostruito = false;
    const ospite = Dialog._overlay();

    const html = fs.readFileSync('index.html', 'utf8');
    const riga = html.split('\n').find((l) => l.includes('id="dlgOverlay"'));
    expect(riga, 'index.html non dichiara piu’ #dlgOverlay').toBeTruthy();

    for (const attr of ['role', 'aria-modal', 'aria-labelledby']) {
      const atteso = riga.match(new RegExp(`${attr}="([^"]*)"`))?.[1];
      expect(ospite.getAttribute(attr), attr).toBe(atteso);
    }
  });

  /* La ricostruzione ripara il sintomo e nasconderebbe la causa. Una causa
     nascosta torna. */
  it('lo dice, e lo dice una volta sola', async () => {
    const { Dialog } = await import('../src/ui/dialog');
    Dialog._ospiteRicostruito = false;

    Dialog._overlay();
    expect(errori).toHaveLength(1);
    expect(errori[0]).toMatch(/dlgOverlay/);
    /* Il messaggio deve dire la CONSEGUENZA, non solo il fatto: chi legge
       deve capire perche' i tasti non rispondevano. */
    expect(errori[0]).toMatch(/annullamento/i);

    /* Un magazzino apre centinaia di dialoghi per turno: trecento righe
       uguali in consolle sono di nuovo un silenzio. */
    doc.getElementById('dlgOverlay').remove();
    Dialog._overlay();
    Dialog._overlay();
    expect(errori).toHaveLength(1);
  });

  it('quando c’e’ gia’, lo restituisce e non dice niente', async () => {
    const { Dialog } = await import('../src/ui/dialog');
    Dialog._ospiteRicostruito = false;
    const mio = doc.createElement('div');
    mio.id = 'dlgOverlay';
    doc.body.appendChild(mio);

    expect(Dialog._overlay()).toBe(mio);
    expect(errori).toHaveLength(0);
    expect(doc.quanti('dlgOverlay')).toBe(1);
  });
});

/* La prova che vale piu’ di tutte: se `_open` torna a uscire su un ospite
   mancante, il difetto e’ tornato per intero. Si legge il sorgente perche'
   quel `return` non lascia nessuna traccia osservabile — e' esattamente il
   punto. */
describe('_open non ha piu’ una via d’uscita muta', () => {
  it('non contiene un ritorno a vuoto sull’ospite', () => {
    const src = fs.readFileSync('src/ui/dialog.ts', 'utf8');
    const inizio = src.indexOf('_open<T extends Esito>');
    expect(inizio).toBeGreaterThan(-1);
    const corpo = src.slice(inizio, inizio + 900);
    expect(corpo).not.toMatch(/if \(!overlay\) return Promise\.resolve\(null\)/);
  });

  it('`_overlay` promette un elemento, non un forse', () => {
    const src = fs.readFileSync('src/ui/dialog.ts', 'utf8');
    expect(src).toMatch(/_overlay\(\): HTMLElement \{/);
    expect(src).not.toMatch(/_overlay\(\): HTMLElement \| null/);
  });
});
