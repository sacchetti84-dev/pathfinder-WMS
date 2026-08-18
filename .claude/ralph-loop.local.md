---
active: true
iteration: 1
session_id: 75d94c66-ad4b-4f7e-b20f-3a9e7e60c773
max_iterations: 40
completion_promise: "MIGRAZIONE COMPLETATA"
started_at: "2026-08-18T13:44:37Z"
---

Migrazione a TypeScript di Pathfinder: una riga di coda per iterazione. Lavora in C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER.

La coda, le regole e la forma esatta di un'iterazione stanno in C:\Users\sacch\AppData\Local\Temp\claude\C--Users-sacch-OneDrive-Desktop-PROGETTI-E-CODING\75d94c66-ad4b-4f7e-b20f-3a9e7e60c773\scratchpad\PIANO-MIGRAZIONE.md — leggilo per primo, a ogni iterazione, e leggi anche `git log --oneline -8` per vedere dove sei arrivato.

Fai SOLO la prima riga non spuntata della coda. Chiudila verde — `npm run check`, `npm test` (485 prove o piu', mai meno), `npm run build` — e committala col titolo `Migrazione N/32 - <file>`. Poi spunta la riga nel piano, scrivi accanto quanti `any` sono spariti, e fermati: l'iterazione dopo prende la riga successiva.

Convertire e' spostare, non riscrivere: il comportamento a video resta identico. Se un tipo fa vedere un difetto, NON correggerlo — scrivilo in fondo al piano, sotto «Difetti che la migrazione ha fatto vedere», e lo prende il ciclo di debug che viene dopo. Niente `as any`, niente `@ts-ignore`. Non toccare test/superficie-app.dati.js per far tacere un collaudo. Conserva i fine riga: `git mv` prima di modificare. Niente tocca C:\Pathfinder\, il servizio o le attivita' pianificate, e `npm run dev` non si usa.

Quando la riga C1 e' committata — tutte le 32 righe spuntate, tsconfig chiuso e INDEX aggiornato — e solo allora, scrivi <promise>MIGRAZIONE COMPLETATA</promise>.
