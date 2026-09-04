/* IL BANCO A VIDEO — il telaio, e i flussi.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Si carica dentro l'applicativo servito dal banco (`accendi.cjs`), con una
   riga sola nella console:

       (await import('/banco.js')).gira('<chiave>')

   ─────────────────────────────────────────────────────────────────────────
   OGNI PROVA GUARDA TRE COSE INSIEME, ed è il motivo per cui questo banco
   esiste accanto a quello del ciclo:

     A VIDEO      quel che l'operatore vede — testo, numeri, stati, misure
     IL CONTO     quel che il numero dovrebbe essere, calcolato a parte
     A DATABASE   quel che è finito scritto, RILETTO dal servizio

   Le 47 prove del ciclo guardano solo la terza. Sono forti e non bastano: un
   bancale «in baia» e uno «saltato» possono uscire grigi tutti e due mentre
   il database dice due cose diverse, e il ciclo non se ne accorge.

   NON SI SCRIVE SUI DATI VERI. Questo file gira dentro l'applicativo servito
   dalla 4199, che ha un database usa e getta. Se l'origine non è quella, si
   ferma prima di toccare qualunque cosa.
   ───────────────────────────────────────────────────────────────────────── */

const PORTA_BANCO = '4199';

/* ═══ La chiave, attaccata una volta sola ════════════════════════════════
   Le rotte vogliono una sessione e qui non c'è nessuno che digiti un PIN: si
   entra dalla porta di servizio, la stessa dell'installer. `Persistence` non
   sa niente di tutto questo — si avvolge `fetch`, come fa `ciclo/banco.js`
   da parte sua. */
function attaccaChiave(chiave) {
  if (globalThis.__bancoVideoFetch) return;
  const originale = globalThis.fetch.bind(globalThis);
  globalThis.__bancoVideoFetch = originale;
  globalThis.fetch = (risorsa, opzioni = {}) => {
    const intestazioni = new Headers(opzioni.headers || {});
    intestazioni.set('X-Pathfinder-Token', chiave);
    return originale(risorsa, { ...opzioni, headers: intestazioni });
  };
}

/* ═══ Il verbale ═════════════════════════════════════════════════════════ */

const esiti = [];
let corrente = null;

class Rotto extends Error {}

function segna(ok, cosa, atteso, avuto) {
  corrente.righe.push({ ok, cosa, atteso, avuto });
  if (!ok) corrente.rotte++;
}

/** Il cuore: dice cosa ci si aspetta, e cosa c'è. Non lancia — una prova che
    si ferma al primo intoppo racconta un difetto solo, e gli altri restano
    nascosti fino al giro dopo. */
export function uguale(avuto, atteso, cosa) {
  const a = JSON.stringify(avuto), b = JSON.stringify(atteso);
  segna(a === b, cosa, atteso, avuto);
  return a === b;
}

export function vero(cond, cosa) {
  segna(!!cond, cosa, 'vero', !!cond);
  return !!cond;
}

export function circa(avuto, atteso, tolleranza, cosa) {
  const ok = Number.isFinite(avuto) && Math.abs(avuto - atteso) <= tolleranza;
  segna(ok, `${cosa} (± ${tolleranza})`, atteso, avuto);
  return ok;
}

/** Quel che l'operatore VEDE: il testo di un elemento, ripulito dagli a capo
    e dagli spazi doppi che il markup lascia in giro. */
export function aVideo(selettore, dentro = document) {
  const el = dentro.querySelector(selettore);
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
}

