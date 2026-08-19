/* DOVE SI METTE LA MERCE — 1.13.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   `conformita.ts` dice cosa è già in un posto sbagliato. Questo modulo è la
   stessa domanda girata nel verso giusto: dato un articolo che è appena
   arrivato, in quali ubicazioni ci può stare, e quale conviene.

   DUE STADI, E NON SONO LA STESSA COSA. Prima i vincoli DURI — sito imposto,
   segregazione allergeni, temperatura, capienza: chi non li passa è escluso,
   e non c'è punteggio che lo recuperi. Un surgelato in una cella a +20 non è
   una scelta peggiore, è una scelta sbagliata. Poi, fra i sopravvissuti, un
   PUNTEGGIO sui criteri morbidi — vicinanza, raggruppamento del lotto, vano
   già avviato — che ordina e basta.

   OGNI PROPOSTA DICE PERCHÉ. Un motore che indica un vano senza motivarlo si
   scavalca alla terza volta e poi non lo guarda più nessuno: qui ogni
   candidato porta i motivi che l'hanno promosso e ogni escluso quelli che lo
   hanno tolto di mezzo. Lo scavalco si registra con la sua ragione, e questo
   modulo si limita a fornirla — scriverla tocca a chi ha lo Store.

   LE REGOLE SONO UN DATO, NON CODICE. «`article_code` inizia per 700 → MAG2»
   è un record di `storage_rules` che scrive un Team Leader, non una riga da
   ricompilare. Qui c'è solo il motore che le applica.

   Nessuno stato, nessun accesso a Store, nessun DOM. Collaudato da fermo in
   `test/stoccaggio.test.js`. */

import type { CodiceAllergene, ClasseTemperatura } from './anagrafica.js';
import { etichettaAllergene, etichettaClasse } from './anagrafica.js';

/** L'articolo da posizionare, per quel che serve a decidere. */
export interface MerceDaStoccare {
  article_code: string;
  description?: string;
  allergens?: readonly CodiceAllergene[] | null;
  temp_class?: ClasseTemperatura | null;
  lot_code?: string;
  /** Quanti colli si stanno posizionando: serve alla capienza. */
  colli?: number;
}

/** Un posto candidato, con quel che si sa di lui. */
export interface PostoCandidato {
  location_code: string;
  site_id?: string;
  zone_id?: string;
  zone_name?: string;
  /** `empty` · `occupied` · `blocked` · `reserved` · `disabled`. */
  status?: string;
  allergen_zone?: boolean;
  allergens?: readonly CodiceAllergene[] | null;
  temp_class?: ClasseTemperatura | null;
  /** Riservata a mano: è la deroga di `conformita`, e vale anche qui. */
  riservata?: boolean;
  /** Quanti colli ci stanno in tutto. Assente = capienza non dichiarata, e
      allora non si può escludere per pieno: un vincolo che non si conosce
      non è un vincolo che si viola. */
  capienza?: number | null;
  /** Quanti colli ci sono adesso. */
  occupati?: number;
  /** Se in questo vano c'è già lo stesso articolo, e con quale lotto. */
  stesso_articolo?: boolean;
  stesso_lotto?: boolean;
  /** Distanza dal punto di ingresso, in passi di serpentina. Più è bassa,
      meno si cammina. Assente = non si sa, e allora non pesa. */
  distanza?: number | null;
}

/** Una regola di `storage_rules`: un dato, non codice. */
export interface RegolaStoccaggio {
  rule_id: string;
  attiva?: boolean;
  /** Più alta = decide prima, a parità di tipo. */
  priority?: number;
  /** Su cosa si applica: prefisso del codice articolo. */
  article_prefix?: string;
  /** L'articolo esatto, quando la regola è per uno solo. */
  article_code?: string;
  /** Dove deve andare — un sito, oppure una zona. */
  site_id?: string;
  zone_id?: string;
  /** `impone`: solo lì e nient'altro (vincolo duro).
      `preferisce`: sale nel punteggio (criterio morbido). */
  modo?: 'impone' | 'preferisce' | string;
  nota?: string;
}

