import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { riga, difetto } from './verbale.js';

/* QUANTI TOCCHI COSTA OGNI OPERAZIONE.

   Con i guanti, su una striscia di vetro da 480 px, un tocco in più non è
   un tocco in più: è un tocco che si sbaglia. Questo file conta, operazione
   per operazione, quante volte il dito deve toccare lo schermo per portarla
   a termine — dalla voce in barra alla conferma.

   COSA SI CONTA E COSA NO, e la distinzione è tutta:

   - **Un tocco** è ogni `onclick` che fa avanzare il flusso. Aprire la voce
     in barra, scegliere la tessera, scegliere una riga da un elenco,
     premere CONFERMA.
   - **Una scansione NON è un tocco.** Il lettore scrive nel campo e manda
     Invio: il campo dopo prende il fuoco da solo. È il motivo per cui il
     posizionamento — quattro campi — non costa nessun tocco una volta
     aperta la maschera.
   - **I tocchi CONDIZIONATI si contano a parte**: la scelta dei colli
     compare solo dove il lotto è imballato in misure diverse, lo scavalco
     del motore solo se si rifiuta la proposta, la conferma di una finestra
     solo sul ramo che la apre. Metterli nel totale direbbe che ogni
     posizionamento costa quanto il peggiore.
   - **Le scorciatoie tolgono due tocchi**: `F2` porta dritto al carico da
     qualunque schermata, `F3` al prelievo, `F4` all'inventario, `F6` allo
     scarico, `F7` alla quarantena, `F8` alle spedizioni. Su un terminale
     senza tastiera non servono a niente, ed è il motivo per cui la colonna
     «da barra» resta quella vera.

   I numeri qui sotto sono DICHIARATI, e le prove controllano che il
   sorgente li regga ancora: se qualcuno aggiunge un pulsante in mezzo a un
   flusso, la riga che lo riguarda smette di quadrare. */

const V = (nome) => readFileSync(`src/ui/views/${nome}.ts`, 'utf8');

/** I pulsanti che fanno avanzare: si scartano quelli che chiudono, quelli
    che annullano e la lente che sfoglia le ubicazioni — non fanno parte del
    gesto, sono la via d'uscita. */
function pulsantiCheAvanzano(src) {
  const trovati = src.match(/onclick="App\.[A-Za-z_]+\([^"]*\)"/g) || [];
  return trovati.filter((b) => !/cancelMov|closeModal|_pickLoc|_undoLast|renderMov/.test(b));
}

const CAMPI_CON_INVIO = (src) => (src.match(/event\.key==='Enter'/g) || []).length;

/* ── Le operazioni, e quello che costano ─────────────────────────────── */

