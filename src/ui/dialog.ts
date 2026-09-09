import { Feedback } from './feedback';
import { ico, type Icona } from './icone';

/* QUEL CHE UN DIALOGO PUO' RESTITUIRE, E CHI GLIELO CHIEDE.

   Quattro generi, quattro risposte: `confirm` da' un booleano, `reason` il
   testo, `qty` l'intero, e chiunque annulli da' `null`. La promessa e'
   generica sul solo valore di ritorno — le azioni restano su `Esito`, perche'
   il fuoco iniziale cerca fra loro il pulsante che vale `false` e un tipo
   stretto renderebbe quel confronto impossibile da scrivere. */
type Esito = string | number | boolean | null;
type Genere = 'confirm' | 'alert' | 'reason' | 'qty' | 'testo';

type Azione = {
  label: string;
  value?: Esito;
  cls?: string;
  autofocus?: boolean;
  onClick?: () => void;
};

type Apertura = {
  icon?: Icona;
  title: string;
  bodyNode?: Node | null;
  actions: Azione[];
  danger?: boolean;
  kind?: Genere;
  guardMs?: number | null;
  focusTarget?: string | null;
};

const Dialog = {
  GUARD_MS: 900,          // finestra anti-ritorno-a-capo del lettore
  _resolve: null as ((v: Esito | undefined) => void) | null,
  _openedAt: 0,
  _guardMs: 0,
  _requireClick: false,
  _kind: 'confirm' as Genere,
  _keyHandler: null as ((e: KeyboardEvent) => void) | null,
  /* `undefined` e non `null`, che `clearTimeout` non accetta. */
  _guardTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  _restoreFocus: null as string | null,

  get isOpen() {
    const o = document.getElementById('dlgOverlay');
    return Boolean(o && o.classList.contains('open'));
  },

  /* ═══════════════════════════════════════════════════════════════════
     2.9 — L'OSPITE MANCANTE NON PUO' ESSERE UN SILENZIO
     © Andrea Sacchetti — Dietopack S.r.l.

     `#dlgOverlay` è un div vuoto dichiarato in `index.html`: è il pavimento
     su cui ogni finestra di dialogo si monta. Fino alla 2.8, se non c'era,
     `_open` usciva con `Promise.resolve(null)` — e `null` è la stessa
     risposta che dà chi preme «Annulla».

     COSA VOLEVA DIRE, e vale la pena scriverlo per intero perché è il
     difetto più difficile da diagnosticare che questo applicativo abbia
     avuto. Ogni conferma del magazzino si comportava come un annullamento:
     `_routeConfirmStop` legge `if (qty === null) return`, e tornava indietro
     in silenzio. Nessun errore in consolle, nessun messaggio a video,
     nessuna traccia nel registro. Da fuori: un tasto che non fa niente. E
     non riguardava una maschera — riguardava TUTTE, perché tutte passano da
     qui: prelievo, conta, smaltimento, quarantena, spedizione.

     Trovato il 27/08 al banco, e trovato per caso: un giro di pulizia del
     DOM aveva cancellato quel div dalla pagina viva. Che sia stato un
     ripulitore, un `index.html` sbagliato in una build o un'estensione del
     browser, il risultato per chi lavora è lo stesso.

     DUE COSE INSIEME, e nessuna delle due basta da sola:

     ① SI RICOSTRUISCE. Il div è vuoto e inerte — non porta stato, non porta
        contenuto, e il CSS lo aggancia per `id`: ricrearlo lo rimette
        esattamente com'era. Rifiutarsi di lavorare sarebbe la scelta giusta
        se il dubbio fosse sui DATI — «meglio fermo che vivo e sbagliato»,
        §6 — ma qui non c'è nessun dubbio sui dati: c'è un contenitore vuoto
        che manca, e fermare un magazzino per un div è sproporzionato.
     ② SI URLA. La ricostruzione ripara il sintomo e nasconderebbe la causa,
        e una causa nascosta torna. `console.error` una volta sola per
        sessione: chi apre gli strumenti la trova, e chi non li apre lavora
        lo stesso.

     UNA VOLTA SOLA, non a ogni dialogo: un magazzino ne apre centinaia in un
     turno, e trecento righe uguali in consolle sono rumore che si impara a
     saltare — cioè di nuovo un silenzio. */
  _ospiteRicostruito: false,

  _overlay(): HTMLElement {
    const gia = document.getElementById('dlgOverlay');
    if (gia) return gia;

    if (!this._ospiteRicostruito) {
      this._ospiteRicostruito = true;
      console.error(
        '[WM] Dialog: #dlgOverlay non c\u2019era nel documento ed è stato ricostruito. '
        + 'Finché mancava, OGNI conferma dell\u2019applicativo si comportava come un annullamento, '
        + 'senza dirlo. Va capito chi lo ha tolto: index.html, un ripulitore del DOM, un\u2019estensione.');
    }

    /* Gli stessi attributi di `index.html`: il lettore di schermo deve
       trovare quel che troverebbe se il div non fosse mai mancato. */
    const nuovo = document.createElement('div');
    nuovo.id = 'dlgOverlay';
    nuovo.setAttribute('role', 'dialog');
    nuovo.setAttribute('aria-modal', 'true');
    nuovo.setAttribute('aria-labelledby', 'dlgTitle');
    document.body.appendChild(nuovo);
    return nuovo;
  },

  /* Costruisce e apre il dialogo. Ritorna una Promise risolta alla chiusura. */
  _open<T extends Esito>({ icon = 'info-circle', title, bodyNode, actions, danger = false, kind = 'confirm',
          guardMs = null, focusTarget = null }: Apertura): Promise<T | null> {
    const overlay = this._overlay();
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
    /* 2.23 — L'ICONA E' MARKUP, IL TESTO NO. Il titolo resta su
       `textContent` perche' puo' portare un codice arrivato da un campo; il
       nome dell'icona invece e' un `Icona`, cioe' una delle ottanta scritte
       nel vocabolario, e non c'e' niente da iniettare. */
    ic.innerHTML = ico(icon);
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
    const btnNodes: { node: HTMLButtonElement; spec: Azione }[] = [];
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
        const t = document.getElementById(focusTarget);
        /* I due campi che arrivano qui sono un `textarea` e un `input`: solo
           loro sanno selezionare il proprio contenuto. */
        if (t) {
          t.focus();
          if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) t.select();
          return;
        }
      }
      defaultBtn?.node.focus();
    }, 30);

    this._keyHandler = (e) => this._onKey(e);
    document.addEventListener('keydown', this._keyHandler, true);
    Feedback.sound(danger ? 'warn' : 'info');

    /* La promessa porta il tipo di chi ha aperto il dialogo, il campo no:
       ne vive uno per volta ed e' l'apertura a sapere cosa aspetta. */
    return new Promise<T | null>(res => { this._resolve = res as (v: Esito | undefined) => void; });
  },

  _onKey(e: KeyboardEvent) {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      /* v2.5.0 — 'reason' annulla come 'qty': restituisce null, non false.
         Un false verrebbe letto come "confermato senza motivazione". */
      this._finish((this._kind === 'qty' || this._kind === 'reason' || this._kind === 'testo') ? null : false);
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
    else if (this._kind === 'testo') this._submitTesto();
    else this._finish(true);
  },

  _finish(value: Esito | undefined) {
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

  _mkBody(message: string, extraNode: Node | null = null): DocumentFragment {
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
  kv(pairs: Iterable<readonly [string, unknown]>): HTMLDListElement {
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
  confirm({ title, message = '', details = null, confirmLabel = 'Conferma', cancelLabel = 'Annulla',
            danger = false, icon = null,
            guardMs = null, focusTarget = null }: {
    title: string; message?: string; details?: Node | null; confirmLabel?: string; cancelLabel?: string;
    danger?: boolean; icon?: Icona | null; guardMs?: number | null; focusTarget?: string | null;
  }): Promise<boolean | null> {
    return this._open<boolean>({
      icon: icon || (danger ? 'alert-triangle' : 'help'),
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

  /* 2.38 — SCEGLIERE FRA PIÙ COSE, NON FRA SÌ E NO.

     `confirm` ha due pulsanti e uno dei due è l'uscita: usarlo per «prepari
     o carichi?» vorrebbe dire che uno dei due lavori sta dove il magazzino
     ha imparato che c'è «Annulla». Chi tira dritto sul lettore ne avvierebbe
     uno per abitudine.

     Qui i pulsanti sono quelli che si passano, e l'uscita resta l'uscita:
     chiudere la finestra dà `null`, e `null` non è nessuna delle scelte. */
  scelta<T extends string>({ title, message = '', details = null, opzioni, icon = 'help', cancelLabel = 'Annulla' }: {
    title: string; message?: string; details?: Node | null;
    opzioni: { label: string; value: T; danger?: boolean }[];
    icon?: Icona | null; cancelLabel?: string;
  }): Promise<T | null> {
    return this._open<T>({
      icon: icon || 'help',
      title,
      bodyNode: this._mkBody(message, details),
      kind: 'confirm',
      actions: [
        { label: cancelLabel, value: false, cls: '' },
        ...opzioni.map((o, i) => ({
          label: o.label, value: o.value,
          cls: o.danger ? 'btn-danger' : i === 0 ? 'btn-accent' : '',
        })),
      ],
      /* IL FUOCO NON STA SUL PRIMO. `_open` lo mette sul pulsante che vale
         `false`, cioè sull'uscita: una finestra che chiede quale lavoro si
         sta facendo non deve poterne avviare uno con un a-capo del
         lettore. */
    }).then((v) => (typeof v === 'string' ? (v as T) : null));
  },

  alert({ title, message = '', details = null, icon = 'info-circle', okLabel = 'Ho capito' }: {
    title: string; message?: string; details?: Node | null; icon?: Icona; okLabel?: string;
  }): Promise<boolean | null> {
    return this._open<boolean>({
      icon, title,
      bodyNode: this._mkBody(message, details),
      kind: 'alert',
      actions: [{ label: okLabel, value: true, cls: 'btn-accent', autofocus: true }]
    });
  },

  reason({ title, message = '', details = null, placeholder = 'Motivazione…',
           minLen = 5, icon = 'pencil', confirmLabel = 'Conferma', danger = false }: {
    title: string; message?: string; details?: Node | null; placeholder?: string;
    minLen?: number; icon?: Icona; confirmLabel?: string; danger?: boolean;
  }): Promise<string | null> {
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
    return this._open<string>({
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

  /* 2.21 — UNA RIGA SOLA, E NON È `reason`. Un numero di DDT non è una
     motivazione: non finisce a log, non ha un minimo di cinque caratteri e
     non sta su tre righe di textarea. `reason` glielo direbbe a video, e
     chi legge un avviso che non lo riguarda smette di leggere gli avvisi.

     Il lettore barcode ci spara dentro come in ogni campo di Pathfinder, e
     INVIO conferma: è il gesto che l'operatore fa già dappertutto. */
  testo({ title, message = '', details = null, placeholder = '', valore = '',
          maiuscolo = false, minLen = 1, icon = 'pencil', confirmLabel = 'Conferma',
          nota = '' }: {
    title: string; message?: string; details?: Node | null; placeholder?: string;
    valore?: string; maiuscolo?: boolean; minLen?: number; icon?: Icona;
    confirmLabel?: string; nota?: string;
  }): Promise<string | null> {
    const wrap = document.createElement('div');
    if (details) wrap.appendChild(details);

    const input = document.createElement('input');
    input.className = maiuscolo ? 'input input-mono uppercase' : 'input input-mono';
    input.id = 'dlgTestoInput';
    input.type = 'text';
    input.maxLength = 60;
    input.autocomplete = 'off';
    input.placeholder = placeholder;
    input.value = valore;
    if (maiuscolo) input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
    wrap.appendChild(input);

    if (nota) {
      const hint = document.createElement('div');
      hint.className = 'dlg-guard';
      hint.style.margin = '0.5rem 0 0';
      hint.textContent = nota;
      wrap.appendChild(hint);
    }

    this._testoMin = minLen;
    return this._open<string>({
      icon, title,
      bodyNode: this._mkBody(message, wrap),
      kind: 'testo',
      focusTarget: 'dlgTestoInput',
      actions: [
        { label: 'Annulla', value: null },
        { label: confirmLabel, cls: 'btn-accent', onClick: () => this._submitTesto() }
      ]
    });
  },

  _testoMin: 1,

  _submitTesto() {
    const input = document.getElementById('dlgTestoInput') as HTMLInputElement | null;
    const txt = (input?.value || '').trim();
    if (txt.length < this._testoMin) {
      Feedback.signal('error', 'Manca il dato',
        `Servono almeno ${this._testoMin} ${this._testoMin === 1 ? 'carattere' : 'caratteri'}.`);
      input?.focus();
      return;
    }
    this._finish(txt);
  },

  _submitReason(minLen: number) {
    const ta = document.getElementById('dlgReasonInput') as HTMLTextAreaElement | null;
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
  qty({ title, message = '', details = null, value = 1, min = 1, max = 9999, unit = 'Coll.' }: {
    title: string; message?: string; details?: Node | null;
    value?: number; min?: number; max?: number; unit?: string;
  }): Promise<number | null> {
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

    const clamp = (v: number) => Math.min(max, Math.max(min, v));
    const setVal = (v: number) => { input.value = String(clamp(v)); Feedback.sound('scan'); };
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
    return this._open<number>({
      icon: 'list-numbers', title,
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
    const input = document.getElementById('dlgQtyInput') as HTMLInputElement | null;
    const { min, max } = this._qtyBounds || { min: 1, max: 9999 };
    const v = parseInt(input?.value ?? '', 10);
    if (!Number.isInteger(v) || v < min || v > max) {
      Feedback.signal('error', 'Quantità non valida', `Inserire un numero intero tra ${min} e ${max}.`);
      input?.focus(); input?.select();
      return;
    }
    this._finish(v);
  },

  _qtyBounds: null as { min: number; max: number } | null
};

export { Dialog };
