# Architettura Viste UI (`src/ui/views/`)

Questa directory accoglie i moduli delle viste estratti progressivamente da `src/ui/app.js`, consentendo di ridurre la complessità del monolite e convertire l'interfaccia a TypeScript in modo sicuro e incrementale.

## Struttura prevista

- `destinatariView.js` / `.ts`: Gestione dell'anagrafica destinatari DDT e selezione destinazioni.
- `parametriView.js` / `.ts`: Gestione parametri articolo (allergeni, conservazione, UM, pericolosità).
- `compitiView.js` / `.ts`: Schedulatore e coda attività di magazzino.
- `campionamentoView.js` / `.ts`: Flusso campionamento GMP, verbali PDF e pulizia post-campionamento.
- `movimentaView.js` / `.ts`: Movimentazioni, carichi, scarichi, trasferimenti e gestione UOM (v1.7).
- `giacenzeView.js` / `.ts`: Viste giacenze, conte multiple e report (v1.8).
- `configView.js` / `.ts`: Schede di configurazione siti, zone, operatori e funzioni.
