/* IL GANCIO DEL CICLO — carica il client vero e lo punta sul banco.

   `RemotePersistence.base` e' vuoto nell'applicativo (stessa origine della
   pagina); qui la pagina non c'e', e la si dichiara. */

export const BASE = process.env.BANCO_API || 'http://127.0.0.1:4199';

/* ── 2.13 · LA CHIAVE, ATTACCATA UNA VOLTA SOLA ───────────────────────
   Dalla 2.11 il servizio vuole una sessione, e qui non c'è un browser che
   tenga un cookie: il ciclo entra dalla porta di servizio, come il backup
   serale. La chiave la genera `gira.cjs` a ogni giro e la passa di qui.

   Si avvolge `fetch` invece di toccare `RemotePersistence`: il client che
   il ciclo esercita dev'essere quello vero, riga per riga. Un adapter con
   un ramo «se sono al banco» proverebbe un codice che in magazzino non
   gira. Senza `BANCO_TOKEN` non si avvolge niente e tutto resta com'era. */
const CHIAVE = process.env.BANCO_TOKEN || null;
if (CHIAVE && !globalThis.__bancoFetch) {
  const originale = globalThis.fetch;
  globalThis.__bancoFetch = originale;
  globalThis.fetch = (risorsa, opzioni = {}) => {
    const url = typeof risorsa === 'string' ? risorsa : risorsa?.url || '';
    if (!url.startsWith(BASE)) return originale(risorsa, opzioni);
    const intestazioni = new Headers(opzioni.headers || {});
    intestazioni.set('X-Pathfinder-Token', CHIAVE);
    return originale(risorsa, { ...opzioni, headers: intestazioni });
  };
}

let pronto = null;

export async function banco() {
  if (pronto) return pronto;
  const { RemotePersistence } = await import('../../src/core/persistence/index.ts');
  RemotePersistence.base = BASE;
  const { Store } = await import('../../src/core/store.ts');
  const { App } = await import('../../src/ui/app.ts');
  await Store.init();
  pronto = { Store, App, RemotePersistence };
  return pronto;
}

/* L'identita'. Ogni movimento porta la sigla di chi l'ha fatto (GMP, §6), e
   le maschere la pretendono PRIMA di aprirsi: senza, il ciclo proverebbe
   solo la meta' delle strade. */
export async function identifica(iniziali = 'ANDS') {
  const { Store, App } = await banco();
  const op = Store._cache.operators.find((o) => o.initials === iniziali);
  if (!op) throw new Error(`operatore ${iniziali} non in anagrafica`);
  App.currentOperator = op.initials;
  App.currentOperatorRecord = op;
  return op;
}

export const api = async (metodo, percorso, corpo) => {
  const r = await fetch(BASE + percorso, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { status: r.status, corpo: j });
  return j;
};
