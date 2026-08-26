import { Persistence } from '../core/persistence/index';
import type { Istante, Operatore } from '../types/entita.js';

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

  async buildPinFields(pin: string): Promise<CampiPin> {
    if (this._remoto()) return await Persistence.op!<CampiPin>('hashPin', { pin });
    const salt = this.newSalt();
    return { pin_salt: salt, pin_hash: await this.hashPin(pin, salt), pin_set_at: Date.now() };
  }
};

export { Auth };
