# Converte gli `style=` di un sorgente in utility Tailwind.
# Non tocca un tag se anche una sola dichiarazione non e' mappata: meglio
# lasciarla scritta che indovinarla.
import io, re, sys, collections

MAP = {
 'display:flex':'flex', 'display:grid':'grid', 'display:block':'block',
 'display:inline-block':'inline-block', 'display:none':'hidden',
 'align-items:center':'items-center', 'align-items:flex-start':'items-start',
 'align-items:flex-end':'items-end', 'align-items:baseline':'items-baseline',
 'justify-content:space-between':'justify-between',
 'justify-content:center':'justify-center', 'justify-content:flex-end':'justify-end',
 'flex-wrap:wrap':'flex-wrap', 'flex-direction:column':'flex-col',
 'flex:1':'flex-1', 'flex-shrink:0':'shrink-0', 'flex-grow:1':'grow',
 'text-align:center':'text-center', 'text-align:right':'text-right',
 'text-align:left':'text-left',
 'text-transform:uppercase':'uppercase', 'text-transform:none':'normal-case',
 'font-weight:400':'font-normal', 'font-weight:500':'font-medium',
 'font-weight:600':'font-semibold', 'font-weight:700':'font-bold',
 'font-style:italic':'italic',
 'white-space:nowrap':'whitespace-nowrap', 'white-space:pre-wrap':'whitespace-pre-wrap',
 'overflow-x:auto':'overflow-x-auto', 'overflow-y:auto':'overflow-y-auto',
 'overflow:hidden':'overflow-hidden', 'overflow:auto':'overflow-auto',
 'cursor:pointer':'cursor-pointer', 'cursor:default':'cursor-default',
 'position:relative':'relative', 'position:absolute':'absolute',
 'position:fixed':'fixed', 'position:sticky':'sticky',
 'width:100%':'w-full', 'height:100%':'h-full', 'max-width:100%':'max-w-full',
 'margin-left:auto':'ml-auto', 'margin-right:auto':'mr-auto', 'margin:0 auto':'mx-auto',
 'margin:0':'m-0', 'padding:0':'p-0',
 'border:none':'border-none', 'text-decoration:none':'no-underline',
 'user-select:none':'select-none', 'pointer-events:none':'pointer-events-none',
 'box-sizing:border-box':'box-border', 'word-break:break-all':'break-all',
 'vertical-align:middle':'align-middle', 'vertical-align:top':'align-top',
 'list-style:none':'list-none', 'font-family:var(--mono)':'font-mono',
}
LATO = {'top':'t','bottom':'b','left':'l','right':'r'}

def passo(v):
    """rem -> passo della scala (0,1rem). None se non e' un multiplo di 0,05."""
    n = round(float(v) * 10, 4)
    if abs(n * 2 - round(n * 2)) > 1e-9: return None
    return int(n) if n == int(n) else n

