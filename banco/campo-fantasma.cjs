/* IL CAMPO FANTASMA — si passa una volta sola.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 2.1 tre rotte del servizio — `removeItem`, `sampleItem`,
   `commitPickStop` — timbravano la riga di giacenza su `updated_at`, che
   `Giacenza` non dichiara e che nessuno legge: il campo della riga si chiama
   `last_updated_at`. Il difetto non si vedeva perché il client si riallinea
   sulla risposta del servizio e la riga a schermo tornava giusta; a database
   restavano due campi e due date. Dalla 2.2 le quattro rotte scrivono tutte
   `last_updated_at`, ma le righe già scritte non si raddrizzano da sole.

   QUALE DELLE DUE DATE SOPRAVVIVE: la più recente. Non è indifferente. La
   risposta del servizio non porta i timbri, quindi il client conservava il
   suo `last_updated_at` — quello del posizionamento o dell'ultima modifica
   fatta dal client — mentre `updated_at` portava lo scarico appena eseguito.
   Delle due, l'ultima modifica vera è quasi sempre la seconda: buttarla
   vorrebbe dire dichiarare una riga più vecchia di quello che è.

   Questo NON è codice dell'applicativo e non va dentro un pacchetto: sta in
   `banco/` come il guardiano, e serve una volta per database.

   Uso — prima si guarda, poi si scrive:
     node banco/campo-fantasma.cjs
     node banco/campo-fantasma.cjs --scrivi

   Il servizio dev'essere acceso: si passa dalle sue rotte e non dal file
   SQLite, così la revisione e i lettori collegati vedono il cambiamento. */
'use strict';

const BASE = process.env.PATHFINDER_BASE || 'http://127.0.0.1:4173';
const SCRIVE = process.argv.includes('--scrivi');

async function chiama(metodo, percorso, corpo) {
  const r = await fetch(BASE + percorso, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`${metodo} ${percorso} → ${r.status} ${await r.text()}`);
  return r.json();
}

const quando = (t) => (typeof t === 'number' ? new Date(t).toLocaleString('it-IT') : '—');

(async () => {
  const righe = await chiama('GET', '/api/c/inventory');
  const sporche = righe.filter((r) => r.updated_at !== undefined);

  console.log(`\n  ${BASE} — ${righe.length} giacenze, ${sporche.length} col campo fantasma\n`);
  if (!sporche.length) { console.log('  Niente da raddrizzare.\n'); return; }

  for (const r of sporche) {
    const tiene = Math.max(r.updated_at || 0, r.last_updated_at || 0);
    const da = tiene === r.updated_at && tiene !== r.last_updated_at ? 'updated_at' : 'last_updated_at';
    console.log(`  ${r.location_code.padEnd(20)} ${r.item_key.padEnd(24)}`
      + ` updated_at ${quando(r.updated_at).padEnd(20)}`
      + ` last_updated_at ${quando(r.last_updated_at).padEnd(20)} → tiene ${da}`);
  }

  if (!SCRIVE) {
    console.log(`\n  SOLA LETTURA. Per scrivere:`);
    console.log(`    1. una copia:  Invoke-RestMethod -Method Post ${BASE}/api/backup`);
    console.log(`    2. poi:        node banco/campo-fantasma.cjs --scrivi\n`);
    return;
  }

  let fatte = 0;
  for (const r of sporche) {
    const tiene = Math.max(r.updated_at || 0, r.last_updated_at || 0);
    /* `updated_at` si toglie destrutturando: `PUT` riscrive il record per
       intero con quello che gli si passa, quindi un campo che non c'è nel
       corpo non c'è più nemmeno a database. Un `PATCH` lo lascerebbe dov'è. */
    const { updated_at: _via, ...pulita } = r;
    await chiama('PUT', `/api/c/inventory/${r._id}`, { ...pulita, last_updated_at: tiene });
    fatte++;
  }

  const dopo = (await chiama('GET', '/api/c/inventory')).filter((r) => r.updated_at !== undefined);
  console.log(`\n  ${fatte} righe raddrizzate. Ne restano ${dopo.length} col campo fantasma.\n`);
  if (dopo.length) process.exitCode = 1;
})().catch((e) => { console.error('\n  ' + e.message + '\n'); process.exitCode = 1; });