export function siVede(selettore, dentro = document) {
  const el = dentro.querySelector(selettore);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** Quel che è finito A DATABASE. Non si guarda la cache dell'applicativo: si
    RILEGGE dal servizio, che è l'unico posto dove la verità è già stata
    scritta. Costa una chiamata, e vale quella chiamata. */
export async function daDatabase() {
  const r = await fetch('/api/load');
  if (!r.ok) throw new Rotto(`/api/load ha risposto ${r.status}`);
  return await r.json();
}

/** Una collezione sola, riletta dal servizio. Per le prove che guardano una
    riga: `/api/load` porta undicimila articoli e non serve a niente. */
export async function collezione(nome) {
  const r = await fetch(`/api/c/${nome}`);
  if (!r.ok) throw new Rotto(`/api/c/${nome} ha risposto ${r.status}`);
  return await r.json();
}

/* ═══ Chi lavora ═════════════════════════════════════════════════════════
   IL BANCO NON DIGITA UN PIN, e non è una scorciatoia: è una scelta.

   Le impronte dei PIN in `pristino.db` sono quelle vere, e nessuno le
   conosce — è il loro mestiere. Fabbricarne una qui vorrebbe dire riscrivere
   `campiPin` fuori dal servizio, cioè tenere due copie di un calcolo di
   sicurezza: esattamente quel che non si fa.

   Quindi il banco si INSTALLA come l'applicativo installa chi ha appena
   digitato il PIN giusto — `_activateOperator`, le stesse tre righe — e
   chiude il cancello. I movimenti portano una sigla vera, che è quel che
   conta per il registro GMP.

   IL CANCELLO RESTA DA PROVARE, e si prova senza un PIN valido: un PIN
   sbagliato deve dire di no, e dopo N tentativi deve chiudere. È un flusso
   suo, e non passa di qui. */
export async function entra() {
  /* PRIMA DI TUTTO, SI CHIUDE QUEL CHE E' RIMASTO APERTO. Un flusso che
     finisce male puo' lasciare un dialogo a video, e un dialogo aperto
     blocca ogni maschera che viene dopo: la prova successiva fallisce su
     campi che «non ci sono», e il verbale accusa una vista che non ha
     nessuna colpa. E' successo alla prima corsa intera. */
  await chiudiQualunqueFinestra();
  const ops = (await collezione('operators')).filter((o) => o.active !== false);
  if (!ops.length) throw new Rotto('nel database del banco non c\'è nessun operatore attivo');
  const op = ops[0];
  /* Gli stessi tre gesti di `_afterLogin`, nello stesso ordine. Il terzo è
     quello che conta e si dimentica: `_identificato()` scioglie la promessa
     su cui l'avvio è fermo. Senza, l'operatore risulta dentro ma `#appRoot`
     resta a `display: none` — l'applicativo non è mai partito. */
  App._activateOperator(op);
  App._closeIdentityGate?.();
  App._identificato?.();
  await finoA(() => getComputedStyle(document.getElementById('appRoot')).display !== 'none',
    'l\'applicativo finisce di avviarsi');
  return op;
}

const respira = (ms = 220) => new Promise((r) => setTimeout(r, ms));

/** Aspetta che una condizione si avveri, invece di dormire a caso: una
    maschera che si ridisegna non ha un tempo fisso, e un `setTimeout` tarato
    su questa macchina fallisce sul portatile di qualcun altro. */
export async function finoA(prova, cosa, msMax = 12000) {
  const scadenza = Date.now() + msMax;
  while (Date.now() < scadenza) {
    try { if (prova()) return true; } catch { /* la maschera non c'è ancora */ }
    await respira(80);
  }
  segna(false, `attesa scaduta: ${cosa}`, `entro ${msMax}ms`, 'mai');
  return false;
}

/* ═══ Il dialogo, guidato come lo guida un dito ═══════════════════════════
   NON SI SCAVALCA `Dialog`. Sarebbe piu' corto sostituire `Dialog.confirm`
   con una funzione che dice sempre di si', e sarebbe una prova che non
   guarda niente: meta' dei conti di questo applicativo — il saldo dopo, i
   colli che escono, il totale del documento — l'operatore li legge nel
   riquadro di conferma, e da nessun'altra parte. Se il banco lo salta, quei
   conti restano non provati proprio dove si vedono.

   Quindi si preme il pulsante, come al banco lo premerebbe un dito. E dopo
   averlo premuto, si aspetta: `Dialog` risolve una promessa, e chi la
   aspetta riprende al giro dopo dell'anello di eventi, non subito. */

export function dialogo() {
  const o = document.getElementById('dlgOverlay');
  return o && o.classList.contains('open') ? o : null;
}

export function tastiDialogo() {
  return [...(dialogo()?.querySelectorAll('.dlg-actions button') || [])];
}

/** Il titolo e il corpo del dialogo aperto: quel che l'operatore legge
    prima di decidere. */
export function testoDialogo() {
  const d = dialogo();
  if (!d) return null;
  return {
    titolo: d.querySelector('.dlg-head h2')?.textContent.trim() || '',
    corpo: (d.querySelector('.dlg-body')?.textContent || '').replace(/\s+/g, ' ').trim(),
  };
}

/** Le coppie del riepilogo, come mappa. È qui che stanno i conti: «Saldo
    dopo», «Colli da smaltire», «Colli in tutto». */
export function riepilogoDialogo() {
  const fuori = {};
  const dl = dialogo()?.querySelector('.dlg-kv');
  if (!dl) return fuori;
  const nodi = [...dl.children];
  for (let i = 0; i < nodi.length - 1; i++) {
    if (nodi[i].tagName === 'DT' && nodi[i + 1].tagName === 'DD') {
      fuori[nodi[i].textContent.trim()] = nodi[i + 1].textContent.trim();
    }
  }
  return fuori;
}

/** Preme il pulsante la cui etichetta contiene `etichetta`, e aspetta che il
    dialogo cambi. Torna `false` — senza lanciare — se quel pulsante non c'è:
    il verbale dirà quali c'erano, che è l'informazione che serve davvero. */
export async function premi(etichetta) {
  const tasti = tastiDialogo();
  const b = tasti.find((x) => x.textContent.toLowerCase().includes(etichetta.toLowerCase()));
  if (!b) {
    segna(false, `nel dialogo c'è un pulsante «${etichetta}»`,
      etichetta, tasti.map((x) => x.textContent.trim()));
    return false;
  }
  b.click();
  /* Il dialogo può chiudersi, o può esserne aperto subito un altro: in tutti
     e due i casi il pulsante di prima non è più quello in fondo alla
     finestra, ed è questo che si aspetta. */
  await finoA(() => !dialogo() || tastiDialogo()[0] !== b,
    `la finestra si muove dopo «${etichetta}»`, 3000);
  await respira(60);
  return true;
}

/** Un dialogo che PUÒ comparire e può non comparire — l'avviso non-FEFO, la
    domanda sulla stampa. Se c'è, si risponde; se non c'è, non è un difetto e
    il verbale non ne parla. Torna `true` se ha risposto. */
export async function seCompare(pezzoDelTitolo, etichetta, msMax = 2000) {
  const scadenza = Date.now() + msMax;
  while (Date.now() < scadenza) {
    const t = testoDialogo();
    if (t && t.titolo.toLowerCase().includes(pezzoDelTitolo.toLowerCase())) {
      await premi(etichetta);
      return true;
    }
    await respira(80);
  }
  return false;
}

/** Chiude quel che c'è aperto, senza sapere in anticipo cosa sia: alcune
    maschere ne aprono una loro appena finito — l'etichetta dell'unità di
    carico parte da sola alla creazione — e una prova che si aspetti sempre
    la stessa finestra si rompe alla prima che ne aggiunge una. */
export async function chiudiQualunqueFinestra() {
  for (let i = 0; i < 4; i++) {
    if (dialogo()) {
      const t = tastiDialogo();
      const via = t.find((x) => /annulla|chiudi|non ora|indietro/i.test(x.textContent)) || t[0];
      if (via) { via.click(); await respira(150); continue; }
    }
    if (document.getElementById('modalOverlay')) { App.closeModal?.(); await respira(150); continue; }
    return true;
  }
  return !dialogo() && !document.getElementById('modalOverlay');
}

/* ═══ La pagina, guidata come la guida un dito ═══════════════════════════ */

/** Scrive in un campo e lo dice alla pagina: senza l'evento, un `oninput`
    non parte e la maschera resta convinta che il campo sia vuoto. */
export function scrivi(id, valore) {
  const el = document.getElementById(id);
  if (!el) { segna(false, `a video c'è il campo «${id}»`, id, 'non c\'è'); return false; }
  el.value = String(valore);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Preme un pulsante DELLA PAGINA scegliendolo dal testo, che è il modo in
    cui lo sceglie chi lavora. */
export function premiInPagina(selettore, testo = null, dentro = document) {
  const nodi = [...dentro.querySelectorAll(selettore)];
  const b = testo ? nodi.find((x) => x.textContent.includes(testo)) : nodi[0];
  if (!b) {
    segna(false, `a video c'è «${selettore}${testo ? ' · ' + testo : ''}»`,
      'un pulsante', `${nodi.length} candidati`);
    return null;
  }
  b.click();
  return b;
}

/** Il numero dentro un testo: «12 Coll. disp.» → 12. Torna `null` se non ce
    n'è, che è diverso da zero e non va confuso con zero. */
export function numeroIn(testo) {
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(testo ?? ''));
  return m ? Number(m[0].replace(',', '.')) : null;
}

/* ═══ I flussi ═══════════════════════════════════════════════════════════ */

const FLUSSI = {};

export function flusso(nome, titolo, fn) { FLUSSI[nome] = { titolo, fn }; }

/* ── L'IMPIANTO ───────────────────────────────────────────────────────────
   La prova che collauda il banco, non l'applicativo. Se questa è rossa, ogni
   altra prova di questo file sta mentendo: sta guardando un database che non
   è quello che crede, o un applicativo che non è quello costruito.

   Si fa per prima e si guarda per prima. */
flusso('impianto', 'L\'impianto: il banco guarda quel che crede di guardare', async () => {
  vero(location.port === PORTA_BANCO,
    `si sta sulla ${PORTA_BANCO} (il banco), non sulla 4173 (i dati veri)`);

  const info = await (await fetch('/api/app-info')).json();
  vero(!!info.versione, `il servizio dice la versione: ${info.versione}`);

  const db = await daDatabase();
  vero(Array.isArray(db.inventory) && db.inventory.length > 0,
    `il database ha merce dentro: ${db.inventory?.length} righe di giacenza`);
  vero(Array.isArray(db.sites) && db.sites.length > 0,
    `i siti ci sono: ${db.sites?.length}`);

  vero(typeof App === 'object' && typeof App.switchView === 'function',
    'l\'applicativo è in pagina e risponde');

  /* IL CANCELLO C'È DAVVERO, e va detto prima di scavalcarlo: se un giorno
     sparisse, questa riga lo direbbe invece di lasciar passare il banco su
     un applicativo che non chiede più chi sei. */
  vero(!!document.getElementById('identityGate'),
    'l\'applicativo chiede chi sei prima di aprirsi');

  const op = await entra();
  vero(App.currentOperator === op.initials, `si entra come ${op.initials}`);

  App.switchView('dashboard');
  await finoA(() => siVede('#viewDashboard'), 'il cruscotto si disegna');
  vero(siVede('#viewDashboard'), 'il cruscotto è a video');

  /* QUEL CHE SI VEDE E QUEL CHE STA A DATABASE DEVONO DIRE LO STESSO NUMERO.

     E si legge DAL VIDEO, non da `Store`. Non è pignoleria: leggere il
     numero dalla cache e confrontarlo con la cache sarebbe una prova che non
     può fallire. Il numero che conta è quello che l'operatore legge, e fra
     lui e il database ci sono un calcolo e un disegno — che è dove i difetti
     di questa giornata si nascondevano. */
  const numeri = [...document.querySelectorAll('#viewDashboard .kpi-value')]
    .map((n) => n.textContent.trim());
  vero(numeri.length > 0, `il cruscotto mostra ${numeri.length} indicatori`);

  const aVideoUbicazioni = Number(String(numeri[0] || '').replace(/\D/g, ''));
  const zone = db.zones || [];
  vero(zone.length > 0, `le zone a database sono ${zone.length}`);
  vero(aVideoUbicazioni > 0,
    `le ubicazioni scritte a video sono ${aVideoUbicazioni}`);

  const itemAVideo = Number(String(numeri[1] || '').replace(/\D/g, ''));
  uguale(itemAVideo, db.inventory.length,
    'gli item scritti a video sono le righe di giacenza a database');

  /* SCRIVERE DEVE FUNZIONARE, o le prove che scrivono falliranno tutte per
     la stessa ragione e nessuno capirà quale. Si scrive la cosa più innocua
     che esista — una riga di `meta` — e la si rilegge DAL SERVIZIO. */
  const chiave = 'bancoVideoProva';
  const valore = String(Date.now());
  const scritto = await fetch(`/api/c/meta/${chiave}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: chiave, value: valore }),
  });
  vero(scritto.ok, `la scrittura passa (${scritto.status})`);
  const riletto = (await collezione('meta')).find((m) => m.key === chiave);
  uguale(riletto?.value, valore, 'quel che si scrive si rilegge dal servizio');
});

/* ── IL CRUSCOTTO ─────────────────────────────────────────────────────────
   Questo flusso nasce da tre difetti veri, trovati a mano il 04/09 e vissuti
   per mesi senza che niente li dicesse:

     · TRE SCORCIATOIE SU SETTE non aprivano niente. Puntavano a `quar`,
       `camp` e `ship`, e i modi si chiamano `quarantine`, `sampling`,
       `shipping`. `forms[mode]` tornava `undefined`, l'optional chaining se
       lo ingoiava, e restavano tre pulsanti da premere invano.
     · IL BADGE DELL'OPERATORE stampava `shield-check ADM1` — il NOME
       dell'icona come testo.
     · LA PREFERENZA DEL CRUSCOTTO non sopravviveva al ricaricamento.

   Nessuno dei tre tocca il database, e nessuna delle 1.476 prove poteva
   vederli. Questo flusso li vede tutti e tre. */
flusso('cruscotto', 'Il cruscotto: le scorciatoie aprono, il badge dice una sigla', async () => {
  await entra();
  App.switchView('dashboard');
  await finoA(() => siVede('#viewDashboard'), 'il cruscotto si disegna');

  /* ① Nessun NOME DI ICONA scritto come testo. Le icone sono ottanta, e i
     loro nomi sono parole: se una finisce a video invece di essere
     disegnata, si legge `shield-check` accanto a una sigla. */
  const nomiIcona = [...document.querySelectorAll('#pfIcone symbol')].map((s) => s.id.slice(2));
  const schema = new RegExp('(^|[\\s>(\\[])(' + nomiIcona.join('|') + ')($|[\\s<).,\\]])');
  const scritti = [];
  const passo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = passo.nextNode())) {
    const t = n.textContent.trim();
    /* «barcode» è anche una parola italiana d'uso — «scansiona con lettore
       barcode» — e non è un'icona finita a video. */
    if (t && schema.test(t) && !/lettore barcode/i.test(t)) scritti.push(t.slice(0, 60));
  }
  uguale(scritti, [], 'nessun nome di icona è finito a video come testo');

  /* ② Il badge dell'operatore porta una SIGLA, non altro. */
  const badge = aVideo('#operatorBadge');
  uguale(badge, App.currentOperator, 'il badge in barra porta la sigla e basta');

  /* ③ OGNI SCORCIATOIA APRE QUEL CHE PROMETTE. Si preme davvero, e si guarda
     se la maschera compare: è l'unica prova che vale, perché un modo
     sbagliato non solleva niente. */
  const scorciatoie = App._scorciatoieDisponibili();
  vero(scorciatoie.length > 0, `il catalogo ha ${scorciatoie.length} scorciatoie`);
  const mute = [];
  for (const s of scorciatoie) {
    App.cancelMov();
    App.switchView('dashboard');
    await respira(120);
    App._goOp(s.mode, s.sub);
    const aperta = await finoA(
      () => (document.getElementById('movFormArea')?.textContent || '').trim().length > 0,
      `la scorciatoia «${s.label}» apre una maschera`, 2500);
    const tessera = aVideo('.mov-action-card.active h3');
    if (!aperta || !tessera) mute.push(`${s.id} (${s.mode}${s.sub ? '/' + s.sub : ''})`);
  }
  App.cancelMov();
  uguale(mute, [], 'nessuna scorciatoia è muta');

  /* ④ LA PREFERENZA È DI CHI GUARDA, E SOPRAVVIVE. Si sposta un riquadro, si
     rilegge DAL SERVIZIO, e si rimette com'era: un banco che lascia il
     cruscotto storto è un banco che si fa odiare. */
  const chiave = `dashboardLayout:${App.currentOperator}`;
  const prima = App._layoutCruscotto().riquadri.find((r) => r.id === 'documenti');
  await App._dashLarghezza('documenti', prima.larghezza === 'meta' ? 'intera' : 'meta');
  await respira(300);
  const scritto = (await collezione('meta')).find((m) => m.key === chiave);
  vero(!!scritto, `la preferenza va sulla chiave di chi guarda (${chiave})`);
  const dentro = (typeof scritto?.value === 'string' ? JSON.parse(scritto.value) : scritto?.value);
  const rigaScritta = (dentro?.riquadri || []).find((r) => r.id === 'documenti');
  uguale(rigaScritta?.larghezza, App._layoutCruscotto().riquadri.find((r) => r.id === 'documenti').larghezza,
    'quel che il cruscotto mostra è quel che sta scritto a database');
  await App._dashLarghezza('documenti', prima.larghezza);
});

/* ── LO SMALTIMENTO ───────────────────────────────────────────────────────
   IL CONTO CHE SI LEGGE E IL CONTO CHE SI SCRIVE DEVONO ESSERE LO STESSO.

   Lo smaltimento è il posto giusto per provarlo perché il saldo compare in
   quattro punti diversi, calcolati in quattro momenti diversi:

     · la scheda a scaffale     — «Colli disponibili» / «Colli fisici»
     · il riepilogo di conferma — «Saldo dopo», l'ultimo numero che
                                  l'operatore legge prima di firmare
     · la riga di giacenza      — quel che resta a database
     · il verbale archiviato    — `qty`, `qty_before`, `qty_after`

   Se uno dei quattro si stacca dagli altri, il magazzino dice una cosa e la
   carta ne dice un'altra: è la firma di un difetto GMP, non un'imprecisione.

   Si smaltisce DUE VOLTE, e non per ridondanza: parziale e totale prendono
   due strade diverse dentro `removeItem` — la prima lascia la riga con meno
   colli, la seconda la fa sparire — e l'intestazione del riepilogo cambia
   con loro. Provarne una sola vorrebbe dire provarne metà. */
flusso('smaltimento', 'Lo smaltimento: il saldo che si legge è il saldo che si scrive', async () => {
  await entra();

  /* ① UNA RIGA SU CUI SI PUÒ LAVORARE, scelta GUARDANDO LA MASCHERA e non
     rifacendo i conti di `Store`. Quale merce sia impegnata su un DDT lo sa
     una regola sola, e riscriverla qui vorrebbe dire tenerne due copie: il
     banco chiede alla ricerca, e prende la prima riga che la ricerca stessa
     dichiara libera. */
  const giacenza = await collezione('inventory');
  const candidati = giacenza
    .filter((r) => (r.qty || 0) >= 3 && !(r.packs && r.packs.length))
    .slice(0, 15);
  vero(candidati.length > 0, `ci sono ${candidati.length} righe abbastanza grosse da smaltirne una parte`);

  App._goOp('io', 'out');
  if (!await finoA(() => !!document.getElementById('mOutArt'), 'lo scarico si apre sulla ricerca')) return;

  let scelto = null, riga = null, disponibile = 0;
  for (const c of candidati) {
    scrivi('mOutArt', c.article_code);
    scrivi('mOutLot', c.lot_code);
    App._searchOut();
    await respira(120);
    const mia = [...document.querySelectorAll('#mOutResults .inv-item-row')]
      .find((r) => r.textContent.includes(c.location_code));
    if (!mia) continue;
    const testo = mia.textContent.replace(/\s+/g, ' ');
    const m = /(\d+) Coll\. disp\. \(fisici (\d+)\)/.exec(testo);
    if (!m || !mia.querySelector('button')) continue;
    /* Disponibile e fisici uguali vuol dire che nessun DDT la sta tenendo:
       è la riga su cui i conti di questa prova valgono senza asterischi. */
    if (m[1] !== m[2] || Number(m[1]) !== (c.qty || 0)) continue;
    scelto = c; riga = mia; disponibile = Number(m[1]); break;
  }
  if (!vero(!!scelto, 'la ricerca offre una riga libera da impegni su cui provare')) return;
  uguale(disponibile, scelto.qty,
    `quel che la ricerca dichiara disponibile è quel che sta a database (${disponibile} Coll.)`);

  /* ② LA SCHEDA A SCAFFALE ripete gli stessi numeri, ed è la prima occasione
     che hanno di smentirsi. */
  premiInPagina('button', 'Vai e verifica', riga);
  if (!await finoA(() => !!document.getElementById('dLoc'), 'la verifica a scaffale si apre')) return;

  const scheda = {};
  for (const r of document.querySelectorAll('.route-stop-kv')) {
    scheda[r.querySelector('span')?.textContent.trim()] = r.querySelector('b')?.textContent.trim();
  }
  uguale(aVideo('.route-stop-loc'), scelto.location_code, 'la scheda porta l\'ubicazione scelta');
  uguale(scheda['Articolo'], scelto.article_code, 'la scheda porta l\'articolo');
  uguale(scheda['Lotto'], scelto.lot_code, 'la scheda porta il lotto');
  uguale(Number(scheda['Colli disponibili']), disponibile, 'la scheda ripete i colli disponibili');
  uguale(Number(scheda['Colli fisici']), disponibile, 'la scheda ripete i colli fisici');

  /* ③ LE TRE SCANSIONI. Sono il controllo che tiene in piedi tutto il resto:
     senza, si smaltisce quel che si è cercato invece di quel che si ha in
     mano. Si guarda che vengano ACCETTATE, non che compaia un messaggio. */
  scrivi('dLoc', scelto.location_code); App._normScan('dLoc'); App._dispCheckLoc();
  scrivi('dArt', scelto.article_code); App._dispCheckArt();
  scrivi('dLot', scelto.lot_code); App._dispCheckLot();
  await respira(150);
  const scan = App._dispState?.scan || {};
  uguale([scan.loc, scan.art, scan.lot],
    [scelto.location_code, scelto.article_code, scelto.lot_code],
    'le tre scansioni a scaffale sono accettate');

  /* ④ UN'USCITA PARZIALE: esce tutto meno un collo. */
  const escono = disponibile - 1;
  scrivi('dQty', escono);
  premiInPagina('.disp-reason');
  const causale = document.querySelector('.disp-reason.active')?.textContent.trim() || '';
  vero(!!causale, `la causale scelta si accende a video: «${causale}»`);

  const idPrima = new Set((await collezione('disposal_archive')).map((v) => v.doc_id));

  App._execSmaltire();
  if (!await finoA(() => !!dialogo(), 'lo smaltimento chiede conferma')) return;
  /* Il lotto scelto potrebbe non essere quello che la FEFO consiglia: è
     legittimo, e l'applicativo lo fa dire per iscritto prima di andare
     avanti. Se l'avviso non compare, non è un difetto. */
  await seCompare('NON conforme a FEFO', 'Smaltisci comunque');
  if (!await finoA(() => !!dialogo(), 'compare il riepilogo dello smaltimento')) return;

  const t = testoDialogo();
  uguale(t?.titolo, 'Smaltimento PARZIALE', 'un\'uscita parziale si annuncia come parziale');
  const riep = riepilogoDialogo();
  uguale(riep['Articolo'], scelto.article_code, 'il riepilogo porta l\'articolo');
  uguale(riep['Lotto'], scelto.lot_code, 'il riepilogo porta il lotto');
  uguale(riep['Ubicazione'], scelto.location_code, 'il riepilogo porta l\'ubicazione');
  uguale(riep['Colli da smaltire'], String(escono), 'il riepilogo dice quanti colli escono');
  /* IL CONTO, fatto qui e non copiato da nessuna parte. */
  uguale(riep['Saldo dopo'], `${disponibile - escono} Coll.`,
    'IL CONTO: saldo dopo = disponibile − usciti');
  uguale(riep['Motivazione'], causale, 'il riepilogo porta la causale scelta');
  vero((t?.corpo || '').includes(`Restano ${disponibile - escono}`),
    'il messaggio ripete il resto con le stesse cifre del riepilogo');

  await premi('Smaltisci');
  await seCompare('Stampare il verbale', 'Non ora', 8000);

  /* ⑤ A DATABASE. Si RILEGGE dal servizio, e si aspetta che ci arrivi: la
     scrittura è asincrona e leggere subito vorrebbe dire leggere prima. */
  let archivio = [];
  for (let i = 0; i < 25; i++) {
    archivio = await collezione('disposal_archive');
    if (archivio.length > idPrima.size) break;
    await respira(150);
  }
  uguale(archivio.length, idPrima.size + 1, 'lo smaltimento archivia UN verbale, e uno solo');
  const verbale = archivio.find((v) => !idPrima.has(v.doc_id));
  if (!vero(!!verbale, `il verbale nuovo esiste: ${verbale?.doc_id}`)) return;

  uguale(verbale.article_code, scelto.article_code, 'il verbale porta l\'articolo');
  uguale(verbale.lot_code, scelto.lot_code, 'il verbale porta il lotto');
  uguale(verbale.location_code, scelto.location_code, 'il verbale porta l\'ubicazione');
  uguale(verbale.qty, escono, 'A DATABASE: `qty` è quel che è USCITO');
  uguale(verbale.qty_before, disponibile, 'A DATABASE: `qty_before` è quel che c\'era');
  uguale(verbale.qty_after, disponibile - escono, 'A DATABASE: `qty_after` è quel che resta');
  uguale(verbale.reason, causale, 'il verbale porta la causale letta a video');
  uguale(verbale.operator, App.currentOperator, 'il verbale porta la sigla di chi ha firmato');
  vero(!!verbale.sender, 'il verbale porta il mittente, o non è intestato a nessuno');

  const rigaDopo = (await collezione('inventory'))
    .find((r) => r.location_code === scelto.location_code && r.item_key === scelto.item_key);
  uguale(rigaDopo?.qty, disponibile - escono,
    'la giacenza scende esattamente di quel che il riepilogo aveva promesso');

  const movimenti = (await collezione('mov_log')).filter((m) => m.doc_ref === verbale.doc_id);
  uguale(movimenti.length, 1, 'il movimento registrato è uno, e porta il numero del verbale');
  const mv = movimenti[0] || {};
  uguale(mv.qty_before, disponibile, 'il movimento parte dallo stesso numero del verbale');
  uguale(mv.qty_after, disponibile - escono, 'il movimento finisce sullo stesso numero del verbale');
  uguale(mv.qty_before - mv.qty_after, escono, 'il salto del movimento è quel che è uscito');
  uguale(mv.location_code, scelto.location_code, 'il movimento porta l\'ubicazione');
  uguale(mv.user, App.currentOperator, 'il movimento porta la sigla');
  vero(String(mv.notes || '').includes(causale),
    'le note del movimento riportano la causale, che è quel che si legge nel registro');

  /* ⑥ E ADESSO IL RESTO, TUTTO. La strada è un'altra dentro `removeItem` —
     la riga non si accorcia, sparisce — e l'intestazione lo deve dire. */
  await finoA(() => !!document.getElementById('mOutArt'), 'lo scarico torna alla ricerca da solo');
  scrivi('mOutArt', scelto.article_code);
  scrivi('mOutLot', scelto.lot_code);
  App._searchOut();
  await respira(150);
  const rigaResto = [...document.querySelectorAll('#mOutResults .inv-item-row')]
    .find((r) => r.textContent.includes(scelto.location_code));
  if (!vero(!!rigaResto, 'la riga si ritrova, con quel che resta')) return;
  const mResto = /(\d+) Coll\. disp\./.exec(rigaResto.textContent.replace(/\s+/g, ' '));
  uguale(Number(mResto?.[1]), disponibile - escono,
    'quel che la ricerca mostra adesso è quel che lo smaltimento aveva lasciato');

  premiInPagina('button', 'Vai e verifica', rigaResto);
  if (!await finoA(() => !!document.getElementById('dLoc'), 'la verifica si riapre sul resto')) return;
  scrivi('dLoc', scelto.location_code); App._normScan('dLoc'); App._dispCheckLoc();
  scrivi('dArt', scelto.article_code); App._dispCheckArt();
  scrivi('dLot', scelto.lot_code); App._dispCheckLot();
  await respira(150);
  scrivi('dQty', disponibile - escono);
  premiInPagina('.disp-reason');

  const idPrima2 = new Set((await collezione('disposal_archive')).map((v) => v.doc_id));
  App._execSmaltire();
  if (!await finoA(() => !!dialogo(), 'lo smaltimento totale chiede conferma')) return;
  await seCompare('NON conforme a FEFO', 'Smaltisci comunque');
  uguale(testoDialogo()?.titolo, 'Smaltimento TOTALE',
    'un\'uscita che svuota la riga si annuncia come totale');
  uguale(riepilogoDialogo()['Saldo dopo'], '0 Coll.', 'IL CONTO: dopo il totale non resta niente');
  await premi('Smaltisci');
  await seCompare('Stampare il verbale', 'Non ora', 8000);

  let archivio2 = [];
  for (let i = 0; i < 25; i++) {
    archivio2 = await collezione('disposal_archive');
    if (archivio2.length > idPrima2.size) break;
    await respira(150);
  }
  const verbale2 = archivio2.find((v) => !idPrima2.has(v.doc_id));
  if (!vero(!!verbale2, `il verbale del totale esiste: ${verbale2?.doc_id}`)) return;
  uguale(verbale2.qty, disponibile - escono, 'il verbale del totale porta quel che è uscito');
  uguale(verbale2.qty_after, 0, 'A DATABASE: dopo un totale `qty_after` è zero');

  const sparita = (await collezione('inventory'))
    .find((r) => r.location_code === scelto.location_code && r.item_key === scelto.item_key);
  uguale(sparita, undefined,
    'dopo un totale la riga di giacenza non c\'è più: non resta a zero');

  App.cancelMov();
});

/* ── L'UNITÀ DI CARICO, E LA SECONDA PORTA DELLO SMALTIMENTO ──────────────
   QUESTO FLUSSO ESISTE PER UNA DOMANDA SOLA: lo smaltimento si può fare da
   due parti — dalla maschera di scarico, riga per riga, e dalla scheda
   dell'unità di carico, tutta insieme — e le due parti costruiscono il
   verbale A MANO, ognuna per conto suo, in `smaltimento.ts` e in `udc.ts`.

   Dove una regola sta scritta due volte, prima o poi le due copie dicono
   cose diverse. La quarantena lo aveva già capito: tre porte, un
   `_quarantineItemCore` solo, il record costruito dentro `Store`. Lo
   smaltimento no.

   Il banco non tira a indovinare quale delle due sbagli: fa passare la
   merce da tutte e due, e CONFRONTA I DUE VERBALI campo per campo. Se sono
   uguali, la duplicazione è un rischio che non è ancora costato niente; se
   non lo sono, il verbale lo dice con i nomi dei campi che divergono.

   Per arrivarci bisogna prima riempire un'unità, e riempirla è a sua volta
   un flusso che nessuno provava: si crea, si carica, e la riga dell'elenco
   deve dire quante righe e quanti colli ci sono sopra. */
flusso('unitaDiCarico', 'L\'unità di carico: si riempie, si conta, e si smaltisce dall\'altra porta', async () => {
  await entra();

  /* ① UN VANO CON DENTRO ALMENO DUE RIGHE LIBERE. Libere vuol dire non già
     su un'altra unità: quelle la scheda non le offre, ed è giusto così. */
  const giacenza = await collezione('inventory');
  const perVano = new Map();
  for (const r of giacenza) {
    if (r.udc_id || !(r.qty > 0)) continue;
    /* SI SALTANO LE RIGHE CON LA CHIAVE NON MAIUSCOLA, e non per pulizia: su
       quelle la prima scrittura le rende irraggiungibili, e la prova
       fallirebbe per un difetto che non è quello che sta guardando. Il
       difetto ha un flusso suo — «chiaviNonMaiuscole» — ed è lì che va
       letto. */
    if (r.item_key !== String(r.item_key).toUpperCase()) continue;
    if (!perVano.has(r.location_code)) perVano.set(r.location_code, []);
    perVano.get(r.location_code).push(r);
  }
  const vano = [...perVano.entries()].find(([, righe]) => righe.length >= 2);
  if (!vero(!!vano, 'c\'è un vano con almeno due righe libere su cui provare')) return;
  const [vanoCodice, righeVano] = vano;

  /* ② SI CREA L'UNITÀ dalla maschera, non da `Store`. */
  App._goOp('udc');
  if (!await finoA(() => !!document.getElementById('udcElenco'), 'la scheda delle unità si apre')) return;
  const primaUdc = new Set((await collezione('udc')).map((u) => u.udc_id));

  premiInPagina('button', 'Nuova unità di carico');
  if (!await finoA(() => !!document.getElementById('udcLoc'), 'la maschera della nuova unità si apre')) return;
  scrivi('udcLoc', vanoCodice);
  premiInPagina('#modalOverlay button', 'Crea e stampa');

  await finoA(() => (App._udcSel || '') && !primaUdc.has(App._udcSel),
    'l\'unità nasce e resta quella scelta');
  const unita = App._udcSel;
  if (!vero(!!unita && !primaUdc.has(unita), `l'unità nuova è ${unita}`)) return;

  /* L'etichetta parte da sola alla creazione — è quella che resterà
     incollata al legno — e qui va solo chiusa. */
  await chiudiQualunqueFinestra();

  const aDatabase = (await collezione('udc')).find((u) => u.udc_id === unita);
  uguale(aDatabase?.location_code, vanoCodice, 'l\'unità nasce nel vano che le è stato indicato');

  /* ③ SI CARICANO DUE RIGHE, dai pulsanti ↥ della scheda. */
  await finoA(() => !!document.getElementById('udcElenco'), 'l\'elenco si ridisegna con l\'unità nuova');
  const daCaricare = righeVano.slice(0, 2);
  for (const r of daCaricare) {
    await respira(120);
    const bottoni = [...document.querySelectorAll('#udcElenco .inv-item-row')]
      .filter((n) => n.textContent.includes(r.article_code) && n.textContent.includes(r.lot_code))
      .map((n) => n.querySelector('button[onclick*="_udcCarica"]'))
      .filter(Boolean);
    if (!vero(bottoni.length > 0, `la scheda offre di caricare ${r.article_code}#${r.lot_code}`)) continue;
    bottoni[0].click();
    await respira(250);
  }

  /* Si aspetta che le righe ci siano DAVVERO prima di guardare l'elenco: una
     scrittura non ha un tempo fisso, e su un terminale lento un `respira`
     tarato qui fallisce la'. */
  let sopra = [];
  for (let i = 0; i < 40; i++) {
    sopra = (await collezione('inventory')).filter((x) => x.udc_id === unita);
    if (sopra.length >= daCaricare.length) break;
    await respira(150);
  }
  uguale(sopra.length, daCaricare.length, 'sull\'unità salgono esattamente le righe caricate');
  /* E che l'elenco si sia ridisegnato con quel che e' appena salito. */
  await finoA(() => {
    const n = [...document.querySelectorAll('#udcElenco .inv-item-row')]
      .find((x) => x.querySelector('.inv-code')?.textContent.includes(unita));
    return n && /\d+ rig/.test(n.textContent) && !/0 righe/.test(n.textContent);
  }, "l'elenco si aggiorna con le righe appena caricate");

  /* ④ IL CONTO A VIDEO: la riga dell'elenco somma i colli delle righe sopra,
     ed è l'unico posto in cui quel totale compare prima della conferma. */
  const colliVeri = sopra.reduce((t, r) => t + (r.qty || 0), 0);
  const rigaElenco = [...document.querySelectorAll('#udcElenco .inv-item-row')]
    .find((n) => n.querySelector('.inv-code')?.textContent.includes(unita));
  if (!vero(!!rigaElenco, 'l\'unità compare nell\'elenco delle aperte')) return;
  const testoRiga = rigaElenco.textContent.replace(/\s+/g, ' ');
  vero(testoRiga.includes(`${sopra.length} righe`) || testoRiga.includes(`${sopra.length} riga`),
    `l'elenco dice quante righe ci sono sopra (${sopra.length})`);
  uguale(numeroIn(/·\s*(\d+) Coll\./.exec(testoRiga)?.[1]), colliVeri,
    'IL CONTO: i colli scritti nell\'elenco sono la somma dei colli delle righe');

  /* ⑤ SI SMALTISCE L'UNITÀ INTERA — la seconda porta. */
  const idPrima = new Set((await collezione('disposal_archive')).map((v) => v.doc_id));
  premiInPagina('button[onclick*="_udcChiediSmaltisci"]', null, rigaElenco);
  if (!await finoA(() => !!document.getElementById('udcDispCausale'),
    'la maschera dello smaltimento dell\'unità si apre')) return;

  const riepilogo = document.querySelector('#modalOverlay')?.textContent.replace(/\s+/g, ' ') || '';
  vero(riepilogo.includes(unita), 'la maschera nomina l\'unità che sta per sparire');
  vero(riepilogo.includes(`tutte e ${sopra.length} le righe`),
    `la maschera avvisa che escono tutte e ${sopra.length} le righe`);

  const scelta = document.getElementById('udcDispCausale');
  const causale = scelta?.options[scelta.selectedIndex]?.textContent.trim() || '';
  vero(!!causale, `la causale proposta è «${causale}»`);
  premiInPagina('#modalOverlay button', 'Smaltisci l\'unità');

  if (!await finoA(() => !!dialogo(), 'lo smaltimento dell\'unità chiede conferma')) return;
  const riep = riepilogoDialogo();
  uguale(riep['Unità'], unita, 'il riepilogo porta il codice dell\'unità');
  uguale(riep['Ubicazione'], vanoCodice, 'il riepilogo porta l\'ubicazione');
  uguale(riep['Righe'], String(sopra.length), 'il riepilogo dice quante righe escono');
  uguale(riep['Colli in tutto'], String(colliVeri),
    'IL CONTO: i colli del riepilogo sono la somma delle righe che escono');
  uguale(riep['Motivazione'], causale, 'il riepilogo porta la causale scelta');
  await premi('Smaltisci tutto');

  /* ⑥ A DATABASE: UN VERBALE PER RIGA, non uno per unità. Sta scritto in
     `udc.ts` e vale un controllo: un verbale che ne elenca due non si allega
     a nessuna delle due pratiche. */
  let archivio = [];
  for (let i = 0; i < 30; i++) {
    archivio = await collezione('disposal_archive');
    if (archivio.length >= idPrima.size + sopra.length) break;
    await respira(150);
  }
  const nuovi = archivio.filter((v) => !idPrima.has(v.doc_id));
  uguale(nuovi.length, sopra.length, 'l\'unità lascia UN verbale per ogni riga, non uno solo');

  for (const r of sopra) {
    const suo = nuovi.find((v) => v.article_code === r.article_code && v.lot_code === r.lot_code);
    if (!vero(!!suo, `${r.article_code}#${r.lot_code} ha il suo verbale`)) continue;
    uguale(suo.location_code, vanoCodice, `${r.article_code}: il verbale porta l'ubicazione`);
    uguale(suo.qty_before, r.qty, `${r.article_code}: \`qty_before\` è quel che c'era`);
    uguale(suo.qty_after, 0, `${r.article_code}: dopo un'unità intera non resta niente`);
    uguale(suo.qty, r.qty, `${r.article_code}: \`qty\` è quel che è uscito, cioè tutto`);
    uguale(suo.operator, App.currentOperator, `${r.article_code}: il verbale porta la sigla`);
    vero(String(suo.forced_note || '').includes(unita),
      `${r.article_code}: il verbale dice da quale unità veniva`);
  }

  const restate = (await collezione('inventory')).filter((x) => x.udc_id === unita);
  uguale(restate.length, 0, 'sull\'unità smaltita non resta niente');
  const chiusa = (await collezione('udc')).find((u) => u.udc_id === unita);
  vero(chiusa?.status === 'empty' || chiusa?.status === 'closed',
    `l'unità si chiude da sola: adesso è «${chiusa?.status}»`);

  /* ⑦ LE DUE PORTE, MESSE UNA ACCANTO ALL'ALTRA.
     Si confrontano i NOMI DEI CAMPI, non i valori: i valori sono di merci
     diverse e devono essere diversi. Quel che non deve essere diverso è la
     FORMA del verbale — se una porta scrive un campo che l'altra non scrive,
     esistono due verbali di smaltimento che non si leggono allo stesso modo,
     e il prossimo campo che si aggiunge finirà in uno solo dei due posti. */
  const dallUnita = nuovi[0];
  const dalloScarico = archivio.find((v) => !String(v.forced_note || '').includes('Unità di carico')
    && !nuovi.includes(v));
  if (dalloScarico && dallUnita) {
    const campiA = Object.keys(dalloScarico).sort();
    const campiB = Object.keys(dallUnita).sort();
    uguale(campiB, campiA,
      'LE DUE PORTE: il verbale dell\'unità ha gli stessi campi di quello dello scarico');
  } else {
    vero(true, 'il confronto fra le due porte si fa quando l\'archivio ha un verbale di ognuna');
  }

  App.cancelMov();
});

/* ── LE CHIAVI CHE NON SONO MAIUSCOLE ─────────────────────────────────────
   QUESTO FLUSSO È ROSSO APPOSTA, e resta rosso finché il difetto c'è.

   Il servizio MAIUSCOLA i codici prima di scriverli — sta in
   `server/lib/schema.js`, si chiama `normalizza`, ed è una scelta giusta:
   due righe che si chiamano `LOTTO1` e `lotto1` sono la stessa merce e non
   devono diventare due giacenze. La funzione restituisce apposta una COPIA,
   per non maiuscolare il record sotto i piedi di chi l'ha passato, e il
   commento accanto dice perché: sarebbe «il genere di effetto che si scopre
   tre viste più in là».

   Nessuno però RIPRENDE quella copia. `Store` scrive con
   `Persistence.put(...)` e poi mette in cache il PROPRIO oggetto, con la
   chiave come l'aveva. Da quel momento il database dice `123456#QWERT` e
   l'applicativo dice `123456#qwert`: sono due righe diverse, e non lo sa
   nessuno.

   Cosa vede chi lavora: la merce è a video, i pulsanti ci sono, e ogni
   comando che la tocca risponde «123456#qwert non è più in MAG-ACC-03» —
   che è falso, ed è la frase peggiore, perché manda a cercare a scaffale una
   cosa che sta dove deve stare. Si sblocca ricaricando la pagina, e non c'è
   niente che lo suggerisca.

   Serve una riga con la chiave non maiuscola perché il difetto si veda: in
   `pristino.db` ce n'è una, e in un magazzino che ha lavorato prima che la
   normalizzazione esistesse ce ne sono quante ne sono. Dove non ce ne sono,
   il flusso lo dice e non prova niente — un banco che inventa il caso da
   provare prova sé stesso. */
flusso('chiaviNonMaiuscole', 'Le chiavi non maiuscole: una riga scritta una volta sparisce dalle maschere', async () => {
  await entra();

  const storte = (await collezione('inventory'))
    .filter((r) => r.item_key !== String(r.item_key).toUpperCase() && (r.qty || 0) > 0 && !r.udc_id);
  if (!storte.length) {
    vero(true, 'in questo database non c\'è nessuna riga con la chiave non maiuscola: niente da provare');
    return;
  }
  const riga = storte[0];
  vero(true, `la riga storta è ${riga.item_key} in ${riga.location_code}`);

  /* Si fa la scrittura più innocua che esista su quella riga: si carica su
     un'unità di carico e basta. Non cambia la quantità, non muove niente. */
  App._goOp('udc');
  if (!await finoA(() => !!document.getElementById('udcElenco'), 'la scheda delle unità si apre')) return;
  const prima = new Set((await collezione('udc')).map((u) => u.udc_id));
  premiInPagina('button', 'Nuova unità di carico');
  if (!await finoA(() => !!document.getElementById('udcLoc'), 'la maschera della nuova unità si apre')) return;
  scrivi('udcLoc', riga.location_code);
  premiInPagina('#modalOverlay button', 'Crea e stampa');
  await finoA(() => (App._udcSel || '') && !prima.has(App._udcSel), 'l\'unità nasce');
  const unita = App._udcSel;
  await chiudiQualunqueFinestra();

  await finoA(() => !!document.getElementById('udcElenco'), 'l\'elenco si ridisegna');
  const bottone = [...document.querySelectorAll('#udcElenco .inv-item-row')]
    .filter((n) => n.textContent.includes(riga.article_code))
    .map((n) => n.querySelector('button[onclick*="_udcCarica"]'))
    .find(Boolean);
  if (!vero(!!bottone, 'la scheda offre di caricare la riga storta')) return;
  bottone.click();
  await respira(400);

  /* ① QUEL CHE STA A DATABASE E QUEL CHE L'APPLICATIVO CREDE. */
  const aDatabase = (await collezione('inventory')).find((r) => r.udc_id === unita);
  if (!vero(!!aDatabase, 'la riga è salita sull\'unità, a database')) return;
  /* Il pulsante compare quando l'elenco si e' ridisegnato, non quando la
     scrittura e' finita: sono due momenti, e leggerlo fra i due vuol dire
     leggere il nulla. */
  await finoA(() => !!document.querySelector('#udcElenco button[onclick*="_udcScarica"]'),
    "la riga compare sopra l’unità, coi suoi pulsanti");
  const aVideoChiave = /_udcScarica\('([^']+)'\)/.exec(
    document.querySelector('#udcElenco button[onclick*="_udcScarica"]')?.getAttribute('onclick') || '')?.[1];
  /* SI CONFRONTA SENZA GUARDARE LE MAIUSCOLE, ed è una scelta, non una
     resa: il servizio maiuscola i codici prima di scriverli, e ha ragione a
     farlo — due righe che si chiamano `LOTTO1` e `lotto1` sono la stessa
     merce. Quel che deve valere è che le due scritte nominino LA STESSA
     RIGA; se un giorno nominassero righe diverse, questa riga lo direbbe
     lo stesso. */
  uguale(String(aVideoChiave || '').toUpperCase(), String(aDatabase.item_key || '').toUpperCase(),
    'LA CHIAVE: quella dei pulsanti a video e quella a database sono la stessa riga');

  /* ② E LA PROVA CHE CONTA: la riga si deve poter ancora toccare. Si prova a
     smaltirla, che è il comando che il magazzino usa davvero, e si guarda se
     l'applicativo la ritrova. */
  const idPrima = new Set((await collezione('disposal_archive')).map((v) => v.doc_id));
  const errori = [];
  const vero_toast = App.toast.bind(App);
  App.toast = (msg, tipo) => { if (tipo === 'error') errori.push(String(msg)); return vero_toast(msg, tipo); };
  try {
    App._udcChiediSmaltisci(unita);
    if (!await finoA(() => !!document.getElementById('udcDispCausale'), 'la maschera si apre')) return;
    premiInPagina('#modalOverlay button', 'Smaltisci l\'unità');
    if (!await finoA(() => !!dialogo(), 'lo smaltimento chiede conferma')) return;
    await premi('Smaltisci tutto');
    await respira(900);
  } finally {
    App.toast = vero_toast;
  }

  uguale(errori.filter((e) => /non e' piu' in|non è più in/.test(e)), [],
    'nessun comando dice «non è più in» di una riga che è dove deve stare');
  let dopo = [];
  for (let i = 0; i < 30; i++) {
    dopo = await collezione('disposal_archive');
    if (dopo.length > idPrima.size) break;
    await respira(200);
  }
  uguale(dopo.length, idPrima.size + 1,
    'anche una riga con la chiave non maiuscola si riesce a smaltire');

  App.cancelMov();
});

