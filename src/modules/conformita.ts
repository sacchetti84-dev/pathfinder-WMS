/* Il motore di stoccaggio girato al contrario: invece di dire dove mettere una
   cosa, dice cosa è già in un posto sbagliato.

   Serve adesso e non alla 1.4.4 per una ragione pratica: finché gli attributi
   si popolano a mano, la mappa che si accende da sola è il modo di vedere se
   quello che si sta scrivendo in anagrafica ha senso.

   Nessuno stato, nessun accesso a Store: entrano righe e tabelle, esce un
   elenco. Collaudata in `test/conformita.test.js`. */

import type { CodiceAllergene, ClasseTemperatura } from './anagrafica.js';
import { etichettaAllergene, etichettaClasse } from './anagrafica.js';
import type { CoppiaIncompatibile } from './regoleBase.js';
import { incompatibili } from './regoleBase.js';

export interface AttributiArticolo {
  allergens?: readonly CodiceAllergene[] | null;
  temp_class?: ClasseTemperatura | null;
  /** 2.8 — la pericolosità, dichiarata sull'articolo dal 1.6 e mai
      verificata fino a oggi: si configurava, si vedeva in maschera, e poi
      nessuno guardava se la merce stesse dove poteva stare. */
  hazards?: readonly string[] | null;
  description?: string;
}

/* Cio' che si sa del posto: gli attributi della zona, piu' lo stato della
   singola ubicazione. Sono due cose di livello diverso e il verificatore le
   guarda insieme, perche' e' insieme che decidono. */
export interface AttributiPosto {
  /** La zona è riservata alla merce con allergeni. */
  allergen_zone?: boolean;
  /** Se valorizzato, i soli allergeni ammessi qui. Vuoto su una zona riservata = tutti. */
  allergens?: readonly CodiceAllergene[] | null;
  temp_class?: ClasseTemperatura | null;
  zone_name?: string;
  /** L'ubicazione è marcata «Riservata»: è una deroga, vedi `verificaConformita`. */
  riservata?: boolean;
  /** 2.8 — la zona (o la cella) è dedicata alla merce pericolosa. */
  hazard_zone?: boolean;
  /** Se valorizzato, le sole pericolosità ammesse. Vuoto su zona
      pericolosa = tutte, come per gli allergeni. */
  hazards?: readonly string[] | null;
}

export interface RigaGiacenza {
  location_code: string;
  item_key?: string;
  article_code: string;
  article_description?: string;
  lot_code?: string;
  qty?: number;
}

export type TipoNonConformita =
  | 'TEMPERATURA' | 'ALLERGENE_FUORI_ZONA' | 'ALLERGENE_NON_AMMESSO' | 'PULITO_IN_ZONA_ALLERGENI'
  /* 2.8 — la pericolosità, simmetrica agli allergeni, e la matrice. */
  | 'PERICOLO_FUORI_ZONA' | 'PERICOLO_NON_AMMESSO' | 'PULITO_IN_ZONA_PERICOLI'
  | 'INCOMPATIBILITA'
  /* 2.8 — la regola base 2 che ha già lavorato in deroga: lo stesso lotto
     in due vani. Grave media, e non alta, perché non è un errore — è
     l'eccezione che lo stato del vano ha imposto, e va vista. */
  | 'LOTTO_SPARSO';
export type Gravita = 'alta' | 'media';

export interface NonConformita {
  location_code: string;
  item_key?: string;
  article_code: string;
  article_description?: string;
  lot_code?: string;
  qty?: number;
  tipo: TipoNonConformita;
  gravita: Gravita;
  messaggio: string;
}

/** Una riga passata per la deroga della cella riservata. */
export interface Deroga {
  location_code: string;
  item_key?: string;
  article_code: string;
  article_description?: string;
  lot_code?: string;
  qty?: number;
  allergens: readonly CodiceAllergene[];
}

/** 2.8 — Quel che la verifica deve sapere e non sta né sull'articolo né
    sul posto. Era il quarto parametro posizionale della matrice: quando ne
    è servito un secondo, due posizionali di seguito sarebbero diventati
    illeggibili al primo terzo. */
export interface OpzioniConformita {
  matrice?: readonly CoppiaIncompatibile[] | null;
  /** Le ubicazioni dove un lotto sta di passaggio — oggi il solo vano WIP.
      Non si accusano di lotto sparso: la merce è in lavorazione, non
      stoccata due volte. */
  areeDiTransito?: readonly string[] | null;
}

