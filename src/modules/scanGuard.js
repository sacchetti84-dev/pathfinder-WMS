// ═══════════════════════════════════════════════════════════════════
// © Andrea Sacchetti — Dietopack S.r.l.
// modulo ScanGuard — v2.1.0
// Protezione dalla doppia scansione involontaria.
//
// Nella v2.0.2 due scansioni identiche ravvicinate in Posiziona sommavano
// silenziosamente la giacenza: l'operatore che non vedeva il riscontro
// d'angolo ripeteva la scansione e raddoppiava i colli. Qui ogni operazione
// registra una firma; una firma ripetuta entro la finestra richiede una
// conferma esplicita.
// ═══════════════════════════════════════════════════════════════════

const ScanGuard = {
  WINDOW_MS: 3000,
  _last: new Map(),

  /* Ritorna i millisecondi trascorsi se la stessa firma e' recente, altrimenti null. */
  check(signature) {
    const prev = this._last.get(signature);
    if (prev === undefined) return null;
    const elapsed = Date.now() - prev;
    return elapsed <= this.WINDOW_MS ? elapsed : null;
  },

  mark(signature) {
    this._last.set(signature, Date.now());
    // Pulizia opportunistica: la mappa non deve crescere per tutta la sessione
    if (this._last.size > 200) {
      const cutoff = Date.now() - this.WINDOW_MS;
      for (const [k, v] of this._last) if (v < cutoff) this._last.delete(k);
    }
  },

  clear(signature = null) {
    if (signature === null) this._last.clear();
    else this._last.delete(signature);
  }
};

export { ScanGuard };
