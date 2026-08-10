// ═══════════════════════════════════════════════════════════════════
// © Andrea Sacchetti — Dietopack S.r.l.
// modulo Tabs — Pathfinder Warehouse Mapper v2.8.0 [H6]
//
// UNA SOLA ISTANZA PUO' SCRIVERE.
//
// L'applicativo tiene una cache in memoria e la usa per rispondere a ogni
// lettura. Due schede aperte significano due cache che non si parlano: la
// seconda non vede le scritture della prima e continua a mostrare — e a
// usare per i propri calcoli — uno stato superato. Su un terminale di
// reparto, dove le finestre non si chiudono mai e qualcuno riapre il file
// "per sicurezza", e' una perdita di dati che non lascia traccia.
//
// La soluzione non e' sincronizzare le cache (sarebbe un piccolo sistema
// distribuito, con tutti i suoi modi di sbagliare): e' stabilire che a
// scrivere sia una sola istanza. Le altre restano utilizzabili in lettura,
// con una fascia che dice chiaramente cosa sta succedendo, e possono
// prendere il comando solo con un atto esplicito di chi le sta guardando.
//
// BroadcastChannel non e' un lock e non pretende di esserlo: e' un annuncio.
// Basta, perche' il caso da evitare non e' la corsa di due millisecondi, e'
// la finestra dimenticata aperta da ieri.
// ═══════════════════════════════════════════════════════════════════

const Tabs = {
  CHANNEL: 'wm-instances',
  _ch: null,
  _id: Math.random().toString(36).slice(2) + Date.now().toString(36),
  readOnly: false,
  _onChange: null,

  init(onChange) {
    if (typeof BroadcastChannel !== 'function') return;   // niente supporto: si prosegue come prima
    this._onChange = onChange;
    this._ch = new BroadcastChannel(this.CHANNEL);
    this._ch.onmessage = (e) => this._receive(e.data);
    /* Ci si annuncia e si aspetta un attimo: se qualcuno risponde "ci sono
       gia' io e sto scrivendo", questa istanza si mette in sola lettura. */
    this._post({ type: 'hello', id: this._id });
    window.addEventListener('pagehide', () => this._post({ type: 'bye', id: this._id }));
  },

  _post(msg) { try { this._ch?.postMessage(msg); } catch {} },

  _receive(msg) {
    if (!msg || msg.id === this._id) return;
    switch (msg.type) {
      case 'hello':
        /* Un nuovo arrivato: se comando io, glielo dico. */
        if (!this.readOnly) this._post({ type: 'iam-writer', id: this._id });
        break;
      case 'iam-writer':
        if (!this.readOnly) this._setReadOnly(true);
        break;
      case 'released':
        /* Chi scriveva ha ceduto o e' uscito: chi resta puo' riprendere. */
        if (this.readOnly) this._setReadOnly(false);
        break;
      case 'bye':
        if (this.readOnly) this._post({ type: 'hello', id: this._id });
        break;
    }
  },

  _setReadOnly(v) {
    this.readOnly = v;
    this._onChange?.(v);
  },

  /* Presa di comando esplicita: le altre istanze passano in sola lettura. */
  takeOver() {
    this._setReadOnly(false);
    this._post({ type: 'iam-writer', id: this._id });
  },

  release() {
    this._post({ type: 'released', id: this._id });
  }
};

export { Tabs };