def utility(d):
    if d in MAP: return MAP[d]
    m = re.fullmatch(r'font-size: ?var\(--md-sys-typescale-(.+)-size\)', d)
    if m: return 'text-' + m.group(1)
    m = re.fullmatch(r'color: ?var\(--sx-([a-z-]+)\)', d)
    if m: return 'text-sx-' + m.group(1)
    m = re.fullmatch(r'background(?:-color)?: ?var\(--sx-([a-z-]+)\)', d)
    if m: return 'bg-sx-' + m.group(1)
    m = re.fullmatch(r'border-color: ?var\(--sx-([a-z-]+)\)', d)
    if m: return 'border-sx-' + m.group(1)
    m = re.fullmatch(r'(margin|padding)-(top|bottom|left|right): ?(-?[0-9.]+)rem', d)
    if m:
        n = passo(m.group(3))
        if n is None: return None
        return f"{'m' if m.group(1)=='margin' else 'p'}{LATO[m.group(2)]}-{n}"
    m = re.fullmatch(r'(margin|padding): ?([0-9.]+)rem', d)
    if m:
        n = passo(m.group(2))
        if n is None: return None
        return f"{'m' if m.group(1)=='margin' else 'p'}-{n}"
    m = re.fullmatch(r'(margin|padding): ?([0-9.]+)rem ([0-9.]+)rem', d)
    if m:
        a, b = passo(m.group(2)), passo(m.group(3))
        if a is None or b is None: return None
        s = 'm' if m.group(1) == 'margin' else 'p'
        return f'{s}y-{a} {s}x-{b}'
    m = re.fullmatch(r'gap: ?([0-9.]+)rem', d)
    if m:
        n = passo(m.group(1))
        return None if n is None else f'gap-{n}'
    m = re.fullmatch(r'(width|height|max-width|max-height|min-width|min-height): ?([0-9]+px)', d)
    if m:
        s = {'width':'w','height':'h','max-width':'max-w','max-height':'max-h',
             'min-width':'min-w','min-height':'min-h'}[m.group(1)]
        return f'{s}-[{m.group(2)}]'
    m = re.fullmatch(r'line-height: ?([0-9.]+)', d)
    if m: return f'leading-[{m.group(1)}]'
    m = re.fullmatch(r'opacity: ?([0-9.]+)', d)
    if m:
        n = float(m.group(1)) * 100
        return f'opacity-{int(n)}' if n == int(n) else None
    return None


LATO_B = {'top':'t','bottom':'b','left':'l','right':'r'}
DIM = {'width':'w','height':'h','max-width':'max-w','max-height':'max-h',
       'min-width':'min-w','min-height':'min-h'}

def utility2(d):
    """Secondo giro: quel che il primo non ha saputo leggere."""
    # margini e padding a zero secco
    m = re.fullmatch(r'(margin|padding)(-(top|bottom|left|right))?: ?0(px|rem)?', d)
    if m:
        s = 'm' if m.group(1) == 'margin' else 'p'
        return f'{s}{LATO_B[m.group(3)] if m.group(3) else ""}-0'
    # padding/margin a due valori con uno zero
    m = re.fullmatch(r'(margin|padding): ?([0-9.]+)rem 0', d)
    if m:
        n = passo(m.group(2))
        if n is None: return None
        s = 'm' if m.group(1) == 'margin' else 'p'
        return f'{s}y-{n} {s}x-0'
    m = re.fullmatch(r'(margin|padding): ?0 ([0-9.]+)rem', d)
    if m:
        n = passo(m.group(2))
        if n is None: return None
        s = 'm' if m.group(1) == 'margin' else 'p'
        return f'{s}y-0 {s}x-{n}'
    # tre valori: sopra, lati, sotto
    m = re.fullmatch(r'(margin|padding): ?([0-9.]+)(?:rem)? ([0-9.]+)(?:rem)? ([0-9.]+)(?:rem)?', d)
    if m:
        a, b, c = (passo(x) for x in m.group(2, 3, 4))
        if None in (a, b, c): return None
        s = 'm' if m.group(1) == 'margin' else 'p'
        return f'{s}t-{a} {s}x-{b} {s}b-{c}'
    # bordo pieno e bordo di un lato
    m = re.fullmatch(r'border: ?([0-9]+)px solid var\(--sx-([a-z-]+)\)', d)
    if m:
        larg = '' if m.group(1) == '1' else f'-[{m.group(1)}px]'
        return f'border{larg} border-sx-{m.group(2)}'
    m = re.fullmatch(r'border-(top|bottom|left|right): ?([0-9]+)px solid var\(--sx-([a-z-]+)\)', d)
    if m:
        l = LATO_B[m.group(1)]
        larg = '' if m.group(2) == '1' else f'-[{m.group(2)}px]'
        return f'border-{l}{larg} border-{l}-sx-{m.group(3)}'
    # colori scritti a mano
    if d in ('color:#fff', 'color:#ffffff'): return 'text-white'
    if d in ('background:#fff', 'background-color:#fff'): return 'bg-white'
    m = re.fullmatch(r'color: ?(#[0-9a-fA-F]{3,8})', d)
    if m: return f'text-[{m.group(1)}]'
    m = re.fullmatch(r'background(?:-color)?: ?(#[0-9a-fA-F]{3,8})', d)
    if m: return f'bg-[{m.group(1)}]'
    if d == 'font-weight:800': return 'font-extrabold'
    if d == 'font-weight:300': return 'font-light'
    if d in ('float:right', 'float:left', 'float:none'): return 'float-' + d.split(':')[1]
    # misure che rimandano a un token: si tengono com'e', dentro la parentesi
    m = re.fullmatch(r'(width|height|max-width|max-height|min-width|min-height): ?(var\(--[a-z0-9-]+\)|[0-9.]+(?:rem|%|vh|vw|em))', d)
    if m: return f'{DIM[m.group(1)]}-[{m.group(2)}]'
    m = re.fullmatch(r'font-size: ?(var\(--[a-z0-9-]+\)|[0-9.]+(?:rem|px|em))', d)
    if m: return f'text-[{m.group(1)}]'
    m = re.fullmatch(r'border-radius: ?(var\(--[a-z0-9-]+\)|[0-9]+px|[0-9.]+rem)', d)
    if m: return f'rounded-[{m.group(1)}]'
    m = re.fullmatch(r'background(?:-color)?: ?(var\(--[a-z0-9-]+\))', d)
    if m: return f'bg-[{m.group(1)}]'
    m = re.fullmatch(r'color: ?(var\(--[a-z0-9-]+\))', d)
    if m: return f'text-[{m.group(1)}]'
    m = re.fullmatch(r'gap: ?(var\(--[a-z0-9-]+\))', d)
    if m: return f'gap-[{m.group(1)}]'
    return None

