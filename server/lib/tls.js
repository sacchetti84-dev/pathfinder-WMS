/* IL CERTIFICATO, E CHI BUSSA ALLA PORTA SBAGLIATA — 2.26.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Due regole pure, e nessuna delle due apre un socket: le decisioni si
   collaudano da ferme, l'apertura sta in `pathfinder-server.js`.

   PERCHE' IL PFX. Su Windows un certificato si fa con
   `New-SelfSignedCertificate`, che e' dentro il sistema, e si esporta con
   `Export-PfxCertificate`, che pure. Arrivare da li' a una coppia PEM
   vorrebbe dire `openssl` — un eseguibile scaricato su un PC di magazzino,
   cioe' esattamente quel che questo progetto non fa (vedi
   `installa-servizio.ps1`, e il perche' l'attivita' pianificata non e' un
   servizio nativo). Node legge il PFX direttamente, quindi la conversione
   non serve a nessuno. Le due variabili PEM restano: sono la strada per un
   certificato che arriva dall'IT.

   UNA PORTA SOLA — 2.26. Il servizio ascolta sulla 4173 come sempre. Chi
   arriva in chiaro su quella porta non riceve un errore di protocollo: la
   prima cosa che un client manda dice gia' chi e', e un `301` verso `https`
   costa meno di un collegamento da rifare su ogni terminale. */

/** Il primo byte di un saluto TLS e' `0x16` — `handshake` — e nessun metodo
    HTTP comincia cosi': `GET`, `POST`, `HEAD` cominciano con una lettera
    maiuscola ASCII. Basta il primo byte, e ne arriva sempre almeno uno. */
function eSalutoTLS(primo) {
  return !!primo && primo.length > 0 && primo[0] === 0x16;
}

/** Che cosa fare, letto dall'ambiente. Non tocca il disco: dice solo quale
    delle tre strade e' quella dichiarata, e quando la dichiarazione e' a
    meta' lo dice invece di ripiegare in chiaro. Un servizio che parte in
    chiaro «perche' il certificato non si leggeva» e' il modo in cui un PIN
    finisce sulla rete senza che nessuno se ne accorga. */
function decidiTls(env) {
  const e = env || {};
  const pfx = e.PATHFINDER_TLS_PFX || null;
  const cert = e.PATHFINDER_TLS_CERT || null;
  const key = e.PATHFINDER_TLS_KEY || null;

  if (pfx && (cert || key)) {
    return {
      modo: 'errore',
      motivo: 'Dichiarati insieme PATHFINDER_TLS_PFX e la coppia CERT/KEY: '
        + 'sono due strade per la stessa cosa, e il servizio non sceglie da solo.',
    };
  }
  if (pfx) return { modo: 'pfx', pfx, password: e.PATHFINDER_TLS_PFX_PASSWORD || '' };
  if (cert && key) return { modo: 'pem', cert, key };
  if (cert || key) {
    return {
      modo: 'errore',
      motivo: 'Certificato incompleto: servono PATHFINDER_TLS_CERT e PATHFINDER_TLS_KEY.'
        + ` cert: ${cert || '(mancante)'} — key: ${key || '(mancante)'}`,
    };
  }
  return { modo: 'chiaro' };
}

module.exports = { eSalutoTLS, decidiTls };
