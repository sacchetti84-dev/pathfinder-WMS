// ═══════════════════════════════════════════════════════════════════
// VALIDATE 
// ═══════════════════════════════════════════════════════════════════

const Validate = {
  // Lunghezze massime (enforced ovunque)
  MAX: Object.freeze({
    SITE_ID: 4, SITE_NAME: 60, ZONE_ID: 6, ZONE_NAME: 60,
    ARTICLE_CODE: 30, ARTICLE_DESC: 120, LOT_CODE: 30,
    LOC_CODE: 40, NOTES: 200, REASON: 300, OPERATOR: 40, REF_DEPT: 40
  }),

  // Regex — caratteri accettati
  RE: Object.freeze({
    SITE_ID: /^[A-Z0-9]{2,4}$/,
    ZONE_ID: /^[A-Z0-9]{1,6}$/,
    ARTICLE: /^[A-Z0-9][A-Z0-9\-_./]{0,29}$/,
    LOT: /^[A-Z0-9][A-Z0-9\-_./]{0,29}$/i,
    LOC: /^[A-Z0-9]+(-[A-Z0-9]+)+$/,
    SAFE_TEXT: /^[^<>"']{0,200}$/,
    /* v2.0.1 [C5] — Variante senza vincolo di lunghezza, per i campi con MAX
       diverso da 200 (es. reason, che ammette 300 caratteri). Serve a impedire
       che <, >, " o ' finiscano nei payload degli attributi onclick. */
    SAFE_CHARS: /^[^<>"']*$/,
    CATEGORY: /^[A-Z]{1,5}$/
  }),

  siteId(v) {
    if (!v) return 'Codice sito obbligatorio';
    if (v.length < 2 || v.length > this.MAX.SITE_ID) return `Lunghezza 2-${this.MAX.SITE_ID} caratteri`;
    if (!this.RE.SITE_ID.test(v)) return 'Solo lettere maiuscole e numeri';
    return null;
  },
  siteName(v) {
    if (!v || !v.trim()) return 'Nome obbligatorio';
    if (v.length > this.MAX.SITE_NAME) return `Max ${this.MAX.SITE_NAME} caratteri`;
    return null;
  },
  zoneId(v) {
    if (!v) return 'Codice zona obbligatorio';
    if (v.length > this.MAX.ZONE_ID) return `Max ${this.MAX.ZONE_ID} caratteri`;
    if (!this.RE.ZONE_ID.test(v)) return 'Solo lettere maiuscole e numeri';
    return null;
  },
  article(v) {
    if (!v) return 'Codice articolo obbligatorio';
    if (v.length > this.MAX.ARTICLE_CODE) return `Max ${this.MAX.ARTICLE_CODE} caratteri`;
    if (!this.RE.ARTICLE.test(v)) return 'Caratteri ammessi: A-Z 0-9 - _ . /';
    return null;
  },
  articleDesc(v, required = false) {
    if (required && (!v || !v.trim())) return 'Descrizione obbligatoria';
    if (v && v.length > this.MAX.ARTICLE_DESC) return `Max ${this.MAX.ARTICLE_DESC} caratteri`;
    if (v && !this.RE.SAFE_TEXT.test(v)) return 'Caratteri non ammessi (<, >, ", \')';
    return null;
  },
  lot(v) {
    if (!v) return 'Codice lotto obbligatorio';
    if (v.length > this.MAX.LOT_CODE) return `Max ${this.MAX.LOT_CODE} caratteri`;
    if (!this.RE.LOT.test(v)) return 'Caratteri ammessi: A-Z 0-9 - _ . /';
    return null;
  },
  location(v) {
    if (!v) return 'Ubicazione obbligatoria';
    if (v.length > this.MAX.LOC_CODE) return `Max ${this.MAX.LOC_CODE} caratteri`;
    if (!this.RE.LOC.test(v)) return 'Formato non valido (es: MOP1-A-01-01-T)';
    return null;
  },
  notes(v) {
    if (!v) return null;
    if (v.length > this.MAX.NOTES) return `Max ${this.MAX.NOTES} caratteri`;
    if (!this.RE.SAFE_TEXT.test(v)) return 'Caratteri non ammessi';
    return null;
  },
  reason(v) {
    if (!v || !v.trim()) return 'Motivo obbligatorio';
    if (v.length > this.MAX.REASON) return `Max ${this.MAX.REASON} caratteri`;
    // v2.0.1 [C5] — Era l'UNICO campo testuale libero privo di controllo caratteri.
    // Il motivo della quarantena confluisce in item.notes ('QUARANTENA: ' + reason)
    // e da lì nei payload JSON degli attributi onclick: un apostrofo rompeva l'handler.
    if (!this.RE.SAFE_CHARS.test(v)) return 'Caratteri non ammessi (<, >, ", \')';
    return null;
  },
  operator(v) {
    if (!v || !v.trim()) return 'Operatore obbligatorio';
    if (v.length > this.MAX.OPERATOR) return `Max ${this.MAX.OPERATOR} caratteri`;
    return null;
  },
  refDept(v) {
    if (!v || !v.trim()) return 'Reparto obbligatorio';
    if (v.length > this.MAX.REF_DEPT) return `Max ${this.MAX.REF_DEPT} caratteri`;
    return null;
  },
  category(v) {
    if (!v) return null;
    if (!this.RE.CATEGORY.test(v)) return 'Categoria: 1-5 lettere maiuscole';
    return null;
  },

  /* Sanitize: rimuove caratteri pericolosi e normalizza */
  clean(v, upper = false) {
    if (v === null || v === undefined) return '';
    let s = String(v).trim().replace(/[\x00-\x1F\x7F]/g, '');
    if (upper) s = s.toUpperCase();
    return s;
  }
};

export { Validate };
