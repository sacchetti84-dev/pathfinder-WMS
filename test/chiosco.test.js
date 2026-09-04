/* IL CHIOSCO — 2.25
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Due cose si collaudano qui, e sono di natura diversa.

   LA REGOLA, da fermo: `modules/chiosco.ts` è puro come `dispositivo.ts` —
   entrano quattro fatti sulla macchina, esce lo stato. L'ordine delle
   domande è la parte che conta, ed è quella che si rompe per prima quando
   qualcuno aggiunge un caso.

   IL TELAIO, letto come stringa: il manifesto e i suoi collegamenti sono
   una promessa fatta al browser, e una promessa mezza scritta — l'icona
   citata che non esiste, il divieto di ingrandire rimasto nel `viewport` —
   non fa fallire niente a video. Fallisce sul terminale, in corsia. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stato, spiega, siPuoInstallare, CLASSI_DA_CHIOSCO } from '../src/modules/chiosco.ts';

const RADICE = path.resolve(import.meta.dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');

/* ═══ La regola ═════════════════════════════════════════════════════════ */

test('installato vince su tutto il resto', () => {
  /* Anche su una scrivania, anche su un indirizzo non sicuro: se la finestra
     È l'applicazione, la domanda «si può installare?» non ha più senso. */
  expect(stato({ classe: 'scrivania', installato: true, origineSicura: false })).toBe('installato');
});

test('la scrivania non riceve mai la proposta', () => {
  expect(stato({ classe: 'scrivania', origineSicura: true, invitoPronto: true })).toBe('non-serve');
});

test('un ambiente che non dice niente non propone niente', () => {
  expect(stato(null)).toBe('non-serve');
  expect(stato({})).toBe('non-serve');
});

test('senza HTTPS lo stato lo dice, e non si confonde con l\'attesa', () => {
  for (const classe of CLASSI_DA_CHIOSCO) {
    expect(stato({ classe, origineSicura: false, invitoPronto: true })).toBe('non-sicuro');
  }
});

test('con l\'invito in mano si installa, senza si aspetta', () => {
  expect(stato({ classe: 'terminale', origineSicura: true, invitoPronto: true })).toBe('invitabile');
  expect(stato({ classe: 'tavoletta', origineSicura: true, invitoPronto: false })).toBe('in-attesa');
});

test('il pulsante compare solo su «invitabile»', () => {
  const tutti = ['installato', 'invitabile', 'in-attesa', 'non-sicuro', 'non-serve'];
  expect(tutti.filter(siPuoInstallare)).toEqual(['invitabile']);
});

test('ogni stato ha una frase, e nessuna è vuota', () => {
  for (const s of ['installato', 'invitabile', 'in-attesa', 'non-sicuro', 'non-serve']) {
    expect(spiega(s).length).toBeGreaterThan(30);
  }
});

/* ═══ Il telaio ═════════════════════════════════════════════════════════ */

test('il manifesto è un JSON valido e dichiara quel che serve a installare', () => {
  const m = JSON.parse(leggi('public/assets/chiosco.webmanifest'));
  expect(m.name).toBeTruthy();
  expect(m.short_name).toBeTruthy();
  expect(m.start_url).toBe('/');
  expect(m.display).toBe('standalone');
  /* 192 e 512 sono il minimo che Chrome chiede per fare una vera icona;
     la `maskable` è quella che Android ritaglia senza mangiare il marchio. */
  const misure = m.icons.map((i) => i.sizes);
  expect(misure).toContain('192x192');
  expect(misure).toContain('512x512');
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
});

test('ogni icona citata dal manifesto esiste davvero, ed è un PNG', () => {
  const m = JSON.parse(leggi('public/assets/chiosco.webmanifest'));
  for (const icona of m.icons) {
    const f = path.join(RADICE, 'public', icona.src.replace(/^\//, ''));
    expect(fs.existsSync(f), `manca ${icona.src}`).toBe(true);
    const b = fs.readFileSync(f);
    expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(b.subarray(-8).toString('hex')).toBe('49454e44ae426082');
  }
});

test('index.html collega il manifesto e non vieta di ingrandire', () => {
  const html = leggi('index.html');
  expect(html).toMatch(/<link rel="manifest" href="\/assets\/chiosco\.webmanifest\?v=/);
  const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? '';
  /* `user-scalable=no` e `maximum-scale=1` tolgono la lente a chi legge un
     lotto in controluce, e su iPad non impediscono lo zoom automatico: lo
     impedisce il campo da 16px. Non devono tornare. */
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
  expect(viewport).not.toMatch(/maximum-scale/);
  expect(viewport).toMatch(/viewport-fit=cover/);
});
