/* LA RICETTA VERA — ODP2607777.

   GENERATO — non si scrive a mano: `node banco/ciclo/rifai-ricetta.cjs`.
   Sorgente: 07082026_gluc.xlsx

   Numeri veri, con la loro asimmetria: 194.9922 kg di calcio
   accanto ai 0.024336 kg dell'ultimo componente. Un ciclo provato su
   quantità tutte uguali non incontra mai il collo incompleto, l'arrotondamento,
   o il lotto che sta in un'unica confezione.

   LA SOMMA DEI 15 FA 380,25 KG. È l'invariante aritmetica su cui il
   ciclo si appoggia: qualunque strada la merce faccia — magazzino, WIP, reso,
   consumo — quei chili devono ritrovarsi tutti, e nel posto giusto.

   Questo file NON sta nel repository: la formulazione di un prodotto e i
   lotti fornitore sono dato, non codice. Vedi `.gitignore`. */

export const ODP_ORIGINE = "ODP2607777";
export const QUANTITA_ORDINE = 380.25;
export const UOM = 'KG';

/** Il lotto è quello che l'ODP ha già impegnato. */
export const RICETTA = [
  { code: "6001418"  , desc: "CALCIO LATTATO GLUCONATO (Ca:13%)",                   lot: "261571"  , kg: 194.9922 },
  { code: "6000149"  , desc: "GLUCOSAMINA SOLFATO 2KCl",                            lot: "261177"  , kg: 50.7 },
  { code: "6000886"  , desc: "MAGNESIO CITRATO TRIBASICO ANIDRO",                   lot: "260545"  , kg: 48.4185 },
  { code: "6000296"  , desc: "GLUCIDEX 19 IT- Granulare",                           lot: "262185"  , kg: 44.420805 },
  { code: "6000004"  , desc: "ACIDO CITRICO ANIDRO E330",                           lot: "261887"  , kg: 20.28 },
  { code: "6000037"  , desc: "AROMA ARANCIO 8358PV",                                lot: "261867"  , kg: 10.14 },
  { code: "6000242"  , desc: "VITAMINA C (ACIDO ASCORBICO)",                        lot: "260926"  , kg: 6.084 },
  { code: "6000006"  , desc: "BIOSSIDO DI SILICIO (SYLOID 244)",                    lot: "261794"  , kg: 3.042 },
  { code: "6000002"  , desc: "SUCRALOSIO",                                          lot: "262191"  , kg: 0.7605 },
  { code: "6001055"  , desc: "MANGANESE SOLFATO MONOIDR. FCC \"L\" (PER USO UMANO)", lot: "261357"  , kg: 0.467961 },
  { code: "6000049"  , desc: "VITAMINA A ACETATO 325 CWS/A",                        lot: "260594"  , kg: 0.31434 },
  { code: "6000401"  , desc: "BETACAROTENE 10% CWS-CWD/O",                          lot: "262198"  , kg: 0.2535 },
  { code: "6000286"  , desc: "VITAMINA D3 100.000UI/g CWS",                         lot: "260322"  , kg: 0.24336 },
  { code: "6001335"  , desc: "ACIDO BORICO",                                        lot: "261534"  , kg: 0.108498 },
  { code: "6001182"  , desc: "VITAMINA K1 5%",                                      lot: "233234"  , kg: 0.024336 },
];

/** Gli ordini del ciclo. Uno è la ricetta com'è; gli altri la scalano, così
    il ciclo incontra quantità diverse sugli STESSI lotti — che è la
    situazione vera di un magazzino, e quella in cui un saldo sbagliato si
    nasconde meglio. */
export const ORDINI = [
  { odp: "ODP2607777", fattore: 1,    nota: 'la miscela vera' },
  { odp: 'ODP-META',  fattore: 0.5,  nota: 'mezza miscela' },
  { odp: 'ODP-QUARTO', fattore: 0.25, nota: 'un quarto — dove gli arrotondamenti mordono' },
  { odp: 'ODP-DECIMO', fattore: 0.1,  nota: 'un decimo — il componente più piccolo scende a pochi grammi' },
];

/* Tre decimali: la stessa precisione che l'applicativo tiene per i KG.
   Arrotondare più fine qui vorrebbe dire chiedere allo scaffale un millesimo
   che lo scaffale non sa rappresentare, e il ciclo si fermerebbe su un
   difetto del collaudo invece che su uno dell'applicativo. */
const arrotonda = (n) => Math.round(n * 1000) / 1000;

/** Le righe di un ordine, scalate. */
export function righeOrdine(fattore) {
  return RICETTA.map((r) => ({ ...r, kg: arrotonda(r.kg * fattore) }));
}

export function totaleOrdine(fattore) {
  return arrotonda(righeOrdine(fattore).reduce((s, r) => s + r.kg, 0));
}

/** Quanto serve in tutto di ogni componente, per tutti gli ordini messi
    insieme: è quello che il carico deve mettere a scaffale perché il ciclo
    possa girare fino in fondo. */
export function fabbisogno() {
  const per = new Map();
  for (const o of ORDINI) {
    for (const r of righeOrdine(o.fattore)) {
      per.set(r.code, arrotonda((per.get(r.code) || 0) + r.kg));
    }
  }
  return per;
}
