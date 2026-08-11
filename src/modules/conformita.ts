/* Il motore di stoccaggio girato al contrario: invece di dire dove mettere una
   cosa, dice cosa è già in un posto sbagliato.

   Serve adesso e non alla 1.4.4 per una ragione pratica: finché gli attributi
   si popolano a mano, la mappa che si accende da sola è il modo di vedere se
   quello che si sta scrivendo in anagrafica ha senso.

   Nessuno stato, nessun accesso a Store: entrano righe e tabelle, esce un
   elenco. Collaudata in `test/conformita.test.js`. */

import type { CodiceAllergene, ClasseTemperatura } from './anagrafica.js';
import { etichettaAllergene, etichettaClasse } from './anagrafica.js';

export interface AttributiArticolo {
  allergens?: readonly CodiceAllergene[] | null;
  temp_class?: ClasseTemperatura | null;
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
}

export interface RigaGiacenza {
  location_code: string;
  item_key?: string;
  article_code: string;
  article_description?: string;
  lot_code?: string;
  qty?: number;
}

export type TipoNonConformita = 'TEMPERATURA' | 'ALLERGENE_FUORI_ZONA' | 'ALLERGENE_NON_AMMESSO' | 'PULITO_IN_ZONA_ALLERGENI';
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
): Esito {
  const nonConformita: NonConformita[] = [];
  const perUbicazione = new Map<string, { n: number; gravita: Gravita }>();
  const deroghe: Deroga[] = [];
  const articoliSenzaAttributi = new Set<string>();
  let verificabili = 0;

  for (const r of righe) {
    const art = articolo(r.article_code);
    const zona = postoDi(r.location_code);

    const allergeniArt = art?.allergens ?? [];
    const tempArt = art?.temp_class ?? null;

    /* Un articolo senza attributi non è conforme né difforme: è ignoto, e
       dirlo è diverso dal tacerlo. Durante il popolamento sono la maggioranza. */
    if (!art || (!tempArt && !allergeniArt.length)) {
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

  /* Le alte prima, poi per ubicazione: chi guarda l'elenco parte da ciò che
     scotta, non dalla prima corsia. */
  nonConformita.sort((a, b) =>
    (a.gravita === b.gravita ? 0 : a.gravita === 'alta' ? -1 : 1)
    || a.location_code.localeCompare(b.location_code));

  deroghe.sort((a, b) => a.location_code.localeCompare(b.location_code));

  return { nonConformita, perUbicazione, deroghe, righe: righe.length, verificabili, articoliSenzaAttributi };
}