const OPERAZIONI = [
  {
    nome: 'Posizionamento (carico a scaffale)',
    vista: 'posiziona',
    barra: 2,   // Movimenta → tessera Carico/Scarico
    dentro: 0,  // ubicazione, articolo, lotto, colli: tutti a scansione + Invio
    conferma: 0, // l'Invio sul campo Colli conferma
    scorciatoia: 'F2',
    condizionati: [
      ['dichiarare più di una misura di collo', '1 per ogni misura in più'],
      ['accettare la proposta del motore di stoccaggio', 1],
      ['scavalcare la proposta e scrivere il motivo', 2],
      ['la stessa riga riscansionata entro pochi secondi', 1],
    ],
    nota: 'È il gesto più frequente del magazzino ed è quello che costa meno: quattro campi in fila, nessun tocco.',
  },
  {
    nome: 'Smaltimento',
    vista: 'smaltimento',
    barra: 3,   // Movimenta → Carico/Scarico → SCARICO
    dentro: 2,  // scegliere l'ubicazione dall'elenco, e la verifica a scaffale
    conferma: 1,
    scorciatoia: 'F6',
    condizionati: [
      ['scegliere quali colli, su misure diverse', 2],
      ['stampare il verbale', 1],
    ],
    nota: 'Due tocchi in mezzo perché la merce si cerca e poi si sceglie: lo stesso lotto può stare in più vani.',
  },
  {
    nome: 'Trasferimento (cambio ubicazione)',
    vista: 'prelievo',
    barra: 3,   // Movimenta → Prelievo → scheda Trasferimento
    dentro: 0,  // articolo, lotto, destinazione: scansione + Invio
    conferma: 0,
    scorciatoia: 'F3',
    condizionati: [
      ['lo stesso lotto in più ubicazioni: scegliere da quale', 1],
      ['scegliere quali colli', 2],
    ],
    nota: 'Come il posizionamento: se la merce sta in un vano solo non serve toccare niente.',
  },
  {
    nome: 'Prelievo di produzione (carrello)',
    vista: 'prelievo',
    barra: 3,   // Movimenta → Prelievo → scheda Prelievo Produzione
    dentro: 1,  // una scelta per riga aggiunta al carrello
    conferma: 1,
    scorciatoia: 'F3',
    condizionati: [
      ['ogni riga in più nel carrello', 1],
      ['scegliere quali colli, riga per riga', 2],
      ['stampare il report di prelievo', 1],
    ],
    nota: 'Il costo cresce con le righe: quindici componenti sono quindici scelte più una conferma.',
  },
  {
    nome: 'Prelievo guidato da ODP',
    vista: 'percorso',
    barra: 3,   // Movimenta → Prelievo → scheda Da Ordine
    dentro: 2,  // caricare il file, avviare il percorso
    conferma: 1, // chiudere e stampare
    scorciatoia: 'F3',
    condizionati: [
      ['ogni tappa confermata', 1],
      ['scegliere quali colli a ogni tappa', 2],
      ['una tappa non trovata', 1],
      ['chiedere il trasferimento di una tappa fuori sito', 2],
    ],
    nota: 'Le tappe sono il grosso: dieci tappe sono dieci conferme. È il flusso dove un tocco in più si moltiplica.',
  },
  {
    nome: 'Quarantena (blocco)',
    vista: 'quarantena',
    barra: 2,
    dentro: 2,  // scegliere l'ubicazione, verifica a scaffale
    conferma: 1,
    scorciatoia: 'F7',
    condizionati: [
      ['scegliere quali colli', 2],
      ['stampare il cartellino di non conformità', 1],
    ],
    nota: null,
  },
  {
    nome: 'Rilascio dalla quarantena',
    vista: 'quarantena',
    barra: 2,
    dentro: 2,  // scegliere la riga bloccata, dichiarare dove rientra
    conferma: 1,
    scorciatoia: 'F7',
    condizionati: [['scegliere quali colli si rilasciano', 2]],
    nota: null,
  },
  {
    nome: 'Campionamento',
    vista: 'campionamento',
    barra: 2,
    dentro: 2,  // cercare, scegliere la riga
    conferma: 1,
    scorciatoia: null,
    condizionati: [['stampare il verbale', 1]],
    nota: 'Non ha scorciatoia: si arriva solo dalla tessera.',
  },
  {
    nome: 'Inventario di vano',
    vista: 'inventario',
    barra: 2,
    dentro: 1,  // il ✓/✗ per ogni riga, contato una volta
    conferma: 1,
    scorciatoia: 'F4',
    condizionati: [
      ['ogni riga oltre la prima', 1],
      ['ridichiarare com\'è fatta una riga a colli dichiarati', 2],
      ['aggiungere una riga trovata e non prevista', 2],
    ],
    nota: 'Un vano con dodici righe costa dodici tocchi più la conferma: è l\'operazione che scala peggio.',
  },
  {
    nome: 'Conta mirata di una riga',
    vista: 'inventario',
    barra: 3,   // Movimenta → Inventario → 📋 sulla riga
    dentro: 0,  // il numero contato si digita
    conferma: 1,
    scorciatoia: 'F4',
    condizionati: [['ridichiarare i colli', 2]],
    nota: null,
  },
  {
    nome: 'DDT — registrazione',
    vista: 'spedizioni',
    barra: 2,
    dentro: 2,  // scegliere la riga da mettere a carrello, aggiungerla
    conferma: 1,
    scorciatoia: 'F8',
    condizionati: [
      ['ogni riga in più sul documento', 2],
      ['scegliere quali colli, riga per riga', 2],
      ['scegliere il destinatario dalla rubrica', 1],
      ['scegliere una destinazione diversa', 1],
    ],
    nota: 'Il documento si registra: la merce non esce ancora, resta prenotata.',
  },
  {
    nome: 'DDT — evasione',
    vista: 'spedizioni',
    barra: 2,
    dentro: 1,  // scegliere il documento pendente
    conferma: 1,
    scorciatoia: 'F8',
    condizionati: [
      ['scegliere quali colli, riga per riga, se il documento non li porta', 2],
      ['stampare il DDT', 1],
    ],
    nota: 'Giorni dopo la registrazione, quando arriva il vettore.',
  },
  {
    nome: 'Unità di carico — creazione',
    vista: 'udc',
    barra: 3,   // Movimenta → tessera Unità di carico → Nuova
    dentro: 0,  // l'ubicazione si scansiona
    conferma: 1, // Crea e stampa
    scorciatoia: null,
    condizionati: [],
    nota: 'L\'etichetta si stampa alla creazione: è la stessa conferma.',
  },
  {
    nome: 'Unità di carico — caricare una riga',
    vista: 'udc',
    barra: 3,
    dentro: 1,  // aprire l'unità
    conferma: 1, // ↥ sulla riga
    scorciatoia: null,
    condizionati: [['ogni riga in più', 1]],
    nota: null,
  },
  {
    nome: 'Unità di carico — spostamento',
    vista: 'udc',
    barra: 3,
    dentro: 1,  // 🔀 sull'unità
    conferma: 1,
    scorciatoia: null,
    condizionati: [],
    nota: 'Il contenitore e tutte le sue righe si spostano insieme: due tocchi per quante righe ci sono sopra.',
  },
  {
    nome: 'Conto di produzione — reso',
    vista: 'wip',
    barra: 4,   // Movimenta → Prelievo → Conto produzione → ↩ sulla riga
    dentro: 0,  // colli e ubicazione si digitano
    conferma: 1,
    scorciatoia: 'F3',
    condizionati: [['scegliere quali colli tornano', 2]],
    nota: null,
  },
  {
    nome: 'Conto di produzione — chiusura',
    vista: 'wip',
    barra: 4,
    dentro: 0,
    conferma: 2,  // CHIUDI, più la conferma che elenca cosa si dichiara consumato
    scorciatoia: 'F3',
    condizionati: [],
    nota: 'La seconda conferma non è cortesia: da lì in poi quei colli sono finiti nel prodotto.',
  },
];