/* ── L'INVENTARIO ─────────────────────────────────────────────────────────
   TRE ESITI, TRE SCRITTURE DIVERSE, e una sola schermata che li mostra tutti
   e tre insieme: si conferma una riga, se ne conta una diversa, se ne
   dichiara una mancante, e si preme una volta sola.

   Il conto che conta è il DELTA: `contati − sistema`. L'operatore lo legge
   accanto alla riga, col segno, prima di applicare; il registro lo riscrive
   come `qty_delta`; la giacenza lo subisce. Se i tre non dicono lo stesso
   numero, un magazzino ha appena scritto una rettifica che non corrisponde a
   quello che qualcuno ha contato — e una rettifica è il documento che in una
   verifica GMP si guarda per primo.

   Le tre strade portano a `removeItem` e `addItem`, cioè agli stessi due
   metodi dello smaltimento e del posizionamento: qui si controlla che ci
   arrivino con i numeri giusti. */
flusso('inventario', 'L\'inventario: il delta che si legge è il delta che si scrive', async () => {
  await entra();

  /* ① IL VANO SI PRENDE INTERO, e le tre righe da toccare si scelgono
     dentro. La maschera elenca TUTTO quel che c'è nel vano, comprese le
     righe che questa prova non tocca: confrontare l'elenco con un
     sottoinsieme già filtrato vorrebbe dire accusare l'inventario di un
     difetto del banco — ed è successo alla prima corsa.

     Si evitano i colli dichiarati — quelli aprono la ridichiarazione, che è
     un altro flusso — e le chiavi non maiuscole, per la ragione scritta in
     «chiaviNonMaiuscole». */
  const giacenza = await collezione('inventory');
  const perVano = new Map();
  for (const r of giacenza) {
    if (!perVano.has(r.location_code)) perVano.set(r.location_code, []);
    perVano.get(r.location_code).push(r);
  }
  const contabile = (r) => (r.qty || 0) >= 2 && !(r.packs && r.packs.length)
    && r.item_key === String(r.item_key).toUpperCase() && !r.udc_id;
  const trovato = [...perVano.entries()]
    .find(([, righe]) => righe.filter(contabile).length >= 3);
  if (!vero(!!trovato, 'c’è un vano con almeno tre righe contabili')) return;
  const [vano, righeVano] = trovato;
  const daToccare = righeVano.filter(contabile);

  App._goOp('inv');
  if (!await finoA(() => !!document.getElementById('mInvLoc'), 'l\'inventario si apre sul vano')) return;
  scrivi('mInvLoc', vano);
  App._loadInv();
  if (!await finoA(() => !!document.getElementById('invRow0'), 'il vano si carica con le sue righe')) return;

  /* ② QUEL CHE IL SISTEMA DICHIARA, riga per riga, prima di toccare niente.
     È il numero contro cui l'operatore conta: se è già sbagliato qui, tutta
     la conta lo è. */
  const aVideoRighe = [...document.querySelectorAll('#mInvContent .inv-item-row')];
  uguale(aVideoRighe.length, righeVano.length,
    `il vano mostra tutte le righe che ha a database (${righeVano.length})`);
  vero((aVideo('#mInvContent p') || '').includes(`Sistema: ${righeVano.length} lotti registrati`),
    `l'intestazione dice quanti lotti sono registrati (${righeVano.length})`);

  const ordineAVideo = [];
  for (const [i, nodo] of aVideoRighe.entries()) {
    const testo = nodo.textContent.replace(/\s+/g, ' ');
    const codice = nodo.querySelector('.inv-code')?.textContent.trim().split(' ')[0];
    const lotto = /Lotto: (\S+)/.exec(testo)?.[1];
    const dichiarato = numeroIn(/Sistema: (\d+) Coll\./.exec(testo)?.[1]);
    const suo = righeVano.find((r) => r.article_code === codice && r.lot_code === lotto);
    ordineAVideo.push({ i, codice, lotto, dichiarato, suo });
    uguale(dichiarato, suo?.qty,
      `riga ${i}: il «Sistema» scritto a video è la giacenza a database (${codice}#${lotto})`);
  }

  /* ③ TRE ESITI DIVERSI, premuti dai pulsanti veri. */
  const tocca = ordineAVideo.filter((r) => r.suo && daToccare.includes(r.suo));
  if (!vero(tocca.length >= 3, 'a video si ritrovano le tre righe da toccare')) return;
  const [conferma, conta, mancante] = tocca;

  premiInPagina(`#invOk${conferma.i}`);
  await respira(80);

  premiInPagina(`#invCnt${conta.i}`);
  if (!await finoA(() => !!dialogo(), 'la conta fisica chiede quanti colli')) return;
  const riepConta = riepilogoDialogo();
  uguale(riepConta['Quantità a sistema'], `${conta.dichiarato} Coll.`,
    'la conta ricorda quanti colli dice il sistema');
  const contati = conta.dichiarato - 1;
  const campo = dialogo()?.querySelector('.dlg-qty');
  if (!vero(!!campo, 'la conta offre un campo dove scrivere il numero')) return;
  campo.value = String(contati);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  await premi('Conferma');
  /* IL CONTO A VIDEO: contati e delta, col segno, accanto alla riga. */
  uguale(aVideo(`#invCountInfo${conta.i}`), `· Contati: ${contati} (${contati - conta.dichiarato})`,
    'IL CONTO: a video il delta è contati − sistema, col segno');

  premiInPagina(`#invMiss${mancante.i}`);
  await respira(80);

  /* ④ SI APPLICA. Le righe non toccate fanno comparire l'avviso: si risponde
     che vanno bene così, che è quel che dice il pulsante. */
  const movPrima = (await collezione('mov_log')).length;
  premiInPagina('#mInvContent button', 'APPLICA CORREZIONI');
  await seCompare('Item non verificati', 'Considera corrette', 1500);
  /* Le rettifiche si applicano una riga per volta, ognuna con la sua
     scrittura: si aspetta l'ultima, non un tempo. */
  await finoAlDatabase(() => collezione('inventory'),
    (inv) => !inv.some((x) => x.location_code === vano && x.item_key === mancante.suo.item_key),
    'la riga mancante è uscita dalla giacenza');

  /* ⑥ A DATABASE: una riga confermata non si tocca, una contata scende del
     delta, una mancante sparisce. */
  const dopo = await collezione('inventory');
  const trova = (r) => dopo.find((x) => x.location_code === vano && x.item_key === r.suo.item_key);

  uguale(trova(conferma)?.qty, conferma.dichiarato,
    'la riga confermata resta esattamente com\'era: confermare non è scrivere');
  uguale(trova(conta)?.qty, contati,
    'la riga contata vale quel che è stato contato, non quel che diceva il sistema');
  uguale(trova(mancante), undefined,
    'la riga dichiarata mancante sparisce dalla giacenza');

  const movimenti = (await collezione('mov_log')).slice(movPrima);
  const suoi = (r) => movimenti.filter((m) => m.article_code === r.codice && m.lot_code === r.lotto);

  uguale(suoi(conferma).length, 0, 'una conferma non lascia nessun movimento nel registro');

  const movConta = suoi(conta)[0];
  if (vero(!!movConta, 'la conta diversa lascia un movimento')) {
    uguale(movConta.qty_before, conta.dichiarato, 'il movimento parte dalla quantità di sistema');
    uguale(movConta.qty_after, contati, 'il movimento arriva alla quantità contata');
    uguale(movConta.qty_delta, contati - conta.dichiarato,
      'IL CONTO: `qty_delta` nel registro è lo stesso delta scritto a video');
    vero(String(movConta.notes || '').includes(`${contati}/${conta.dichiarato}`),
      'le note del movimento riportano contati su sistema');
    uguale(movConta.location_code, vano, 'il movimento porta il vano contato');
  }

  const movMancante = suoi(mancante)[0];
  if (vero(!!movMancante, 'la riga mancante lascia un movimento')) {
    uguale(movMancante.qty_before, mancante.dichiarato, 'il mancante parte da tutto quel che c\'era');
    uguale(movMancante.qty_after, 0, 'dopo un mancante totale non resta niente');
    uguale(movMancante.qty_delta, -mancante.dichiarato, 'il mancante scende di tutto, col segno');
    vero(/[Mm]ancante/.test(String(movMancante.notes || '')),
      'le note dicono che si tratta di un mancante a inventario');
  }

  App.cancelMov();
});

