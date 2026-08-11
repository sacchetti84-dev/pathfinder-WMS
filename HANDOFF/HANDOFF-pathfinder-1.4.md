# HANDOFF — Pathfinder 1.4

**Passaggio di consegne per la prossima conversazione**
Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 11/08/2026 · Rev. 01 — la 1.4 ha un piano, una scadenza e il primo pezzo di codice

---

## 0. Come si riprende, in tre righe

Dare **[INDEX.md](../INDEX.md)** e **questo file**. Basta.
Quando si comincia a costruire, aprire **[PIANO-1.4.md](PIANO-1.4.md)**: lì c'è il
disegno dei dati, il calendario e il perché di ogni scelta. Il README serve solo a
chi installa. Gli HANDOFF [1.3](HANDOFF-pathfinder-1.3.md) e
[1.0](HANDOFF-pathfinder-1.0.md) restano validi per ciò che qui non viene ridetto.

Repo privato `sacchetti84-dev/pathfinder`, branch `main`, ultimo commit **`e7e6512`**,
albero pulito e in pari con origin.

---

## 1. Stato, al minuto

| Voce | Valore |
|---|---|
| In magazzino, **adesso** | `pathfinder-1.1.html` — verificato su `/api/app-info` |
| Costruita e mai installata | 1.2, e da oggi contiene anche la verifica di stoccaggio |
| Sorgente | 25 file in `src/`: **19 TypeScript**, 6 JavaScript, più 5 CSS |
| Ancora JavaScript | `core/store.js` · `main.js` · `ui/` (4 file) |
| Collaudi | **109 client** · **29 servizio** · **8 migrazione** — tutti verdi |
| Tipi | `npm run check` a 0 su client e servizio |
| Scadenza progetto | **31/12/2026** · ultima installazione utile **19/12** |

> **Attenzione a un disallineamento che c'è già.** Il magazzino gira sulla **1.1**,
> ma tutto il lavoro di oggi è nella 1.2 costruita. Nessuno vedrà la verifica di
> stoccaggio finché la 1.2 non entra in servizio: sono i cinque comandi dell'HANDOFF
> 1.3 §6, ancora da dare.

---

## 2. Cosa è successo in questa sessione

Cinque commit.

| Commit | Cosa |
|---|---|
| `60ddceb` | **5.519 righe di commento** tolte da 39 file. Provato che il codice non cambia: bundle JS minificato identico byte per byte prima e dopo. Nasce `INDEX.md` |
| `3127d79` | **PIANO-1.4**: le cinque funzioni riordinate per dipendenza, calendario, e il bloccante della §1 |
| `2142031` | Il collaudo che dimostra che i dati di oggi sopravvivono al cambio di schema, più il prototipo della migrazione |
| `99d7bb3` | Le tre decisioni: WIP dentro, verifica a fine ottobre, `store.js` in Fase 0. Calendario rifatto |
| `548c3df` + `e7e6512` | **Verifica di stoccaggio**: attributi articolo e zona, import/export Excel, segnalazione in mappa, deroga della cella Riservata |

### Decisioni prese, che valgono da qui in avanti

1. **Il WIP resta nella 1.4** (1.4.5, installato il 19/12 a interruttore spento).
2. **Verifica dell'andamento il 31/10**, con quattro fatti da guardare e una scala di
   cosa togliere già decisa — PIANO-1.4 §6.
