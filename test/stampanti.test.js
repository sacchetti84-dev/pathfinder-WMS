/* LE STAMPANTI DI ETICHETTE, DALLA PARTE DEL CLIENT — 2.19.

   Il conto dei millimetri è scritto due volte: qui e in
   `server/lib/zpl.js`, che è quello che comanda — il servizio RIFIUTA un
   layout più alto del supporto, e la sua parola è l'ultima. La copia del
   client serve a far vedere i millimetri mentre si sposta un cursore, invece
   di scoprirli in corsia.

   DUE COPIE CHE POSSONO DIVERGERE IN SILENZIO SONO DUE VERITÀ. Questa prova
   è la rete: importa il modulo del SERVIZIO — CommonJS, ma sotto Vitest si
   carica lo stesso — e confronta i due conti sullo stesso layout. Il giorno
   che qualcuno cambia un margine di là e non di qua, questa riga diventa
   rossa; senza, la scheda di configurazione direbbe «ci sta» su un'etichetta
   che il servizio rifiuta.

   Il resto sono le regole che il client applica da solo: la proposta della
   stampante, la convalida che accompagna chi compila, il tetto alle copie. */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  disponi, leggiLayout, leggiRiga, validaStampante, proponiStampante,
  nuovoIdStampante, leggiCopie, stampanteDiSerie,
  LAYOUT_DI_SERIE, CAMPI_ETICHETTA, COPIE_MAX,
  MARGINE_MM, INTERLINEA_MM, INTERPRETAZIONE_MM,
} from '../src/modules/stampanti';

const zpl = createRequire(import.meta.url)('../server/lib/zpl.js');

const STAMPANTE = {
  printer_id: 'STP-1', nome: 'Spedizioni', host: '10.0.1.50', porta: 9100,
  dpi: 203, larghezza_mm: 100, altezza_mm: 80, site_id: 'MAG1', attiva: true,
};

describe('il conto dei millimetri è lo stesso del servizio', () => {
  /* Le tre misure che decidono dove finisce ogni riga. Se una diverge, tutto
     il resto diverge dietro, e questa è la prova che lo dice per prima. */
  it('le tre costanti sono le stesse di là', () => {
    expect(MARGINE_MM).toBe(zpl.MARGINE_MM);
    expect(INTERLINEA_MM).toBe(zpl.INTERLINEA_MM);
    expect(INTERPRETAZIONE_MM).toBe(zpl.INTERPRETAZIONE_MM);
  });

  it('il layout di serie occupa gli stessi millimetri', () => {
    const qui = disponi(null, 80);
    const la = zpl.disponi(null, 80);
    expect(qui.usato_mm).toBe(la.usato_mm);
    expect(qui.ci_sta).toBe(la.ci_sta);
    expect(qui.blocchi.map((b) => b.campo)).toEqual(la.blocchi.map((b) => b.campo));
  });

  it('ogni riga finisce alla stessa altezza', () => {
    const qui = disponi(null, 80).blocchi;
    const la = zpl.disponi(null, 80).blocchi;
    expect(qui.map((b) => [b.campo, b.y_mm, b.alta_mm]))
      .toEqual(la.map((b) => [b.campo, b.y_mm, b.alta_mm]));
  });

  /* Non solo il layout di serie: anche uno storto, e uno che non ci sta.
     Un accordo su un caso solo non è un accordo. */
  it('i due conti restano d’accordo anche su un layout smontato', () => {
    const strano = {
      righe: [
        { campo: 'barcode', attivo: true, altezza_mm: 22, allineamento: 'C', righe_testo: 1 },
        { campo: 'descrizione', attivo: true, altezza_mm: 5, allineamento: 'R', righe_testo: 3 },
        { campo: 'ubicazione', attivo: true, altezza_mm: 2.5, allineamento: 'L', righe_testo: 1 },
        { campo: 'colli', attivo: false, altezza_mm: 9, allineamento: 'L', righe_testo: 1 },
      ],
    };
    for (const altezza of [30, 45, 60, 80, 100]) {
      expect(disponi(strano, altezza).usato_mm).toBe(zpl.disponi(strano, altezza).usato_mm);
      expect(disponi(strano, altezza).ci_sta).toBe(zpl.disponi(strano, altezza).ci_sta);
    }
  });

  /* Il numero che la scheda di configurazione mostra a chi sposta un cursore.
     Se cambia qui e non di la', l'operatore legge «ci sta» su un'etichetta
     che il servizio rifiuta — ed e' il difetto che questa batteria esiste per
     impedire. */
  it('sul supporto vero i due conti danno lo stesso verdetto', () => {
    expect(disponi(null, 80).usato_mm).toBe(68.5);
    expect(zpl.disponi(null, 80).usato_mm).toBe(68.5);
    expect(disponi(null, 80).ci_sta).toBe(true);
    /* Sui 60 mm dell'etichetta A4 non ci sta, e i due sono d'accordo pure su
       questo: i due formati sono diversi di proposito. */
    expect(disponi(null, 60).ci_sta).toBe(false);
    expect(zpl.disponi(null, 60).ci_sta).toBe(false);
  });

  it('i campi che il client offre sono quelli che il servizio sa leggere', () => {
    expect(CAMPI_ETICHETTA.map((c) => c.campo).sort())
      .toEqual([...zpl.CAMPI_AMMESSI].sort());
  });
});