/* ── IL CAMBIO UBICAZIONE ─────────────────────────────────────────────────
   È il gesto più frequente del magazzino e il più semplice da sbagliare in
   silenzio: la merce risulta partita e non arrivata, o arrivata e non
   partita, e il vano giusto lo sa solo chi ce l'ha messa.

   Passa da `_moveItemCore`, che è lo stesso cuore di altre tre maschere:
   provarlo qui vuol dire provare anche loro sul punto che conta — che i
   colli che escono da un vano siano gli stessi che entrano nell'altro, e che
   il registro sappia dire da dove a dove. */
flusso('cambioUbicazione', 'Il cambio ubicazione: quel che parte da un vano arriva nell\'altro', async () => {
  await entra();

  const giacenza = await collezione('inventory');
  const buone = giacenza.filter((r) => (r.qty || 0) >= 1 && !r.udc_id
    && r.item_key === String(r.item_key).toUpperCase()
    && !(r.packs && r.packs.length));
  /* Serve una riga sola nel suo vano di partenza — così la partenza si
     svuota e la prova sa cosa aspettarsi — e un vano d'arrivo che quel lotto
     non ce l'abbia già. */
  const vaniOccupati = new Set();
  for (const r of giacenza) vaniOccupati.add(`${r.location_code}|${r.item_key}`);
  let riga = null, arrivo = null;
  for (const r of buone) {
    const altro = giacenza.find((x) => x.location_code !== r.location_code
      && !vaniOccupati.has(`${x.location_code}|${r.item_key}`));
    if (altro) { riga = r; arrivo = altro.location_code; break; }
  }
  if (!vero(!!riga, 'c\'è una riga da spostare e un vano dove metterla')) return;

  const partenza = riga.location_code;
  const colli = riga.qty;

  App._goOp('pick', 'cambio');
  if (!await finoA(() => !!document.getElementById('pCambioArt'), 'il trasferimento si apre')) return;
  scrivi('pCambioArt', riga.article_code);
  scrivi('pCambioLot', riga.lot_code);
  App._cambioLookup();
  await respira(200);

  /* Lo stesso lotto può stare in più vani: allora la maschera chiede da
     quale si parte, ed è giusto che lo chieda. */
  const scelte = [...document.querySelectorAll('#pCambioInfo .inv-item-row')];
  if (scelte.length) {
    const mia = scelte.find((n) => n.textContent.includes(partenza));
    if (!vero(!!mia, `la maschera offre di partire da ${partenza}`)) return;
    mia.click();
    await respira(200);
  }
  if (!await finoA(() => !document.getElementById('pCambioDestArea')?.classList.contains('hidden'),
    'la maschera chiede dove va la merce')) return;

  scrivi('pCambioDest', arrivo);
  App._execCambio();
  /* Il vano d'arrivo può non essere quello che le regole consigliano: è
     legittimo, e l'applicativo lo fa dire per iscritto. */
  await seCompare('destinazione', 'Conferma', 1200);
  await seCompare('regola', 'Conferma', 1500);
  await finoA(() => (aVideo('#pCambioFeedback') || '').includes('Coll.'),
    "la maschera scrive l'esito del trasferimento");

  const bloccante = testoDialogo();
  vero(!bloccante, `nessuna finestra resta aperta senza risposta${bloccante ? ` — «${bloccante.titolo}»` : ''}`);

  /* ① A VIDEO: la riga di esito dice quanti colli si sono mossi. */
  vero((aVideo('#pCambioFeedback') || '').includes(`${colli} Coll.`),
    `l'esito a video dice quanti colli si sono mossi (${colli})`);

  /* ② A DATABASE: partita e arrivata, senza colli persi per strada. */
  const dopo = await collezione('inventory');
  uguale(dopo.find((x) => x.location_code === partenza && x.item_key === riga.item_key), undefined,
    'nel vano di partenza la riga non c\'è più');
  const arrivata = dopo.find((x) => x.location_code === arrivo && x.item_key === riga.item_key);
  if (!vero(!!arrivata, `la riga si ritrova in ${arrivo}`)) return;
  uguale(arrivata.qty, colli, 'IL CONTO: i colli arrivati sono i colli partiti');
  uguale(arrivata.lot_code, riga.lot_code, 'il lotto non cambia strada facendo');
  uguale(arrivata.expiry_date || '', riga.expiry_date || '', 'la scadenza segue la merce');

  const mosse = (await collezione('mov_log'))
    .filter((m) => m.article_code === riga.article_code && m.lot_code === riga.lot_code
      && m.dest_location === arrivo);
  if (!vero(mosse.length >= 1, 'il registro sa che la merce si è mossa')) return;
  const mv = mosse[mosse.length - 1];
  uguale(mv.location_code, partenza, 'il movimento dice da dove');
  uguale(mv.dest_location, arrivo, 'il movimento dice dove');
  uguale(mv.user, App.currentOperator, 'il movimento porta la sigla di chi l\'ha fatto');

  App.cancelMov();
});