export type MotivoEsclusione =
  | 'stato' | 'temperatura' | 'allergene_fuori_zona' | 'pulito_in_zona_allergeni'
  | 'allergene_non_ammesso' | 'pieno' | 'regola_impone';

export interface Escluso {
  location_code: string;
  motivo: MotivoEsclusione;
  /** In chiaro, per chi legge: è la stessa frase che finisce a video. */
  messaggio: string;
}

export interface Proposta {
  location_code: string;
  punteggio: number;
  /** Perché questa e non un'altra, una ragione per riga. */
  perche: string[];
}

export interface EsitoStoccaggio {
  proposte: Proposta[];
  esclusi: Escluso[];
  /** Quanti posti sono stati guardati in tutto. */
  candidati: number;
  /** Vero quando nessun posto passa i vincoli duri: chi legge deve poterlo
      distinguere da «non ho guardato». */
  nessunPosto: boolean;
}

/* I punti dei criteri morbidi. Stanno qui, in chiaro e in un posto solo:
   un punteggio sparso dentro gli `if` non si sa più leggere il mese dopo, e
   la prima domanda che farà qualcuno è «perché questo prima di quello». */
export const PUNTI = Object.freeze({
  /** Stesso articolo già lì: si raggruppa, e chi preleva fa un giro solo. */
  STESSO_ARTICOLO: 40,
  /** Stesso lotto: meglio ancora — si somma alla riga che c'è già. */
  STESSO_LOTTO: 30,
  /** Una regola che «preferisce» quel sito o quella zona. */
  REGOLA_PREFERISCE: 25,
  /** Vano vuoto: non frammenta una giacenza che sta insieme. */
  VUOTO: 10,
  /** Quanto pesa un passo di distanza, in negativo. */
  PASSO: -1,
});

const SCALA: Record<ClasseTemperatura, number> = { SURG: 0, REFR: 1, AMB: 2 };

/** Le regole che riguardano questo articolo, dalla più forte alla più
    debole. Una regola spenta non si applica, e una senza bersaglio nemmeno:
    «va in nessun posto» non è una regola, è un record incompleto. */
export function regolePerArticolo(
  regole: readonly RegolaStoccaggio[] | null | undefined,
  articleCode: string,
): RegolaStoccaggio[] {
  if (!regole?.length) return [];
  const code = String(articleCode ?? '').toUpperCase();
  return regole
    .filter(r => r && r.attiva !== false)
    .filter(r => r.site_id || r.zone_id)
    .filter(r => {
      if (r.article_code) return String(r.article_code).toUpperCase() === code;
      if (r.article_prefix) return code.startsWith(String(r.article_prefix).toUpperCase());
      return false;
    })
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
}

/** Che cosa non va in una regola, in chiaro. Elenco vuoto = si può salvare.

    Una regola è un dato che scrive una persona, e una persona sbaglia: senza
    questi controlli si finisce con record che non si applicano a niente —
    invisibili, perché non danno errore, semplicemente non fanno mai nulla. */
export function validaRegola(r: Partial<RegolaStoccaggio> | null | undefined): string[] {
  const errori: string[] = [];
  if (!r) return ['Regola vuota'];
  const su = String(r.article_code ?? '').trim() || String(r.article_prefix ?? '').trim();
  if (!su) errori.push('Indica su quali articoli vale: un codice esatto o un prefisso');
  const dove = String(r.site_id ?? '').trim() || String(r.zone_id ?? '').trim();
  if (!dove) errori.push('Indica dove devono andare: un sito o una zona');
  if (r.modo && r.modo !== 'impone' && r.modo !== 'preferisce') {
    errori.push('Il modo è «impone» oppure «preferisce»');
  }
  const p = r.priority;
  if (p !== undefined && p !== null && (!Number.isFinite(Number(p)) || Number(p) < 0)) {
    errori.push('La priorità è un numero da zero in su');
  }
  return errori;
}

