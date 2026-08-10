// ═══════════════════════════════════════════════════════════════════
// © Andrea Sacchetti — Dietopack S.r.l.
// modulo Feedback — v2.1.0
// Riscontro multisensoriale per operatori di magazzino: suono, vibrazione,
// flash perimetrale e messaggio al CENTRO dello schermo.
//
// Perche' al centro: dopo una scansione lo sguardo dell'operatore e' sul
// campo attivo o sul collo, non sull'angolo in alto a destra. Il riscontro
// d'angolo della v2.0.x veniva sistematicamente perso.
//
// Nessun file audio esterno: i toni sono sintetizzati con WebAudio, quindi
// l'applicazione resta un singolo file e funziona completamente offline.
// Nessun dato personale trattato: le preferenze salvate sono tre booleani
// e un livello di volume (GDPR — minimizzazione, art. 5.1.c Reg. UE 2016/679).
// ═══════════════════════════════════════════════════════════════════

const Feedback = {
  PREF_KEY: 'wm_feedback_prefs',

  /* Durate calibrate sul tipo di esito: l'errore deve restare a video
     abbastanza da essere letto, l'esito positivo deve sparire in fretta
     per non rallentare una sequenza di scansioni. */
  DURATIONS: Object.freeze({ ok: 1500, info: 2400, warn: 4500, error: 6500 }),

  _prefs: { audio: true, vibration: true, flash: true, volume: 0.55 },
  _ctx: null,
  _node: null,
  _timer: null,
  _outTimer: null,

  init() {
    try {
      const raw = localStorage.getItem(this.PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
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

  getPrefs() { return { ...this._prefs }; },

  setPref(key, value) {
    if (!(key in this._prefs)) return;
    this._prefs[key] = key === 'volume'
      ? Math.min(1, Math.max(0, Number(value) || 0))
      : Boolean(value);
    try { localStorage.setItem(this.PREF_KEY, JSON.stringify(this._prefs)); }
    catch (err) { console.warn('Feedback: preferenze non salvabili', err); }
  },

  _ensureCtx() {
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
  _tone(freq, offsetMs, durMs, type = 'sine', peak = 0.22) {
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
  sound(kind) {
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

  vibrate(kind) {
    if (!this._prefs.vibration || !navigator.vibrate) return;
    const patterns = { ok: [35], info: [25], warn: [40, 70, 40], error: [90, 70, 90, 70, 160], scan: [15] };
    try { navigator.vibrate(patterns[kind] || patterns.info); } catch { /* non supportato */ }
  },

  flash(kind) {
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
  popup(kind, title, detail = '', ms = null) {
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
  signal(kind, title, detail = '', ms = null) {
    const k = ['ok', 'error', 'warn', 'info'].includes(kind) ? kind : 'info';
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
