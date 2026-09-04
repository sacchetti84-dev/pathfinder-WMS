/* LA MODALITA' CHIOSCO — 2.25.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Chiosco vuol dire una cosa sola: sul terminale Pathfinder si apre
   dall'icona e non dentro un browser. Niente barra dell'indirizzo, niente
   schede, niente pulsante «indietro» che porta chissa' dove a meta' di un
   prelievo. La strada e' quella standard — un manifesto web
   (`assets/chiosco.webmanifest`) e il browser che INSTALLA la pagina come
   applicazione: su Android nasce una vera icona nel menu, su iPad la si
   aggiunge alla schermata Home.

   NON SI ACCENDE, SI INSTALLA. Non c'e' un interruttore da ricordare per
   macchina: l'invito compare da solo dove ha senso — terminale e tavoletta
   — e sulla scrivania non compare mai, perche' un PC d'ufficio con
   Pathfinder installato come app perderebbe le schede e non guadagnerebbe
   niente.

   L'INSTALLAZIONE VUOLE HTTPS, E VA DETTO. Nessun browser installa una
   pagina servita in chiaro: oggi Pathfinder risponde su `http://` in LAN,
   quindi finche' il servizio non parla in HTTPS il chiosco resta una
   possibilita' dichiarata e non un fatto. Questo modulo lo distingue —
   `non-sicuro` non e' `in-attesa` — perche' un'assenza senza motivo e' il
   modo migliore per far cercare il guasto dalla parte sbagliata.

   Nessuno stato, nessun DOM, nessun accesso a Store: le misure gliele passa
   chi lo chiama, come in `dispositivo.ts`. */

import type { ClasseDispositivo } from './dispositivo';

/** Dove sta il chiosco su questa macchina, adesso. */
export type StatoChiosco =
  /** Gia' installato: la pagina gira come applicazione. */
  | 'installato'
  /** Il browser ha detto che si puo' installare: c'e' un invito da mostrare. */
  | 'invitabile'
  /** Si potrebbe, ma il browser non ha ancora offerto — o non offre mai (iOS,
      dove l'aggiunta alla schermata Home e' un gesto manuale). */
  | 'in-attesa'
  /** L'indirizzo non e' sicuro: nessun browser installera' niente. */
  | 'non-sicuro'
  /** Una scrivania: il chiosco non c'entra, e non si propone. */
  | 'non-serve';

export interface AmbienteChiosco {
  /** Quella che decide `dispositivo.ts`. */
  classe?: ClasseDispositivo | null;
  /** Vero se la pagina gira gia' come applicazione installata. */
  installato?: boolean | null;
  /** `window.isSecureContext`: HTTPS, oppure localhost. */
  origineSicura?: boolean | null;
  /** Vero se `beforeinstallprompt` e' arrivato e l'invito e' in mano. */
  invitoPronto?: boolean | null;
}

/** Le due classi di dispositivo su cui il chiosco si propone da solo. */
export const CLASSI_DA_CHIOSCO: ClasseDispositivo[] = ['terminale', 'tavoletta'];

/** L'ordine delle domande e' quello che conta: chi e' gia' installato non ha
    altre domande da farsi, e chi sta su una scrivania non le ha mai avute. */
export function stato(a: AmbienteChiosco | null | undefined): StatoChiosco {
  if (a?.installato) return 'installato';
  const classe = a?.classe ?? null;
  if (!classe || !CLASSI_DA_CHIOSCO.includes(classe)) return 'non-serve';
  if (!a?.origineSicura) return 'non-sicuro';
  return a?.invitoPronto ? 'invitabile' : 'in-attesa';
}

/** Cosa si legge nella scheda. Una frase per stato, e ognuna dice il passo
    successivo: uno stato che non si sa come cambiare e' un vicolo cieco. */
export function spiega(s: StatoChiosco): string {
  switch (s) {
    case 'installato':
      return 'Pathfinder e\' installato su questo terminale e si apre dalla sua icona.';
    case 'invitabile':
      return 'Questo terminale puo\' installare Pathfinder come applicazione: si aprira\' '
        + 'dall\'icona, senza barra dell\'indirizzo.';
    case 'in-attesa':
      return 'Il browser non ha ancora offerto l\'installazione. Su iPad si fa a mano, dal '
        + 'menu di condivisione: «Aggiungi alla schermata Home».';
    case 'non-sicuro':
      return 'L\'indirizzo di questo servizio non e\' sicuro (http). Nessun browser installa '
        + 'una pagina servita in chiaro: serve HTTPS sulla macchina che serve Pathfinder.';
    case 'non-serve':
      return 'Il chiosco riguarda i terminali e le tavolette. Su una postazione da scrivania '
        + 'Pathfinder resta una scheda del browser, ed e\' quel che serve.';
  }
}

/** Vero quando la scheda di Configurazione deve mostrare il pulsante. */
export function siPuoInstallare(s: StatoChiosco): boolean {
  return s === 'invitabile';
}
