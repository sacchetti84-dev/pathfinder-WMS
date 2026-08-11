const Session = {
  KEY: 'wm_session_timeout_min',
  DEFAULT_MIN: 10,
  MIN_MIN: 1,
  MAX_MIN: 120,

  _timer: null as ReturnType<typeof setTimeout> | null,
  _minutes: null as number | null,
  _onExpire: null as (() => void | Promise<void>) | null,
  _armed: false,

  getTimeoutMinutes(): number {
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

  setTimeoutMinutes(min: string | number): number {
    const n = parseInt(min as string, 10);
    const v = !Number.isFinite(n) || n === 0 ? 0 : Math.min(this.MAX_MIN, Math.max(this.MIN_MIN, n));
    this._minutes = v;
    try { localStorage.setItem(this.KEY, String(v)); } catch {}
    this.reset();
    return v;
  },

  /* onExpire e' asincrona: deve poter salvare prima di bloccare. */
  init(onExpire: () => void | Promise<void>): void {
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
  suspend(): void {
    this._armed = false;
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
  },

  resume(): void {
    this._armed = true;
    this.reset();
  },

  reset(): void {
    if (!this._armed) return;
    if (this._timer !== null) clearTimeout(this._timer);
    const min = this.getTimeoutMinutes();
    if (min <= 0) return;                       // disattivato
    this._timer = setTimeout(() => { this._onExpire?.(); }, min * 60000);
  }
};

export { Session };
