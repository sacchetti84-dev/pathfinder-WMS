/* I NOMI CHE App ESPONEVA PRIMA CHE LE VISTE USCISSERO DA app.js.

   Non e' un elenco da tenere aggiornato a mano: e' il foglio con cui si
   controlla che un metodo estratto sia RIENTRATO in App. L'HTML e i gestori
   costruiti dentro le stringhe chiamano App per nome, e un nome perso per
   strada non da' errore: da' un pulsante che non fa niente.

   Si tocca quando App guadagna o perde un metodo DAVVERO - cioe' quando si
   sviluppa una funzione, mai quando si sposta un blocco in un altro file.
   2.0: sono usciti `_FUNZIONI`, `_TURNO_MS`, `_syncFeatureNav` e
   `_toggleFeature` insieme agli interruttori.
   2.1: sono entrati `_etichettaRuolo` e `_ruoloScelto` col ruolo Admin.
   2.1: sono entrati i quattro del conto di produzione — `_wipConsumaTutto`,
   `_wipDichiaraConsumata`, `_wipScelteConParte`, `_wipStampaRendiconto`.
   2.2: la scelta dei colli si fa per MISURA e non piu' collo per collo:
   sono usciti `_colliSelQta` e `_colliSelToggle`, sono entrati
   `_colliSelPreso`, `_colliSelParte`, `_colliSelParteDa` e
   `_colliSelOpzioniParte`.
   2.13: sono entrati i cinque della via di fuga dai PIN persi —
  `_renderRecoveryGate` e `_confirmRecovery` (il rientro con codice dalla
  schermata di accesso), `_mostraCodiceRipristino` e
  `_stampaCodiceRipristino` (il pannello che lo mostra una volta sola e il
  foglio da mettere in cassaforte), `rigeneraCodiceRipristino` (un Admin ne
  emette uno nuovo, e quello vecchio muore).
  2.9: la griglia di incompatibilita' e' uscita e con lei `_matriceHtml` e
   `_toggleIncompatibilita`; sono entrati `_srCambiaBersaglio` (la
   pericolosita' come bersaglio di regola), `_scanErrore` e `_scanAvanti`
   (la scansione che segnala e non chiude), `_elencoNCAperto` e
   `_trasferisciDaElenco` (il trasferimento dall'elenco fuori posto).
   2.8: sono entrati i nove delle regole di stoccaggio — `_regoleBaseHtml`,
   `_matriceHtml` e `_toggleIncompatibilita` per la scheda delle regole;
   `showCaratterizzaUbicazione`, `_salvaCaratterizzazione`,
   `_scaratterizzaUbicazione` e `_rigaAttributiVano` per la
   caratterizzazione della singola cella; `_usaVanoDiCasa` e
   `_usaUdcProposta` per i due bottoni delle regole base.
   2.19: sono entrati i sedici della stampa su Zebra in rete. La maschera
   che sta fra il pulsante e l'etichetta — `_chiediStampaEtichetta`,
   `_eseguiStampaEtichetta`, `_riscontroStampa`, `_sitoDiUbicazione`,
   `_provaStampante`. La scheda di configurazione —
   `_renderConfigStampanti`, `_stampantiElencoHTML`, `_stampanteModifica`,
   `_stampanteSalva`, `_stampanteTogli`, e i quattro del layout
   (`_layoutEtichettaHTML`, `_layoutEtichettaLetto`, `_layoutEtichettaSalva`,
   `_layoutEtichettaDiSerie`). Piu' i due che portano il vecchio nome della
   stampa su foglio: `_udcEtichettaA4` e `_stampaEtichettaItemA4`, perche' il
   nome senza suffisso adesso e' quello che CHIEDE dove stampare — la Zebra
   si affianca alla carta, non la sostituisce.
   2.20: sono entrati i quindici del magazzino del prodotto finito —
   `_formProdottoFinito` (la maschera), i sette del bancale che si compone
   (`_pfBozza`, `_pfBozzaHTML`, `_pfNuovoBancale`, `_pfAggiungiRiga`,
   `_pfTogliRiga`, `_pfAnnullaBozza`, `_pfChiudiBancale`), i tre della
   proposta (`_pfProponiUbicazione`, `_pfArticoloLetto`, `_pfModelloCorrente`,
   `_pfModelloScelto`), e i tre della lettura (`_pfBancali`, `_pfElencoHTML`,
   `_pfEtichetta`), piu' `_pfEtichettaA4` — la via su foglio, che porta il
   nome col suffisso come le altre due: il nome senza suffisso e' quello che
   CHIEDE dove stampare. Con l'elenco che si ordina e si filtra sono entrati
   `_pfTabella`, `_pfColonne`, `_pfOrdina`, `_pfCerca` e `_pfTabellaHTML`, e
   con la vista grafica `_pfVediInMappa` piu' i tre della mappa —
   `_mapFiltroPf`, `_mapToggleFiltroPf`, `_pfStatiBancali`. Con l'aggancio al
   DDT sono entrati `_pfSel`, `_pfSpunta`, `_pfCaricaInDdt` e
   `_shipCaricaDaBancali` — quest'ultimo sta in `spedizioni.ts`, perche' il
   carrello e' di la'. Con la packing list sono entrati `_printPackingList`,
   `_packingBlocchi` e `_packingLordo` — anche loro in `spedizioni.ts`, perche'
   il documento da cui la packing list nasce e' il DDT. Col conto terzi sono
   entrati `_shipDestLocation`, `_shipETrasferimento`, `_shipAggiornaDestLoc`
   e `_evadiTrasferendo` — l'evasione che sposta invece di scaricare.
   2.20: sono entrati i quattro dei modelli di imballo del prodotto finito —
   `_imballiHTML`, `_imballoModifica`, `_imballoSalva`, `_imballoTogli` — e
   `_campoImballo`, la tendina che l'anagrafica articoli mostra solo quando
   un modello esiste.
   2.21: la maschera del prodotto finito e' diventata quella del carico
   merce — articolo, lotto, colli pieni per quanto dentro — e l'ubicazione si
   scansiona DOPO l'etichetta. Sono entrati i due della maschera
   (`_pfPartiteHTML`, `_pfUbicazioneHTML`), gli otto della dichiarazione dei
   colli (`_pfColli`, `_pfColliChiave`, `_pfCampoColliHTML`, `_pfColliRigaAdd`,
   `_pfColliRigaDel`, `_pfColliRigaSet`, `_pfRenderColli`, `_pfAnteprimaColli`),
   `_pfConfezione` e `_pfFuocoColli`, `_pfPosiziona` — il gesto che porta il
   bancale nel vano e ci fa entrare la merce — `_cbPickPf`, e i tre dei
   bancali etichettati e mai riempiti (`_pfOrfani`, `_pfOrfaniHTML`,
   `_pfScartaOrfano`), piu' `_pfModelloDelBancale` — il formato che il
   bancale porta scritto sopra, anche quando l'articolo lo sta imparando
   proprio da lui.
   2.21: l'elenco dei bancali porta articolo e lotto in due colonne, il DDT
   con cui sono partiti e la data — che si RILEGGONO dai documenti evasi,
   non sono campi dell'unita' — e un filtro di stato: sono entrati
   `_pfArticoloCella`, `_pfFiltroStato`, `_pfFiltrati` e `_pfStato`. Con lo
   scarico a mano sono entrati `_pfScaricoManuale`, `_pfCausaleUscita` e
   `_shipRigheDaBancali` — quest'ultimo in `spedizioni.ts`, perche' come una
   riga di DDT nasce da un bancale sta scritto li' e non si copia.
   2.21: e' nata la schermata del CARICO SPEDIZIONI — `caricoSpedizione.ts`,
   la ventiseiesima vista. E' il giro di prelievo di chi carica il camion, e
   le tappe sono BANCALI: `_formCaricoSpedizione`, i tre dell'avvio
   (`_carDocumentiCaricabili`, `_carAvvioHTML`, `_carAvvia`), i due della
   forma (`_carDocDelCarico`, `_carTappeDaDoc`), i due del giro
   (`_carDocCorrente`, `_carGiroHTML`), i cinque della scansione
   (`_carScansiona`, `_carRiallineaDoc`, `_carVanoLibero`, `_carFeedback`,
   `_carRiscontro`), `_carSalta`, i due del secondo DDT (`_carAltroDdt`,
   `_carScegliDdt`), i due della fine (`_carChiudi`, `_carAbbandona`) e
   `_carEsito`, che e' l'unico stato che non sta a database.
   2.24: la packing list si legge per ARTICOLO, LOTTO E BANCALE — tre livelli
   di riga, e ognuno porta il suo totale. `_packingRiepilogoHTML` e' uscita
   perche' il riepilogo in coda era la risposta che adesso da' il foglio
   intero; sono entrate `_packingDistintaHTML`, che disegna i tre livelli, e
   `_packingQta`, che scrive il numero e la sua unita' in due celle.
   `_packingComposizione` prende adesso le uscite e l'unita' invece di una
   riga: la distinta le ha gia' lette.
   2.24: il FOGLIO si separa dalla STAMPA — `_ddtFoglioHTML` e
   `_packingFoglioHTML` compongono, `_printDDT` e `_printPackingList`
   leggono dallo Store e stampano. Serve al banco a video, che sui documenti
   a database — da UNA riga nella copia di prova — non misurava mai il caso
   che rompe un foglio: quello che non ci sta. Il DDT stampa una riga per articolo#lotto invece
   di una per bancale: il raggruppamento e' `raggruppaPerPartita` in
   `modules/documenti.ts`, dove una riga di documento si compone, e le righe
   SALVATE restano una per bancale.
   2.21: la tessera del prodotto finito porta un MARCHIO invece di
   un'emoji — la fabbrica non e' il prodotto finito, e' dove si fa — quindi
   e' entrato `MARCHIO_BANCALE`, il rimando allo sprite di `index.html`.
   2.1: sono usciti i sei della copia esterna (`vault*`, `doVaultRestore`,
   `_scheduleVaultBackup`), `purgeOldLogsManual` con la purga, e i due
   salvataggi a mano `forceSave` e `manualSave`.
   2.22: la scheda della tappa mostra la CAMPATA vista di fronte — a che
   altezza sta il vano da prelevare. Sono entrati `_routeColonna` (che
   chiede la campata a `modules/colonna.ts`), `_routeColonnaHTML` (il
   disegno), `_routeRischioLottoHTML` (la banda dello stesso articolo con
   un altro lotto, un altro livello) e `_COL_STATI`, le cinque etichette di
   stato scritte con le stesse parole della mappa.
   2.23: e' entrato `_ico`, uno solo, e sostituisce 68 emoji. Sta accanto a
   `_esc` perche' fa lo stesso mestiere — un pezzo di markup che le viste
   chiedono da dentro una stringa. Ed e' entrato `_carTappaHTML`: la tappa
   del carico camion era una riga di tabella in mezzo a quelle gia' fatte,
   adesso e' la scheda che hanno le altre quattro schermate a scaffale.
   2.23: il CARICO DEL CAMION e' entrato dentro Spedizioni come scheda, e la
   dodicesima tessera di Movimenta e' sparita — comporre un DDT e andare a
   prendere i bancali che ci vanno sopra sono due momenti dello stesso
   mestiere. Sono entrati `_shipSub` e `_renderShipSub` (le due schede, come
   `_pickSub` per il prelievo), `_formDocumenti` (quel che la schermata
   faceva prima, dentro la sua scheda) e `_carRidisegna`, il punto unico da
   cui il carico si ridisegna: prima erano sette richiami a `movFormArea`,
   che adesso non e' piu' il posto giusto. */