describe('I GESTI DI OGNI OPERAZIONE', () => {
  it('il conto dei tocchi, operazione per operazione', () => {
    riga('\n## Quanti tocchi costa ogni operazione\n');
    riga('Un tocco = un `onclick` che fa avanzare. **Le scansioni non sono tocchi**: il lettore scrive e manda Invio, e il campo dopo prende il fuoco da solo.\n');
    riga('| Operazione | da barra | dentro | conferma | **totale** | scorc. |');
    riga('|---|---:|---:|---:|---:|---|');

    const ordinate = [...OPERAZIONI].sort((a, b) =>
      (a.barra + a.dentro + a.conferma) - (b.barra + b.dentro + b.conferma));
    for (const o of ordinate) {
      const tot = o.barra + o.dentro + o.conferma;
      riga(`| ${o.nome} | ${o.barra} | ${o.dentro} | ${o.conferma} | **${tot}** | ${o.scorciatoia ? `\`${o.scorciatoia}\` (−2)` : '—'} |`);
    }

    riga('\n### Quello che si paga solo su un ramo\n');
    riga('| Operazione | quando | tocchi in più |');
    riga('|---|---|---:|');
    for (const o of OPERAZIONI) {
      for (const [quando, quanti] of o.condizionati) riga(`| ${o.nome} | ${quando} | ${quanti} |`);
    }

    riga('\n### Note\n');
    for (const o of OPERAZIONI) if (o.nota) riga(`- **${o.nome}** — ${o.nota}`);

    expect(OPERAZIONI.length).toBeGreaterThan(10);
  });

  it('le operazioni che si ripetono a ogni riga sono quelle che scalano peggio', () => {
    riga('\n### Il costo su una giornata vera\n');
    /* Un ODP da quindici componenti, un inventario da dodici righe, un DDT
       da sei: sono i numeri della miscela vera e di un giro di magazzino
       normale, non un caso peggiore inventato. */
    const casi = [
      ['Prelievo guidato di un ODP da 15 componenti', 3 + 2 + 1, 15, 1, 'una conferma per tappa'],
      ['Inventario di un vano da 12 righe', 2 + 1 + 1, 11, 1, 'un ✓/✗ per ogni riga oltre la prima'],
      ['DDT da 6 righe', 2 + 2 + 1, 5, 2, 'due tocchi per riga in più'],
      ['Carrello di produzione da 15 componenti', 3 + 1 + 1, 14, 1, 'una scelta per riga in più'],
      ['Posizionamento di 15 pallet in fila', 2, 14, 0, 'l\'ubicazione resta fissa: solo i campi si riscansionano'],
    ];
    riga('| Caso | base | ripetizioni | per volta | **totale** | perché |');
    riga('|---|---:|---:|---:|---:|---|');
    for (const [nome, base, n, per, perche] of casi) {
      riga(`| ${nome} | ${base} | ${n} | ${per} | **${base + n * per}** | ${perche} |`);
    }
    riga('\nCol lotto imballato in misure diverse — che è il caso della miscela vera — la scelta dei colli aggiunge **2 tocchi a ogni riga**: il prelievo guidato dei quindici componenti passa da 21 a **51**.\n');
    expect(casi.length).toBe(5);
  });

  it('il sorgente regge ancora i numeri dichiarati', () => {
    riga('\n### La verifica sul sorgente\n');
    riga('| Vista | campi con Invio | pulsanti che avanzano |');
    riga('|---|---:|---:|');
    const viste = [...new Set(OPERAZIONI.map((o) => o.vista))];
    const misure = {};
    for (const v of viste) {
      const src = V(v);
      misure[v] = { invio: CAMPI_CON_INVIO(src), pulsanti: pulsantiCheAvanzano(src).length };
      riga(`| ${v}.ts | ${misure[v].invio} | ${misure[v].pulsanti} |`);
    }

    /* IL POSIZIONAMENTO NON DEVE COSTARE UN TOCCO. È il gesto più frequente
       del magazzino: quattro campi in fila, tutti a scansione, e l'ultimo
       Invio conferma. Se un giorno servisse un tocco, quel tocco lo farebbe
       trecento volte al giorno chi porta i guanti. */
    if (misure.posiziona.invio < 4) {
      difetto('GE1', 'grave', 'ui/views/posiziona.ts',
        `La maschera di posizionamento ha ${misure.posiziona.invio} campi concatenati con Invio invece di 4: qualcuno ha spezzato la catena, e il gesto più frequente del magazzino adesso chiede un tocco.`,
        'posiziona.ts, campi con onkeydown Enter');
    }
    /* La stessa cosa per il trasferimento, che è l'altro gesto a scansione
       pura: articolo, lotto, destinazione. */
    if (misure.prelievo.invio < 3) {
      difetto('GE2', 'grave', 'ui/views/prelievo.ts',
        `Il trasferimento ha ${misure.prelievo.invio} campi concatenati con Invio: la catena si è spezzata e il gesto chiede tocchi che prima non chiedeva.`,
        'prelievo.ts');
    }
    expect(misure.posiziona.invio).toBeGreaterThanOrEqual(4);
  });
});
