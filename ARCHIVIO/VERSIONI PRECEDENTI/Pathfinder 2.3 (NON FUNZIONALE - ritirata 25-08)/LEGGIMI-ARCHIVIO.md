# Pathfinder 2.3 — versione ritirata

**Non installare.** La 2.3 ha disfunzionato in produzione ed è stato necessario
un ripristino d'emergenza alla 2.2. Questa cartella è memoria, non un rilascio.

Ritirata il 25/08/2026. Archiviata il 25/08/2026.

## Cosa c'è qui dentro

| | |
|---|---|
| `app/`, `servizio/`, `installa.ps1`, `Installa Pathfinder.bat`, `LEGGIMI.txt` | il pacchetto costruito, impronta `367d977e…`, 4 file |
| `2.3-reparto-e-giro-conto.bundle` | il ramo git completo — commit `d717098`, 49 file, +22.156 / −1.265 righe |

Il bundle porta **la storia intera**, non solo la punta: si riapre senza il
repository di origine.

## Cosa portava la 2.3

Il giro conto nel vano di lavorazione (un `out` sul cedente e un `in` sul
ricevente, `qty` a zero, `giro_odp` a distinguerlo), il controllo pre-percorso
su quel che il reparto ha già in mano, la lista piatta dei colli al posto del
conto per ordine, e il percorso di più ODP insieme.

Il caso che l'aveva chiesta: cinque ODP della stessa serie chiedono 5 KG dello
stesso lotto l'uno, a magazzino c'è una confezione da 25, il primo prelievo si
portava via il collo intero e i quattro percorsi dopo dicevano «lotto non
trovato».

Il problema resta aperto. La strada scelta per risolverlo no.

## Come si rilegge

```
git clone "ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.3 (NON FUNZIONALE - ritirata 25-08)/2.3-reparto-e-giro-conto.bundle" /tmp/pf23
```

Oppure, dentro il repository di lavoro:

```
git fetch "ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.3 (NON FUNZIONALE - ritirata 25-08)/2.3-reparto-e-giro-conto.bundle" 2.3-reparto-e-giro-conto:2.3-recuperata
```

Verifica dell'integrità:

```
git bundle verify "…/2.3-reparto-e-giro-conto.bundle"
```

## Il pacchetto si ricostruisce

La build è riproducibile bit per bit: lo stesso commit ricostruito a giorni di
distanza dà la stessa impronta, cifra per cifra. Dopo aver recuperato il ramo
dal bundle, `npm run build` rifà `367d977e…`.