describe('come si legge un layout', () => {
  it('il layout di serie porta barre, descrizione, scadenza e peso', () => {
    const accesi = LAYOUT_DI_SERIE.righe.filter((r) => r.attivo).map((r) => r.campo);
    for (const c of ['barcode', 'descrizione', 'scadenza', 'peso']) {
      expect(accesi).toContain(c);
    }
  });

  /* §8: l'ubicazione invecchia — un pallet si sposta e quel che è stampato
     resta a dire una cosa che non è più vera. Nasce spenta, e chi l'accende
     legge nella scheda perché. */
  it('l’ubicazione nasce spenta', () => {
    expect(LAYOUT_DI_SERIE.righe.find((r) => r.campo === 'ubicazione').attivo).toBe(false);
    expect(CAMPI_ETICHETTA.find((c) => c.campo === 'ubicazione').invecchia).toBe(true);
  });

  it('un campo che il servizio non conosce si scarta invece di rompere', () => {
    expect(leggiRiga({ campo: 'inventato', attivo: true, altezza_mm: 5 })).toBeNull();
    expect(leggiLayout({ righe: [{ campo: 'inventato' }] }).righe.length)
      .toBe(LAYOUT_DI_SERIE.righe.length);
  });

  /* Un layout salvato da una versione precedente non deve far mancare le
     chiavi aggiunte dopo: è la stessa regola di `getDocConfig`. */
  it('una riga a metà si completa coi valori di serie', () => {
    const r = leggiRiga({ campo: 'lotto' });
    expect(r).toMatchObject({ campo: 'lotto', attivo: true, allineamento: 'L', righe_testo: 1 });
    expect(r.altezza_mm).toBeGreaterThan(0);
  });

  it('nessun layout salvato non è un errore: si ripiega su quello di serie', () => {
    expect(leggiLayout(null).righe.map((r) => r.campo))
      .toEqual(LAYOUT_DI_SERIE.righe.map((r) => r.campo));
  });
});