/* ── LA QUARANTENA ────────────────────────────────────────────────────────
   È IL MODELLO, e per questo va provata: tre maschere ci arrivano — la
   scheda della merce, quella dell'unità di carico, il prelievo che trova un
   collo rotto — e passano tutte e tre da `_quarantineItemCore`. La regola
   sta scritta una volta, il record lo costruisce `Store.quarantineItem`. È
   l'opposto dello smaltimento, dove il verbale si scrive a mano in due
   posti, e serve una prova che dica quando quel modello si rompe.

   Un blocco parziale muove tre cose insieme e nessuna può restare indietro:
   i colli scendono dall'ubicazione di partenza, salgono in area di non
   conformità, e il record di quarantena deve raccontare tutti e due i
   numeri — quanto è stato bloccato e quanto è rimasto conforme. È il conto
   che finisce sul cartellino appeso al bancale. */
flusso('quarantena', 'La quarantena: quel che si blocca e quel che resta conforme', async () => {
  await entra();

  const giacenza = await collezione('inventory');
  const bloccate = new Set((await collezione('quarantine'))
    .filter((q) => q.status !== 'released').map((q) => q.item_key));
  /* L'AREA DI NON CONFORMITA' SI CERCA NEL SITO, non nel magazzino: lo dice
     `findNearestBlockedLocation`, che parte dal primo pezzo del codice e non
     esce dal sito. Una riga di un sito che non ha un vano bloccato non si
     puo' mettere in quarantena — l'applicativo lo dice con una finestra — e
     provarci qui vorrebbe dire chiamare difetto una configurazione. */
  const siti = new Set((await collezione('loc_status'))
    .filter((l) => l.status === 'blocked')
    .map((l) => String(l.location_code || l.code || '').split('-')[0])
    .filter(Boolean));
  vero(siti.size > 0, `i siti con un'area di non conformita' sono ${[...siti].join(', ') || 'nessuno'}`);
  const riga = giacenza.find((r) => (r.qty || 0) >= 3 && !(r.packs && r.packs.length)
    && r.item_key === String(r.item_key).toUpperCase()
    && !r.udc_id && !bloccate.has(r.item_key)
    && siti.has(String(r.location_code).split('-')[0]));
  if (!vero(!!riga, "c’è una riga bloccabile in un sito che ha un’area di non conformità")) return;

  const partenza = riga.location_code;
  const fisici = riga.qty;
  const bloccati = 2;
  const conformi = fisici - bloccati;

  App._goOp('quarantine');
  if (!await finoA(() => !!document.getElementById('qArt'), 'la quarantena si apre sulla ricerca')) return;
  scrivi('qArt', riga.article_code);
  scrivi('qLot', riga.lot_code);
  App._searchQuar();
  await respira(200);

  const trovata = [...document.querySelectorAll('#qResults .inv-item-row')]
    .find((n) => n.textContent.includes(partenza));
  if (!vero(!!trovata, `la ricerca trova la riga in ${partenza}`)) return;
  premiInPagina('button', 'Vai e verifica', trovata);
  if (!await finoA(() => !!document.getElementById('qvLoc'), 'la verifica a scaffale si apre')) return;

  /* ① LA SCHEDA DICE DOVE VA A FINIRE. Una quarantena che non nomina l'area
     di non conformità manda l'operatore a indovinare. */
  const scheda = document.querySelector('#movFormArea')?.textContent.replace(/\s+/g, ' ') || '';
  vero(scheda.includes(partenza), 'la scheda nomina l’ubicazione di partenza');

  scrivi('qvLoc', partenza); App._normScan('qvLoc'); App._qCheckLoc();
  scrivi('qvArt', riga.article_code); App._qCheckArt();
  scrivi('qvLot', riga.lot_code); App._qCheckLot();
  await respira(150);
  const scan = App._qState?.scan || {};
  uguale([scan.loc, scan.art, scan.lot], [partenza, riga.article_code, riga.lot_code],
    'le tre scansioni a scaffale sono accettate');

  const areaNC = App._qState?.nearestBlocked?.code;
  if (!vero(!!areaNC, `a sistema esiste un’area di non conformità: ${areaNC}`)) return;

  scrivi('qQty', bloccati);
  scrivi('qReason', 'Banco a video: sospetto danno da umidità sul bancale');
  scrivi('qOperator', App.currentOperator);
  scrivi('qRefDept', 'Controllo Qualità');

  const quarPrima = new Set((await collezione('quarantine')).map((q) => q.q_id));
  /* Quanti movimenti c'erano PRIMA. Senza questo numero, cercare «il
     movimento di blocco» per articolo e lotto ne ritrova uno vecchio: lo
     stesso lotto puo' essere gia' stato bloccato mesi fa, e la prova finisce
     a controllare i numeri di quel giorno la'. */
  const movPrima = (await collezione('mov_log')).length;
  App._execQuarantena();
  await respira(1200);
  await chiudiQualunqueFinestra();

  /* ② A DATABASE: la partenza si accorcia, l’area NC si riempie, e i due
     numeri sono lo stesso numero visto da due parti. */
  const dopo = await collezione('inventory');
  const restata = dopo.find((x) => x.location_code === partenza && x.item_key === riga.item_key);
  uguale(restata?.qty, conformi,
    'IL CONTO: in partenza restano i colli conformi, cioè fisici − bloccati');
  const inNC = dopo.find((x) => x.location_code === areaNC && x.item_key === riga.item_key);
  if (!vero(!!inNC, `la merce bloccata si ritrova in ${areaNC}`)) return;
  uguale(inNC.qty, bloccati, 'IL CONTO: in area NC ci sono i colli bloccati, né uno di più né uno di meno');
  uguale(restata.qty + inNC.qty, fisici, 'IL CONTO: nessun collo si perde per strada');
  vero(String(inNC.notes || '').startsWith('QUARANTENA:'),
    'la riga in area NC dice, nelle note, che è merce bloccata');

  /* ③ IL RECORD DI QUARANTENA — quello che finisce sul cartellino. */
  /* Il record arriva DOPO lo spostamento della merce: leggerlo subito vuol
     dire leggerlo prima che sia stato scritto, e accusare la quarantena di
     non averlo scritto affatto. */
  let nuove = [];
  for (let i = 0; i < 30; i++) {
    nuove = (await collezione('quarantine')).filter((q) => !quarPrima.has(q.q_id));
    if (nuove.length) break;
    await respira(200);
  }
  uguale(nuove.length, 1, 'il blocco lascia un record di quarantena, e uno solo');
  const q = nuove[0] || {};
  uguale(q.article_code, riga.article_code, 'il record porta l’articolo');
  uguale(q.lot_code, riga.lot_code, 'il record porta il lotto');
  uguale(q.original_location, partenza, 'il record dice da dove veniva');
  uguale(q.blocked_location, areaNC, 'il record dice dov’è finita');
  uguale(q.qty, bloccati, 'il record dice quanti colli sono bloccati');
  uguale(q.qty_at_origin_before, fisici, 'il record ricorda quanti ce n’erano prima');
  uguale(q.qty_left_at_origin, conformi, 'il record dice quanti ne restano conformi');
  uguale(q.partial, true, 'un blocco parziale si dichiara parziale');
  uguale(q.operator, App.currentOperator, 'il record porta la sigla di chi ha bloccato');
  uguale(q.reference_dept, 'Controllo Qualità', 'il record porta il reparto che ha chiesto il blocco');

  /* ④ E IL REGISTRO. Due movimenti: la merce si sposta, e il lotto si
     blocca. */
  /* I due movimenti — la merce che si sposta e il lotto che si blocca —
     arrivano dopo il record, e non nello stesso istante: si aspettano. */
  let movimenti = [];
  for (let i = 0; i < 30; i++) {
    movimenti = (await collezione('mov_log')).slice(movPrima)
      .filter((m) => m.article_code === riga.article_code && m.lot_code === riga.lot_code
        && m.dest_location === areaNC);
    if (movimenti.some((m) => String(m.notes || '').includes('parziale'))) break;
    await respira(200);
  }
  vero(movimenti.length >= 1, 'il registro sa che la merce è andata in area NC');
  const quar = movimenti.find((m) => String(m.notes || '').includes('parziale'));
  if (vero(!!quar, 'il registro dice che il blocco era parziale')) {
    uguale(quar.qty_before, fisici, 'il movimento di blocco parte da tutti i colli');
    uguale(quar.qty_after, conformi, 'il movimento di blocco lascia i colli conformi');
    uguale(quar.qty_delta, -bloccati, 'il movimento di blocco scende dei colli bloccati, col segno');
  }

  App.cancelMov();
});

/* ── IL POSIZIONAMENTO ────────────────────────────────────────────────────
   L'unica porta da cui la merce ENTRA in giacenza a mano, e quella che gli
   altri flussi danno per buona: se `addItem` sbaglia il saldo, sbagliano
   anche l'inventario che rettifica in più e la quarantena che rimette la
   merce a scaffale, e nessuno dei due se ne accorge.

   Si posiziona due volte lo stesso articolo e lotto nello stesso vano: la
   prima volta la riga nasce, la seconda si INCREMENTA — sono due strade
   diverse dentro `addItem`, e l'esito a video le distingue con una parola
   («INCREMENTATO») che nessuna prova via `fetch` può leggere. */
flusso('posiziona', 'Il posizionamento: la riga nasce, poi si incrementa', async () => {
  await entra();

  /* Un articolo che l'anagrafica conosce già — senza, la maschera chiede la
     descrizione, ed è giusto che la chieda — e un lotto che non esiste, così
     la riga nasce davvero invece di sommarsi a una che c'era. */
  const giacenza = await collezione('inventory');
  const lotto = 'BANCO' + String(Date.now()).slice(-6);
  const primi = 3;
  const secondi = 2;

  App._goOp('io', 'in');
  if (!await finoA(() => !!document.getElementById('mInLoc'), 'il posizionamento si apre')) return;

  /* L'ARTICOLO SI SCEGLIE GUARDANDO LA MASCHERA. Dove la misura e'
     dichiarata, il posizionamento chiede com'e' fatto ogni collo — ed e'
     giusto, perche' un collo senza misura e' una giacenza in chili che non
     si sa a cosa corrisponda. E' un flusso suo; qui si prova il saldo, e
     serve un articolo che quella domanda non la faccia. */
  let modello = null;
  const visti = new Set();
  for (const r of giacenza) {
    if (!r.article_code || !r.location_code) continue;
    if (r.item_key !== String(r.item_key).toUpperCase()) continue;
    /* Un articolo per volta, e non piu' di venti: la domanda sulla misura la
       fa l'articolo, non la riga, e provare lo stesso codice dodici volte
       allunga la corsa senza guardare niente di nuovo. */
    if (visti.has(r.article_code)) continue;
    visti.add(r.article_code);
    if (visti.size > 20) break;
    scrivi('mInArtCode', r.article_code);
    scrivi('mInLot', lotto);
    await respira(120);
    if (!document.getElementById('mInColliBox')?.hidden) continue;
    modello = r; break;
  }
  if (!vero(!!modello, 'c’è un articolo che non chiede la suddivisione dei colli')) return;
  const vano = modello.location_code;
  const articolo = modello.article_code;

  /* ① LA RIGA CHE NASCE. */
  scrivi('mInLoc', vano);
  scrivi('mInArtCode', articolo);
  scrivi('mInLot', lotto);
  scrivi('mInQty', primi);
  const movPrima = (await collezione('mov_log')).length;
  App._execPosiziona();
  await seCompare('Scansione ripetuta', 'Sì, sono colli diversi', 2500);
  await finoA(() => (aVideo('#mInFeedback') || '').includes('Coll.'),
    "la maschera scrive l’esito del posizionamento");

  const esito1 = aVideo('#mInFeedback') || '';
  vero(esito1.includes(`+${primi} Coll.`), `l’esito a video dice quanti colli sono entrati (+${primi})`);
  vero(esito1.includes(vano), 'l’esito a video dice in quale vano');
  vero(!/INCREMENTATO/.test(esito1), 'una riga che nasce non si annuncia come incrementata');

  const nata = (await collezione('inventory'))
    .find((x) => x.location_code === vano && x.lot_code === lotto);
  if (!vero(!!nata, 'la riga nuova è a database')) return;
  uguale(nata.qty, primi, 'la riga nasce con i colli dichiarati');
  uguale(nata.article_code, articolo, 'la riga nasce con l’articolo giusto');
  vero(!!nata.article_description, 'la descrizione arriva dall’anagrafica, non resta vuota');

  /* ② LA RIGA CHE SI INCREMENTA. Stesso articolo, stesso lotto, stesso
     vano: il saldo si somma e l’esito lo dice. */
  scrivi('mInArtCode', articolo);
  scrivi('mInLot', lotto);
  scrivi('mInQty', secondi);
  App._execPosiziona();
  /* La guardia contro la doppia scansione salta fuori apposta: la stessa
     riga in pochi secondi è quasi sempre un lettore che ha letto due volte,
     e qui invece sono colli diversi. */
  await seCompare('Scansione ripetuta', 'Sì, sono colli diversi', 4000);
  await finoA(() => (aVideo('#mInFeedback') || '').includes('INCREMENTATO'),
    "la maschera scrive l’esito del secondo posizionamento");

  const esito2 = aVideo('#mInFeedback') || '';
  vero(esito2.includes('INCREMENTATO'), 'un incremento si annuncia come incremento');
  vero(esito2.includes(`saldo: ${primi + secondi}`),
    `IL CONTO: l’esito a video dice il saldo sommato (${primi + secondi})`);

  const cresciuta = (await collezione('inventory'))
    .find((x) => x.location_code === vano && x.lot_code === lotto);
  uguale(cresciuta?.qty, primi + secondi,
    'IL CONTO: a database il saldo è la somma dei due posizionamenti');

  /* ③ IL REGISTRO: due entrate, non una sola col totale. */
  const entrate = (await collezione('mov_log')).slice(movPrima)
    .filter((m) => m.lot_code === lotto && m.location_code === vano);
  uguale(entrate.length, 2, 'ogni posizionamento lascia il suo movimento');
  uguale(entrate[0].qty_before, 0, 'la prima entrata parte da zero');
  uguale(entrate[0].qty_after, primi, 'la prima entrata arriva ai colli dichiarati');
  uguale(entrate[1].qty_before, primi, 'la seconda entrata parte da dov’era rimasta la prima');
  uguale(entrate[1].qty_after, primi + secondi, 'la seconda entrata arriva al saldo sommato');
  uguale(entrate.map((m) => m.qty_delta), [primi, secondi],
    'ogni movimento porta il proprio incremento, non il totale');

  App.cancelMov();
});