/* Se un posto soddisfa il bersaglio di una regola. */
function rispetta(posto: PostoCandidato, r: RegolaStoccaggio): boolean {
  if (r.site_id && posto.site_id !== r.site_id) return false;
  if (r.zone_id && posto.zone_id !== r.zone_id) return false;
  return true;
}

/** Dove si può mettere questa merce, e dove conviene.

    L'ordine delle proposte è per punteggio, e a parità per codice: due vani
    equivalenti devono uscire sempre nello stesso ordine, o l'operatore vede
    la proposta ballare a ogni ricarica. */
export function proponi(
  merce: MerceDaStoccare | null | undefined,
  posti: readonly PostoCandidato[] | null | undefined,
  regole: readonly RegolaStoccaggio[] | null | undefined = null,
): EsitoStoccaggio {
  if (!merce || !posti?.length) {
    return { proposte: [], esclusi: [], candidati: 0, nessunPosto: true };
  }

  const allergeniMerce = merce.allergens ?? [];
  const tempMerce = merce.temp_class ?? null;
  const mie = regolePerArticolo(regole, merce.article_code);
  const impongono = mie.filter(r => r.modo === 'impone');
  const preferiscono = mie.filter(r => r.modo !== 'impone');
  const colli = Number(merce.colli) || 0;

  const proposte: Proposta[] = [];
  const esclusi: Escluso[] = [];

  for (const posto of posti) {
    /* ── I VINCOLI DURI. Chi non passa esce, e nessun punteggio lo salva. */
    const stato = posto.status || 'empty';
    if (stato === 'blocked' || stato === 'disabled' || stato === 'reserved') {
      esclusi.push({
        location_code: posto.location_code, motivo: 'stato',
        messaggio: `Ubicazione ${stato === 'blocked' ? 'bloccata' : stato === 'disabled' ? 'disattivata' : 'riservata ad altro'}`,
      });
      continue;
    }

    if (impongono.length && !impongono.some(r => rispetta(posto, r))) {
      const r = impongono[0]!;
      esclusi.push({
        location_code: posto.location_code, motivo: 'regola_impone',
        messaggio: `Una regola impone ${r.zone_id ? `la zona ${r.zone_id}` : `il sito ${r.site_id}`}${r.nota ? ` — ${r.nota}` : ''}`,
      });
      continue;
    }

    if (tempMerce && posto.temp_class && tempMerce !== posto.temp_class) {
      const piuCalda = SCALA[posto.temp_class] > SCALA[tempMerce];
      esclusi.push({
        location_code: posto.location_code, motivo: 'temperatura',
        messaggio: piuCalda
          ? `Richiede ${etichettaClasse(tempMerce)}, il posto è ${etichettaClasse(posto.temp_class)}`
          : `Il posto è ${etichettaClasse(posto.temp_class)}: più freddo del necessario`,
      });
      continue;
    }

    /* La cella riservata a mano deroga sugli allergeni, come in
       `conformita`: è una decisione presa su un vano preciso, e vale più di
       una regola generale. Sulla temperatura no — quella è fisica. */
    if (!posto.riservata) {
      if (allergeniMerce.length && !posto.allergen_zone) {
        esclusi.push({
          location_code: posto.location_code, motivo: 'allergene_fuori_zona',
          messaggio: `Contiene ${allergeniMerce.map(etichettaAllergene).join(', ')}: fuori dalla zona riservata`,
        });
        continue;
      }
      if (allergeniMerce.length && posto.allergens?.length) {
        const nonAmmessi = allergeniMerce.filter(a => !posto.allergens!.includes(a));
        if (nonAmmessi.length) {
          esclusi.push({
            location_code: posto.location_code, motivo: 'allergene_non_ammesso',
            messaggio: `${nonAmmessi.map(etichettaAllergene).join(', ')} non ammesso in questa zona`,
          });
          continue;
        }
      }
      if (!allergeniMerce.length && posto.allergen_zone) {
        esclusi.push({
          location_code: posto.location_code, motivo: 'pulito_in_zona_allergeni',
          messaggio: 'Merce senza allergeni: la zona riservata è per gli altri',
        });
        continue;
      }
    }

    /* La capienza si valuta solo dove è dichiarata: un vincolo che nessuno
       ha scritto non è un vincolo che si viola. */
    const capienza = typeof posto.capienza === 'number' ? posto.capienza : null;
    const occupati = Number(posto.occupati) || 0;
    if (capienza !== null && colli > 0 && occupati + colli > capienza) {
      esclusi.push({
        location_code: posto.location_code, motivo: 'pieno',
        messaggio: `Ci stanno ${capienza} colli, ce ne sono ${occupati}: ${colli} non ci entrano`,
      });
      continue;
    }

    /* ── IL PUNTEGGIO. Da qui in giù si ordina soltanto. */
    let punti = 0;
    const perche: string[] = [];

    if (posto.stesso_lotto) {
      punti += PUNTI.STESSO_LOTTO + PUNTI.STESSO_ARTICOLO;
      perche.push('Qui c’è già questo lotto: la giacenza resta una riga sola');
    } else if (posto.stesso_articolo) {
      punti += PUNTI.STESSO_ARTICOLO;
      perche.push('Qui c’è già questo articolo: si preleva in un giro solo');
    } else if (stato === 'empty' && !occupati) {
      punti += PUNTI.VUOTO;
      perche.push('Vano libero: non frammenta una giacenza che sta insieme');
    }

    for (const r of preferiscono) {
      if (rispetta(posto, r)) {
        punti += PUNTI.REGOLA_PREFERISCE;
        perche.push(`Regola: ${r.nota || (r.zone_id ? `preferire la zona ${r.zone_id}` : `preferire il sito ${r.site_id}`)}`);
        break;
      }
    }
    for (const r of impongono) {
      if (rispetta(posto, r)) {
        perche.push(`Regola: ${r.nota || (r.zone_id ? `deve stare nella zona ${r.zone_id}` : `deve stare nel sito ${r.site_id}`)}`);
        break;
      }
    }

    if (typeof posto.distanza === 'number' && posto.distanza >= 0) {
      punti += posto.distanza * PUNTI.PASSO;
      if (posto.distanza === 0) perche.push('All’ingresso della corsia');
    }

    if (posto.riservata && allergeniMerce.length) {
      perche.push('Cella riservata: gli allergeni ci possono stare per decisione presa');
    }

    if (capienza !== null) {
      perche.push(`Restano ${Math.max(0, capienza - occupati)} colli di spazio`);
    }

    proposte.push({ location_code: posto.location_code, punteggio: punti, perche });
  }

  proposte.sort((a, b) =>
    b.punteggio - a.punteggio || a.location_code.localeCompare(b.location_code));
  esclusi.sort((a, b) => a.location_code.localeCompare(b.location_code));

  return {
    proposte, esclusi,
    candidati: posti.length,
    nessunPosto: proposte.length === 0,
  };
}

/** La prima proposta, o `null` se non ce n'è nessuna. È quel che le maschere
    mostrano di serie: l'elenco completo si apre solo se qualcuno lo chiede. */
export function migliore(esito: EsitoStoccaggio | null | undefined): Proposta | null {
  return esito?.proposte?.[0] ?? null;
}

/** Il testo dello scavalco, quando l'operatore sceglie un vano diverso da
    quello proposto. Non impedisce niente — il motore consiglia — ma il
    motivo si scrive, perché è l'unico dato che dirà se le regole valgono. */
export function scavalco(
  propostoCode: string | null | undefined,
  sceltoCode: string | null | undefined,
  motivo: string | null | undefined,
): string | null {
  const p = String(propostoCode ?? '').trim();
  const s = String(sceltoCode ?? '').trim();
  if (!p || !s || p === s) return null;
  const m = String(motivo ?? '').trim();
  return `Proposto ${p}, scelto ${s}${m ? ` — ${m}` : ''}`;
}
