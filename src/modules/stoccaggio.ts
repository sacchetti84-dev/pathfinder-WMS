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
import type { CoppiaIncompatibile } from './regoleBase.js';
import { scontri } from './regoleBase.js';

/** L'articolo da posizionare, per quel che serve a decidere. */
export interface MerceDaStoccare {
  article_code: string;
  description?: string;
  /** 2.8 — la categoria merceologica. Una regola può indirizzare un'intera
      categoria verso un magazzino o una zona, e allora vale per tutti gli
      articoli che ne fanno parte senza che nessuno debba elencarli. */
  category?: string;
  allergens?: readonly CodiceAllergene[] | null;
  temp_class?: ClasseTemperatura | null;
  lot_code?: string;
  /** Quanti colli si stanno posizionando: serve alla capienza. */
  colli?: number;
  /** 2.8 — la pericolosita', dichiarata sull'articolo dal 1.6 e mai letta
      da questo motore fino a oggi. I codici sono aziendali — vivono in
      `meta.articleParams`, vedi `modules/parametri.ts` — quindi qui e'
      `string` e non un'unione chiusa come gli allergeni. */
  hazards?: readonly string[] | null;
  /** 2.8 — quanto pesa in tutto quel che si sta posizionando, in chili.
      Serve alla portata del vano. Zero o assente = non si sa, e allora la
      portata non esclude nessuno. */
  peso_kg?: number;
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

  /* ── 2.8 — LA PERICOLOSITA', E IL PESO ────────────────────────────── */

  /** La zona (o la cella) è dedicata alla merce pericolosa. */
  hazard_zone?: boolean;
  /** Se valorizzato, le sole pericolosità ammesse qui. Vuoto su zona
      pericolosa = tutte, come per gli allergeni. */
  hazards?: readonly string[] | null;
  /** Le pericolosità della merce che è GIA' in questo vano. Servono alla
      matrice: un infiammabile non entra dove c'è un comburente, e la zona
      non basta a dirlo — sono tutte e due «pericolose». */
  pericoli_presenti?: readonly string[] | null;
  /** Quanti chili regge. Assente = portata non dichiarata, e allora non si
      può escludere per sfondamento: stessa regola della capienza. */
  portata_kg?: number | null;
  /** Quanti chili ci sono adesso. */
  peso_presente_kg?: number;
}

/** 2.8 — Quel che il motore deve sapere e non sta né sulla merce né sul
    vano: la matrice delle incompatibilità, e il verdetto della regola base
    sull'ubicazione unica. Li calcola chi ha lo Store — `regoleBase.ts` è
    puro anche lui, ma ha bisogno dell'inventario intero. */
export interface OpzioniStoccaggio {
  matrice?: readonly CoppiaIncompatibile[] | null;
  /** Il vano dove questo lotto sta già E che può ancora ricevere. Quando
      c'è, è l'UNICO posto proposto: è la regola base 2, e non si scavalca. */
  casaLibera?: string | null;
}

/** Una regola di `storage_rules`: un dato, non codice. */
export interface RegolaStoccaggio {
  rule_id: string;
  attiva?: boolean;
  /** Da 1 a 10: più alta = decide prima, a parità di tipo. Una regola
      scritta prima della 2.1 puo' portare 0, e continua a valere — in
      lettura si e' tolleranti, in scrittura no. */
  priority?: number;
  /** Su cosa si applica: prefisso del codice articolo. */
  article_prefix?: string;
  /** L'articolo esatto, quando la regola è per uno solo. */
  article_code?: string;
  /* ── 2.8 — LA CATEGORIA MERCEOLOGICA ───────────────────────────────
     Il terzo modo di dire «su quali articoli», e in magazzino è il primo
     che viene in mente: «i detersivi stanno in MAG3» non è una regola sui
     codici, è una regola su una famiglia di merce. Scriverla come prefisso
     funziona solo dove qualcuno ha avuto la disciplina di far cominciare
     tutti i detersivi con le stesse tre cifre — e nessuna anagrafica
     cresciuta in vent'anni ce l'ha.

     `category` sta su `Articolo` dalla v1 ed è già un indice a database:
     qui si limita a diventare anche un bersaglio di regola. */
  /** La categoria esatta. */
  category?: string;
  /** Le categorie che iniziano così. */
  category_prefix?: string;
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
  | 'allergene_non_ammesso' | 'pieno' | 'regola_impone'
  /* 2.8 — la regola base che non si scavalca, e i quattro vincoli che la
     pericolosita' porta con se'. */
  | 'casa_del_lotto'
  | 'pericolo_fuori_zona' | 'pulito_in_zona_pericoli'
  | 'pericolo_non_ammesso' | 'incompatibilita' | 'portata';

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
  /* 2.8 — LA CASA DEL LOTTO NON E' UN CRITERIO, E' UN FATTO.

     Quando il lotto sta già in un vano che può ricevere, quel vano non
     compete con gli altri: gli altri sono esclusi. Il punteggio esiste
     comunque perché una proposta senza numero non si ordina e non si
     esporta, e sta sopra a tutto il resto messo insieme — 1.000 contro i
     70 che il caso migliore raggiungeva prima — perché chi guarda la
     colonna dei punti deve vedere a occhio che quello è un altro genere di
     ragione. Vedi `REGOLE_BASE` in `modules/regoleBase.ts`. */
  CASA_DEL_LOTTO: 1000,
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
  /** 2.1 — QUANTO PUO' PESARE LA DISTANZA IN TUTTO.

      Senza un tetto la distanza decideva da sola: `distanza` e' la
      posizione nella sequenza della zona, e una zona da 274 ubicazioni
      arriva a −273 punti mentre «qui c'e' gia' questo articolo» ne vale 40.
      Il raggruppamento del lotto non ha mai spostato una proposta.

      Quindici e' meno di STESSO_ARTICOLO e di REGOLA_PREFERISCE, e piu' di
      VUOTO: fra due vani lontani uguale decide il raggruppamento, fra due
      vani equivalenti decide chi fa camminare meno, e oltre i quindici
      passi la differenza di cammino smette di contare — che e' quello che
      succede in magazzino, dove il giro lo fa il carrello. */
  DISTANZA_MAX: 15,
});