/* ── L'IMPAGINAZIONE DEI DOCUMENTI ────────────────────────────────────────
   SETTE FOGLI ESCONO DA QUESTO APPLICATIVO e nessuno li aveva mai misurati.
   Un documento si guarda in anteprima una volta, il giorno che lo si
   scrive, e poi non lo guarda più nessuno: cambia un carattere, si allunga
   una descrizione, e sei mesi dopo il numero del lotto finisce sopra la
   firma del responsabile. In una verifica GMP quel foglio è il documento,
   non l'applicativo.

   COME SI MISURA UN FOGLIO SENZA STAMPARLO. Le regole della carta stanno in
   `@media print`, e un browser non le applica finché non stampa davvero:
   qui si prendono da `document.styleSheets` — dove il browser le ha già
   lette e capite — e si rimettono come regole normali. Non è una copia
   scritta a mano che può divergere: è la stessa regola, senza la condizione
   davanti.

   Poi il foglio si porta alla larghezza vera della carta (A4, 210mm) e si
   guardano due cose sole, che sono le due che rovinano un documento:

     · TESTO SOPRA TESTO — due elementi che portano testo e occupano lo
       stesso rettangolo. Le filigrane e i timbri sono esclusi: si
       sovrappongono apposta, ed è il loro mestiere.
     · TESTO FUORI DAL FOGLIO — qualcosa che sborda dal margine destro, e in
       stampa viene tagliato via senza che nessuno se ne accorga.

   Non si stampa niente: `window.print` viene messo da parte per la durata
   della prova e rimesso dov'era. */

/** Le regole della carta, prese dove il browser le tiene già pronte. */
function regolePerLaCarta() {
  const fuori = [];
  /* SI SCENDE DENTRO GLI INVOLUCRI, e non e' un dettaglio: in questo
     applicativo le regole stanno in `@layer app { ... }`, e un giro che
     guarda solo il primo livello di ogni foglio non trova nemmeno una
     regola di stampa. La prima corsa e' andata cosi': misurava i documenti
     con le regole dello schermo, e chiamava sovrapposizione l'impaginazione
     di un piede che a stampa sta su una riga sola.

     Rimesse FUORI da ogni livello, queste regole vincono su quelle dentro
     `@layer`: e' la cascata, ed e' lo stesso rapporto che hanno in stampa. */
  const scendi = (regole) => {
    for (const r of regole) {
      const tipo = r.constructor?.name;
      if (tipo === 'CSSMediaRule') {
        if (/print/.test(r.conditionText || '')) for (const d of r.cssRules) fuori.push(d.cssText);
        continue;
      }
      if (r.cssRules && (tipo === 'CSSLayerBlockRule' || tipo === 'CSSSupportsRule'
          || tipo === 'CSSContainerRule' || tipo === 'CSSScopeRule')) {
        scendi(r.cssRules);
      }
    }
  };
  for (const foglio of document.styleSheets) {
    let regole;
    try { regole = foglio.cssRules; } catch { continue; }   // foglio di un'altra origine
    scendi(regole);
  }
  return fuori.join('\n');
}

/** Il primo pezzo di testo di un elemento: serve a NOMINARE il guaio, non a
    misurarlo — un verbale che dice «qualcosa si sovrappone» non si corregge. */
function primoTesto(el) {
  const t = [...el.childNodes].filter((n) => n.nodeType === 3)
    .map((n) => n.textContent.replace(/\s+/g, ' ').trim()).join(' ').trim();
  return t.length > 42 ? t.slice(0, 42) + '…' : t;
}

/** Vero se l'elemento, o uno dei suoi genitori dentro il foglio, è messo
    fuori dal flusso: filigrane, timbri, bolli. Si sovrappongono apposta. */
function fuoriDalFlusso(el, foglio) {
  for (let n = el; n && n !== foglio; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === 'absolute' || p === 'fixed') return true;
  }
  return false;
}

