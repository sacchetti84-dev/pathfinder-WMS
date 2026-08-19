/* I PASSI DEL CICLO, e gli aiuti che li rendono leggibili.

   Il ciclo è UNA sequenza: il prelievo pretende il carico, il reso pretende
   il prelievo, la chiusura pretende il reso. Stanno in un file solo perché
   spezzarli in file diversi vorrebbe dire affidare l'ordine a come il
   collaudatore ordina i file — e quando l'ordine cambia, il difetto che si
   legge non è quello vero. */

export const tre = (n) => Math.round(Number(n) * 1000) / 1000;

/** 25 kg per collo, e l'ultimo prende il resto: è come arrivano le materie
    prime, ed è l'unico modo di far nascere il collo incompleto. */
export function suddividi(totale, perCollo = 25) {
  const colli = [];
  let resto = tre(totale);
  while (resto > perCollo + 1e-9) { colli.push(perCollo); resto = tre(resto - perCollo); }
  if (resto > 0) colli.push(resto);
  return colli;
}

/** Come la maschera sceglie i colli: per INDICE — è quello che l'operatore
    tocca a video — e si apre il più grande finché basta. Le misure le ricava
    `Store` prima di mandarle al servizio. */
export function sceltePer(colli, quanto) {
  const scelte = [];
  let resto = tre(quanto);
  const per = colli.map((c, indice) => ({ c, indice })).sort((a, b) => b.c - a.c);
  for (const { c, indice } of per) {
    if (resto <= 1e-9) break;
    const preso = Math.min(c, resto);
    scelte.push({ indice, quantita: tre(preso) });
    resto = tre(resto - preso);
  }
  if (resto > 1e-9) throw new Error(`non bastano i colli: mancano ${resto}`);
  return scelte;
}