describe('la convalida di una stampante', () => {
  it('una stampante buona non ha rilievi', () => {
    expect(validaStampante(STAMPANTE, [STAMPANTE])).toEqual([]);
  });

  it('senza nome non si salva: è quello che si sceglie in corsia', () => {
    expect(validaStampante({ ...STAMPANTE, nome: '' })).toContainEqual(expect.stringContaining('nome'));
  });

  it('senza indirizzo non si salva', () => {
    expect(validaStampante({ ...STAMPANTE, host: '' }).length).toBe(1);
  });

  /* Il cancello vero è quello del servizio — `meta` la scrive chiunque abbia
     una sessione, non solo questa maschera. Qui si accompagna chi compila. */
  it('una porta che non è di stampa si rifiuta', () => {
    expect(validaStampante({ ...STAMPANTE, porta: 5432 }).length).toBe(1);
  });

  it('un dpi inventato si rifiuta', () => {
    expect(validaStampante({ ...STAMPANTE, dpi: 250 }).length).toBe(1);
  });

  it('un supporto fuori misura si rifiuta', () => {
    expect(validaStampante({ ...STAMPANTE, altezza_mm: 900 }).length).toBe(1);
    expect(validaStampante({ ...STAMPANTE, larghezza_mm: 2 }).length).toBe(1);
  });

  /* Due stampanti con lo stesso nome sono due stampanti che in corsia si
     scelgono a caso. */
  it('due stampanti non possono chiamarsi allo stesso modo', () => {
    const altra = { ...STAMPANTE, printer_id: 'STP-2' };
    expect(validaStampante(altra, [STAMPANTE, altra]))
      .toContainEqual(expect.stringContaining('già una stampante'));
  });

  /* Le misure sono quelle del supporto VERO — adesive staccate 100 × 80 su
     testina a 203 dpi, la serie ZD200 del magazzino. NON sono quelle
     dell'etichetta su A4 (100 × 60, `.item-label`): quella è un ripiego su
     foglio e non deve imitare il rotolo. Le due strade portano lo stesso
     codice a barre, non lo stesso formato. */
  it('la stampante di serie ha le misure del supporto vero', () => {
    expect(stampanteDiSerie()).toMatchObject({ larghezza_mm: 100, altezza_mm: 80, porta: 9100, dpi: 203 });
  });

  /* Una chiave non si riusa mai: un'etichetta stampata da `STP-3` deve
     restare rintracciabile nel registro anche dopo che quella stampante è
     stata tolta. */
  it('un identificativo nuovo non collide con quelli in elenco', () => {
    const elenco = [{ ...STAMPANTE, printer_id: 'STP-1' }, { ...STAMPANTE, printer_id: 'STP-2' }];
    expect(nuovoIdStampante(elenco)).toBe('STP-3');
    expect(nuovoIdStampante([...elenco, { ...STAMPANTE, printer_id: 'STP-3' }])).toBe('STP-4');
  });
});

describe('quale stampante si propone', () => {
  const mag1 = { ...STAMPANTE, printer_id: 'STP-1', nome: 'MAG1', site_id: 'MAG1' };
  const mag2 = { ...STAMPANTE, printer_id: 'STP-2', nome: 'MAG2', site_id: 'MAG2' };

  it('quella che si è scelta l’ultima volta viene prima di tutto', () => {
    expect(proponiStampante([mag1, mag2], { ricordata: 'STP-2', siteId: 'MAG1' }))
      .toBe(mag2);
  });

  /* La stampante di MAG1 è quella vicina a MAG1: proporre quella di MAG2 vuol
     dire un operatore che attraversa il magazzino per un pezzo di carta. */
  it('senza un ricordo si propone quella del sito', () => {
    expect(proponiStampante([mag1, mag2], { siteId: 'MAG2' })).toBe(mag2);
  });

  it('con una stampante sola non c’è niente da chiedere', () => {
    expect(proponiStampante([mag1], {})).toBe(mag1);
  });

  it('con due e nessun indizio non si indovina', () => {
    expect(proponiStampante([mag1, mag2], {})).toBeNull();
  });

  it('una stampante disattivata non si propone mai', () => {
    expect(proponiStampante([{ ...mag1, attiva: false }], { ricordata: 'STP-1' })).toBeNull();
  });

  it('nessuna stampante configurata non è un guasto', () => {
    expect(proponiStampante([], { ricordata: 'STP-9' })).toBeNull();
  });
});

describe('quante etichette', () => {
  /* Tornano sempre a 1: le copie in più sono l'eccezione di UN gesto, e
     un'eccezione che si ricorda smette di essere un'eccezione. */
  it('niente, zero e il non-numero valgono 1', () => {
    for (const v of [undefined, null, 0, -3, '', 'tre', NaN]) expect(leggiCopie(v)).toBe(1);
  });

  it('un numero scritto vale quel numero', () => {
    expect(leggiCopie('6')).toBe(6);
    expect(leggiCopie(2.7)).toBe(2);
  });

  it('sopra il tetto si ferma al tetto — un dito che scivola', () => {
    expect(leggiCopie(500)).toBe(COPIE_MAX);
  });
});
