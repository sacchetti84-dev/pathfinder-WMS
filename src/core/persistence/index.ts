import { LocalPersistence } from './local.js';
import { RemotePersistence } from './remote.js';

/* FASE 3 — l'annotazione qui sotto non è decorativa: è il punto in cui il
   contratto smette di essere una descrizione e diventa un controllo. Se un
   adapter perde un metodo o ne cambia la firma, non compila più. */
import type { Persistenza } from '../../types/contratto.js';

// ═══════════════════════════════════════════════════════════════════
// PERSISTENCE ADAPTER
// © Andrea Sacchetti — Dietopack S.r.l.
// warehouse-mapper — v2.6.0
//
// Unico punto di contatto fra la logica applicativa e il supporto di
// memorizzazione. Store non parla più direttamente con Dexie: parla con
// l'adapter attivo. Sostituire LocalPersistence con RemotePersistence
// (PocketBase) non deve richiedere modifiche a Store, App o alla UI.
// ═══════════════════════════════════════════════════════════════════
//
// PERCHE' ESISTE
// Warehouse Mapper deve diventare il client di un database centralizzato.
// Senza questo strato, introdurre il server significherebbe riscrivere i
// novanta punti in cui Store nomina una tabella Dexie. Con questo strato
// significa scrivere un secondo oggetto che espone gli stessi metodi.
//
// COSA PASSA DI QUI E COSA NO
// Passano di qui le SCRITTURE e il caricamento iniziale. NON passano le
// letture correnti: quelle restano sincrone dalla cache in memoria di
// Store, perche' sono chiamate centinaia di volte dentro i cicli di
// rendering e un backend remoto non puo' servirle in modo sincrono. La
// cache e' il read model; l'adapter e' la sola via di scrittura e la sola
// sorgente di idratazione. Quando arrivera' RemotePersistence, i delta
// realtime del server entreranno nella cache dallo stesso punto in cui
// oggi entrano quelli locali.
//
// IL CONTRATTO E' PIU' AMPIO DI QUANTO ABBOZZATO NELL'HANDOFF
// La bozza elencava open/loadAll/put/bulkPut/delete/clear/transaction/
// count. Alla prova dei fatti Store usa anche:
//   . add()        - inserimento con chiave autoincrementale RESTITUITA;
//                    put() la genererebbe ugualmente ma sovrascriverebbe
//                    in silenzio un record esistente invece di fallire,
//                    e quella differenza e' un controllo, non un dettaglio
//   . bulkAdd()    - stessa distinzione, in blocco (import e checkpoint)
//   . update()     - modifica PARZIALE per chiave. Ricostruirla come
//                    read-modify-put cambierebbe la semantica e, contro un
//                    server, trasformerebbe una PATCH in una PUT: due
//                    operatori che toccano campi diversi dello stesso
//                    record smetterebbero di poter convivere
//   . deleteWhere()/count() con CRITERIO DICHIARATIVO - le uniche vere
//                    query del file sono cancellazioni per prefisso di
//                    ubicazione, per uguaglianza e per soglia temporale.
//                    Non possono essere espresse con una funzione di
//                    filtro JavaScript, perche' una funzione non attraversa
//                    la rete. Il criterio { field, op, value } si traduce
//                    in una where() di Dexie oggi e in una stringa di
//                    filtro PocketBase domani.
// Sono cinque metodi generici in piu', non cinque metodi per entita': il
// contratto resta piccolo e implementabile da un secondo adapter.
//
// CAPABILITY FLAG
// Store interroga i flag invece di dare per scontato cio' che il supporto
// sa fare. Il RemoteAdapter dichiarera' supportsRealtime: true e
// supportsLocalBackup: false, e Store si comportera' di conseguenza senza
// che nessuno debba ricordarsi di andare a cercare i punti da cambiare.
// ═══════════════════════════════════════════════════════════════════


/* ═══════════════════════════════════════════════════════════════════
   SCELTA DELL'ADAPTER
   © Andrea Sacchetti — Dietopack S.r.l.

   Decide da DOVE e' stata aperta la pagina, non da una configurazione:
   servita da http(s) da un servizio Pathfinder → database sulla
   macchina; aperta come file locale → IndexedDB come sempre.

   E' la scelta piu' difficile da sbagliare: non esiste il caso in cui
   qualcuno apra il file dal disco e creda di star scrivendo sul server,
   ne' il contrario. Si puo' forzare con ?db=local per aprire comunque in
   locale un applicativo servito dal servizio — serve a confrontare i due
   supporti senza toccare niente.
   ═══════════════════════════════════════════════════════════════════ */
const Persistence: Persistenza = (() => {
  const forzato = new URLSearchParams(location.search).get('db');
  if (forzato === 'local') return LocalPersistence;
  if (forzato === 'remote') return RemotePersistence;
  const servito = location.protocol === 'http:' || location.protocol === 'https:';
  return servito ? RemotePersistence : LocalPersistence;
})();

export { Persistence, LocalPersistence, RemotePersistence };