export interface Esito {
  nonConformita: NonConformita[];
  /** Per ubicazione: quante righe fuori posto, e la gravità peggiore. */
  perUbicazione: Map<string, { n: number; gravita: Gravita }>;
  /* Le deroghe NON sono non conformità, ma non sono nemmeno niente: sono le
     eccezioni volute, e vanno elencabili. «Dove tenete allergeni fuori dalla
     zona riservata» è una domanda che qualcuno farà. */
  deroghe: Deroga[];
  /** Copertura: quante righe si sono potute verificare davvero. */
  righe: number;
  verificabili: number;
  articoliSenzaAttributi: Set<string>;
}

/* Dal freddo al caldo. Serve a dire da che parte sta l'errore: merce più
   calda di quanto chiede è un rischio, più fredda è uno spreco. */
const SCALA: Record<ClasseTemperatura, number> = { SURG: 0, REFR: 1, AMB: 2 };

/* LA DEROGA DELLA CELLA RISERVATA.
   Un'ubicazione marcata «Riservata» ammette allergeni, qualunque cosa dica la
   zona intorno. E' una decisione presa da una persona su una cella precisa —
   «qui ci metto quel lotto, e lo so» — e vale piu' di una regola generale.

   Sulla temperatura invece NON deroga, e non e' un'incoerenza: riservare una
   cella e' una scelta organizzativa, e una scelta organizzativa non scalda
   una cella frigorifera. Un surgelato a +20 resta un surgelato a +20 anche se
   qualcuno ha deciso che quel posto era suo. */
