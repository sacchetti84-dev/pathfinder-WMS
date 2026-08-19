/* IL GANCIO DEL CICLO — carica il client vero e lo punta sul banco.

   `RemotePersistence.base` e' vuoto nell'applicativo (stessa origine della
   pagina); qui la pagina non c'e', e la si dichiara. */

export const BASE = process.env.BANCO_API || 'http://127.0.0.1:4199';

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
