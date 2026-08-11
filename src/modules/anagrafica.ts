/* Attributi di anagrafica che il motore di stoccaggio userà come vincoli duri:
   allergeni da segregare e classe di conservazione.

   I valori arrivano convalidati da Excel — elenchi a discesa, non testo
   libero — quindi qui la lettura è STRETTA: un valore che non è esattamente
   uno dei codici previsti non viene interpretato, viene segnalato. Indovinare
   cosa intendeva chi ha scritto è il modo di mettere un articolo con il latte
   in una zona senza latte.

   L'export porta con sé il foglio «Valori ammessi», che è la sorgente da cui
   si costruisce la convalida in Excel: gli elenchi stanno in un posto solo.

   Nessuno stato: tabelle e funzioni pure. Collaudata in `test/anagrafica.test.js`. */

export type CodiceAllergene =
  | 'GLUTINE' | 'CROSTACEI' | 'UOVA' | 'PESCE' | 'ARACHIDI' | 'SOIA' | 'LATTE'
  | 'FRUTTA_GUSCIO' | 'SEDANO' | 'SENAPE' | 'SESAMO' | 'SOLFITI' | 'LUPINI' | 'MOLLUSCHI';

export type ClasseTemperatura = 'SURG' | 'REFR' | 'AMB';

/* I 14 dell'Allegato II del Reg. UE 1169/2011. L'elenco è chiuso: è una
   norma, non una preferenza, e un quindicesimo non si aggiunge qui. */
export const ALLERGENI: readonly { code: CodiceAllergene; label: string }[] = [
  { code: 'GLUTINE', label: 'Cereali contenenti glutine' },
  { code: 'CROSTACEI', label: 'Crostacei' },
  { code: 'UOVA', label: 'Uova' },
  { code: 'PESCE', label: 'Pesce' },
  { code: 'ARACHIDI', label: 'Arachidi' },
  { code: 'SOIA', label: 'Soia' },
  { code: 'LATTE', label: 'Latte e derivati' },
  { code: 'FRUTTA_GUSCIO', label: 'Frutta a guscio' },
  { code: 'SEDANO', label: 'Sedano' },
  { code: 'SENAPE', label: 'Senape' },
  { code: 'SESAMO', label: 'Semi di sesamo' },
  { code: 'SOLFITI', label: 'Anidride solforosa e solfiti' },
  { code: 'LUPINI', label: 'Lupini' },
  { code: 'MOLLUSCHI', label: 'Molluschi' },
];

/* Le tre classi della logistica del freddo. Il codice va a database, il
   `range` è ciò che l'operatore legge. */
export const CLASSI_TEMPERATURA: readonly { code: ClasseTemperatura; label: string; range: string }[] = [
  { code: 'SURG', label: 'Surgelato', range: '−18 °C' },
  { code: 'REFR', label: 'Refrigerato', range: '+4/+8 °C' },
  { code: 'AMB', label: 'Ambiente', range: '+18/+25 °C' },
];

const ALLERGENE_PER_CODICE = new Map(ALLERGENI.map(a => [a.code as string, a]));
const CLASSE_PER_CODICE = new Map(CLASSI_TEMPERATURA.map(c => [c.code as string, c]));

/** Maiuscolo e senza spazi ai bordi. Non è interpretazione: è igiene. */
function ripulisci(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

export function etichettaAllergene(code: string): string {
  return ALLERGENE_PER_CODICE.get(code)?.label ?? code;
}

export function etichettaClasse(code: string | null | undefined): string {
  if (!code) return '';
  const c = CLASSE_PER_CODICE.get(code);
  return c ? `${c.label} (${c.range})` : code;
}

export function allergeneValido(code: string): code is CodiceAllergene {
  return ALLERGENE_PER_CODICE.has(code);
}

export function classeValida(code: string | null | undefined): code is ClasseTemperatura {
  return !!code && CLASSE_PER_CODICE.has(code);
}

/** Cella → codici. Separatore `;`. Ciò che non è un codice finisce fra gli scarti. */
export function leggiAllergeni(raw: unknown): { codici: CodiceAllergene[]; scarti: string[] } {
  const codici: CodiceAllergene[] = [];
  const scarti: string[] = [];
  if (raw === null || raw === undefined || raw === '') return { codici, scarti };

  const testo = Array.isArray(raw) ? raw.join(';') : String(raw);
  for (const pezzo of testo.split(';')) {
    const v = ripulisci(pezzo);
    if (!v) continue;
    /* «NESSUNO» è una risposta: vuol dire che qualcuno ha guardato l'articolo.
       La cella vuota vuol dire che non l'ha guardato nessuno. */
    if (v === 'NESSUNO') continue;
    if (allergeneValido(v)) { if (!codici.includes(v)) codici.push(v); }
    else scarti.push(pezzo.trim());
  }
  /* Ordine di tabella, non di digitazione: due articoli con gli stessi
     allergeni devono risultare uguali anche a chi confronta le stringhe. */
  codici.sort((a, b) => ALLERGENI.findIndex(x => x.code === a) - ALLERGENI.findIndex(x => x.code === b));
  return { codici, scarti };
}

export function scriviAllergeni(codici: readonly string[] | null | undefined): string {
  return codici && codici.length ? codici.join(';') : '';
}

/** Cella → classe. `null` se vuota, `undefined` se c'è scritto qualcosa di sconosciuto. */
export function leggiClasseTemperatura(raw: unknown): ClasseTemperatura | null | undefined {
  const v = ripulisci(raw);
  if (!v) return null;
  return classeValida(v) ? v : undefined;
}

/* Il foglio di riferimento che accompagna l'export. È la sorgente da cui si
   costruiscono gli elenchi a discesa in Excel: se un giorno una classe
   cambia, cambia qui e si ripresenta da sola nel foglio successivo. */
export function fogliValoriAmmessi(): { colonna: string; valore: string; significato: string }[] {
  return [
    ...CLASSI_TEMPERATURA.map(c => ({
      colonna: 'Temperatura', valore: c.code, significato: `${c.label} — ${c.range}`,
    })),
    ...ALLERGENI.map(a => ({
      colonna: 'Allergeni', valore: a.code, significato: a.label,
    })),
    { colonna: 'Allergeni', valore: 'NESSUNO', significato: 'Verificato: non contiene allergeni da dichiarare' },
  ];
}