_utility1 = utility
def utility(d):
    return _utility1(d) or utility2(d)

def converti(percorso):
    b = io.open(percorso, 'rb').read(); crlf = b.count(b'\r\n') > 0
    s = b.decode('utf-8')
    if crlf: s = s.replace('\r\n', '\n')
    saltate, fatti = [], 0

    def rifai(m):
        nonlocal fatti
        tag = m.group(0)
        sm = re.search(r'\s*style="([^"]*)"', tag)
        if not sm: return tag
        utils = []
        for d in sm.group(1).split(';'):
            d = re.sub(r'\s+', ' ', d.strip())
            if not d: continue
            u = utility(d)
            if u is None:
                saltate.append(d); return tag
            utils.extend(u.split())
        nuovo = tag[:sm.start()] + tag[sm.end():]
        cm = re.search(r'class="([^"]*)"', nuovo)
        if cm:
            nuovo = nuovo[:cm.start(1)] + cm.group(1) + ' ' + ' '.join(utils) + nuovo[cm.end(1):]
        else:
            i = re.match(r'<[a-zA-Z][a-zA-Z0-9-]*', nuovo).end()
            nuovo = nuovo[:i] + ' class="' + ' '.join(utils) + '"' + nuovo[i:]
        fatti += 1
        return nuovo

    s = re.sub(r'<[a-zA-Z][a-zA-Z0-9-]*\b[^<>]*?style="[^"]*"[^<>]*?>', rifai, s)
    if crlf: s = s.replace('\n', '\r\n')
    io.open(percorso, 'wb').write(s.encode('utf-8'))
    return fatti, collections.Counter(saltate), s.count('style="')

for percorso in sys.argv[1:]:
    fatti, saltate, rimasti = converti(percorso)
    print(f'{percorso}: {fatti} tag convertiti, {rimasti} style= rimasti')
    for d, n in saltate.most_common():
        print(f'   non mappata x{n}: {d}')
