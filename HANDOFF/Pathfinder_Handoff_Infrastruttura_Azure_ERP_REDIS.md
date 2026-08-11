# Handoff Tecnico: Integrazione Infrastrutturale e Strategia Cloud/ERP per Pathfinder

**Progetto:** Pathfinder (Warehouse Mapper & Route Optimizer)  
**Oggetto:** Valutazione Architetturale per Hosting Azure, Caching/State Management con Redis e Integrazione con l'Ecosistema Microsoft ERP  
**Data:** 9 Agosto 2026  
**Stato:** Documento di Handover Tecnico e Pianificazione Infrastrutturale

---

## 1. Contestualizzazione e Scopo

Il presente documento integra il precedente handoff sull'evoluzione modulare (ES6 / TypeScript) di Pathfinder, definendo le linee guida architetturali per:
1. L'hosting e la distribuzione tramite infrastruttura **Microsoft Azure**.
2. Il ruolo strategico ed ev. limiti dell'adozione di **Redis** per la gestione dello stato.
3. L'impatto e i requisiti di sviluppo in vista della futura adozione di un **ERP basato su tecnologia Microsoft** (es. Dynamics 365 Business Central / Supply Chain Management).

---

## 2. Architettura di Hosting su Microsoft Azure

Essendo Pathfinder un'applicazione che, a valle del processo di build, genera un bundle di asset statici (`dist/`), l'integrazione con l'infrastruttura Azure risulta ottimale, economica e scalabile.

### 2.1 Modello di Hosting Consigliato
* **Azure Static Web Apps (Scelta Primaria):**
  * **Caratteristiche:** Hosting nativo per asset statici con CDN globale integrata e SSL automatizzato.
  * **Vantaggi:** Costi trascurabili, gestione HTTPS nativa (condizione necessaria per il corretto funzionamento di PWA e IndexedDB nei browser dei terminali).
* **Azure App Service (Scelta Alternativa):**
  * **Caratteristiche:** Per contesti in cui si richieda una segregazione di rete avanzata tramite **Azure Virtual Networks (VNet)** o restrizioni IP aziendali.

### 2.2 Flusso di Deployment e Accesso Terminali
* **Deployment (CI/CD):** Integration pipeline automatizzata tramite GitHub Actions o Azure DevOps (`npm run build` -> aggiornamento automatico della cartella di distribuzione).
* **Lato Terminali (PC, Tablet, Palmari):** Nessuna installazione richiesta sul dispositivo. Gli operatori accedono via browser aziendale (`https://pathfinder.azienda.com`).
* **Autenticazione:** Integrazione con **Microsoft Entra ID (ex Azure AD)** per Single Sign-On (SSO) tramite librerie MSAL.js.

---

## 3. Valutazione Tecnico-Architetturale: Adozione di Redis

### 3.1 Ruolo e Posizionamento
Redis è un database *in-memory* ad altissime prestazioni. Sebbene **non debba sostituire IndexedDB** per la persistenza principale e l'operatività offline-first dei terminali, può ricoprire un ruolo chiave come strato di sincronizzazione tra più operatori.

### 3.2 Matrice Comparativa: IndexedDB vs. Redis

| Criterio | IndexedDB (Client-Side) | Redis (Azure Cache for Redis) |
| :--- | :--- | :--- |
| **Residenza Dati** | Browser dell'operatore | Server Cloud / Azure |
| **Tolleranza Offline / Zone d'Ombra** | **100% Funzionante** | Richiede Wi-Fi / Connessione continua |
| **Sincronizzazione Multi-Operatore** | Isolato sul singolo dispositivo | **Tempo Reale** (Pub/Sub, lock corsie/ubicazioni) |
| **Ruolo Architetturale** | Cache locale ODP e mappe | Stato condiviso e lock concorrenza |

### 3.3 Modello Ibrido Consigliato
* **IndexedDB:** Mantiene il ruolo di storage locale e motore primario di esecuzione per il calcolo dei percorsi (`PickRoute`) e l'operatività in assenza di rete.
* **Redis (via Azure Cache for Redis):** Utilizzato tramite backend/API per la gestione delle notifiche concorrenti (es. blocco corsia occupata, sblocco quarantene in tempo reale tra più postazioni).

---

## 4. Requisiti di Sviluppo per Integrazione con ERP Microsoft (Dynamics 365)

L'adozione di un nuovo ERP basato su ecosistema Microsoft richiede una predisposizione dell'architettura software di Pathfinder fin dalla fase di modulare refactoring.

### 4.1 Principi Guida per lo Sviluppo

1. **Disaccoppiamento tramite Adapters / Mappers:**
   * La logica di parsing attuale (es. Sage X3 / Excel) deve risiedere in un modulo isolato (es. `src/modules/adapters/excelAdapter.ts`).
   * Creare una struttura di interfaccia generica (`src/types/odp.ts`) affinché l'algoritmo di picking sia indipendente dalla sorgente dei dati.
   * Predisporre l'adapter OData/REST (`d365Adapter.ts`) per l'interazione nativa con le entità Microsoft Dynamics.

2. **Architettura "Offline-First con Queue":**
   * Mantenere la scrittura e la registrazione dei movimenti su IndexedDB locale.
   * Predisporre un servizio di background (`apiService.ts`) che gestisca la sincronizzazione asincrona verso l'ERP con logica di retry automatica in caso di disconnessioni temporanee.

3. **Integrazione con Azure Logic Apps / Functions:**
   * Utilizzare servizi serverless (Azure Functions) per fare da middleware sicuro tra Pathfinder e le REST API dell'ERP Microsoft, alleggerendo il carico sui client.

---

## 5. Sintesi della Roadmap Architetturale

```text
[ Terminale Magazzino ] ──(PWA / IndexedDB)──> Operatività Offline & PickRoute
          │
          ├──(HTTPS / Entra ID)─────────────> Azure Static Web Apps (Hosting App)
          │
          ├──(REST / WebSockets)────────────> Azure Functions (Middleware API)
                                                   │
                                                   ├──> Azure Cache for Redis (Lock & Stato RT)
                                                   └──> Microsoft Dynamics ERP (OData API)
```

---

*Documento generato per il passaggio di consegne e la definizione delle specifiche architetturali di integrazione Cloud/ERP per Pathfinder.*