export function verificaConformita(
  righe: readonly RigaGiacenza[],
  articolo: (code: string) => AttributiArticolo | null | undefined,
  postoDi: (location_code: string) => AttributiPosto | null | undefined,
  opzioni: OpzioniConformita | null | undefined = null,
): Esito {
  const matrice = opzioni?.matrice ?? null;
  /* 2.8 — le aree di TRANSITO, dove un lotto sta di passaggio e non di
     casa. Il vano WIP è l'unica di oggi: portare in produzione è quasi
     sempre un prelievo parziale, e senza questa esclusione la mappa
     segnalerebbe come «sparso» ogni lotto che un ordine ha toccato. */
  const transito = new Set(
    (opzioni?.areeDiTransito ?? []).map(c => String(c ?? '').trim().toUpperCase()).filter(Boolean));
  const nonConformita: NonConformita[] = [];
  const perUbicazione = new Map<string, { n: number; gravita: Gravita }>();
  const deroghe: Deroga[] = [];
  const articoliSenzaAttributi = new Set<string>();
  let verificabili = 0;

  /* 2.8 — LA MATRICE SI GUARDA DA FERMO, e non può essere altrimenti.
     `stoccaggio.ts` confronta quel che ARRIVA con quel che c'è, perché lì
     la domanda è «posso metterlo qui». Qui la domanda è un'altra — «c'è
     qualcosa che non può stare insieme» — e la risposta richiede tutte le
     righe del vano prima di poterne giudicare una. Per questo si raccoglie
     in un primo giro e si giudica in un secondo. */
  const pericoliPerVano = new Map<string, Map<string, RigaGiacenza[]>>();

  for (const r of righe) {
    const art = articolo(r.article_code);
    const zona = postoDi(r.location_code);

    const allergeniArt = art?.allergens ?? [];
    const tempArt = art?.temp_class ?? null;

    /* Un articolo senza attributi non è conforme né difforme: è ignoto, e
       dirlo è diverso dal tacerlo. Durante il popolamento sono la maggioranza. */
    /* 2.8 — la pericolosità conta come attributo: un articolo che dichiara
       solo quella era «ignoto» fino alla 2.7 e non veniva verificato mai. */
    if (!art || (!tempArt && !allergeniArt.length && !art.hazards?.length)) {
      if (r.article_code) articoliSenzaAttributi.add(r.article_code);
      continue;
    }
    if (!zona) continue;
    verificabili++;

    const trovate: NonConformita[] = [];
    const base = {
      location_code: r.location_code, item_key: r.item_key, article_code: r.article_code,
      article_description: r.article_description ?? art.description, lot_code: r.lot_code, qty: r.qty,
    };

    if (tempArt && zona.temp_class && tempArt !== zona.temp_class) {
      const piuCalda = SCALA[zona.temp_class] > SCALA[tempArt];
      trovate.push({
        ...base,
        tipo: 'TEMPERATURA',
        gravita: piuCalda ? 'alta' : 'media',
        messaggio: piuCalda
          ? `Richiede ${etichettaClasse(tempArt)}, si trova in ${etichettaClasse(zona.temp_class)}`
          : `Conservato più freddo del necessario: richiede ${etichettaClasse(tempArt)}, si trova in ${etichettaClasse(zona.temp_class)}`,
      });
    }

    /* 2.8 — LA PERICOLOSITA', SIMMETRICA AGLI ALLERGENI.

       La cella riservata NON deroga qui, e non è un'incoerenza: «riservata»
       è la decisione di ammettere un allergene in un posto pulito, che è un
       rischio di contaminazione e una scelta organizzativa. Un comburente
       accanto a un infiammabile non è organizzativo — è la stessa fisica
       della temperatura, e su quella non si deroga già dal 1.4.0. */
    const pericoliArt = art?.hazards ?? [];
    if (pericoliArt.length) {
      /* Si annota per la matrice PRIMA di giudicare: anche una riga che qui
         risulta a posto può essere quella che rende sbagliata un'altra. */
      let perVano = pericoliPerVano.get(r.location_code);
      if (!perVano) { perVano = new Map(); pericoliPerVano.set(r.location_code, perVano); }
      for (const h of pericoliArt) {
        const e = perVano.get(h);
        if (e) e.push(r); else perVano.set(h, [r]);
      }
    }

    if (pericoliArt.length && !zona.hazard_zone) {
      trovate.push({
        ...base,
        tipo: 'PERICOLO_FUORI_ZONA',
        gravita: 'alta',
        messaggio: `Merce ${pericoliArt.join(', ')} — fuori dall’area per la merce pericolosa`,
      });
    } else if (pericoliArt.length && zona.hazards && zona.hazards.length) {
      const nonAmmessi = pericoliArt.filter(h => !zona.hazards!.includes(h));
      if (nonAmmessi.length) {
        trovate.push({
          ...base,
          tipo: 'PERICOLO_NON_AMMESSO',
          gravita: 'alta',
          messaggio: `${nonAmmessi.join(', ')} non ammesso in questa area`,
        });
      }
    } else if (!pericoliArt.length && zona.hazard_zone) {
      trovate.push({
        ...base,
        tipo: 'PULITO_IN_ZONA_PERICOLI',
        gravita: 'media',
        messaggio: 'Merce non pericolosa, stoccata nell’area dedicata alla merce pericolosa',
      });
    }

    /* La cella riservata è la deroga: sugli allergeni non si discute con chi
       ha marcato quel posto apposta. Le tre regole sotto non girano. */
    if (zona.riservata) {
      /* Si annota solo se c'è davvero qualcosa da derogare: una cella
         riservata con dentro merce senza allergeni non è un'eccezione. */
      if (allergeniArt.length) deroghe.push({ ...base, allergens: allergeniArt });
    } else if (allergeniArt.length) {
      if (!zona.allergen_zone) {
        trovate.push({
          ...base,
          tipo: 'ALLERGENE_FUORI_ZONA',
          gravita: 'alta',
          messaggio: `Contiene ${allergeniArt.map(etichettaAllergene).join(', ')} — fuori dalla zona riservata`,
        });
      } else if (zona.allergens && zona.allergens.length) {
        const nonAmmessi = allergeniArt.filter(a => !zona.allergens!.includes(a));
        if (nonAmmessi.length) {
          trovate.push({
            ...base,
            tipo: 'ALLERGENE_NON_AMMESSO',
            gravita: 'alta',
            messaggio: `${nonAmmessi.map(etichettaAllergene).join(', ')} non ammesso in questa zona`,
          });
        }
      }
    } else if (zona.allergen_zone) {
      /* Il contrario del caso sopra, e non è simmetrico: la zona riservata
         serve a non contaminare il resto, quindi un prodotto pulito messo
         lì dentro è il prodotto pulito a rischiare. */
      trovate.push({
        ...base,
        tipo: 'PULITO_IN_ZONA_ALLERGENI',
        gravita: 'media',
        messaggio: 'Senza allergeni, stoccato nella zona riservata agli allergeni',
      });
    }

    for (const nc of trovate) {
      nonConformita.push(nc);
      const cur = perUbicazione.get(nc.location_code);
      if (!cur) perUbicazione.set(nc.location_code, { n: 1, gravita: nc.gravita });
      else { cur.n++; if (nc.gravita === 'alta') cur.gravita = 'alta'; }
    }
  }

  /* ── 2.8 — LA MATRICE, SUL MAGAZZINO FERMO ─────────────────────────
     Due pericolosità incompatibili nello stesso vano. Si accusano TUTTE E
     DUE le righe e non solo una: non c'è modo di sapere quale delle due sia
     arrivata per ultima, e dire «questa è di troppo» sceglierebbe a caso
     chi deve spostarsi. Chi legge vede la coppia e decide lui. */
  if (matrice?.length) {
    for (const [location_code, perVano] of pericoliPerVano) {
      const codici = [...perVano.keys()].sort();
      for (let i = 0; i < codici.length; i++) {
        for (let j = i + 1; j < codici.length; j++) {
          const a = codici[i]!;
          const b = codici[j]!;
          if (!incompatibili(matrice, a, b)) continue;
          for (const [uno, altro] of [[a, b], [b, a]] as const) {
            for (const r of (perVano.get(uno) || [])) {
              nonConformita.push({
                location_code, item_key: r.item_key, article_code: r.article_code,
                article_description: r.article_description, lot_code: r.lot_code, qty: r.qty,
                tipo: 'INCOMPATIBILITA', gravita: 'alta',
                messaggio: `${uno} non può stare con ${altro}, che è nello stesso vano`,
              });
            }
          }
        }
      }
    }
  }

  /* ── 2.8 — LO STESSO LOTTO IN PIU' VANI ────────────────────────────
     E' la regola base 2 che ha lavorato in deroga: il vano di casa era
     pieno o bloccato, il lotto si è esteso, e la mappa lo deve dire.

     GRAVITA' MEDIA, E NON ALTA. Non è un errore: è l'eccezione che lo stato
     del vano ha imposto, e chi l'ha fatta non ha scavalcato niente. Ma non
     è nemmeno niente — finché dura, quella merce si conta due volte e il
     FEFO la ordina come due partite — e per questo si vede.

     QUESTO GIRO NON GUARDA GLI ATTRIBUTI, e va detto: un lotto sparso è
     sparso anche se l'articolo non è mai stato classificato. Il cancello
     degli «articoli senza attributi» qui sopra non lo riguarda. */
  {
    const perChiave = new Map<string, RigaGiacenza[]>();
    for (const r of righe) {
      if (!r?.location_code) continue;
      if (transito.has(String(r.location_code).toUpperCase())) continue;
      const k = r.item_key || `${r.article_code}#${r.lot_code ?? ''}`;
      if ((r.qty ?? 1) <= 0) continue;
      const e = perChiave.get(k);
      if (e) e.push(r); else perChiave.set(k, [r]);
    }
    for (const [, gruppo] of perChiave) {
      const vani = [...new Set(gruppo.map(r => r.location_code))].sort();
      if (vani.length < 2) continue;
      for (const r of gruppo) {
        const altri = vani.filter(v => v !== r.location_code);
        nonConformita.push({
          location_code: r.location_code, item_key: r.item_key, article_code: r.article_code,
          article_description: r.article_description, lot_code: r.lot_code, qty: r.qty,
          tipo: 'LOTTO_SPARSO', gravita: 'media',
          messaggio: `Lo stesso lotto sta anche in ${altri.join(', ')}: lo stesso articolo/lotto sta in un’ubicazione sola`,
        });
      }
    }
  }

  /* Le due famiglie qui sopra scrivono in `nonConformita` senza passare dal
     ciclo principale, e il conto per ubicazione lo tiene quello: si rifa'
     qui, su tutto l'elenco, invece di aggiornarlo in tre punti diversi. */
  perUbicazione.clear();
  for (const nc of nonConformita) {
    const cur = perUbicazione.get(nc.location_code);
    if (!cur) perUbicazione.set(nc.location_code, { n: 1, gravita: nc.gravita });
    else { cur.n++; if (nc.gravita === 'alta') cur.gravita = 'alta'; }
  }

  /* Le alte prima, poi per ubicazione: chi guarda l'elenco parte da ciò che
     scotta, non dalla prima corsia. */
  nonConformita.sort((a, b) =>
    (a.gravita === b.gravita ? 0 : a.gravita === 'alta' ? -1 : 1)
    || a.location_code.localeCompare(b.location_code));

  deroghe.sort((a, b) => a.location_code.localeCompare(b.location_code));

  return { nonConformita, perUbicazione, deroghe, righe: righe.length, verificabili, articoliSenzaAttributi };
}
