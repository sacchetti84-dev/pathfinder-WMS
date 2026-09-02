/* I CODICI SI DIGITANO IN MAIUSCOLO — 2.6.

   PERCHE'. Il 26/08, in `MAG1-RAKA-01-05-C`, lo stesso lotto stava a
   scaffale due volte: `6001412#cl260854` con 5 pezzi e `6001412#CL260854`
   con 1. Stessa merce, due righe, perche' una volta era stato digitato in
   minuscolo. Il FEFO le ordinava separate e chi prelevava ne trovava una e
   non l'altra.

   QUESTA E' LA META' COMODA, NON LA GARANZIA. La garanzia sta sul servizio
   (`server/lib/schema.js`, `MAIUSCOLE`), che normalizza ogni scrittura da
   qualunque parte arrivi — due terminali e un import da Excel non passano
   dalla stessa maschera. Qui si fa in modo che l'operatore VEDA subito
   quello che verra' scritto, invece di scoprirlo dopo aver salvato.

   IL LETTORE OTTICO E' UNA TASTIERA. Non c'e' un «evento di scansione» da
   agganciare: il lettore digita dentro il campo che ha il fuoco, carattere
   per carattere, e finisce con un Invio. Maiuscolare mentre si digita copre
   percio' la scansione e la digitazione con lo stesso gesto.

   CHI AGGIUNGE UN CAMPO lo mette in uno dei due elenchi, e la prova
   `test/maiuscole.test.js` non lo lascia passare finche' non l'ha fatto:
   un campo non classificato e' un campo che qualcuno ha dimenticato. */

/** I campi che portano un CODICE: due grafie diverse fanno due entita'. */
const CAMPI_CODICE: ReadonlySet<string> = new Set([
  /* Anagrafica articoli */
  'artCode', 'artCategory', 'artUnit', 'eaCategory', 'eaUnit',
  /* Conta e inventario */
  'cnArt', 'cnLoc', 'cnLot', 'invArtQ', 'invUdcCode',
  'mInvExtraArt', 'mInvExtraLot', 'mInvLoc',
  /* Giacenze */
  'editItemArt', 'editItemLot', 'itemArticleCode', 'itemLotCode', 'moveItemDest',
  /* Posizionamento */
  'mInArtCode', 'mInLoc', 'mInLot',
  /* Smaltimento */
  'dArt', 'dLoc', 'dLot', 'mOutArt', 'mOutLot',
  /* Attivita' */
  'ntLot', 'ntFrom', 'ntTo',
  /* Prelievo e trasferimenti */
  'pCambioArt', 'pCambioDest', 'pCambioLot', 'pProdArt', 'pProdLot', 'pProdOrder',
  'rArt', 'rLoc', 'rLot', 'trfTo',
  /* Documenti e spedizioni */
  'pEditArt', 'pEditDdt', 'pEditLot', 'pShipArt', 'pShipLot', 'pShipDdt',
  'pShipDestProvince', 'pShipDestVat',
  /* 2.19 — Stampanti. Il sito servito e' un `site_id`, e i site_id sono
     maiuscoli come tutti gli altri codici di questo applicativo. */
  'stpSito',
  /* 2.20 — il codice del modello di imballo: e' una chiave, e l'articolo lo
     nomina in anagrafica. Due grafie sono due modelli. */
  'imbCode',
  /* 2.20 — prodotto finito: ubicazione, articolo, lotto e ordine sono le
     quattro chiavi che il lettore scrive dentro la maschera del reparto. */
  'pfLoc', 'pfArt', 'pfLot', 'pfOdp',
  /* Quarantena */
  'qArt', 'qLot', 'qvArt', 'qvLoc', 'qvLot', 'releaseDestLoc',
  /* Unita' di carico */
  'udcDest', 'udcLoc',
  /* Conto di produzione */
  'wipDove', 'wipOrd',
  /* Configurazione */
  'newSiteId', 'newZoneId', 'zfLevels', 'cfgAreaWip', 'cfgGS1', 'srPrefisso',
  /* Operatori */
  'opInitials', 'wizInitials',
  /* 2.13 — il codice di ripristino: alfabeto di sole maiuscole e cifre,
     e chi lo ricopia da un foglio non deve pensarci. */
  'recCode',
  /* Destinatari */
  'rcVat', 'rcCf',
]);

/* I campi con l'identificativo costruito a runtime — `pp_<chiave>_code` dei
   parametri. Si riconoscono dalla forma, perche' il nome non e' scritto in
   nessun sorgente. */
const FORME_CODICE: readonly RegExp[] = [
  /^pp_.+_code$/,
];

/* I campi che NON si maiuscolano, e il perche'. Sta scritto qui e non nella
   testa di chi ha scritto l'elenco di sopra: la prova confronta i due
   elenchi con i campi che le viste dichiarano davvero, e un campo nuovo che
   non sta ne' di qua ne' di la' fa suonare il collaudo. */