export function misuraFoglio(nome, html) {
  const foglio = document.getElementById('printReport');
  foglio.innerHTML = html;

  const stile = document.createElement('style');
  stile.id = 'bancoCarta';
  /* La larghezza è quella della carta, non quella del monitor: un foglio
     misurato su uno schermo largo non sborda mai, e su A4 sì. */
  stile.textContent = regolePerLaCarta()
    + '\n#printReport{display:block!important;width:210mm;box-sizing:border-box;}';
  document.head.appendChild(stile);

  const portanoTesto = [...foglio.querySelectorAll('*')].filter((el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (!primoTesto(el)) return false;
    return !fuoriDalFlusso(el, foglio);
  });

  const sovrapposti = [];
  for (let i = 0; i < portanoTesto.length; i++) {
    for (let j = i + 1; j < portanoTesto.length; j++) {
      const a = portanoTesto[i], b = portanoTesto[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      if (!ra.width || !ra.height || !rb.width || !rb.height) continue;
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      /* Due punti di tolleranza: gli arrotondamenti del motore di
         impaginazione fanno toccare i bordi senza che si legga niente
         sopra niente. */
      if (x > 2 && y > 2) sovrapposti.push(`«${primoTesto(a)}» sopra «${primoTesto(b)}»`);
    }
  }

  const dentro = foglio.getBoundingClientRect();
  const imbottitura = parseFloat(getComputedStyle(foglio).paddingRight) || 0;
  const limite = dentro.right - imbottitura;
  const sbordati = portanoTesto
    .filter((el) => el.getBoundingClientRect().right > limite + 1)
    .map((el) => `«${primoTesto(el)}» sborda di ${Math.round(el.getBoundingClientRect().right - limite)}px`);

  stile.remove();
  foglio.innerHTML = '';
  return { nome, elementi: portanoTesto.length, sovrapposti, sbordati };
}

flusso('impaginazione', 'L\'impaginazione dei documenti: niente testo sopra altro testo', async () => {
  await entra();

  const foglio = document.getElementById('printReport');
  if (!vero(!!foglio, 'in pagina c’è il contenitore dei documenti da stampare')) return;

  /* Si mette da parte la stampa vera: la prova guarda il foglio, non lo
     manda alla stampante. */
  const stampaVera = window.print;
  const presi = [];
  window.print = () => { presi.push(foglio.innerHTML); };

  const prova = async (nome, apri) => {
    presi.length = 0;
    try { await apri(); } catch (e) { /* il documento dirà di sé sotto */ }
    await respira(250);
    if (!presi.length) return { nome, saltato: true };
    return misuraFoglio(nome, presi[presi.length - 1]);
  };

  const smaltimenti = await collezione('disposal_archive');
  const quarantene = await collezione('quarantine');
  const pendenti = await collezione('pending_outbound');
  const prelievi = await collezione('pick_archive');
  const registro = await collezione('mov_log');
  const lavorazioni = await collezione('wip');

  const spedizione = pendenti.find((d) => d.kind === 'SHIP');
  const campione = registro.find((m) => /CAMPIONE per /.test(String(m.notes || '')));

  const fogli = [];
  if (smaltimenti.length) fogli.push(await prova('Verbale di smaltimento',
    () => App._printDisposal(smaltimenti[smaltimenti.length - 1].doc_id)));
  if (quarantene.length) fogli.push(await prova('Cartellino di non conformità',
    () => App._printNCCard(quarantene[quarantene.length - 1].q_id)));
  if (spedizione) {
    fogli.push(await prova('DDT', () => App._printDDT(spedizione.doc_id)));
    fogli.push(await prova('Packing list', () => App._printPackingList(spedizione.doc_id)));
  }
  if (prelievi.length) fogli.push(await prova('Rapporto di prelievo',
    () => App._printPickArchive(prelievi[prelievi.length - 1].doc_id)));
  if (campione) fogli.push(await prova('Verbale di campionamento',
    () => App._ristampaVerbaleCampione(campione._id)));
  if (lavorazioni.length) fogli.push(await prova('Rendiconto di consumo',
    () => App._wipStampaRendiconto(lavorazioni[0].odp_num)));

  window.print = stampaVera;
  foglio.innerHTML = '';

  /* ① QUANTI FOGLI SI SONO RIUSCITI A GUARDARE. Se un documento smette di
     uscire, questa riga lo dice: un foglio non misurato non è un foglio
     senza difetti. */
  const misurati = fogli.filter((f) => !f.saltato);
  const saltati = fogli.filter((f) => f.saltato).map((f) => f.nome);
  vero(misurati.length > 0, `si sono misurati ${misurati.length} documenti su ${fogli.length}`);
  uguale(saltati, [], 'ogni documento che la prova chiede si lascia stampare');

  /* ② IL CONTROLLO. Un foglio per riga, col suo nome: un verbale che dice
     «tre sovrapposizioni» manda a cercare in sette documenti. */
  for (const f of misurati) {
    vero(f.elementi > 0, `${f.nome}: il foglio ha del testo dentro (${f.elementi} elementi)`);
    uguale(f.sovrapposti, [], `${f.nome}: niente testo sopra altro testo`);
    uguale(f.sbordati, [], `${f.nome}: niente testo fuori dal margine del foglio`);
  }
});

/* ── I CONTI DEI DOCUMENTI ────────────────────────────────────────────────
   UN DOCUMENTO DI TRASPORTO ESCE DAL MAGAZZINO E NON TORNA. Chi lo riceve
   controlla in banchina quello che c'è scritto, e se il numero è sbagliato
   la contestazione arriva settimane dopo, quando la merce è già stata usata.
   Nessuna delle prove via `fetch` guarda quei numeri: guardano quel che il
   magazzino calcola, non quel che finisce sulla carta.

   QUATTRO CONTI, e il banco li rifà per conto suo — sommando le righe del
   documento riletto dal servizio — invece di confrontare il totale con sé
   stesso:

     · NUMERO COLLI     — la somma dei colli di tutte le righe
     · QUANTITÀ TOTALE  — una somma PER UNITÀ DI MISURA, mai una sola cifra
                          per unità diverse
     · LE PARTITE       — dieci bancali dello stesso lotto fanno una riga
                          sola in bolla, e i colli di quella riga sono la
                          somma dei bancali
     · IL PESO LORDO    — netto più tare, e SOLO se tutto è in chili e
                          qualche bancale porta una tara. Un lordo inventato
                          su un'etichetta di trasporto è un numero che
                          qualcuno mette in bolla.

   LA REGOLA CHE SI CONTROLLA PIÙ VOLENTIERI È QUELLA DELL'ASSENZA. Un
   totale che non si può fare deve restare VUOTO, non zero: zero è una
   quantità, e su un documento fiscale dice una cosa falsa. */

/** Le celle del blocco totali di un documento stampato, lette come le legge
    chi ha il foglio in mano: etichetta e valore. */
export function celleDocumento(dentro = document.getElementById('printReport')) {
  const fuori = {};
  for (const c of dentro.querySelectorAll('.doc-cell')) {
    const etichetta = c.querySelector('.doc-cell-lbl')?.textContent.trim();
    const valore = c.querySelector('.doc-cell-val, .ddt-notes-val')?.textContent.trim();
    if (etichetta) fuori[etichetta] = valore ?? '';
  }
  return fuori;
}

flusso('contiDeiDocumenti', 'I conti dei documenti: quel che è stampato è la somma delle righe', async () => {
  await entra();

  const documenti = await collezione('pending_outbound');
  const ddt = documenti.filter((d) => d.kind === 'SHIP' && Array.isArray(d.lines) && d.lines.length);
  if (!vero(ddt.length > 0, `ci sono ${ddt.length} documenti di trasporto da controllare`)) return;

  const foglio = document.getElementById('printReport');
  const stampaVera = window.print;
  let preso = '';
  window.print = () => { preso = foglio.innerHTML; };

  /* Si controllano TUTTI i documenti che il magazzino ha, non uno scelto
     bene: un conto sbagliato si nasconde nel documento che nessuno guarda. */
  let controllati = 0;
  for (const doc of ddt) {
    preso = '';
    App._printDDT(doc.doc_id);
    await respira(300);
    if (!vero(!!preso, `il DDT ${doc.ddt_num || doc.doc_id} si lascia stampare`)) continue;
    foglio.innerHTML = preso;
    controllati++;

    const celle = celleDocumento(foglio);

    /* ① I COLLI. */
    const colliVeri = doc.lines.reduce((n, l) => n + (l.qty || 1), 0);
    uguale(celle['Numero colli'], String(colliVeri),
      `${doc.ddt_num}: IL CONTO — i colli in bolla sono la somma delle righe (${colliVeri})`);

    /* ② LA QUANTITÀ, UNITÀ PER UNITÀ. Il banco raggruppa da capo e guarda
       che ogni unità vista sulle righe compaia nella cella, e che nessuna
       unità che non c'è compaia lo stesso. */
    const unita = new Set(doc.lines.filter((l) => l.qty_uom != null && l.uom).map((l) => l.uom));
    const cella = celle['Quantità totale'] ?? '';
    for (const u of unita) {
      vero(cella.includes(u), `${doc.ddt_num}: la quantità totale nomina i ${u}`);
    }
    if (unita.size > 1) {
      /* NON SI SOMMA FRA UNITÀ DIVERSE: la cella deve portarne una per
         ognuna, separate, non un numero solo. */
      uguale(cella.split('·').length, unita.size,
        `${doc.ddt_num}: con ${unita.size} unità diverse la cella ne porta ${unita.size}, separate`);
    }
    if (!unita.size) {
      uguale(cella, '—',
        `${doc.ddt_num}: senza unità dichiarate la quantità resta vuota, non zero`);
    }

    /* ③ LE PARTITE. Righe della bolla contro righe del documento,
       raggruppate a mano dal banco. */
    const perPartita = new Map();
    for (const l of doc.lines) {
      const k = `${l.article_code}#${l.lot_code}`;
      perPartita.set(k, (perPartita.get(k) || 0) + (l.qty || 1));
    }
    const righeStampate = [...foglio.querySelectorAll('.ddt-table tbody tr')]
      .filter((r) => r.querySelector('.c-art'));
    uguale(righeStampate.length, perPartita.size,
      `${doc.ddt_num}: in bolla c'è una riga per partita (${perPartita.size}), non una per bancale`);

    let colliInBolla = 0;
    for (const r of righeStampate) {
      const art = r.querySelector('.c-art')?.textContent.trim();
      const lot = r.querySelector('.c-lot')?.textContent.trim();
      const q = numeroIn(r.querySelector('.c-qty')?.textContent);
      colliInBolla += q || 0;
      const atteso = perPartita.get(`${art}#${lot}`);
      uguale(q, atteso, `${doc.ddt_num}: ${art}#${lot} — i colli della partita`);
    }
    uguale(colliInBolla, colliVeri,
      `${doc.ddt_num}: IL CONTO — le righe stampate sommano al totale stampato`);

    foglio.innerHTML = '';
  }
  vero(controllati > 0, `si sono controllati ${controllati} documenti di trasporto`);

  /* ④ IL PESO LORDO, sulla packing list. La regola è di ASSENZA: senza
     tare, o con unità che non sono chili, il lordo non si scrive. */
  const conBancali = ddt.find((d) => d.lines.some((l) => l.pallet_id || l.bancale));
  const perLordo = conBancali || ddt[0];
  preso = '';
  App._printPackingList(perLordo.doc_id);
  await respira(300);
  if (vero(!!preso, 'la packing list si lascia stampare')) {
    foglio.innerHTML = preso;
    const celle = celleDocumento(foglio);
    const tutteKg = perLordo.lines.every((l) => l.uom === 'KG' && l.qty_uom != null);
    const lordo = celle['Peso lordo (kg)'] ?? celle['Peso lordo'] ?? '';
    if (!tutteKg) {
      uguale(lordo === '' || lordo === '—', true,
        'senza tutte le righe in chili il peso lordo resta vuoto: un lordo inventato finisce in bolla');
    } else {
      vero(true, 'il documento è tutto in chili: il lordo può esserci');
    }
    foglio.innerHTML = '';
  }

  window.print = stampaVera;
  foglio.innerHTML = '';
});

/* ── LA CATENA DEL PRODOTTO FINITO ────────────────────────────────────────
   TRE MASCHERE CHE NON SI PROVANO DA SOLE, e non perché siano difficili: non
   si aprono finché il magazzino non è configurato. Il prodotto finito vuole
   una zona marcata «prodotto finito», il carico delle spedizioni vuole una
   baia, e il carico vuole per giunta un DDT con sopra dei bancali — che
   nasce solo dopo che qualcuno il bancale l'ha chiuso.

   Sono i tre anelli di un viaggio solo: si dichiara un bancale, gli si
   scrive un documento, lo si carica sul camion. Il banco li fa in fila,
   perché ognuno costruisce quel che serve al successivo — ed è lo stesso
   ordine in cui li fa il magazzino.

   LE ZONE SI CREANO NUOVE, non si riusa quel che c'è. Marcare «baia di
   carico» la zona degli arrivi farebbe passare la prova e lascerebbe il
   magazzino di prova con una bugia dentro: la prossima persona che lo
   guarda ci crede. */

/** Aspetta che una lettura dal servizio dica quel che deve dire: una
    scrittura non ha un tempo fisso e il banco non deve indovinarlo. */
export async function finoAlDatabase(leggi, prova, cosa, tentativi = 30) {
  let ultimo = null;
  for (let i = 0; i < tentativi; i++) {
    ultimo = await leggi();
    if (prova(ultimo)) return ultimo;
    await respira(200);
  }
  segna(false, `attesa scaduta a database: ${cosa}`, 'entro qualche secondo', 'mai');
  return ultimo;
}

flusso('configZone', 'Le zone: una di prodotto finito e una baia di carico, create e marcate', async () => {
  await entra();

  const siti = await collezione('sites');
  const sito = siti.find((s) => s.active !== false) || siti[0];
  if (!vero(!!sito, 'c’è un sito su cui lavorare')) return;

  App.switchView('config');
  App._configTab = 'sites';
  App.renderConfig();
  if (!await finoA(() => !!document.querySelector('button[onclick*="showAddZoneModal"]'),
    'la scheda «Siti e Zone» si apre')) return;

  const daFare = [
    { id: 'PFB', nome: 'Bancali finiti — banco', casella: 'ezPfZone', che: 'prodotto finito' },
    { id: 'DOK', nome: 'Baia di carico — banco', casella: 'ezDockZone', che: 'baia di carico' },
  ];

  for (const z of daFare) {
    const gia = (await collezione('zones')).some((x) => x.site_id === sito.id && x.id === z.id);
    if (!gia) {
      /* ① SI CREA. Venti posizioni: in baia ne serve una per bancale, e due
         pallet dello stesso lotto non stanno nello stesso vano. */
      premiInPagina(`button[onclick*="showAddZoneModal('${sito.id}')"]`);
      if (!await finoA(() => !!document.getElementById('newZoneId'),
        `la maschera della nuova zona ${z.id} si apre`)) return;
      scrivi('newZoneId', z.id);
      scrivi('newZoneName', z.nome);
      const tipo = document.getElementById('newZoneType');
      tipo.value = 'BULK';
      tipo.dispatchEvent(new Event('change', { bubbles: true }));
      await respira(150);
      scrivi('zfPositions', 20);
      premiInPagina('#modalOverlay button', 'Crea Zona');
      await respira(500);
    }

    const nata = await finoAlDatabase(() => collezione('zones'),
      (zone) => zone.some((x) => x.site_id === sito.id && x.id === z.id),
      `la zona ${z.id} esiste in ${sito.id}`);
    const riga = nata.find((x) => x.site_id === sito.id && x.id === z.id);
    if (!vero(!!riga, `la zona ${sito.id}/${z.id} è a database`)) return;
    uguale(riga.type, 'BULK', `${z.id}: è un'area libera`);
    uguale(riga.positions, 20, `${z.id}: ha venti posizioni, una per bancale`);

    /* ② SI MARCA. La spunta è quella della maschera, non un campo scritto
       a mano: è lì che qualcuno la troverà per cambiarla. */
    App.showEditZoneModal(sito.id, z.id);
    if (!await finoA(() => !!document.getElementById(z.casella),
      `la maschera della zona ${z.id} porta la spunta «${z.che}»`)) return;
    const casella = document.getElementById(z.casella);
    if (!casella.checked) { casella.checked = true; casella.dispatchEvent(new Event('change', { bubbles: true })); }
    premiInPagina('#modalOverlay button', 'Salva');
    await respira(500);

    const marcate = await finoAlDatabase(() => collezione('zones'),
      (zone) => zone.some((x) => x.site_id === sito.id && x.id === z.id
        && x[z.casella === 'ezPfZone' ? 'pf_zone' : 'dock_zone'] === true),
      `la zona ${z.id} risulta marcata «${z.che}»`);
    const dopo = marcate.find((x) => x.site_id === sito.id && x.id === z.id);
    uguale(dopo?.[z.casella === 'ezPfZone' ? 'pf_zone' : 'dock_zone'], true,
      `${sito.id}/${z.id} è dichiarata ${z.che}`);
  }

  /* ③ E LE MASCHERE SE NE ACCORGONO: è la ragione per cui si marcano. */
  App._goOp('pf');
  await finoA(() => (document.getElementById('movFormArea')?.textContent || '').length > 0,
    'la maschera del prodotto finito si apre');
  vero(!/Nessuna zona .{0,40}prodotto finito/i.test(document.getElementById('movFormArea')?.textContent || ''),
    'il prodotto finito non si lamenta più della zona mancante');

  App.cancelMov();
  App._goOp('shipping', 'carico');
  await finoA(() => (document.getElementById('movFormArea')?.textContent || '').length > 0,
    'il carico delle spedizioni si apre');
  vero(!!document.getElementById('carBaia'),
    'il carico delle spedizioni adesso propone una baia');
  App.cancelMov();
});

/* ── IL PRODOTTO FINITO ───────────────────────────────────────────────────
   Il bancale nasce qui, e nasce con un'identità: un codice che non si riusa,
   un'etichetta che gli resta incollata, e delle righe di giacenza che da
   quel momento viaggiano insieme. È l'unico punto in cui la merce entra in
   magazzino senza venire da fuori — la produzione la fa, e il magazzino la
   trova già sua.

   Il conto da guardare è che i colli dichiarati siano i colli scritti: fra
   la dichiarazione e la giacenza ci sono un modello di carico, una
   creazione di unità e un posizionamento, e ognuno dei tre può perdere per
   strada quel che il reparto ha contato. */
flusso('prodottoFinito', 'Il prodotto finito: il bancale nasce, si etichetta e si posa', async () => {
  await entra();

  const zonaPf = (await collezione('zones')).find((z) => z.pf_zone === true);
  if (!vero(!!zonaPf, 'c’è una zona di prodotto finito: senza, questo flusso non esiste')) return;

  const giacenza = await collezione('inventory');
  const lotto = 'PF' + String(Date.now()).slice(-6);
  const colli = 4;

  App._goOp('pf');
  /* La maschera si apre sull'ELENCO dei bancali pronti, non sulla
     dichiarazione: chi imballa passa di li' venti volte al giorno per
     guardare cosa c'e', e dichiara un bancale nuovo ogni tanto. */
  if (!await finoA(() => !!document.getElementById('pfElencoTabella'),
    "l'elenco dei bancali di prodotto finito si apre")) return;
  premiInPagina('#movFormArea button', 'Nuovo bancale');
  if (!await finoA(() => !!document.getElementById('pfArt'), 'la dichiarazione del bancale si apre')) return;

  /* ① UN ARTICOLO CHE NON CHIEDE COM'È FATTO OGNI COLLO: la dichiarazione
     per misura è un flusso suo, e qui si guarda il saldo. */
  let articolo = null;
  const visti = new Set();
  for (const r of giacenza) {
    if (!r.article_code || visti.has(r.article_code)) continue;
    visti.add(r.article_code);
    if (visti.size > 20) break;
    scrivi('pfArt', r.article_code);
    scrivi('pfLot', lotto);
    App._pfArticoloLetto();
    await respira(120);
    if (document.getElementById('pfColliSoloBox')?.hidden) continue;
    articolo = r.article_code; break;
  }
  if (!vero(!!articolo, 'c’è un articolo che si dichiara a colli e basta')) return;

  scrivi('pfColliSolo', colli);
  premiInPagina('#movFormArea button', 'Aggiungi partita');
  await respira(400);

  /* ② LA PARTITA COMPARE IN TAVOLA, coi colli che sono stati dichiarati. */
  const inTavola = [...document.querySelectorAll('#movFormArea .sx-table tbody tr')]
    .find((r) => r.textContent.includes(lotto));
  if (!vero(!!inTavola, 'la partita dichiarata compare nell’elenco del bancale')) return;
  uguale(numeroIn([...inTavola.querySelectorAll('td')][4]?.textContent), colli,
    'IL CONTO: i colli in tavola sono quelli dichiarati');

  /* ③ SI CHIUDE IL BANCALE: nasce l'unità e parte l'etichetta. */
  const udcPrima = new Set((await collezione('udc')).map((u) => u.udc_id));
  premiInPagina('#movFormArea button', 'Chiudi bancale');
  await respira(900);
  await chiudiQualunqueFinestra();

  const conNuova = await finoAlDatabase(() => collezione('udc'),
    (u) => u.some((x) => !udcPrima.has(x.udc_id)), 'il bancale nuovo esiste');
  const bancale = conNuova.find((x) => !udcPrima.has(x.udc_id));
  if (!vero(!!bancale, `il bancale nuovo è ${bancale?.udc_id}`)) return;

  /* ④ SI POSA nella zona di prodotto finito. */
  if (!await finoA(() => !!document.getElementById('pfLoc'),
    'la maschera chiede dove si posa il bancale')) return;
  const vano = `${zonaPf.site_id}-${zonaPf.id}-01`;
  scrivi('pfLoc', vano);
  premiInPagina('#movFormArea button', 'POSIZIONA IL BANCALE');
  await respira(900);
  await chiudiQualunqueFinestra();

  const righe = await finoAlDatabase(() => collezione('inventory'),
    (inv) => inv.some((x) => x.udc_id === bancale.udc_id),
    'le righe del bancale sono in giacenza');
  const sue = righe.filter((x) => x.udc_id === bancale.udc_id);
  uguale(sue.length, 1, 'il bancale porta la partita dichiarata, e una sola');
  uguale(sue[0]?.lot_code, lotto, 'la riga porta il lotto dichiarato');
  uguale(sue[0]?.article_code, articolo, 'la riga porta l’articolo dichiarato');
  uguale(sue[0]?.qty, colli, 'IL CONTO: i colli in giacenza sono i colli dichiarati');
  uguale(sue[0]?.location_code, vano, 'la riga sta nel vano dove il bancale è stato posato');

  const dopo = (await collezione('udc')).find((u) => u.udc_id === bancale.udc_id);
  uguale(dopo?.location_code, vano, 'anche l’unità sa dove è stata posata');

  globalThis.__bancoBancale = { udc_id: bancale.udc_id, lotto, articolo, colli, vano };
  App.cancelMov();
});

/* ── IL CARICO DELLE SPEDIZIONI ───────────────────────────────────────────
   L'ULTIMO GESTO PRIMA CHE LA MERCE ESCA, ed è quello dove un errore non si
   recupera più: quel che sale sul camion sbagliato torna indietro fra una
   settimana, se torna.

   Il giro è a tappe — un bancale per tappa — e la scansione è l'unica
   conferma che vale: il bancale scansionato si sposta in baia, e la
   schermata deve dire quante tappe restano. Se il conto delle tappe si
   stacca da quel che è stato scansionato, chi carica chiude il camion
   convinto di avere finito. */
flusso('caricoSpedizione', 'Il carico: il bancale scansionato va in baia, e le tappe calano', async () => {
  await entra();

  const baia = (await collezione('zones')).find((z) => z.dock_zone === true);
  if (!vero(!!baia, 'c’è una baia di carico dichiarata')) return;

  const bancale = globalThis.__bancoBancale;
  if (!vero(!!bancale, 'il bancale del prodotto finito è pronto (serve il flusso prima)')) return;

  /* ① IL DOCUMENTO. Le righe si prendono DAL BANCALE, che è il solo modo di
     avere un DDT che il carico sappia caricare: un documento di righe
     sciolte non ha niente da scansionare. */
  const ddtNum = 'BANCO' + String(Date.now()).slice(-5);
  App._goOp('shipping', 'documenti');
  if (!await finoA(() => !!document.getElementById('pShipDdt'), 'la composizione del DDT si apre')) return;

  await App._shipCaricaDaBancali(bancale.udc_id);
  await respira(500);
  const carrello = document.getElementById('shipCartZone')?.textContent.replace(/\s+/g, ' ') || '';
  vero(carrello.includes(`${bancale.colli} Coll.`),
    `IL CONTO: nel carrello ci sono i colli del bancale (${bancale.colli})`);

  scrivi('pShipDdt', ddtNum);
  scrivi('pShipCustomer', 'Cliente del banco a video');
  scrivi('pShipDocDate', new Date().toLocaleDateString('it-IT'));
  App._persistShipHeader();
  await respira(200);

  const docPrima = new Set((await collezione('pending_outbound')).map((d) => d.doc_id));
  /* NON SI ASPETTA `_saveShipPending`: chiede conferma, e la sua promessa
     non si scioglie finche' qualcuno non preme. Aspettarla vorrebbe dire
     aspettare se stessi. */
  App._saveShipPending();
  if (!await finoA(() => !!dialogo(), 'la registrazione del DDT chiede conferma')) return;
  const riepDdt = riepilogoDialogo();
  uguale(riepDdt['N° DDT'], ddtNum, 'il riepilogo porta il numero del documento');
  uguale(riepDdt['Righe'], '1', 'il riepilogo dice quante righe vanno in bolla');
  uguale(riepDdt['Colli totali'], String(bancale.colli),
    'IL CONTO: i colli del riepilogo sono i colli del bancale');
  await premi('Registra DDT');
  await respira(600);
  await chiudiQualunqueFinestra();

  const conDoc = await finoAlDatabase(() => collezione('pending_outbound'),
    (d) => d.some((x) => !docPrima.has(x.doc_id)), 'il DDT pendente esiste');
  const doc = conDoc.find((x) => !docPrima.has(x.doc_id));
  if (!vero(!!doc, `il DDT pendente è ${doc?.ddt_num}`)) return;
  uguale(doc.status, 'pending', 'il DDT nasce pendente: la merce è ancora in giacenza');
  vero((doc.lines || []).some((l) => l.udc_id === bancale.udc_id),
    'le righe del DDT sanno da quale bancale vengono');

  /* ② IL GIRO DI CARICO. */
  App.cancelMov();
  App._goOp('shipping', 'carico');
  if (!await finoA(() => !!document.getElementById('carBaia'), 'il carico si apre sulla scelta della baia')) return;
  const scelta = document.getElementById('carBaia');
  const opzione = [...scelta.options].find((o) => o.value.endsWith(`|${baia.id}`));
  if (!vero(!!opzione, `la baia ${baia.id} è fra quelle che si possono scegliere`)) return;
  scelta.value = opzione.value;
  scelta.dispatchEvent(new Event('change', { bubbles: true }));

  const rigaDoc = [...document.querySelectorAll('#movFormArea table tbody tr')]
    .find((r) => r.textContent.includes(ddtNum));
  if (!vero(!!rigaDoc, `il DDT ${ddtNum} è fra quelli che si possono caricare`)) return;
  uguale(numeroIn([...rigaDoc.querySelectorAll('td')][3]?.textContent), 1,
    'IL CONTO: il documento dichiara un bancale da scansionare');
  premiInPagina('button', 'Carica questo', rigaDoc);
  if (!await finoA(() => !!document.getElementById('carScan'), 'il giro si apre e chiede di scansionare')) return;

  /* ③ SI SCANSIONA IL BANCALE. È l'unica conferma che vale. */
  const primaDelloScan = document.getElementById('movFormArea')?.textContent.replace(/\s+/g, ' ') || '';
  vero(primaDelloScan.includes(bancale.udc_id),
    'il giro nomina il bancale che si aspetta');

  scrivi('carScan', bancale.udc_id);
  document.getElementById('carScan').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await respira(1200);
  await chiudiQualunqueFinestra();

  /* ④ A DATABASE: il bancale è in baia, con le sue righe. */
  const inBaia = await finoAlDatabase(() => collezione('udc'),
    (u) => {
      const x = u.find((y) => y.udc_id === bancale.udc_id);
      return !!x && String(x.location_code || '').includes(`-${baia.id}-`);
    }, 'il bancale si sposta in baia');
  const suo = inBaia.find((y) => y.udc_id === bancale.udc_id);
  vero(String(suo?.location_code || '').startsWith(`${baia.site_id}-${baia.id}-`),
    `il bancale è in baia: ${suo?.location_code}`);

  const righe = (await collezione('inventory')).filter((x) => x.udc_id === bancale.udc_id);
  uguale(righe.length, 1, 'le righe del bancale sono ancora una');
  uguale(righe[0]?.location_code, suo?.location_code,
    'la merce ha seguito il bancale: riga e unità stanno nello stesso vano');
  uguale(righe[0]?.qty, bancale.colli,
    'IL CONTO: in baia ci sono i colli che sono partiti, il carico non li tocca');

  /* ⑤ E LA MERCE NON È ANCORA USCITA: esce quando il documento si evade. */
  const docDopo = (await collezione('pending_outbound')).find((d) => d.doc_id === doc.doc_id);
  uguale(docDopo?.status, 'pending',
    'caricare non evade: la merce resta in giacenza finché il documento non si chiude');

  App.cancelMov();
});

/* ── IL PERCORSO DI PRELIEVO ──────────────────────────────────────────────
   È la maschera che sta più tempo in mano a chi lavora: un ordine di
   produzione entra come foglio del gestionale ed esce come giro di tappe,
   una per vano, nell'ordine della serpentina. Chi preleva guarda solo
   quella, e si fida.

   IL FILE È QUELLO VERO. `banco/odp-2.12/` porta ordini esportati da Sage
   X3, e `accendi.cjs` ne mette uno fra le risorse servite: un `.xlsx`
   fabbricato dal banco proverebbe il fabbricatore, non il lettore. Il
   parser ha già ventisei prove sue in `test/odp.test.js`; qui si guarda
   quel che il parser NON può vedere — che le tappe a video siano la merce
   che sta a scaffale, e che prelevare una tappa cali la giacenza di quel
   che dice la tappa.

   LA MERCE SI POSIZIONA PRIMA. L'ordine chiede lotti che il magazzino di
   prova non ha, ed è normale: quei fogli vengono da un altro giorno. Il
   banco legge dall'applicativo che cosa l'ordine pretende, la posiziona
   dalla maschera di carico — che è come sarebbe arrivata davvero — e
   ricarica l'ordine. Nessun dato scritto a mano nel database. */
flusso('percorso', 'Il percorso: dall’ordine alle tappe, e la tappa cala la giacenza', async () => {
  await entra();

  const risposta = await fetch('/assets/ordine.xlsx');
  if (!vero(risposta.ok, 'il banco serve un ordine di produzione vero da caricare')) return;
  const contenuto = await risposta.arrayBuffer();

  const caricaOrdine = async () => {
    const campo = document.getElementById('fileImportOdp');
    const dt = new DataTransfer();
    dt.items.add(new File([contenuto], 'ordine.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    campo.files = dt.files;
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    await respira(600);
  };

  App._goOp('pick', 'ordine');
  if (!await finoA(() => !!document.getElementById('pRouteOperator'),
    'la maschera del percorso si apre')) return;

  /* ① UN PRIMO CARICAMENTO PER SAPERE COSA CHIEDE L'ORDINE. Si legge dalla
     lettura dell'applicativo, non riaprendo il foglio: il banco non tiene
     una seconda copia del parser. */
  await caricaOrdine();
  if (!await finoA(() => !!App._routeParsed, "l'ordine si lascia leggere")) return;
  /* QUEL CHE MANCA LO DICE L'APPLICATIVO, in `offroute`: articolo, lotto,
     quanto ne serve e perche' non si puo' servire. E' la stessa lista che
     l'operatore legge sotto l'anteprima, e leggerla di li' vuol dire non
     tenere una seconda copia del parser dentro il banco. */
  const ordine = (App._routeOrdini || [])[0];
  vero(!!ordine?.odp_num, `l'ordine caricato e' ${ordine?.odp_num}`);
  const chieste = (App._routeParsed.offroute || []).map((o) => ({
    articolo: o.article_code, lotto: o.lot_code, uom: o.um, quanto: o.kg_required,
  }));
  const gia = (App._routeParsed.stops || []).length;
  vero(chieste.length + gia > 0,
    `l'ordine chiede ${chieste.length + gia} partite, ${gia} gia' servibili`);

  /* ② SI POSIZIONA QUEL CHE MANCA, dalla maschera di carico. */
  const giacenza = await collezione('inventory');
  const mancanti = chieste.filter((c) => !giacenza.some((r) =>
    r.article_code === c.articolo && r.lot_code === c.lotto && (r.qty || 0) > 0));
  const vano = giacenza[0]?.location_code;
  if (!vero(!!vano, 'c’è un vano dove posare la merce dell’ordine')) return;

  if (mancanti.length) {
    App._routeClearImport();
    App.cancelMov();
    App._goOp('io', 'in');
    if (!await finoA(() => !!document.getElementById('mInLoc'), 'il carico merce si apre')) return;
    scrivi('mInLoc', vano);
    for (const c of mancanti) {
      scrivi('mInArtCode', c.articolo);
      scrivi('mInLot', c.lotto);
      await respira(150);
      /* Dove la misura è dichiarata il carico chiede com'è fatto ogni
         collo: qui si posano colli e basta, e le righe che la chiedono si
         saltano dicendolo. */
      /* Dove la misura e' dichiarata il carico chiede com'e' fatto ogni
         collo, ed e' giusto: una giacenza in chili senza sapere quanti
         chili c'e' dentro ogni collo non si preleva. Si dichiarano dieci
         colli abbastanza pieni da coprire quel che l'ordine chiede. */
      if (!document.getElementById('mInColliBox')?.hidden) {
        if (!vero(document.querySelectorAll('#mInColliRighe input').length >= 2,
          `${c.articolo}#${c.lotto}: la dichiarazione dei colli e' a video`)) continue;
        /* SI PASSA DAL SETTORE DELL'APPLICATIVO, non dal valore del campo:
           `_colliRigaSet` e' quel che chiama l'`oninput`, e scrivere solo
           nel DOM lascia la dichiarazione vuota quando la maschera si e'
           appena ridisegnata — la riga entra senza misure e il
           posizionamento si ferma senza dire niente. Visto alla terza
           partita di fila, e alle prime due no. */
        const per = Math.max(1, Math.ceil((Number(c.quanto) || 10) / 10));
        App._colliRigaSet(0, 'colli', 10);
        App._colliRigaSet(0, 'per', per);
        await respira(250);
        vero((aVideo('#mInColliPrev') || '').includes(String(per)),
          `${c.articolo}#${c.lotto}: l'anteprima dei colli dice 10 × ${per}`);
      } else {
        scrivi('mInQty', 10);
      }
      App._execPosiziona();
      await seCompare('Scansione ripetuta', 'Sì, sono colli diversi', 2500);
      /* SI ASPETTA IL DATABASE, non la riga d'esito: il posizionamento
         ridisegna la maschera appena finito, e il riquadro che diceva
         «entrati N colli» sparisce mentre lo si legge. Il banco cercava
         quel riquadro e concludeva che la merce non era entrata, mentre a
         scaffale c'era. */
      await finoAlDatabase(() => collezione('inventory'),
        (inv) => inv.some((r) => r.article_code === c.articolo && r.lot_code === c.lotto
          && r.location_code === vano && (r.qty || 0) > 0),
        `${c.articolo}#${c.lotto} si posiziona in ${vano}`);
    }
    App.cancelMov();

    const dopoIlCarico = await collezione('inventory');
    const ancoraFuori = mancanti.filter((c) => !dopoIlCarico.some((r) =>
      r.article_code === c.articolo && r.lot_code === c.lotto && (r.qty || 0) > 0));
    uguale(ancoraFuori.map((c) => `${c.articolo}#${c.lotto}`), [],
      'la merce che l’ordine chiede è a scaffale');

    /* ③ SI RICARICA L'ORDINE, adesso che la merce c'è. */
    App._goOp('pick', 'ordine');
    if (!await finoA(() => !!document.getElementById('pRouteOperator'),
      'la maschera del percorso si riapre')) return;
    await caricaOrdine();
    if (!await finoA(() => !!App._routeParsed, "l'ordine si rilegge")) return;
  }

  /* ④ L'ANTEPRIMA DEL GIRO: quante tappe, e su quanti siti. */
  if (!await finoA(() => !!document.querySelector('#routeImportResult .route-stats'),
    "l'anteprima del giro compare")) return;
  const valori = [...document.querySelectorAll('#routeImportResult .route-stat')]
    .map((n) => ({ etichetta: n.querySelector('.route-stat-lbl')?.textContent.trim(),
                   valore: numeroIn(n.querySelector('.route-stat-val')?.textContent) }));
  const tappeAVideo = valori.find((v) => v.etichetta === 'Tappe')?.valore;
  const stops = App._routeParsed.stops || [];
  uguale(tappeAVideo, stops.length,
    `IL CONTO: le tappe scritte a video sono quelle del giro (${stops.length})`);
  vero(stops.length > 0, `il giro ha ${stops.length} tappe`);

  /* Ogni tappa nomina merce che sta davvero in quel vano: un giro che manda
     dove non c'è niente è il modo di far perdere un turno. */
  const adesso = await collezione('inventory');
  const fantasma = stops.filter((s) => !adesso.some((r) =>
    r.location_code === s.location_code && r.item_key === s.item_key && (r.qty || 0) > 0));
  uguale(fantasma.map((s) => `${s.item_key} in ${s.location_code}`), [],
    'nessuna tappa manda a un vano dove quella merce non c’è');

  /* ⑤ SI AVVIA. La sessione nasce, e da lì il giro è ripristinabile: un
     terminale che si spegne a metà corridoio non deve far ricominciare. */
  premiInPagina('#routeImportResult button', 'AVVIA PERCORSO');
  await respira(900);
  await chiudiQualunqueFinestra();

  const sessione = await finoAlDatabase(() => collezione('pick_session'),
    (s) => s.some((x) => x.status !== 'closed' && (x.stops || []).length),
    'la sessione di prelievo è a database');
  const sess = sessione.find((x) => x.status !== 'closed' && (x.stops || []).length);
  if (!vero(!!sess, `la sessione è aperta: ${sess?.session_id}`)) return;
  uguale((sess.stops || []).length, stops.length,
    'IL CONTO: le tappe salvate sono quelle mostrate in anteprima');
  uguale(sess.operator, App.currentOperator, 'la sessione porta la sigla di chi la sta facendo');
  uguale((sess.stops || []).filter((s) => s.status !== 'pending').length, 0,
    'un giro appena avviato non ha ancora nessuna tappa fatta');

  App.cancelMov();
});

/* ═══ La corsa ═══════════════════════════════════════════════════════════ */

export async function gira(chiave, solo = null) {
  if (location.port !== PORTA_BANCO) {
    console.error(`%c IL BANCO NON GIRA QUI `, 'background:#BA1A1A;color:#fff;font-weight:700',
      `\nSei sulla porta ${location.port || '(nessuna)'}. Il banco vive sulla ${PORTA_BANCO},`
      + '\nche ha un database usa e getta. Qui ci sono i dati veri: non si prova sopra.');
    return;
  }
  attaccaChiave(chiave);
  esiti.length = 0;

  const chiesti = solo == null ? null : (Array.isArray(solo) ? solo : [solo]);
  const ignoti = (chiesti || []).filter((n) => !FLUSSI[n]);
  if (ignoti.length) {
    console.error(`Non c'è nessun flusso che si chiami «${ignoti.join('», «')}».`
      + ` Ci sono: ${Object.keys(FLUSSI).join(', ')}`);
    return;
  }
  const daFare = chiesti ? chiesti.map((n) => [n, FLUSSI[n]]) : Object.entries(FLUSSI);

  for (const [nome, f] of daFare) {
    corrente = { nome, titolo: f.titolo, righe: [], rotte: 0, ms: 0 };
    const t0 = performance.now();
    try {
      await f.fn();
    } catch (e) {
      segna(false, `la prova si è fermata: ${e.message}`, 'arriva in fondo', 'eccezione');
    }
    corrente.ms = Math.round(performance.now() - t0);
    esiti.push(corrente);
  }

  stampa();
  return esiti;
}

function stampa() {
  const rotte = esiti.reduce((n, e) => n + e.rotte, 0);
  const righe = esiti.reduce((n, e) => n + e.righe.length, 0);
  console.log(`%c BANCO A VIDEO `, 'background:#274C57;color:#fff;font-weight:700;padding:2px 6px');
  for (const e of esiti) {
    const stile = e.rotte ? 'color:#BA1A1A;font-weight:700' : 'color:#2D694F;font-weight:700';
    console.groupCollapsed(`%c${e.rotte ? '✗' : '✓'} ${e.titolo}  (${e.ms}ms)`, stile);
    for (const r of e.righe) {
      if (r.ok) console.log(`%c  ok  %c${r.cosa}`, 'color:#2D694F', 'color:inherit');
      else console.log(`%c  NO  %c${r.cosa}\n      atteso: ${JSON.stringify(r.atteso)}\n      avuto:  ${JSON.stringify(r.avuto)}`,
        'color:#BA1A1A;font-weight:700', 'color:inherit');
    }
    console.groupEnd();
  }
  const stile = rotte ? 'background:#BA1A1A;color:#fff' : 'background:#2D694F;color:#fff';
  console.log(`%c ${righe - rotte} su ${righe} `, stile + ';font-weight:700;padding:2px 6px',
    rotte ? `— ${rotte} da guardare` : '— tutto a posto');
}

/** Il verbale in una forma che si legge da fuori, per chi guida il banco da
    un'altra parte e non ha la console sotto gli occhi. */
export function verbale() {
  return esiti.map((e) => ({
    flusso: e.nome, titolo: e.titolo, ms: e.ms, rotte: e.rotte,
    guai: e.righe.filter((r) => !r.ok).map((r) => `${r.cosa} — atteso ${JSON.stringify(r.atteso)}, avuto ${JSON.stringify(r.avuto)}`),
  }));
}
