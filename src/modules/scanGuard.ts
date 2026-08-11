const ScanGuard = {
  WINDOW_MS: 3000,

  _last: new Map<string, number>(),

  /* Ritorna i millisecondi trascorsi se la stessa firma e' recente, altrimenti null. */
  check(signature: string): number | null {
    const prev = this._last.get(signature);
    if (prev === undefined) return null;
    const elapsed = Date.now() - prev;
    return elapsed <= this.WINDOW_MS ? elapsed : null;
  },

  mark(signature: string): void {
    this._last.set(signature, Date.now());
    // Pulizia opportunistica: la mappa non deve crescere per tutta la sessione
    if (this._last.size > 200) {
      const cutoff = Date.now() - this.WINDOW_MS;
      for (const [k, v] of this._last) if (v < cutoff) this._last.delete(k);
    }
  },

  clear(signature: string | null = null): void {
    if (signature === null) this._last.clear();
    else this._last.delete(signature);
  }
};

export { ScanGuard };