export const SUPERFICIE = [
  'MARCHIO_BANCALE',
  '_campoImballo', '_imballiHTML', '_imballoModifica', '_imballoSalva', '_imballoTogli',
  '_formProdottoFinito', '_pfAggiungiRiga', '_pfAnnullaBozza', '_pfArticoloLetto',
  '_pfBancali', '_pfBozza', '_pfBozzaHTML', '_pfChiudiBancale', '_pfElencoHTML',
  '_pfEtichetta', '_pfEtichettaA4', '_pfModelloCorrente',
  '_pfTabella', '_pfColonne', '_pfOrdina', '_pfCerca', '_pfTabellaHTML', '_pfVediInMappa',
  '_mapFiltroPf', '_mapToggleFiltroPf', '_pfStatiBancali',
  '_pfSel', '_pfSpunta', '_pfCaricaInDdt', '_shipCaricaDaBancali',
  '_printPackingList', '_packingFoglioHTML', '_ddtFoglioHTML',
  '_packingBlocchi', '_packingLordo',
  '_packingComposizione', '_packingDistintaHTML', '_packingQta',
  '_shipDestLocation', '_shipETrasferimento', '_shipAggiornaDestLoc', '_evadiTrasferendo', '_pfModelloScelto', '_pfNuovoBancale',
  '_pfProponiUbicazione', '_pfTogliRiga',
  '_pfPartiteHTML', '_pfUbicazioneHTML', '_pfPosiziona', '_cbPickPf', '_pfFuocoColli',
  '_pfColli', '_pfColliChiave', '_pfConfezione', '_pfCampoColliHTML',
  '_pfColliRigaAdd', '_pfColliRigaDel', '_pfColliRigaSet',
  '_pfRenderColli', '_pfAnteprimaColli',
  '_pfOrfani', '_pfOrfaniHTML', '_pfScartaOrfano', '_pfModelloDelBancale',
  '_pfArticoloCella', '_pfFiltroStato', '_pfFiltrati', '_pfStato',
  '_pfScaricoManuale', '_pfCausaleUscita', '_shipRigheDaBancali',
  '_formCaricoSpedizione', '_carEsito', '_carDocumentiCaricabili', '_carAvvioHTML',
  '_carAvvia', '_carDocDelCarico', '_carTappeDaDoc', '_carDocCorrente', '_carGiroHTML', '_carTappaHTML', '_carRidisegna',
  '_carScansiona', '_carRiallineaDoc', '_carVanoLibero', '_carFeedback', '_carRiscontro',
  '_carSalta', '_carAltroDdt', '_carScegliDdt', '_carChiudi', '_carAbbandona',
  '_chiediStampaEtichetta', '_eseguiStampaEtichetta', '_layoutEtichettaDiSerie', '_layoutEtichettaHTML', '_layoutEtichettaLetto', '_layoutEtichettaSalva', '_provaStampante', '_renderConfigStampanti', '_riscontroStampa', '_sitoDiUbicazione', '_stampaEtichettaItemA4', '_stampanteModifica', '_stampanteSalva', '_stampanteTogli', '_stampantiElencoHTML', '_udcEtichettaA4',
  'UNDO_WINDOW_MS', '_ARC_KINDS', '_DOC_REQUIRED', '_KNOWN_OPERATORS_KEY',
  '_MIGRATED_KEY', '_MOVQUEUE_KEY', '_MOV_COLORS', '_MOV_SHORT', '_OPERATOR_KEY',
  '_PARAM_SCHEDE', '_PICK_REPORT_VER', '_SCANNER_FIX_KEY', '_SIDEBAR_KEY',   '_activateOperator', '_afterLogin', '_aggiornaConformita', '_aggiornaNotaUM',
  '_aggiornaRubrica', '_anteprimaColliIn', '_anteprimaUmIn', '_applyMovWindow',
  '_applySessionTimeout', '_arcFrom', '_arcRedraw', '_arcReset', '_arcText', '_arcTo',
  '_arcType', '_archiveRows', '_armSearchOutsideClose', '_artFilter', '_artSort',
  /* 2.11 — la promessa che l'identificazione scioglie prima del carico. */
  '_aspettaIdentificazione', '_attesaIdentificazione', '_identificato', '_sessioneRipresa',
  '_autoLookupArticle', '_avvisiArticolo', '_avvisiBanda', '_avvisiRigaStampa',
  '_blockedByReadOnly', '_bloccaCampoColli', '_buildPickReportHTML', '_buildRegistryTable', '_cambioLookup',
  '_cambioSelect', '_cambioSelectEnc', '_campBloccoPulizia', '_campCerca',
  '_campRenderDettaglio', '_campReset', '_campSelect', '_campState',
  '_campiAttributiArticolo', '_campiDestinazioneZona', '_campoColliIngresso',
  '_campoUmIngresso', '_cancelPendingShip', '_causaliDDT', '_cbPickCambio', '_cbPickIn',
  '_cbPickInv', '_cbPickReleaseDest', '_checkPendingPickSession', '_checkStorageQuota',
  '_chiediColli', '_closeIdentityGate', '_closePickLoc', '_colliIn', '_colliInChiave',
  '_colliInUom', '_colliQtyInput',
  '_colliResolve', '_colliRigaAdd', '_colliRigaDel', '_colliRigaSet', '_colliSel',
  '_colliSelAnnulla', '_colliSelChiudi', '_colliSelOk', '_colliSelOpzioniParte',
  '_colliSelParte', '_colliSelParteDa', '_colliSelPreso', '_colliSelPrev',
  '_colliSelRender', '_colliSelScelte', '_conf',
  '_confermaImportArticoli', '_configTab', '_confirmCompleteProfile',
  '_confirmFirstLeader', '_confirmLogin', '_confirmRecovery',
  '_renderRecoveryGate', '_mostraCodiceRipristino', '_stampaCodiceRipristino',
  'rigeneraCodiceRipristino',
  '_contaAnteprima', '_contaBack',
  '_contaCheckArt', '_contaCheckLoc', '_contaCheckLot', '_contaRenderVerify',
  '_contaSelect', '_contaState', '_datalistUM', '_ddtTotaliUom', '_dateISOtoIT', '_dateITtoISO',
  '_dateMaskBlur', '_dateMaskInput', '_dispBack', '_dispCheckArt', '_dispCheckLoc',
  '_dispCheckLot', '_dispFreeReasonInput', '_dispPickReason', '_dispRenderSearch',
  '_dispRenderVerify', '_dispReset', '_dispSelect', '_dispStage', '_dispState',
  '_dispSwitchToAlternative', '_doResync', '_docCausaleAdd', '_docCausaleEdit',
  '_docCausaleLabel', '_docCausaleRemove', '_docBarcodeHTML', '_docCell', '_docHeadHTML', '_docIsReturn',
  '_docPageHTML', '_docPrint', '_docReasonAdd', '_docReasonEdit', '_docReasonRemove',
  '_docResetList', '_docSaveNumbering', '_docSaveSender', '_docSenderGaps', '_docWarnHTML',
  '_editAddNewLine', '_editCancel', '_editItemArtLookup', '_editLineNotes', '_editLineQty',
  '_editLookupNewLine', '_editPendingDoc', '_editPersistHeader', '_editRemoveLine',
  '_editSave', '_editSelectNewLineEnc', '_editSelectNewLineItem', '_editingSiteId',
  '_elencoDichiarato', '_emitFinalPickReport', '_emitPickReport', '_esc', '_etAllergene',
  '_etichettaRuolo', '_ruoloScelto',
  '_udcDestinazione', '_pickUdcIn', '_cbPickUdcIn',
  '_invUdcState', '_invFormUdc', '_invUdcCerca', '_invUdcRighe', '_invUdcRender',
  '_invUdcToggle', '_invUdcTutti', '_invUdcConta',
  '_routeSetCasa',
  '_umTotaliRiga', '_dettaglioItem', '_stampaEtichettaItem',
  '_vistaDiZona', '_udcNelVanoHTML', '_udcTrascinata', '_udcDragStart', '_udcDragOver',
  '_udcDragLeave', '_udcDrop',
  '_riquadriDisponibili', '_layoutCruscotto', '_contenutoRiquadro', '_renderRiquadri',
  '_renderKpiGrid', '_scorciatoieDisponibili', '_personalizzaCruscotto', '_dashTrascinato',
  '_dashDragStart', '_dashDragOver', '_dashDrop', '_dashCommuta', '_dashLarghezza',
  '_dashCommutaScorciatoia', '_dashRipristina', '_dashScrivi',
  '_arcOrdine', '_arcColonne', '_arcOrdina',
  '_opOrdine', '_opColonne', '_opOrdina', '_opCerca',
  '_regOrdine', '_regColonne', '_regOrdina', '_regCerca',
  '_movOrdine', '_movColonne', '_movOrdina',
  '_wipScegliColli',
  '_udcChiediQuarantena', '_udcChiediSmaltisci', '_udcQuarantena', '_udcRiepilogoHTML', '_udcRigheOChiedi', '_udcSmaltisci',
  '_etichettaTipoNC', '_evadiSpedizione', '_execCambio', '_execCampione', '_execConta',
  '_execInventario', '_execPosiziona', '_execProduzione', '_execQuarantena',
  '_execReleaseDest', '_execSmaltire', '_fasciaConformita', '_filterRegistry',
  '_filterRegistryDebounced', '_flashLocation', '_flushRecoveryQueue', '_fmtClock',
  '_fmtDateTime', '_fmtDayShort', '_fmtDurLong', '_fmtKg', '_fmtStamp', '_fmtUsage',
  '_focusKeeper', '_formCambio', '_formCampionamento', '_formCaricoScarico',
  '_formInventario', '_formOrdine', '_formPosiziona', '_formPrelievo', '_formProduzione',
  '_formQuarantena', '_formSmaltire', '_formSpedizioni', '_gateOpen', '_gateShell',
  '_getKnownOperators', '_getLocInfo', '_goOp', '_gotoPendingDoc', '_groupProdOrders',
  '_hasOpenCart', '_hideServiceDown', '_highlightSearchSel', '_invAddExtra', '_invConfirm',
  '_invCount', '_invRemoveExtra', '_invState', '_ioMode', '_ioSwitch', '_isoToIt',
  '_leggiAttributiArticolo', '_leggiDestinazioneZona', '_leggiFoglioArticoli', '_loadInv',
  '_loadScannerSettings', '_loadSidebarState', '_logMov', '_loginFails', '_loginPillsHTML',
  '_loginSelectedId', '_mapToggleDisable', '_migrateLegacyOperators', '_movCard',
  '_movColor', '_movMode', '_movSessionLog', '_movShort', '_moveItemCore',
  '_moveItemDestPreview', '_moveSelection', '_normScan', '_notaColliIn', '_notaUM', '_ntCercaArticolo',
  '_ntConferma', '_ntScegli', '_ntTypeChanged', '_onArtFilterInput', '_onReadOnlyChange',
  '_onSearchFocus', '_onSearchInput', '_onSearchKeydown', '_onSessionExpired',
  '_ico',
  '_openIdentityGate', '_openSearchHit', '_payload', '_persistShipHeader', '_pickCart',
  '_pickDocId', '_pickLoc', '_pickSnapFromCart', '_pickSnapFromLog',
  '_pickSnapFromSession', '_pickSub', '_pickSubMode',
  /* 2.23 — la serratura del posizionamento: la maschera si chiude mentre
     la scrittura e' in volo, cosi' il lettore non attacca il codice dopo
     a quello prima. Vedi `posiziona.ts`. */
  '_posInVolo', '_posCampiAperti',
  '_populateRegistryRows',
  '_precompilaCategoria', '_previewLoc', '_previewReleaseDest', '_primaryScanField',
  '_printDDT', '_printDisposal', '_printNCCard', '_printNCCardFromRecord',
  '_printPickArchive', '_printProdOrderFromLog', '_printProdReport', '_printRouteReport',
  '_prodAddEnc', '_prodAddToCart', '_prodCartSnapshot', '_prodCartZoneHTML',
  '_prodClearCart', '_prodLookup', '_prodOperator', '_prodOrderNum', '_prodPickStartTime',
  '_prodRemoveFromCart', '_promptText', '_pushUndo', '_qBack', '_qCheckArt', '_qCheckLoc',
  '_qCheckLot', '_qRenderSearch', '_qRenderVerify', '_qSelect', '_qStage', '_qState',
  '_qSwitchToAlternative', '_qtaOrdine', '_quarantineItemCore', '_queueFailedMovement', '_rcpFiltro',
  '_recoveryQueue', '_refreshSessionLog', '_regDefaultRange', '_regQuickRange',
  '_regRange', '_releaseQuarantine', '_renderCell', '_renderColliIn',
  '_renderCompleteProfile', '_renderConfigArticles', '_renderConfigData',
  '_renderConfigDocs', '_renderConfigFeatures', '_renderConfigOperators',
  '_renderConfigParams', '_renderConfigRecipients', '_renderConfigSession',
  '_renderConfigSites', '_renderDailyBars', '_renderDisposalDocs', '_renderEditModal',
  '_renderFirstLeaderWizard', '_renderIntegrityAlertsSection', '_renderInvExtras',
  '_renderIoSub', '_renderKpiPendingOutbound', '_renderLastMovements', '_renderLoginModal',
  '_renderMapFrontal', '_renderMapPlan', '_renderMovRegistry', '_renderOperatorBadge',
  '_renderPendingDdtList', '_renderPendingDocCard', '_renderPendingDocs',
  '_renderPickCart', '_renderPickSub', '_renderPickupAlertsSection', '_renderProdOrders',
  '_renderQuarantineList', '_renderQuickActions', '_renderRecoveryBanner',
  '_renderResilienzaCard', '_renderRouteRun', '_renderSearchPopup', '_renderSessionLog',
  '_renderShipCart', '_renderSiteOccupancy', '_renderTaskBanner', '_renderTaskKpi',
  '_renderTaskPayload', '_renderTaskRegistro', '_renderTaskTable', '_renderTasksPanel',
  '_renderTopArticles', '_renderTypeCounts', '_renderUndoBar', '_requireLeaderAuth',
  '_requireOperator', '_retryService', '_ridich', '_ridichAnnulla', '_ridichChiudi',
  '_ridichElenco', '_ridichOk', '_ridichPrev', '_ridichRender', '_ridichResolve',
  '_ridichRigaAdd', '_ridichRigaDel', '_ridichSet', '_ridichiaraColli',
  '_rigaUM', '_ristampaVerbaleCampione',
  '_routeAbandon', '_routeBlock', '_routeCheckArt', '_routeCheckLoc', '_routeCheckLot',
  '_routeClearImport', '_routeClose', '_routeColonna', '_routeColonnaHTML',
  '_routeConfirmStop', '_routeCurrentHTML', '_routeRischioLottoHTML', '_COL_STATI',
  '_routeCurrentStop', '_routeFb', '_routeFinishHTML', '_routeImportResultHTML',
  '_routeListRowHTML', '_routeMarkMissing', '_routeMoveSite', '_routeParsed',
  '_routeApertura', '_routeChiaveScan', '_routeDisponibili', '_routeFermoHTML',
  '_routeMsInPausa',
  '_routeNuovaApertura', '_routePausa', '_routePausaAperta', '_routePausaHTML',
  '_routeResume', '_routeRettifica', '_routeRiprendi', '_routeSaltaTappa',
  '_routeSave', '_routeScan', '_routeScanChiave', '_routeScanValida',
  '_routeSiteOrderHTML', '_routeStage', '_routeStatoTrasf', '_routeTrasfBandaHTML',
  '_routeStart', '_routeStartTime', '_routeSwitchToAlternative', '_routeTailRowHTML',
  /* 2.12 — il giro: piu' ordini in un percorso solo, la quantita'
     ricalibrabile, e la sosta (l'ubicazione scansionata una volta sola). */
  '_routeOrdini', '_routeCapofila', '_routeRicostruisci', '_routeSetCapofila',
  '_routeTogliOrdine', '_routeQtaOrdine', '_routeOrdineCardHTML', '_routeRichiesteHTML',
  '_routeSosta', '_routeSostaHTML', '_routeQuoteHTML', '_routeRiscansionaVano',
  '_giroDellaSessione',
  '_saveCheckpoint', '_saveShipPending', '_saving', '_scanBlock', '_scanFb',
  '_scanKeydownFix', '_scannerLayoutFix', '_scegliColli', '_scheduleAutoBackup',
  '_scheduleResync', '_searchAll', '_searchDebounced',
  '_searchHits', '_searchLimits', '_searchOut', '_searchOutsideHandler', '_searchQuar',
  '_searchSel', '_segnoConformita', '_selectLoginOp', '_setFeedbackPref',
  '_setScannerLayoutFix', '_shipAddToCart', '_shipAspetto', '_shipSub', '_shipSubMode', '_renderShipSub', '_formDocumenti', '_SOTTOSCHEDE', '_shipCarrier', '_shipCart',
  '_shipCartZoneHTML', '_shipCausale', '_shipClearCart', '_shipColliLiberi',
  '_shipCustomer', '_shipDdtNum', '_shipDestAddress', '_shipDestCity', '_shipDestProvince',
  '_shipDestVat', '_shipDestZip', '_shipDocDate', '_shipDocNotes', '_shipExpectedDate',
  '_shipLookup', '_shipMostraDestinazioni', '_shipOrderRef', '_shipPesoLordo',
  '_shipPesoNetto', '_shipPorto', '_shipRecipientPicked', '_shipRemoveFromCart',
  '_shipResetHeader', '_shipScegliDestinazione', '_shipSelectEnc', '_shipSelectItem',
  '_shipShipTo', '_shipStartTime', '_shipStartTransport', '_shipState', '_shipTrasporto',
  '_shortcuts', '_showRecoveryQueue', '_showRegistry', '_showReleaseDestDialog',
  '_showServiceDown', '_smoothPath', '_stampaVerbaleCampione', '_storageLabel',
  '_svgDonut', '_syncHeaderHeight', '_taskAbbandona', '_taskAction',
  '_taskAmbito', '_taskAvanza', '_taskLancia', '_taskLascia', '_taskPrioClasse',
  '_taskRun', '_taskScala', '_taskStatoClasse', '_taskTipo', '_testFeedback',
  '_tsBreve', '_tuttiIColli', '_umFuoriPosto', '_umMossa', '_undoBarHTML', '_undoEntry',
  '_undoLast', '_undoTimer', '_undoValid', '_updateProdCart', '_updateShipCart',
  '_wireRemote', 'cancelMov', 'changeLevel', 'clearSearch', 'closeDetail', 'closeModal',
  'closeSearchPop', 'confirmDeleteArticle', 'confirmDeleteRecipient', 'confirmDeleteSite',
  'confirmDeleteZone', 'confirmRemoveItem', 'confirmResetData', 'currentLevel',
  'currentOperator', 'currentOperatorRecord', 'currentSite', 'currentView', 'currentZone',
  'doAddArticle', 'doAddItem', 'doAddOperator', 'doAddSite', 'doAddZone',
  'doAggiungiParam', 'doCancelTask', 'doCreateTask', 'doEditArticle', 'doEditItem',
  'doEditOperator', 'doEditSite', 'doEditZone', 'doMoveItem', 'doQuarantineItem',
  'doRenewPin', 'doRimuoviDestinazione', 'doRimuoviParam', 'doSaveRecipient',
  'doSetTaskPriority', 'doStartTask', 'doTakeTask', 'esportaDeroghe',
  'esportaNonConformita', 'exportArticlesExcel', 'exportData', 'exportGiacenzeExcel',
  'exportMovLogExcel', 'exportTasksExcel', 'goToLocation', 'handleImport',
  'handleImportExcel', 'handleImportOdp', 'importArticlesCSV', 'importArticlesExcel',
  'importData', 'init', 'logoutOperator', 'mapViewMode', 'mostraDeroghe',
  'mostraNonConformita', 'onArticleSelect', 'openZone', 'opfsBackupNow',
  'renderArchive', 'renderConfig', 'renderDashboard', 'renderDetail',
  'renderMap', 'renderMovimenta', 'renderSidebar', 'renderTasks', 'restoreOPFSBackup',
  'selectLocation', 'selectedLocation', 'setLocStatus', 'setMapView',
  'setPrimaryScanField', 'showAddArticleModal', 'showAddItemModal', 'showAddOperatorModal',
  'showAddSiteModal', 'showAddZoneModal', 'showEditArticleModal', 'showEditItemModal',
  'showEditOperatorModal', 'showEditRecipientModal', 'showEditSiteModal',
  'showEditZoneModal', 'showModal', 'showMoveItemModal', 'showNewTaskModal',
  'showOPFSBackups', 'showOperatorMenu', 'showQuarantineItemModal', 'showRenewPinModal',
  'startMov', 'switchView', 'takeOverTab', 'toast', 'toggleLocDisabled',
  'toggleMirrorFrontal', 'toggleOperatorActive', 'toggleSidebar', 'toggleSite',
  'updateSyncIndicator', 'updateZoneFields',   
  /* 1.9 - L'INVENTARIO PER ARTICOLO, e il giro di conte che ne esce.
     Nomi NUOVI, non nomi spostati: sono la funzione, non un trasloco. */
  '_invSubMode', '_invSub', '_renderInvSub', '_invFormVano', '_invFormArticolo',
  '_gaState', '_invArtCerca', '_invArtApri', '_invArtRighe', '_invArtRender',
  '_invArtToggle', '_invArtToggleLotto', '_invArtTutti', '_invArtConta',
  '_invArtStampa', '_rigaTotaleVano',
  '_contaCoda', '_contaFatte', '_contaTotale', '_contaAvviaCoda', '_contaApri',
  '_contaProssima', '_contaSalta', '_contaFineCoda',

  /* 1.10 - il trasferimento chiesto dall'ordine di produzione. */
  '_routeTrasf', '_routeRigaAltrove', '_routeChiediTrasf', '_routeCreaTrasf',
  '_routeApplicaTrasf',

  /* 1.11 - su che cosa sta girando l'applicativo. */
  '_dispositivo', '_applicaDispositivo',


  /* 1.12 - le unita' di carico. */
  '_udcSel', '_formUdc', '_udcRenderElenco', '_udcDettaglioHTML', '_udcApri',
  '_udcNuova', '_udcCrea', '_udcCarica', '_udcScarica', '_udcChiediSposta',
  '_udcSposta', '_udcEtichetta', '_prefissoGS1HTML', '_salvaPrefissoGS1',

  /* 1.13 - il motore di stoccaggio, la sua faccia. */
  '_propostaCorrente', '_proponiVano', '_usaVanoProposto', '_altreProposte',
  '_perchePropostaEsclusi', '_notaScavalco',
  '_renderConfigRules', '_salvaRegola', '_toggleRegola', '_eliminaRegola',

  /* 2.8 - LE REGOLE DI STOCCAGGIO: le due che non si scrivono, la matrice
     di incompatibilita' e la caratterizzazione della singola cella. */
  '_regoleBaseHtml',
  'showCaratterizzaUbicazione', '_salvaCaratterizzazione',
  '_scaratterizzaUbicazione', '_rigaAttributiVano',
  '_usaVanoDiCasa', '_usaUdcProposta',

  /* 2.9 - IL MODELLO GUIDATO. `_matriceHtml` e `_toggleIncompatibilita`
     sono USCITI con la griglia di incompatibilita': la pericolosita' si
     dichiara adesso dentro le regole di stoccaggio. */
  '_srCambiaBersaglio', '_scanErrore', '_scanAvanti',
  '_elencoNCAperto', '_trasferisciDaElenco',
  /* Il campo scansionato bene si vede da lontano: verde su ogni maschera
     che legge un codice — percorso, conta, posizionamento. */
  '_campoScansionato', '_campiScansioneReset',

  /* 1.14 - il conto di produzione. */
  '_wipOrdine', '_formWip', '_wipApri', '_wipRenderConto', '_wipChiediReso',
  '_wipRendi', '_wipChiudi', '_areaWipHTML', '_salvaAreaWip',
  /* 2.1 — il consumo dichiarato riga per riga, il rientro di un collo
     aperto e il rendiconto su carta. */
  '_wipConsumaTutto', '_wipDichiaraConsumata', '_wipScelteConParte', '_wipQuoteConsumo',
  '_wipStampaRendiconto',
  /* 2.14 — la schermata parte dalla merce e non dal numero: la lista di
     quello che e' fermo in lavorazione, ordinabile e filtrabile, l'elenco
     compatto dei conti aperti, e la via per l'archivio che e' uscito di qui. */
  '_wipTabella', '_wipOrfaneAperte', '_wipColonne', '_wipOrdina', '_wipCerca',
  '_wipRidisegnaLista', '_wipQta', '_wipListaHTML', '_wipDaRiga', '_wipOrdiniHTML',
  '_wipVaiAllArchivio',
  /* 2.14 — un reso sbagliato si annulla, e non si cancella. */
  '_wipCorreggiReso', '_wipStorna',
];
