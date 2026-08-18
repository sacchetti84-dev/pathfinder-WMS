/* Le preferenze del riscontro, e le due famiglie di segnale.

   `scan` non e' un esito: e' il tono corto del lettore, e per questo ha il
   suono e la vibrazione ma non la finestra ne' il lampo. Le altre quattro
   fanno il giro intero. */
type Preferenze = { audio: boolean; vibration: boolean; flash: boolean; volume: number };
type Riscontro = 'ok' | 'info' | 'warn' | 'error';
type Suono = Riscontro | 'scan';

/* Safari fino alla 14 espone l'audio solo col prefisso, e su iPad il magazzino
   ci gira ancora. */
declare global {
  interface Window { webkitAudioContext?: typeof AudioContext }
}

const Feedback = {
  PREF_KEY: 'wm_feedback_prefs',

  DURATIONS: Object.freeze({ ok: 1500, info: 2400, warn: 4500, error: 6500 }),

  _prefs: { audio: true, vibration: true, flash: true, volume: 0.55 } as Preferenze,
  _ctx: null as AudioContext | null,
  _node: null as HTMLElement | null,
  /* `undefined` e non `null`: `clearTimeout` accetta l'uno e non l'altro,
     e i due punti che lo chiamano restano scritti come prima. */
  _timer: undefined as ReturnType<typeof setTimeout> | undefined,
  _outTimer: undefined as ReturnType<typeof setTimeout> | undefined,

  init() {
    try {
      const raw = localStorage.getItem(this.PREF_KEY);
      if (raw) {
        /* La chiave e' aperta: la scrive `setPref`, ma un dispositivo la
           puo' portare con dentro altro. I campi si rileggono a uno a uno,
           come si faceva prima. */
        const parsed = JSON.parse(raw) as Partial<Preferenze> | null;
        if (parsed && typeof parsed === 'object') {
          this._prefs.audio = parsed.audio !== false;
          this._prefs.vibration = parsed.vibration !== false;
          this._prefs.flash = parsed.flash !== false;
          const v = Number(parsed.volume);
          this._prefs.volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.55;
        }
      }
    } catch (err) {
      console.warn('Feedback: preferenze non leggibili, si usano i valori predefiniti', err);
    }
    /* I browser vietano la creazione di un AudioContext prima di un gesto
       dell'utente: lo si predispone al primo click o tasto premuto. */
    const unlock = () => this._ensureCtx();
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
  },

  getPrefs(): Preferenze { return { ...this._prefs }; },

  setPref(key: keyof Preferenze, value: unknown) {
    if (!(key in this._prefs)) return;
    if (key === 'volume') this._prefs.volume = Math.min(1, Math.max(0, Number(value) || 0));
    else this._prefs[key] = Boolean(value);
    try { localStorage.setItem(this.PREF_KEY, JSON.stringify(this._prefs)); }
    catch (err) { console.warn('Feedback: preferenze non salvabili', err); }
  },

  _ensureCtx(): AudioContext | null {
    if (this._ctx) { if (this._ctx.state === 'suspended') this._ctx.resume(); return this._ctx; }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      this._ctx = new Ctor();
    } catch (err) {
      console.warn('Feedback: audio non disponibile su questo dispositivo', err);
      this._ctx = null;
    }
    return this._ctx;
  },

  /* Singolo tono sintetizzato. offsetMs consente di comporre sequenze. */
  _tone(freq: number, offsetMs: number, durMs: number, type: OscillatorType = 'sine', peak = 0.22) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + offsetMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    const amp = peak * this._prefs.volume;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000 + 0.03);
  },

  /* Firme sonore distinte: l'operatore deve riconoscere l'esito
     SENZA guardare lo schermo. */
  sound(kind: Suono) {
    if (!this._prefs.audio) return;
    switch (kind) {
      case 'ok':      this._tone(1046, 0, 70, 'sine', 0.20); this._tone(1568, 65, 90, 'sine', 0.18); break;
      case 'warn':    this._tone(740, 0, 130, 'triangle', 0.24); this._tone(740, 190, 130, 'triangle', 0.24); break;
      case 'error':   this._tone(233, 0, 240, 'square', 0.16); this._tone(175, 250, 340, 'square', 0.16); break;
      case 'scan':    this._tone(1320, 0, 45, 'sine', 0.12); break;
      case 'info':
      default:        this._tone(880, 0, 80, 'sine', 0.16); break;
    }
  },

  vibrate(kind: Suono) {
    if (!this._prefs.vibration || !navigator.vibrate) return;
    const patterns = { ok: [35], info: [25], warn: [40, 70, 40], error: [90, 70, 90, 70, 160], scan: [15] };
    try { navigator.vibrate(patterns[kind] || patterns.info); } catch { /* non supportato */ }
  },

  flash(kind: Suono) {
    if (!this._prefs.flash) return;
    const el = document.getElementById('fbFlash');
    if (!el) return;
    const cls = kind === 'ok' ? 'on-ok' : kind === 'error' ? 'on-err' : kind === 'warn' ? 'on-warn' : null;
    if (!cls) return;
    el.classList.remove('on-ok', 'on-warn', 'on-err');
    void el.offsetWidth;   // forza il riavvio dell'animazione
    el.classList.add(cls);
  },

  /* Messaggio centrale. Non impila: un nuovo riscontro sostituisce il
     precedente, cosi' lo schermo resta pulito anche a raffica di scansioni. */
  popup(kind: Riscontro, title: string, detail = '', ms: number | null = null) {
    const host = document.getElementById('fbCenter');
    if (!host) return;
    const map = {
      ok:    { cls: 'fb-ok',   ico: '✓' },
      error: { cls: 'fb-err',  ico: '✕' },
      warn:  { cls: 'fb-warn', ico: '⚠' },
      info:  { cls: 'fb-info', ico: 'ℹ' }
    };
    const cfg = map[kind] || map.info;
    const dur = ms || this.DURATIONS[kind] || this.DURATIONS.info;

    clearTimeout(this._timer);
    clearTimeout(this._outTimer);
    host.textContent = '';

    const box = document.createElement('aside');
    box.className = `fb-popup ${cfg.cls}`;

    const ico = document.createElement('div');
    ico.className = 'fb-ico';
    ico.textContent = cfg.ico;

    const txt = document.createElement('div');
    txt.className = 'fb-txt';
    const h = document.createElement('div');
    h.className = 'fb-title';
    h.textContent = title;                      // textContent: nessuna iniezione HTML
    txt.appendChild(h);
    if (detail) {
      const d = document.createElement('div');
      d.className = 'fb-detail';
      d.textContent = detail;
      txt.appendChild(d);
    }

    const bar = document.createElement('div');
    bar.className = 'fb-bar';
    bar.style.width = '100%';
    bar.style.transition = `width ${dur}ms linear`;

    box.append(ico, txt, bar);
    host.appendChild(box);
    requestAnimationFrame(() => { bar.style.width = '0%'; });

    this._node = box;
    this._timer = setTimeout(() => {
      box.classList.add('fb-out');
      this._outTimer = setTimeout(() => { if (box.parentNode) box.remove(); }, 260);
    }, dur);
  },

  /* Punto d'ingresso unico: suono + vibrazione + flash + messaggio. */
  signal(kind: string, title: string, detail = '', ms: number | null = null) {
    /* `find` al posto di `includes`: stessa risposta, ma qui esce la parola
       e non un booleano, e le tre chiamate sotto sanno cosa ricevono. */
    const k = (['ok', 'error', 'warn', 'info'] as const).find(v => v === kind) ?? 'info';
    this.sound(k);
    this.vibrate(k);
    this.flash(k);
    this.popup(k, title, detail, ms);
  },

  clear() {
    clearTimeout(this._timer);
    clearTimeout(this._outTimer);
    const host = document.getElementById('fbCenter');
    if (host) host.textContent = '';
  }
};

export { Feedback };
