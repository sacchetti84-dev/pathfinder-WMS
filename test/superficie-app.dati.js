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
   2.1: sono usciti i sei della copia esterna (`vault*`, `doVaultRestore`,
   `_scheduleVaultBackup`), `purgeOldLogsManual` con la purga, e i due
   salvataggi a mano `forceSave` e `manualSave`. */
export const SUPERFICIE = [
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
  '_openIdentityGate', '_openSearchHit', '_payload', '_persistShipHeader', '_pickCart',
  '_pickDocId', '_pickLoc', '_pickSnapFromCart', '_pickSnapFromLog',
  '_pickSnapFromSession', '_pickSub', '_pickSubMode', '_populateRegistryRows',
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
  '_routeClearImport', '_routeClose', '_routeConfirmStop', '_routeCurrentHTML',
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
  '_setScannerLayoutFix', '_shipAddToCart', '_shipAspetto', '_shipCarrier', '_shipCart',
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
