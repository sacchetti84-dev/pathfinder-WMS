import { Persistence } from '../core/persistence/index';
import type { Istante, Operatore } from '../types/entita.js';

/* ── 2.13 · I campi della via di fuga ─────────────────────────────────
   Stessa forma dei campi del PIN, e non e' una somiglianza casuale: e'
   lo stesso meccanismo — un sale casuale, un'impronta, l'algoritmo che
   l'ha fatta — applicato a un segreto diverso. */
export interface CampiRipristino {
  rec_salt: string;
  rec_hash: string;
  rec_algo?: 'scrypt';
  rec_set_at: Istante;
}

export interface CampiPin {
  pin_salt: string;
  pin_hash: string;
  /** 2.10 — con quale algoritmo è fatta l'impronta. Lo decide chi la scrive:
      il servizio dice `scrypt`, il modo «da file» lascia il campo assente e
      quello vuol dire SHA-256, cioè tutto ciò che esisteva prima. */
  pin_algo?: 'scrypt';
  pin_set_at: Istante;
}

type ErroreTentativi = Error & { status?: number; blocked?: boolean };

const Auth = {
  PIN_LENGTH: 6,

  _TRIVIAL: new Set(['000000', '123456', '654321', '111111', '112233', '123123']),

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

  /* ── 2.11 · ACCEDERE NON E' VERIFICARE, e la differenza conta ─────────
     `verifyPin` risponde a «questo PIN e' quello di questa persona?», e la
     si chiama anche a sessione aperta — per confermare un gesto che chiede
     il PIN di un Admin, per esempio. Se emettesse una sessione, confermare
     un reset col PIN dell'Admin scambierebbe l'operatore al lavoro.

     `accedi` invece e' l'ingresso: il servizio verifica e posa il cookie.
     Da file non c'e' nessun servizio e nessuna porta da attraversare — la
     verifica avviene qui, come sempre. */
  async accedi(operatore: Operatore, pin: string): Promise<boolean> {
    if (!this._remoto()) return await this.verifyPin(operatore, pin);
    try {
      const r = await Persistence.accedi!({ op_id: operatore.op_id }, pin);
      return r?.ok === true;
    } catch (err) {
      const e = err as ErroreTentativi;
      if (e?.status === 429) { e.blocked = true; throw e; }
      /* 401 vuol dire «PIN sbagliato», ed e' una risposta, non un guasto. */
      if (e?.status === 401) return false;
      throw err;
    }
  },

  async esci(): Promise<void> {
    if (!this._remoto()) return;
    try { await Persistence.esci!(); } catch { /* uscire non puo' fallire */ }
  },

  async buildPinFields(pin: string): Promise<CampiPin> {
    if (this._remoto()) return await Persistence.op!<CampiPin>('hashPin', { pin });
    const salt = this.newSalt();
    return { pin_salt: salt, pin_hash: await this.hashPin(pin, salt), pin_set_at: Date.now() };
  },

  /* ══ 2.13 · IL CODICE DI RIPRISTINO ═══════════════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l.

     PERCHE' ESISTE. Un PIN smarrito si rinnova, e chi lo rinnova e' un
     grado piu' alto: l'Operatore ha il Team Leader, il Team Leader ha
     l'Admin. Sopra l'Admin non c'e' nessuno. Con un solo Admin — che e'
     ogni installazione appena nata — il suo PIN perso e' la Configurazione
     murata per sempre, e con lei il reset, i siti, l'anagrafica: nessuno
     puo' nemmeno nominare un secondo Admin, perche' si nomina da li'.
     Questo codice e' l'unica porta che resta, e si apre una volta sola.

     COM'E' FATTO. Venti caratteri dall'alfabeto di Crockford — le dieci
     cifre e ventidue lettere, senza I L O U — divisi in quattro gruppi da
     cinque. Cento bit: indovinarlo non e' un'ipotesi da fare. L'alfabeto
     non e' vezzo tipografico: e' un codice che qualcuno stampa, mette in
     cassaforte e sei mesi dopo ricopia a mano da un foglio. Uno zero letto
     come una O li' dentro e' la via di fuga che non funziona, e allora la
     lettura le riconduce entrambe alla stessa cifra.

     NON E' UN SECONDO PIN. Non apre l'applicativo: apre soltanto la
     maschera che riscrive il PIN di quell'Admin. Si consuma nell'uso — al
     posto suo ne nasce subito un altro, mostrato una volta — e sul disco
     non c'e' mai il codice, c'e' la sua impronta.                      */

  /* Crockford base32. Niente I, L, O, U: le prime tre si confondono con 1
     e 0 su carta, la quarta e' esclusa perche' senza di lei nessun codice
     generato a caso puo' comporre una parola sgradevole. */
  _RIPRISTINO_ALFABETO: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
  RIPRISTINO_GRUPPI: 4,
  RIPRISTINO_PER_GRUPPO: 5,

  get RIPRISTINO_LUNGHEZZA(): number {
    return this.RIPRISTINO_GRUPPI * this.RIPRISTINO_PER_GRUPPO;
  },

  /** Un codice nuovo, in gruppi separati dal trattino. */
  newRecoveryCode(): string {
    const alfabeto = this._RIPRISTINO_ALFABETO;
    const totale = this.RIPRISTINO_LUNGHEZZA;
    const scelte: string[] = [];
    /* 256 non e' multiplo di 32 — lo e', ma la riga vale lo stesso il
       giorno in cui l'alfabeto cambia: un byte fuori dalla soglia si
       butta invece di piegarlo con un modulo che sbilancerebbe. */
    const soglia = 256 - (256 % alfabeto.length);
    while (scelte.length < totale) {
      const bytes = new Uint8Array(totale);
      crypto.getRandomValues(bytes);
      for (const b of bytes) {
        if (b >= soglia) continue;
        scelte.push(alfabeto.charAt(b % alfabeto.length));
        if (scelte.length === totale) break;
      }
    }
    const gruppi: string[] = [];
    for (let i = 0; i < totale; i += this.RIPRISTINO_PER_GRUPPO) {
      gruppi.push(scelte.slice(i, i + this.RIPRISTINO_PER_GRUPPO).join(''));
    }
    return gruppi.join('-');
  },

  /** Quel che l'utente ha digitato, ricondotto alla forma canonica: senza
      trattini ne' spazi, maiuscolo, con I/L letti come 1 e O come 0. */
  normalizeRecoveryCode(valore: unknown): string {
    return String(valore ?? '')
      .toUpperCase()
      .replace(/[\s-]+/g, '')
      .replace(/[IL]/g, '1')
      .replace(/O/g, '0');
  },

  /** `null` se il codice ha la forma giusta, altrimenti il motivo. */
  validateRecoveryCode(valore: unknown): string | null {
    const v = this.normalizeRecoveryCode(valore);
    if (v.length !== this.RIPRISTINO_LUNGHEZZA) {
      return `Il codice di ripristino ha ${this.RIPRISTINO_LUNGHEZZA} caratteri.`;
    }
    for (const c of v) if (!this._RIPRISTINO_ALFABETO.includes(c)) {
      return `Carattere non ammesso nel codice: «${c}».`;
    }
    return null;
  },

  async buildRecoveryFields(codice: string): Promise<CampiRipristino> {
    const v = this.normalizeRecoveryCode(codice);
    if (this._remoto()) return await Persistence.op!<CampiRipristino>('hashRecovery', { codice: v });
    const salt = this.newSalt();
    return { rec_salt: salt, rec_hash: await this.hashPin(v, salt), rec_set_at: Date.now() };
  },

  /* Da file non c'e' nessun servizio: la verifica avviene qui, come per il
     PIN. Col servizio non si passa da qui — ci passa `Persistence.recupera`,
     che l'impronta la legge dal database e non la fa viaggiare. */
  async verifyRecoveryCode(operatore: Operatore | null | undefined, codice: string): Promise<boolean> {
    if (!operatore?.rec_hash || !operatore?.rec_salt) return false;
    const h = await this.hashPin(this.normalizeRecoveryCode(codice), operatore.rec_salt);
    return this._equal(h, operatore.rec_hash);
  }
};

export { Auth };
