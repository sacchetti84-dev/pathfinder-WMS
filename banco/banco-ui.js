/* Attrezzi di banco per la revisione UI. Si reinietta dopo ogni ricarica. */
window.__audit = function () {
  const out = { campi: [], tagli: [], larghezza: innerWidth };
  const root = document.body;
  const cv = document.createElement('canvas').getContext('2d');
  for (const el of root.querySelectorAll('input,select,textarea')) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width) continue;
    const txt = el.value || el.placeholder || '';
    cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const need = cv.measureText(txt || '0000000').width;
    const util = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2 * parseFloat(cs.borderLeftWidth || 0);
    if (need > util - 2) out.campi.push({ id: el.id || el.name || '', testo: txt, larghezza: +r.width.toFixed(0), utile: +util.toFixed(0), servono: +need.toFixed(0) });
  }
  for (const el of root.querySelectorAll('*')) {
    if (el.children.length) continue;
    const cs = getComputedStyle(el);
    if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden')
      && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      out.tagli.push({ cls: (el.className || '').toString().slice(0, 40), txt: (el.textContent || '').trim().slice(0, 50), scroll: el.scrollWidth, client: el.clientWidth });
  }
  return out;
};

window.__odp = async function (...nomi) {
  if (!document.getElementById('movFormArea')) { App.switchView('movimenta'); await new Promise(r=>setTimeout(r,400)); App.startMov('pick'); await new Promise(r=>setTimeout(r,300)); }
  if (App._pickSubMode !== 'ordine') App._pickSub('ordine');
  await new Promise(r => setTimeout(r, 200));
  const inp = document.getElementById('fileImportOdp');
  if (!inp) return 'input file non trovato';
  for (const n of nomi) {
    const buf = await (await fetch('/banco/odp-wip/' + n)).arrayBuffer();
    const dt = new DataTransfer();
    dt.items.add(new File([buf], n, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const vero = document.getElementById('fileImportOdp');
    vero.files = dt.files;
    vero.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
  }
  return (App._routeOrdini || []).map(o => o.odp_num);
};

/* Un giro intero, dalla lettura dei file alla chiusura del percorso.
   Serve a rifare in un colpo lo stato che la revisione WIP vuole davanti. */
window.__preleva = async function (...nomi) {
  const attesa = (ms) => new Promise((r) => setTimeout(r, ms));
  const set = (id, v) => {
    const e = document.getElementById(id);
    if (!e) return false;
    e.value = v; e.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  await window.__odp(...nomi);
  App._routeStart();
  await attesa(800);
  const fatte = [];
  for (let giro = 0; giro < 20; giro++) {
    const p = App._routeParsed;
    const st = App._routeCurrentStop();
    if (!st) break;
    if (!App._routeScanValida(st) || !App._routeScan.loc) {
      set('rLoc', st.location_code); App._routeCheckLoc(); await attesa(500);
    }
    set('rArt', st.article_code); App._routeCheckArt(); await attesa(250);
    set('rLot', st.lot_code); App._routeCheckLot(); await attesa(250);
    App._routeConfirmStop(); await attesa(1200);
    const ok = [...document.querySelectorAll('#colliOverlay button')].find((b) => /Conferma i colli/.test(b.textContent));
    if (ok) { ok.click(); await attesa(1800); }
    fatte.push(st.location_code + ' ' + st.item_key);
  }
  const chiudi = [...document.querySelectorAll('button')].find((b) => /Chiudi percorso/.test(b.textContent));
  if (chiudi) { chiudi.click(); await attesa(1000);
    const si = [...document.querySelectorAll('#dlgOverlay button')].find((b) => /^Chiudi percorso/.test(b.textContent.trim()));
    if (si) { si.click(); await attesa(1500); } }
  return fatte;
};
