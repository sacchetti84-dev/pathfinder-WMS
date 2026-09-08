/* LE SESSIONI DI PRELIEVO, QUANDO SONO PIÙ D'UNA — 2.30
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 2.29 di sessione ne viveva UNA per tutto l'impianto:
   `startPickSession` faceva `clear` e poi `put`, e avviare un percorso
   chiudeva quello di chiunque altro. Ha retto finché il prelievo nasceva da
   un file caricato a mano da una persona sola.

   Dalla 2.30 il prelievo nasce da un'ATTIVITÀ presa in carico — una per DDT
   da preparare, una per ordine di produzione — e due operatori possono
   prenderne due nello stesso momento. Una sessione sola diventerebbe una
   fila davanti a una porta.

   QUESTO MODULO NON APRE E NON CHIUDE NIENTE: risponde a una domanda sola,
   «quale di queste sessioni è la mia», e la risponde da fermo. Aprire e
   chiudere resta in `Store`; qui c'è la regola con cui si sceglie, ed è
   l'unico posto in cui è scritta.

   SI SCEGLIE PER OPERATORE, NON PER TERMINALE. Un terminale non ha
   un'identità che sopravviva a un ricaricamento della pagina; una sigla sì,
   ed è quella che l'operatore digita per entrare. Chi torna al banco dopo
   aver chiuso il browser ritrova il suo percorso perché la sessione porta il
   suo nome — che è lo stesso motivo per cui `pauses` sta sul record e non
   nella memoria della pagina. */

import type { SessionePrelievo } from '../types/entita';

/** La sigla, ridotta alla forma con cui si confronta. Un confronto fatto
    sulle stringhe grezze sbaglia sul primo spazio incollato da un lettore di
    codici a barre. */
function sigla(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

/** La sigla a cui una sessione risponde.

    `owner` è chi l'ha aperta; `operator` è chi preleva, e i due differiscono
    quando un Team Leader avvia un giro per un altro. Si cerca per `owner`,
    perché la domanda è «dov'è il MIO percorso» e chi l'ha aperto è chi torna
    al terminale. Il ripiego su `operator` regge le sessioni scritte prima
    della 2.30, che `owner` non ce l'hanno: senza, un aggiornamento fatto a
    percorso aperto lo renderebbe irraggiungibile. */
function padrone(s: SessionePrelievo | null | undefined): string {
  return sigla(s?.owner) || sigla(s?.operator);
}

/** La sessione di un operatore, o `null`.

    PIÙ D'UNA È UN CASO CHE NON DEVE ESISTERE, e se esiste vince la più
    recente: `doStartTask` chiude l'avvio precedente prima di aprirne un
    altro, quindi due sessioni della stessa sigla vogliono dire che qualcosa
    si è interrotto a metà. Prendere la più recente è la scelta che rimette
    l'operatore dove stava lavorando davvero; le altre restano lì, visibili a
    chi guarda, invece di sparire in silenzio. */
export function sessioneDi(
  sessioni: readonly SessionePrelievo[] | null | undefined,
  operatore: string | null | undefined,
): SessionePrelievo | null {
  const k = sigla(operatore);
  if (!k) return null;
  let vinta: SessionePrelievo | null = null;
  for (const s of sessioni || []) {
    if (!s || padrone(s) !== k) continue;
    if (!vinta || (s.created_at || 0) > (vinta.created_at || 0)) vinta = s;
  }
  return vinta;
}

/** La sessione che serve una data attività. Serve a chi riprende un compito:
    la domanda non è «chi sta prelevando» ma «questo lavoro è già cominciato».

    Un'attività senza sessione risponde `null`, ed è il caso normale: la
    sessione nasce quando l'operatore configura il percorso, non quando
    prende in carico. */
export function sessioneDiCompito(
  sessioni: readonly SessionePrelievo[] | null | undefined,
  taskId: string | null | undefined,
): SessionePrelievo | null {
  const k = String(taskId ?? '').trim().toUpperCase();
  if (!k) return null;
  return (sessioni || []).find((s) => String(s?.task_id ?? '').trim().toUpperCase() === k) || null;
}

/** Chi altro sta prelevando adesso, escluso chi guarda.

    NON SERVE A IMPEDIRE NIENTE. Due prelievi insieme sono il caso normale
    dalla 2.30; questo elenco serve a dirlo a chi apre la maschera, così due
    persone che scendono nella stessa corsia lo sanno prima di trovarsi
    davanti allo stesso vano. */
export function altriInPrelievo(
  sessioni: readonly SessionePrelievo[] | null | undefined,
  operatore: string | null | undefined,
): SessionePrelievo[] {
  const k = sigla(operatore);
  return (sessioni || [])
    .filter((s) => s && padrone(s) && padrone(s) !== k)
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

/** Le sessioni senza padrone: nessuna sigla addosso.

    Non è un caso teorico — una sessione nata prima della 2.30, o scritta da
    un banco, può non avere `operator`. `sessioneDi` non le restituisce mai,
    quindi resterebbero a database senza che nessuno le veda. Questa le
    nomina, così la maschera può proporre di riprenderle o di buttarle invece
    di lasciarle marcire. */
export function sessioniOrfane(
  sessioni: readonly SessionePrelievo[] | null | undefined,
): SessionePrelievo[] {
  return (sessioni || []).filter((s) => s && !padrone(s));
}