const CAMPI_TESTO: ReadonlySet<string> = new Set([
  /* RICERCHE — cercano anche nelle descrizioni, e una descrizione
     maiuscolata non si trova piu'. */
  'arcText', 'artFilterInput', 'cpQuery', 'ntArticle', 'opCerca',
  'regCerca', 'regFilterText', 'wipCerca',
  /* NOMI PROPRI E RAGIONI SOCIALI — due grafie non fanno due persone:
     l'identita' la fanno `op_id` e la partita IVA. */
  'artSupplier', 'eaSupplier', 'cpFirst', 'cpLast', 'editSiteName', 'ezName', 'opFirst', 'opLast',
  'pEditDest',
  'newSiteName', 'newZoneName', 'pShipCustomer', 'pShipShipTo', 'rcName', 'wizFirst', 'wizLast',
  'cpFor', 'ntCarrier', 'ntDest', 'pEditCarrier', 'pShipCarrier',
  'pProdOperator', 'pRouteOperator', 'qOperator', 'qiOperator', 'releaseOperator',
  'qRefDept', 'qRefPerson', 'qiRefDept', 'qiRefPerson', 'releaseRefPerson',
  /* DESCRIZIONI, NOTE E MOTIVI — prosa. */
  'artDesc', 'artNotes', 'cnNota', 'cpNotes', 'dReasonFree', 'eaDesc', 'eaNotes',
  'editItemDesc', 'editSiteAddress', 'editSiteNotes', 'itemArticleDesc', 'itemNotes',
  'mInArtDesc', 'mInNotes', 'mInScavalco', 'newSiteAddress', 'newSiteNotes',
  'ntNote', 'ntSampleFor', 'pEditNotes', 'pShipAspetto', 'pShipDocNotes', 'pShipNotes',
  'pShipOrderRef', 'srNota', 'udcDispNota', 'udcQMotivo', 'udcQPersona', 'udcQReparto',
  /* 2.8 — perche' QUESTA cella e' diversa dalle altre. E' prosa che legge
     chi si vede escludere un vano, non un codice: «unica campata con la
     vasca di contenimento» urlato in maiuscolo non aiuta nessuno. */
  'laNota',
  /* INDIRIZZI */
  'pShipDestAddress', 'pShipDestCity', 'pShipDestZip',
  /* 2.19 — STAMPANTI. Il nome e' quello che l'operatore legge in corsia —
     «Zebra ZT411 — Spedizioni» urlato in maiuscolo non aiuta nessuno.
     L'indirizzo e' un IP o un nome DNS: i nomi DNS sono indifferenti al caso
     e maiuscolarli non cambia dove si va, ma li rende illeggibili. */
  'stpNome', 'stpHost',
  /* 2.20 — IMBALLI. Il nome e il supporto sono quel che si legge in tendina
     e sulla packing list: «EPAL 8 per strato» urlato in maiuscolo si legge
     peggio, e non identifica niente — a identificare c'e' il codice. */
  'imbLabel', 'imbSupporto',
  /* DATE, QUANTITA' E MISURE — non sono testo, e maiuscolarle non vuol
     dire niente. */
  'editItemExp', 'itemExpiry', 'mInExp', 'pEditExpected', 'pShipDocDate', 'pShipExpected',
  'pShipStartTransport', 'pShipPesoLordo', 'pShipPesoNetto',
  'colliSelParte', 'wipParte', 'wipPerCollo', 'ezLevels',
  /* 2.20 — la scadenza del prodotto finito e il numero di colli: una data e
     un conteggio, e maiuscolarli non vuol dire niente. */
  'pfExp', 'pfColli',
]);

/** Questo campo porta un codice? */
function eCodice(id: string): boolean {
  if (!id) return false;
  if (CAMPI_CODICE.has(id)) return true;
  return FORME_CODICE.some(r => r.test(id));
}

/** Il valore, maiuscolato. Le stringhe vuote restano vuote. */
function maiuscola(v: unknown): string {
  return typeof v === 'string' ? v.toUpperCase() : '';
}

/* IL CURSORE NON DEVE SALTARE IN FONDO.
   Riassegnare `.value` mentre si digita rimette il cursore alla fine, e chi
   sta correggendo un carattere in mezzo a un codice si ritrova a scrivere in
   coda. Si riscrive solo se il valore cambia davvero, e la posizione si
   rimette dov'era. */
function applica(el: HTMLInputElement): boolean {
  const prima = el.value;
  const dopo = maiuscola(prima);
  if (dopo === prima) return false;
  const inizio = el.selectionStart;
  const fine = el.selectionEnd;
  el.value = dopo;
  if (inizio !== null && fine !== null) {
    try { el.setSelectionRange(inizio, fine); } catch { /* i type che non lo sostengono */ }
  }
  return true;
}

/* UN ASCOLTATORE SOLO, IN CIMA AL DOCUMENTO.
   Le maschere nascono e muoiono dentro le modali, e agganciarsi al singolo
   campo vorrebbe dire riagganciarsi a ogni apertura — cioe' dimenticarsene
   una. La delega non ha questo problema: il campo puo' nascere dopo. */
function accendi(radice: Document | HTMLElement = document): () => void {
  const suInput = (ev: Event) => {
    const el = ev.target as HTMLInputElement | null;
    if (!el || el.tagName !== 'INPUT') return;
    if (!eCodice(el.id)) return;
    applica(el);
  };
  radice.addEventListener('input', suInput, true);
  return () => radice.removeEventListener('input', suInput, true);
}

export { CAMPI_CODICE, CAMPI_TESTO, FORME_CODICE, eCodice, maiuscola, applica, accendi };