const SCALA: Record<ClasseTemperatura, number> = { SURG: 0, REFR: 1, AMB: 2 };

/** 2.1 — la scala della priorità di una regola: chiusa, e in un posto solo. */
export const PRIORITA_MIN = 1;
export const PRIORITA_MAX = 10;
export const PRIORITA_PREDEFINITA = 5;

/** Le regole che riguardano questo articolo, dalla più forte alla più
    debole. Una regola spenta non si applica, e una senza bersaglio nemmeno:
    «va in nessun posto» non è una regola, è un record incompleto. */
export function regolePerArticolo(
  regole: readonly RegolaStoccaggio[] | null | undefined,
  articleCode: string,
  category?: string | null,
): RegolaStoccaggio[] {
  if (!regole?.length) return [];
  const code = String(articleCode ?? '').toUpperCase();
  const cat = String(category ?? '').trim().toUpperCase();
  const vive = regole
    .filter(r => r && r.attiva !== false)
    .filter(r => r.site_id || r.zone_id);

  /* 2.8 — SOLO IL LIVELLO PIU' PRECISO CHE HA COLPITO, e non tutti insieme.

     Con due regole che «impongono» — «l'articolo 7001234 va in MAG1» e
     «i detersivi vanno in MAG3» — tenerle tutte e due vorrebbe dire che
     `proponi` accetta i vani di MAG1 E quelli di MAG3, perché gli basta che
     UNA regola sia soddisfatta. La decisione presa su quell'articolo
     preciso sarebbe annacquata proprio dalla regola generale che doveva
     scavalcare, e nessuno capirebbe perché.

     La regola è una sola e si dice in una riga: chi è più preciso zittisce
     chi è più generale. La priorità continua a ordinare DENTRO un livello,
     che è il lavoro per cui esiste. */
  const livelli: RegolaStoccaggio[][] = [
    vive.filter(r => r.article_code && String(r.article_code).toUpperCase() === code),
    vive.filter(r => !r.article_code && r.article_prefix
      && code.startsWith(String(r.article_prefix).toUpperCase())),
    /* Senza categoria sull'articolo, una regola di categoria non lo
       riguarda. Non è pignoleria: «categoria vuota» non vuol dire
       «qualunque categoria», vuol dire che nessuno l'ha classificato. */
    !cat ? [] : vive.filter(r => !r.article_code && !r.article_prefix && (
      (r.category && String(r.category).trim().toUpperCase() === cat)
      || (!r.category && r.category_prefix
        && cat.startsWith(String(r.category_prefix).trim().toUpperCase()))
    )),
  ];

  const vinto = livelli.find(l => l.length) ?? [];
  return vinto
    .slice()
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
}

/** Che cosa non va in una regola, in chiaro. Elenco vuoto = si può salvare.

    Una regola è un dato che scrive una persona, e una persona sbaglia: senza
    questi controlli si finisce con record che non si applicano a niente —
    invisibili, perché non danno errore, semplicemente non fanno mai nulla. */
