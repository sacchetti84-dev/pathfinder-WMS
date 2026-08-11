import { Persistence } from '../core/persistence/index';
import type { Istante, Operatore } from '../types/entita.js';

// ═══════════════════════════════════════════════════════════════════
// © Andrea Sacchetti — Dietopack S.r.l.
// modulo Auth — Pathfinder Warehouse Mapper v2.7.0 [G6]
//
// Verifica del PIN operatore. Tre righe di sostanza e una lunga premessa,
// perche' la premessa e' cio' che impedisce di usare questo modulo per
// qualcosa che non puo' reggere.
//
// CHE COSA GARANTISCE. Che il PIN in chiaro non venga mai scritto: ne' in
// IndexedDB, ne' in localStorage, ne' nel registro movimenti, ne' negli
// export. Sul disco resta lo SHA-256 di salt+':'+pin con un salt casuale
// diverso per ogni operatore, quindi due persone con lo stesso PIN hanno
// hash diversi e una tabella precalcolata non serve a nulla.
//
// CHE COSA NON GARANTISCE. Sei cifre sono un milione di combinazioni: un
// attaccante con accesso al file del database e tempo macchina le prova
// tutte. Questo non e' un difetto da correggere con piu' iterazioni, e'
// il livello giusto per cio' che il PIN deve fare — dire QUALE operatore
// sta lavorando su un terminale di reparto, non difendere un segreto da
// chi ha gia' in mano il computer. Se un domani i dati staranno su un
// server condiviso, l'autenticazione sara' quella del server e questo
// modulo diventera' un ricordo. Nessuno lo scambi per crittografia.
//
// crypto.subtle e' nativo e funziona offline: nessuna libreria, nessuna
// rete. Richiede pero' un contesto sicuro — https o file:// o localhost.
// Su http:// verso un host remoto non esiste, e in quel caso l'app lo dice
// invece di far finta di verificare qualcosa.
// ═══════════════════════════════════════════════════════════════════

/* I tre campi che descrivono un PIN sul record operatore. Escono da
   buildPinFields() e non se ne separano mai: scriverne due su tre lascia un
   operatore che non può più entrare e che nessuno può reimpostare. */
export interface CampiPin {
  pin_salt: string;
  pin_hash: string;
  pin_set_at: Istante;
}

/* Il 429 del freno sui tentativi. `blocked` è la bandiera che distingue
   «aspetta un minuto» da un guasto di rete, e viaggia sull'errore perché è
   lì che chi chiama la va a cercare. */
type ErroreTentativi = Error & { status?: number; blocked?: boolean };

