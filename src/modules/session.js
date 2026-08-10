// ═══════════════════════════════════════════════════════════════════
// © Andrea Sacchetti — Dietopack S.r.l.
// modulo Session — Pathfinder Warehouse Mapper v2.7.0 [G6]
//
// Chi lavora al terminale si allontana: va a prendere un pallet, risponde
// al telefono, finisce il turno. Il terminale resta acceso con la sessione
// di qualcun altro aperta, e il movimento successivo viene firmato dalla
// persona sbagliata. In un sistema che deve reggere un audit questa non e'
// una scomodita': e' un record falso.
//
// Allo scadere dell'inattivita' l'applicazione SALVA — perche' il lavoro
// fatto fin li' e' buono e non va perso — e si blocca dietro un popup che
// non si puo' aggirare. Non un avviso: un blocco.
//
// Il timeout e' preferenza di DISPOSITIVO (localStorage), non dato
// aziendale: un tablet in reparto e un PC in ufficio hanno esigenze
// diverse e non c'e' ragione perche' la scelta viaggi negli export.
// ═══════════════════════════════════════════════════════════════════
const Session = {
  KEY: 'wm_session_timeout_min',
  DEFAULT_MIN: 10,
  MIN_MIN: 1,
  MAX_MIN: 120,

  _timer: null,
  _minutes: null,
  _onExpire: null,
  _armed: false,

  /* 0 = disattivato. Valori fuori scala vengono riportati nell'intervallo:
     un file di preferenze manipolato non deve poter disattivare il blocco
     scrivendo "0.0001". */
  getTimeoutMinutes() {
    if (this._minutes !== null) return this._minutes;
    let v = this.DEFAULT_MIN;
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw !== null) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) v = n === 0 ? 0 : Math.min(this.MAX_MIN, Math.max(this.MIN_MIN, n));
      }
    } catch { /* localStorage disabilitato → default */ }
    this._minutes = v;
    return v;
  },

  setTimeoutMinutes(min) {
    const n = parseInt(min, 10);
    const v = !Number.isFinite(n) || n === 0 ? 0 : Math.min(this.MAX_MIN, Math.max(this.MIN_MIN, n));
    this._minutes = v;
    try { localStorage.setItem(this.KEY, String(v)); } catch {}
    this.reset();
    return v;
  },

  /* onExpire e' asincrona: deve poter salvare prima di bloccare. */
  init(onExpire) {
    this._onExpire = onExpire;
    const bump = () => this.reset();
    for (const ev of ['mousedown', 'keydown', 'touchstart', 'wheel']) {
      document.addEventListener(ev, bump, { capture: true, passive: true });
    }
    this._armed = true;
    this.reset();
  },

  /* Sospende il conto alla rovescia: mentre il popup di sblocco e' aperto
     non ha senso far scadere di nuovo la sessione. */
  suspend() {
    this._armed = false;
    clearTimeout(this._timer);
    this._timer = null;
  },

  resume() {
    this._armed = true;
    this.reset();
  },

  reset() {
    if (!this._armed) return;
    clearTimeout(this._timer);
    const min = this.getTimeoutMinutes();
    if (min <= 0) return;                       // disattivato
    this._timer = setTimeout(() => { this._onExpire?.(); }, min * 60000);
  }
};

export { Session };
