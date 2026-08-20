type Esito = string | null;

type Campo = string | null | undefined;

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
    SAFE_CHARS: /^[^<>"']*$/
  }),

  siteId(v: Campo): Esito {
    if (!v) return 'Codice sito obbligatorio';
    if (v.length < 2 || v.length > this.MAX.SITE_ID) return `Lunghezza 2-${this.MAX.SITE_ID} caratteri`;
    if (!this.RE.SITE_ID.test(v)) return 'Solo lettere maiuscole e numeri';
    return null;
  },
  siteName(v: Campo): Esito {
    if (!v || !v.trim()) return 'Nome obbligatorio';
    if (v.length > this.MAX.SITE_NAME) return `Max ${this.MAX.SITE_NAME} caratteri`;
    return null;
  },
  zoneId(v: Campo): Esito {
    if (!v) return 'Codice zona obbligatorio';
    if (v.length > this.MAX.ZONE_ID) return `Max ${this.MAX.ZONE_ID} caratteri`;
    if (!this.RE.ZONE_ID.test(v)) return 'Solo lettere maiuscole e numeri';
    return null;
  },
  article(v: Campo): Esito {
    if (!v) return 'Codice articolo obbligatorio';
    if (v.length > this.MAX.ARTICLE_CODE) return `Max ${this.MAX.ARTICLE_CODE} caratteri`;
    if (!this.RE.ARTICLE.test(v)) return 'Caratteri ammessi: A-Z 0-9 - _ . /';
    return null;
  },
  articleDesc(v: Campo, required = false): Esito {
    if (required && (!v || !v.trim())) return 'Descrizione obbligatoria';
    if (v && v.length > this.MAX.ARTICLE_DESC) return `Max ${this.MAX.ARTICLE_DESC} caratteri`;
    if (v && !this.RE.SAFE_TEXT.test(v)) return 'Caratteri non ammessi (<, >, ", \')';
    return null;
  },
  lot(v: Campo): Esito {
    if (!v) return 'Codice lotto obbligatorio';
    if (v.length > this.MAX.LOT_CODE) return `Max ${this.MAX.LOT_CODE} caratteri`;
    if (!this.RE.LOT.test(v)) return 'Caratteri ammessi: A-Z 0-9 - _ . /';
    return null;
  },
  location(v: Campo): Esito {
    if (!v) return 'Ubicazione obbligatoria';
    if (v.length > this.MAX.LOC_CODE) return `Max ${this.MAX.LOC_CODE} caratteri`;
    if (!this.RE.LOC.test(v)) return 'Formato non valido (es: MOP1-A-01-01-T)';
    return null;
  },
  notes(v: Campo): Esito {
    if (!v) return null;
    if (v.length > this.MAX.NOTES) return `Max ${this.MAX.NOTES} caratteri`;
    if (!this.RE.SAFE_TEXT.test(v)) return 'Caratteri non ammessi';
    return null;
  },
  reason(v: Campo): Esito {
    if (!v || !v.trim()) return 'Motivo obbligatorio';
    if (v.length > this.MAX.REASON) return `Max ${this.MAX.REASON} caratteri`;
    if (!this.RE.SAFE_CHARS.test(v)) return 'Caratteri non ammessi (<, >, ", \')';
    return null;
  },
  operator(v: Campo): Esito {
    if (!v || !v.trim()) return 'Operatore obbligatorio';
    if (v.length > this.MAX.OPERATOR) return `Max ${this.MAX.OPERATOR} caratteri`;
    return null;
  },
  refDept(v: Campo): Esito {
    if (!v || !v.trim()) return 'Reparto obbligatorio';
    if (v.length > this.MAX.REF_DEPT) return `Max ${this.MAX.REF_DEPT} caratteri`;
    return null;
  },
  /* 2.1 — LA CATEGORIA NON HA PIU' UNA FORMA.

     Era `^[A-Z]{1,5}$`: cinque lettere maiuscole, niente cifre, niente
     spazi. Ma la categoria e' un'etichetta merceologica che arriva
     dall'anagrafica di chi la scrive — «MP», «SEMILAV.», «Materie prime
     2026» — e una regola che rifiuta quello che il fornitore manda
     costringe a inventare un'abbreviazione, cioe' a perdere il dato vero.
     Resta il solo controllo che vale ovunque: i caratteri che romperebbero
     una pagina. */
  category(v: Campo): Esito {
    if (!v) return null;
    if (!this.RE.SAFE_CHARS.test(v)) return 'Categoria: non sono ammessi i caratteri < > " e apostrofo';
    return null;
  },

  clean(v: unknown, upper = false): string {
    if (v === null || v === undefined) return '';
    let s = String(v).trim().replace(/[\x00-\x1F\x7F]/g, '');
    if (upper) s = s.toUpperCase();
    return s;
  }
};

export { Validate };