const Auth = {
  PIN_LENGTH: 6,

  /* PIN palesemente indovinabili. Non e' una policy di sicurezza: e' un
     paracadute contro il "tanto tengo 000000", che vanificherebbe l'intera
     tracciabilita' senza che nessuno se ne accorga. */
  _TRIVIAL: new Set(['000000', '123456', '654321', '111111', '112233', '123123']),

  /* ═══════════════════════════════════════════════════════════════════
     DOVE SI CALCOLA L'IMPRONTA DEL PIN
     © Andrea Sacchetti — Dietopack S.r.l.

     `crypto.subtle` esiste solo in CONTESTO SICURO: https, file:// o
     localhost. Un terminale di reparto che apre http://192.168.x.x NON
     e' in contesto sicuro, e li' quella funzione non c'e' proprio.

     Fino a quando il database viveva nella scheda non c'era alternativa:
     o si calcolava li' o non si calcolava, e l'applicativo sceglieva
     onestamente di dirlo invece di fingere una verifica — degradando
     all'identificazione per sole iniziali, che e' esattamente cio' che
     succedeva ai terminali collegati per indirizzo IP.

     Con un servizio a disposizione la scelta non serve piu': il calcolo
     si fa dove il contesto e' sempre sicuro, cioe' sul server. Il
     formato dell'impronta e' identico — SHA-256 di `salt:pin` in
     esadecimale — quindi i PIN restano gli stessi passando da un
     supporto all'altro. Nessun PIN da rifare.

     `_remoto()` decide caso per caso, non una volta per tutte: la stessa
     copia del file serve il terminale in rete e il portatile aperto col
     doppio clic. ═══════════════════════════════════════════════════ */
  _remoto(): boolean {
    return typeof Persistence !== 'undefined'
        && Persistence.kind === 'remote'
        && Persistence.supportsRemoteOps === true;
  },

  available(): boolean {
    /* Col servizio la verifica e' sempre possibile: non dipende da cosa
       il browser concede a questa origine. */
    if (this._remoto()) return true;
    return Boolean(globalThis.crypto?.subtle && globalThis.crypto?.getRandomValues);
  },

  /* Ritorna null se il PIN va bene, altrimenti il motivo del rifiuto. */
  validatePin(pin: unknown): string | null {
    const v = String(pin ?? '');
    if (!/^\d{6}$/.test(v)) return 'Il PIN deve essere di esattamente 6 cifre.';
    if (this._TRIVIAL.has(v)) return 'PIN troppo semplice: scegline uno non prevedibile.';
    if (/^(\d)\1{5}$/.test(v)) return 'PIN troppo semplice: sei cifre uguali.';
    return null;
  },

  _hex(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  newSalt(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return this._hex(bytes.buffer);
  },

  async hashPin(pin: string, salt: string): Promise<string> {
    const data = new TextEncoder().encode(`${salt}:${pin}`);
    return this._hex(await crypto.subtle.digest('SHA-256', data));
  },

  /* Confronto a tempo costante. Su un applicativo locale il timing attack e'
     teorico, ma il costo di scriverlo bene e' due righe. */
  _equal(a: unknown, b: unknown): boolean {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  },

  async verifyPin(operator: Operatore | null | undefined, pin: string): Promise<boolean> {
    if (this._remoto()) {
      /* Il server rilegge l'operatore dal database e confronta li'. Ha
         anche un freno sui tentativi ripetuti, che nel browser non
         avrebbe senso mettere: chi vuole provare un milione di PIN non
         lo fa certo dall'interfaccia.

         Il freno risponde 429, e un 429 il trasporto lo solleva come
         errore prima di restituire il corpo: va riconosciuto qui e
         ripresentato con il flag, altrimenti a chi chiama arriva un
         errore di rete qualunque e l'operatore legge "riprova" mentre
         il vero motivo e' che deve aspettare un minuto.

         Il punto esclamativo su `op` dice ciò che `_remoto()` ha appena
         verificato: `op` è dichiarata facoltativa nel contratto perché
         l'adapter locale non ce l'ha, e questo ramo si esegue solo quando
         sotto c'è il servizio. */
      let r;
      try {
        r = await Persistence.op!<{ ok?: boolean }>('verifyPin', { op_id: operator?.op_id, pin });
      } catch (err) {
        const e = err as ErroreTentativi;
        if (e?.status === 429) { e.blocked = true; throw e; }
        throw err;
      }
      return r?.ok === true;
    }
    if (!operator?.pin_hash || !operator?.pin_salt) return false;
    const h = await this.hashPin(pin, operator.pin_salt);
    return this._equal(h, operator.pin_hash);
  },

  /* Prepara i campi da scrivere sul record operatore. Il chiamante non vede
     mai il PIN dopo questa chiamata: entra qui e ne esce solo l'hash.

     Col servizio il calcolo lo fa lui e la firma resta questa: i quattro
     punti che impostano un PIN — wizard, completamento scheda, creazione
     operatore, rinnovo — non cambiano di una riga. */
  async buildPinFields(pin: string): Promise<CampiPin> {
    if (this._remoto()) return await Persistence.op!<CampiPin>('hashPin', { pin });
    const salt = this.newSalt();
    return { pin_salt: salt, pin_hash: await this.hashPin(pin, salt), pin_set_at: Date.now() };
  }
};

export { Auth };