3. **`core/store.js` in TypeScript dentro la Fase 0.**
4. **Allergeni:** i 14 dell'Allegato II del Reg. UE 1169/2011. Elenco chiuso.
5. **Temperature:** `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C.
6. **Niente parsing tollerante**: i valori arrivano convalidati da Excel, quindi la
   lettura è stretta e ciò che non è un codice previsto si segnala.
7. **La cella Riservata ammette allergeni** — deroga esplicita, contata ed elencabile.
   Sulla temperatura non deroga.

---

## 3. Da dove si riparte, in ordine

### Prima cosa, e non è codice

**Caratterizzare le zone** in Configurazione → Zone: classe di conservazione, e la
spunta sulla zona allergeni. Finché non è fatto la mappa resta muta, per quanti
articoli si classifichino: la verifica confronta due metà e una manca.

Poi **esportare l'anagrafica** e costruire le tendine in Excel puntando al foglio
**«Valori ammessi»** che l'export porta con sé.

### Poi il codice della 1.4.0, in quest'ordine

| # | Cosa | Dove |
|---|---|---|
| 1 | **La migrazione `ALTER TABLE` dentro `PathfinderDB`**, fra `createSQL` e gli indici. Il prototipo e le 8 prove esistono già: si sposta `migra()` e si toglie da lì | `server/lib/db.js` · `server/test/collaudo-migrazione-1.4.js` |
| 2 | **`core/store.js` in TypeScript**, a blocchi. Cache e `_applyToCache` per primi | PIANO-1.4 §3 |
| 3 | **Collaudi su `_applyToCache`** — 14 collezioni oggi, 18 dopo | — |
| 4 | Lo schema mosso **una volta**: `inventory.udc_id`, le collezioni `lots` `udc` `tasks` `wip` vuote, Dexie `version(8)` | PIANO-1.4 §3 |
| 5 | Export/import letto da `COLLEZIONI` invece che da tre elenchi a mano | PIANO-1.4 §5bis |
| 6 | Gli interruttori `feature.*` in `meta`, tutti spenti | PIANO-1.4 §3 |

Criterio di riuscita della 1.4.0: **si installa e non cambia niente a video.**

---

## 4. Le trappole trovate oggi

Costano ore a chi le ritrova da solo.

1. **PowerShell distrugge gli accenti.** `Get-Content`/`Set-Content` in Windows
   PowerShell 5.1 leggono e scrivono in CP1252: un giro su un `.ts` UTF-8 trasforma
   `Quantità` in `QuantitÃ ` su 17.000 righe. Per riscrivere in blocco si passa da
   Node in **UTF-8 senza BOM, a-capo LF**. I due `.ps1` invece **hanno** il BOM e va
   lasciato.
2. **Il dev server parla col magazzino vero.** `vite.config.js` rimanda `/api` a
   `127.0.0.1:4173`. Per provare senza toccare niente: **`?db=local`**, che passa
   all'adapter IndexedDB del browser.
3. **`CREATE TABLE IF NOT EXISTS` non aggiunge colonne**, e il `CREATE INDEX` dopo
   muore nel costruttore: il servizio non parte affatto. È il bloccante della
   PIANO-1.4 §1.
4. **`getLocationStatus`: uno stato esplicito vince su «occupata».** Una cella
   Riservata con merce dentro resta `reserved`. Senza questo la deroga non sarebbe
   mai scattata, perché le celle da segnalare sono per definizione occupate.
5. **`addArticle` esce con `false` su un codice noto.** Era il motivo per cui l'import
   Excel diceva «importati 0» su un'anagrafica popolata. Ora c'è `upsertArticles`.
6. **`Dialog.confirm` non accetta HTML**: vuole `message` (testo) e `details` (nodo
   DOM). È deliberato — niente è iniettabile. Si costruisce con `document.createElement`.
7. **Le classi `table` / `table-sm` non esistono**: la tabella del progetto è
   `sx-table`, dentro un `div` con `overflow-x:auto`.
8. **Nella pagina è esposto solo `window.App`**, non `Store`. Per sondare dal browser
   si passa dai metodi di App.
9. **L'ordine degli allergeni è quello dell'Allegato II**, non quello di digitazione:
   `SOIA` (6ª) viene prima di `LATTE` (7ª). Due articoli con gli stessi allergeni
   devono risultare uguali anche a chi confronta le stringhe.
10. **Il prefisso `nc-` era già preso** dalle stampe del cartellone non conformità.
    Le classi nuove usano `conf-`.

---

## 5. Cosa NON fare

Valgono le §7 degli HANDOFF 1.3 e 1.2. In aggiunta:

- **Non installare la 1.4.x prima della migrazione della §3.1**: il servizio non parte.
- **Non toccare `pathfinder-1.1.html` in radice** finché è quello servito.
- **Non accendere due interruttori `feature.*` nello stesso turno.**
- **Non aggiungere un quindicesimo allergene** a `ALLERGENI`: è una norma, non una
  preferenza. Le esigenze locali si esprimono con la deroga della cella Riservata.
- **Non rendere tollerante la lettura di allergeni e temperature.** È stretta apposta:
  indovinare cosa intendeva chi ha scritto `-18` è il modo di mettere un articolo col
  latte in una zona senza latte.
- **Non provare a mano nel browser sulla porta 5199 senza `?db=local`** (trappola 2).

---

## 6. Aperti che restano

Quelli di sostanza stanno in **INDEX §6bis** e nel **PIANO-1.4 §8**. In sintesi:

| # | Cosa | Chi |
|---|---|---|
| 1 | **Portare la 1.2 in magazzino** — cinque comandi, HANDOFF 1.3 §6 | Andrea, a fine turno |
| 2 | Caratterizzare le zone e popolare l'anagrafica | Andrea |
| 3 | Nome DNS interno e certificato dalla CA | IT |
| 4 | Partita IVA e dati mittente — senza, i DDT escono «non conformi» | Andrea |
| 5 | Prefisso aziendale GS1, per le etichette UDC di 1.4.3 | da chiedere |
| 6 | Chi può alzare la priorità di un compito (proposta: solo Team Leader) | Andrea |
| 7 | `TODO F1-REVIEW` ×3, `ui/` in TypeScript, i due file identici in `ARCHIVIO/LOGHI` | rinviati |

---

## 7. Comandi

```bash
npm run check                       # tsc client + servizio
npm test                            # 109 prove client
npm run build                       # produce "Pathfinder 1.2/"
```

```bash
node test/collaudo.js               # 29 prove servizio, da server/
```

```bash
node test/collaudo-migrazione-1.4.js   # 8 prove sul cambio di schema, da server/
```

---

*Uso interno Dietopack S.r.l. / Naturacare Group — © Andrea Sacchetti*
