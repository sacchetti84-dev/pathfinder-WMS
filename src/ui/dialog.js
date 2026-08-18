import { Feedback } from './feedback.js';

const Dialog = {
  GUARD_MS: 900,          // finestra anti-ritorno-a-capo del lettore
  _resolve: null,
  _openedAt: 0,
  _guardMs: 0,
  _requireClick: false,
  _kind: 'confirm',
  _keyHandler: null,
  _guardTimer: null,
  _restoreFocus: null,

  get isOpen() {
    const o = document.getElementById('dlgOverlay');
    return Boolean(o && o.classList.contains('open'));
  },

  _overlay() { return document.getElementById('dlgOverlay'); },

  /* Costruisce e apre il dialogo. Ritorna una Promise risolta alla chiusura. */
  _open({ icon = 'ℹ', title, bodyNode, actions, danger = false, kind = 'confirm',
          guardMs = /** @type {number|null} */ (null), focusTarget = /** @type {string|null} */ (null) }) {
    const overlay = this._overlay();
    if (!overlay) return Promise.resolve(null);
    if (this.isOpen) this._finish(null);   // un dialogo per volta

    this._kind = kind;
    this._guardMs = guardMs === null ? this.GUARD_MS : guardMs;
    this._requireClick = danger;
    this._openedAt = Date.now();
    this._restoreFocus = document.activeElement && document.activeElement.id ? document.activeElement.id : null;

    overlay.textContent = '';
    const dlg = document.createElement('div');
    dlg.className = 'dlg' + (danger ? ' dlg-danger' : '');

    const head = document.createElement('header');
    head.className = 'dlg-head';
    const ic = document.createElement('span');
    ic.className = 'dlg-ico';
    ic.textContent = icon;
    const h2 = document.createElement('h2');
    h2.id = 'dlgTitle';
    h2.textContent = title;
    head.append(ic, h2);

    const body = document.createElement('div');
    body.className = 'dlg-body';
    if (bodyNode) body.appendChild(bodyNode);

    /* Indicatore visibile della finestra di guardia: l'operatore capisce
       perche' il primo Invio non ha effetto, invece di credere a un blocco. */
    const guard = document.createElement('div');
    guard.className = 'dlg-guard';
    guard.innerHTML = '';
    const guardTxt = document.createElement('span');
    guardTxt.textContent = danger
      ? 'Conferma solo con il pulsante — Invio disabilitato per sicurezza'
      : 'Protezione lettore barcode attiva…';
    const guardBar = document.createElement('div');
    guardBar.className = 'dlg-guard-bar';
    const guardFill = document.createElement('i');
    guardBar.appendChild(guardFill);
    guard.append(guardTxt, guardBar);

    const foot = document.createElement('footer');
    foot.className = 'dlg-actions';
    const btnNodes = [];
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = `btn ${a.cls || ''}`.trim();
      b.textContent = a.label;
      b.addEventListener('click', () => {
        if (typeof a.onClick === 'function') a.onClick();
        else this._finish(a.value);
      });
      foot.appendChild(b);
      btnNodes.push({ node: b, spec: a });
    }

    dlg.append(head, body, guard, foot);
    overlay.appendChild(dlg);
    overlay.classList.add('open');

    // Animazione della barra di guardia
    if (!danger && this._guardMs > 0) {
      guardFill.style.transition = `width ${this._guardMs}ms linear`;
      requestAnimationFrame(() => { guardFill.style.width = '100%'; });
      clearTimeout(this._guardTimer);
      this._guardTimer = setTimeout(() => { guardTxt.textContent = 'Pronto — Invio abilitato'; }, this._guardMs);
    } else if (danger) {
      guardFill.style.width = '100%';
      guardFill.style.background = 'var(--sx-danger)';
    }

    // Fuoco iniziale: fail-safe sui dialoghi critici
    const defaultBtn = btnNodes.find(b => b.spec.autofocus) ||
                       btnNodes.find(b => danger ? b.spec.value === false : b.spec.value !== false);
    setTimeout(() => {
      if (focusTarget && !danger) {
        const t = typeof focusTarget === 'string' ? document.getElementById(focusTarget) : focusTarget;
        if (t) { t.focus(); if (t.select) t.select(); return; }
      }
      defaultBtn?.node.focus();
    }, 30);

    this._keyHandler = (e) => this._onKey(e);
    document.addEventListener('keydown', this._keyHandler, true);
    Feedback.sound(danger ? 'warn' : 'info');

    return new Promise(res => { this._resolve = res; });
  },

  _onKey(e) {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      /* v2.5.0 — 'reason' annulla come 'qty': restituisce null, non false.
         Un false verrebbe letto come "confermato senza motivazione". */
      this._finish((this._kind === 'qty' || this._kind === 'reason') ? null : false);
      return;
    }
    if (e.key !== 'Enter') return;

    const elapsed = Date.now() - this._openedAt;
    // (1) finestra di guardia
    if (elapsed < this._guardMs) {
      e.preventDefault(); e.stopPropagation();
      Feedback.sound('warn');
      const g = this._overlay()?.querySelector('.dlg-guard span');
      if (g) g.textContent = 'Invio ignorato — probabile suffisso del lettore barcode';
      return;
    }
    // (2) conferme critiche: Invio non conferma mai
    if (this._requireClick) {
      e.preventDefault(); e.stopPropagation();
      Feedback.signal('warn', 'Conferma manuale richiesta',
        'Questa operazione richiede un click sul pulsante. Il tasto Invio è disabilitato.');
      return;
    }
    // (3) su un pulsante il comportamento nativo va bene
    if (document.activeElement?.tagName === 'BUTTON') return;
    e.preventDefault(); e.stopPropagation();
    if (this._kind === 'qty') this._submitQty();
    else if (this._kind === 'reason') this._submitReason(this._reasonMin);
    else this._finish(true);
  },

  _finish(value) {
    clearTimeout(this._guardTimer);
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler, true);
      this._keyHandler = null;
    }
    const overlay = this._overlay();
    if (overlay) { overlay.classList.remove('open'); overlay.textContent = ''; }
    const res = this._resolve;
    this._resolve = null;
    // Il fuoco torna al campo da cui si e' partiti: la scansione successiva
    // non finisce nel vuoto (causa nota di "scansioni perse" nella v2.0.x).
    const id = this._restoreFocus;
    this._restoreFocus = null;
    if (id) setTimeout(() => document.getElementById(id)?.focus(), 40);
    if (res) res(value);
  },

  _mkBody(message, extraNode = null) {
    const frag = document.createDocumentFragment();
    if (message) {
      const p = document.createElement('p');
      p.textContent = message;                // textContent: nessun HTML iniettabile
      frag.appendChild(p);
    }
    if (extraNode) frag.appendChild(extraNode);
    return frag;
  },

  /* Elenco chiave/valore opzionale, per i riepiloghi documento. E' il nodo che
     finisce in `details`, che porta un NODO e non del testo: senza
     l'annotazione TypeScript deduce `null` dal valore predefinito e rifiuta
     quel nodo a chi chiama. Le viste estratte in `.ts` sono il primo codice
     controllato che passa di qua. */
  kv(pairs) {
    const dl = document.createElement('dl');
    dl.className = 'dlg-kv';
    for (const [k, v] of pairs) {
      if (v === null || v === undefined || v === '') continue;
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = String(v);
      dl.append(dt, dd);
    }
    return dl;
  },

  /* Conferma booleana. danger:true -> Invio disabilitato, fuoco su Annulla. */
  confirm({ title, message = '', details = /** @type {Node|null} */ (null), confirmLabel = 'Conferma', cancelLabel = 'Annulla',
            danger = false, icon = /** @type {string|null} */ (null),
            guardMs = /** @type {number|null} */ (null), focusTarget = /** @type {string|null} */ (null) }) {
    return this._open({
      icon: icon || (danger ? '⚠' : '❓'),
      title,
      bodyNode: this._mkBody(message, details),
      danger,
      kind: 'confirm',
      guardMs,
      focusTarget,
      actions: [
        { label: cancelLabel, value: false, cls: '' },
        { label: confirmLabel, value: true, cls: danger ? 'btn-danger' : 'btn-accent' }
      ]
    });
  },

  alert({ title, message = '', details = /** @type {Node|null} */ (null), icon = 'ℹ', okLabel = 'Ho capito' }) {
    return this._open({
      icon, title,
      bodyNode: this._mkBody(message, details),
      kind: 'alert',
      actions: [{ label: okLabel, value: true, cls: 'btn-accent', autofocus: true }]
    });
  },

  reason({ title, message = '', details = /** @type {Node|null} */ (null), placeholder = 'Motivazione…',
           minLen = 5, icon = '\u270E', confirmLabel = 'Conferma', danger = false }) {
    const wrap = document.createElement('div');
    if (details) wrap.appendChild(details);

    const ta = document.createElement('textarea');
    ta.className = 'textarea';
    ta.id = 'dlgReasonInput';
    ta.placeholder = placeholder;
    ta.maxLength = 240;
    ta.rows = 3;
    ta.autocomplete = 'off';
    wrap.appendChild(ta);

    const hint = document.createElement('div');
    hint.className = 'dlg-guard';
    hint.style.margin = '0.5rem 0 0';
    hint.textContent = `Minimo ${minLen} caratteri — la motivazione viene registrata a log`;
    wrap.appendChild(hint);

    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      if (ta.value.trim().length >= minLen) this._submitReason(minLen);
    });
    ta.addEventListener('input', () => {
      const len = ta.value.trim().length;
      hint.textContent = len >= minLen
        ? `${len} caratteri — pronto`
        : `Ancora ${minLen - len} caratteri — la motivazione viene registrata a log`;
    });

    this._reasonMin = minLen;
    return this._open({
      icon, title,
      bodyNode: this._mkBody(message, wrap),
      kind: 'reason',
      danger,
      focusTarget: 'dlgReasonInput',
      actions: [
        { label: 'Annulla', value: null },
        { label: confirmLabel, cls: danger ? 'btn-danger' : 'btn-accent',
          onClick: () => this._submitReason(minLen) }
      ]
    });
  },

  _submitReason(minLen) {
    const ta = document.getElementById('dlgReasonInput');
    const txt = (ta?.value || '').trim();
    if (txt.length < minLen) {
      Feedback.signal('error', 'Motivazione troppo breve',
        `Servono almeno ${minLen} caratteri: questo testo finisce nel registro movimenti.`);
      ta?.focus();
      return;
    }
    this._finish(txt);
  },

  _reasonMin: 5,

  /* Selezione quantita' senza tastiera: +/- a pollice, valore preimpostato al
     massimo disponibile. Restituisce un intero o null se annullato. */
  qty({ title, message = '', details = /** @type {Node|null} */ (null), value = 1, min = 1, max = 9999, unit = 'Coll.' }) {
    const wrap = document.createElement('div');
    if (details) wrap.appendChild(details);

    const row = document.createElement('div');
    row.className = 'dlg-qty-row';

    const minus = document.createElement('button');
    minus.className = 'btn'; minus.type = 'button'; minus.textContent = '−';
    minus.setAttribute('aria-label', 'Diminuisci');

    const input = document.createElement('input');
    input.className = 'input input-mono dlg-qty';
    input.id = 'dlgQtyInput';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.value = String(value);
    input.setAttribute('aria-label', `Quantita' in ${unit}`);

    const plus = document.createElement('button');
    plus.className = 'btn'; plus.type = 'button'; plus.textContent = '+';
    plus.setAttribute('aria-label', 'Aumenta');

    const maxBtn = document.createElement('button');
    maxBtn.className = 'btn'; maxBtn.type = 'button';
    maxBtn.textContent = `Tutti (${max})`;
    maxBtn.style.minWidth = 'auto';
    maxBtn.style.fontSize = '0.85rem';

    const clamp = (v) => Math.min(max, Math.max(min, v));
    const setVal = (v) => { input.value = String(clamp(v)); Feedback.sound('scan'); };
    minus.addEventListener('click', () => setVal((parseInt(input.value, 10) || min) - 1));
    plus.addEventListener('click', () => setVal((parseInt(input.value, 10) || min) + 1));
    maxBtn.addEventListener('click', () => setVal(max));

    /* Se il lettore spara un codice dentro questo campo, i caratteri non
       numerici vengono scartati e l'operatore ne viene informato. */
    input.addEventListener('input', () => {
      const cleaned = input.value.replace(/\D+/g, '');
      if (cleaned !== input.value) {
        input.value = cleaned;
        Feedback.signal('warn', 'Scansione ignorata',
          'Il campo quantità accetta solo cifre. Confermare o annullare la quantità prima di scansionare.');
      }
      if (cleaned.length > 5) input.value = cleaned.slice(0, 5);
    });

    row.append(minus, input, plus, maxBtn);
    wrap.appendChild(row);

    const hint = document.createElement('div');
    hint.className = 'dlg-guard';
    hint.style.margin = '0.6rem 0 0';
    hint.textContent = `Minimo ${min} · Massimo ${max} ${unit}`;
    wrap.appendChild(hint);

    this._qtyBounds = { min, max };
    return this._open({
      icon: '\u{1F522}', title,
      bodyNode: this._mkBody(message, wrap),
      kind: 'qty',
      focusTarget: 'dlgQtyInput',
      actions: [
        { label: 'Annulla', value: null },
        { label: 'Conferma', cls: 'btn-accent', onClick: () => this._submitQty() }
      ]
    });
  },

  _submitQty() {
    const input = document.getElementById('dlgQtyInput');
    const { min, max } = this._qtyBounds || { min: 1, max: 9999 };
    const v = parseInt(input?.value, 10);
    if (!Number.isInteger(v) || v < min || v > max) {
      Feedback.signal('error', 'Quantità non valida', `Inserire un numero intero tra ${min} e ${max}.`);
      input?.focus(); input?.select();
      return;
    }
    this._finish(v);
  },

  _qtyBounds: null
};

export { Dialog };