export function validaRegola(r: Partial<RegolaStoccaggio> | null | undefined): string[] {
  const errori: string[] = [];
  if (!r) return ['Regola vuota'];
  const su = String(r.article_code ?? '').trim() || String(r.article_prefix ?? '').trim()
    || String(r.category ?? '').trim() || String(r.category_prefix ?? '').trim();
  if (!su) errori.push('Indica su quali articoli vale: un codice esatto, un prefisso o una categoria');
  const dove = String(r.site_id ?? '').trim() || String(r.zone_id ?? '').trim();
  if (!dove) errori.push('Indica dove devono andare: un sito o una zona');
  if (r.modo && r.modo !== 'impone' && r.modo !== 'preferisce') {
    errori.push('Il modo è «impone» oppure «preferisce»');
  }
  /* 2.1 — LA SCALA E' DA 1 A 10. Prima era «da zero in su» e non aveva un
     tetto: due regole a 100 e a 3.000 si ordinano lo stesso, ma nessuno sa
     piu' che numero scrivere alla terza. Una scala chiusa e' una scala che
     si legge. Chi rilegge una regola vecchia con 0 la trova ancora buona. */
  const p = r.priority;
  if (p !== undefined && p !== null && p !== 0) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < PRIORITA_MIN || n > PRIORITA_MAX) {
      errori.push(`La priorità è un numero intero da ${PRIORITA_MIN} a ${PRIORITA_MAX}`);
    }
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
  opzioni: OpzioniStoccaggio | null | undefined = null,
): EsitoStoccaggio {
  if (!merce || !posti?.length) {
    return { proposte: [], esclusi: [], candidati: 0, nessunPosto: true };
  }

  const allergeniMerce = merce.allergens ?? [];
  const pericoliMerce = merce.hazards ?? [];
  const tempMerce = merce.temp_class ?? null;
  const matrice = opzioni?.matrice ?? null;
  const casaLibera = String(opzioni?.casaLibera ?? '').trim().toUpperCase() || null;
  const peso = Number(merce.peso_kg) || 0;
  const mie = regolePerArticolo(regole, merce.article_code, merce.category);
  const impongono = mie.filter(r => r.modo === 'impone');
  const preferiscono = mie.filter(r => r.modo !== 'impone');
  const colli = Number(merce.colli) || 0;

  const proposte: Proposta[] = [];
  const esclusi: Escluso[] = [];

  for (const posto of posti) {
    /* ── I VINCOLI DURI. Chi non passa esce, e nessun punteggio lo salva. */
    const stato = posto.status || 'empty';

    /* ── 2.8 — LA REGOLA BASE 2, E VIENE PRIMA DI TUTTO.

       Se questo lotto sta già in un vano che può ricevere, la merce va lì e
       il resto del magazzino non è in gara. Non è un criterio forte: è
       l'unica risposta, e il ciclo qui sotto non deve nemmeno girare.

       IL VANO DI CASA PASSA I VINCOLI SENZA RIGUARDARLI, e non è una
       scorciatoia. Quella merce è già fisicamente lì: se il vano non fosse
       adatto sarebbe un problema di adesso, non di questo collo in più, e
       a dirlo è `verificaConformita` — che guarda il magazzino da fermo ed
       è il posto giusto per accorgersene. Rivalutare i vincoli qui darebbe
       «nessun posto» su un vano che contiene già quel lotto, cioè un
       messaggio falso su un fatto vero. */
    if (casaLibera) {
      if (posto.location_code === casaLibera) {
        proposte.push({
          location_code: posto.location_code,
          punteggio: PUNTI.CASA_DEL_LOTTO,
          perche: ['Questo lotto sta già qui: lo stesso articolo/lotto sta in un’ubicazione sola, e questa regola non si scavalca'],
        });
      } else {
        esclusi.push({
          location_code: posto.location_code, motivo: 'casa_del_lotto',
          messaggio: `Il lotto sta già in ${casaLibera}: lo stesso articolo/lotto sta in un’ubicazione sola`,
        });
      }
      continue;
    }

    if (stato === 'blocked' || stato === 'disabled') {
      esclusi.push({
        location_code: posto.location_code, motivo: 'stato',
        messaggio: `Ubicazione ${stato === 'blocked' ? 'bloccata' : 'disattivata'}`,
      });
      continue;
    }

    /* 2.1 — LA CELLA RISERVATA ERA IRRAGGIUNGIBILE, e la deroga con lei.

       Fino alla 2.0 `reserved` usciva qui insieme a «bloccata» e
       «disattivata», e trenta righe piu' in basso `posto.riservata` — che
       chi costruisce i candidati calcola proprio come `stato ===
       'reserved'` — avrebbe fatto derogare gli allergeni. Non e' mai
       successo: il vano era gia' fuori. La deroga esisteva nei collaudi
       perche' li' `riservata` e `status` si passano separati, cioe' in una
       combinazione che il chiamante vero non produce.

       «Riservata» vuol dire riservata A QUALCOSA, e §6 dice a cosa: e' il
       vano dove gli allergeni ci possono stare per decisione presa. Quindi
       esclude la merce PULITA — che di quella decisione non ha bisogno e
       occuperebbe il posto di chi si' — e ammette quella con allergeni. */
    if (stato === 'reserved' && !allergeniMerce.length) {
      esclusi.push({
        location_code: posto.location_code, motivo: 'stato',
        messaggio: 'Ubicazione riservata: ci va la merce con allergeni, non questa',
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

    /* ── 2.8 — LA PERICOLOSITA'.

       `hazard_zone` e `hazards` stanno sulla Zona dal 1.6 e questo motore
       non li ha mai letti: si configuravano, si vedevano in maschera, e
       poi il motore proponeva come se non ci fossero. Da qui in poi
       valgono, e valgono SIMMETRICI agli allergeni — merce pericolosa solo
       dove è ammessa, merce pulita fuori da dove i pericoli stanno — per
       la stessa ragione che rende asimmetrico solo l'aspetto: la zona
       dedicata serve a NON contaminare il resto, quindi è il prodotto
       pulito a rischiare quando ci finisce dentro.

       LA CELLA RISERVATA NON DEROGA QUI, e vale la pena dire perché non è
       un'incoerenza con gli allergeni. «Riservata» è la decisione di
       ammettere un allergene in un posto pulito: è un rischio di
       contaminazione, ed è organizzativo. Un comburente accanto a un
       infiammabile non è organizzativo — è la stessa fisica della
       temperatura, e su quella §6 dice già che non si deroga. */
    if (pericoliMerce.length && !posto.hazard_zone) {
      esclusi.push({
        location_code: posto.location_code, motivo: 'pericolo_fuori_zona',
        messaggio: `Merce ${pericoliMerce.join(', ')}: fuori dall’area per la merce pericolosa`,
      });
      continue;
    }
    if (pericoliMerce.length && posto.hazards?.length) {
      const nonAmmessi = pericoliMerce.filter(h => !posto.hazards!.includes(h));
      if (nonAmmessi.length) {
        esclusi.push({
          location_code: posto.location_code, motivo: 'pericolo_non_ammesso',
          messaggio: `${nonAmmessi.join(', ')} non ammesso in questa area`,
        });
        continue;
      }
    }
    if (!pericoliMerce.length && posto.hazard_zone) {
      esclusi.push({
        location_code: posto.location_code, motivo: 'pulito_in_zona_pericoli',
        messaggio: 'Merce non pericolosa: l’area dedicata è per gli altri',
      });
      continue;
    }

    /* LA MATRICE. Due pericolosità entrambe ammesse dalla zona possono
       essere incompatibili FRA LORO, e la zona non ha modo di dirlo: sono
       tutte e due «pericolose». Il confronto è fra quel che arriva e quel
       che c'è già nel vano — spostare la merce che c'è non è compito di
       chi sta posizionando, e se due cose incompatibili si trovano già
       insieme a dirlo è la verifica di conformità. */
    const urti = scontri(matrice, pericoliMerce, posto.pericoli_presenti);
    if (urti.length) {
      const u = urti[0]!;
      esclusi.push({
        location_code: posto.location_code, motivo: 'incompatibilita',
        messaggio: `${u.entrante} non può stare con ${u.presente}, che è già qui${u.nota ? ` — ${u.nota}` : ''}`,
      });
      continue;
    }

    /* LA PORTATA. Stessa regola della capienza: si valuta solo dove è
       dichiarata. Un livello in quota e uno a terra non reggono lo stesso
       peso, ed è per questo che sta sulla CELLA e non sulla zona. */
    const portata = typeof posto.portata_kg === 'number' ? posto.portata_kg : null;
    const pesoPresente = Number(posto.peso_presente_kg) || 0;
    if (portata !== null && peso > 0 && pesoPresente + peso > portata) {
      esclusi.push({
        location_code: posto.location_code, motivo: 'portata',
        messaggio: `Regge ${portata} kg, ce ne sono ${Math.round(pesoPresente)}: altri ${Math.round(peso)} kg non ci stanno`,
      });
      continue;
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
      punti += Math.min(posto.distanza, PUNTI.DISTANZA_MAX) * PUNTI.PASSO;
      if (posto.distanza === 0) perche.push('All’ingresso della corsia');
    }

    if (posto.riservata && allergeniMerce.length) {
      perche.push('Cella riservata: gli allergeni ci possono stare per decisione presa');
    }

    if (capienza !== null) {
      perche.push(`Restano ${Math.max(0, capienza - occupati)} colli di spazio`);
    }
    if (portata !== null) {
      perche.push(`Restano ${Math.max(0, Math.round(portata - pesoPresente))} kg di portata`);
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
