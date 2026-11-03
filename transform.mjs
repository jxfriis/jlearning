// Reduces an itslearning stylesheet to its colour declarations, remapped to the skin's dark palette.
// Used twice: by tools/generate.js at build time, and by content.js for a sheet the build hadn't seen.

const NAMED = { white: '#ffffff', black: '#000000', gray: '#808080', grey: '#808080', silver: '#c0c0c0', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', whitesmoke: '#f5f5f5', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', gainsboro: '#dcdcdc', darkgray: '#a9a9a9', darkgrey: '#a9a9a9' };
const COLOR_SRC = '#[0-9a-f]{3,8}\\b|rgba?\\([^)]*\\)|\\b(?:white|black|gray|grey|silver|red|green|blue|yellow|orange|whitesmoke|lightgr[ae]y|gainsboro|darkgr[ae]y)\\b';
const colors = value => value.match(new RegExp(COLOR_SRC, 'gi')) || [];

export function parse(str) {
  const s = str.toLowerCase();
  if (NAMED[s]) return parse(NAMED[s]);
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = i => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const m = s.match(/rgba?\(([^)]*)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
}
export function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
export const hsl = (h, s, l, a = 1) => {
  const f = n => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const hex = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}${a < 1 ? hex(a) : ''}`;
};
export const TINT = 278;   // itslearning's aubergine (#5D4A68)
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ACCENT_TEXT = 28;    // the itslearning orange, for what the site draws in link blue
const isBlue = (h, s) => s >= 0.25 && h >= 190 && h <= 235;

function mapBg(c) {
  const { h, s, l } = toHsl(c);
  if (s < 0.2 || l > 0.96) {
    if (l >= 0.5) return hsl(TINT, 0.17, 0.075 + (1 - l) * 0.3, c.a);   // white→panel, light grey→raised
    return hsl(TINT, 0.15, clamp(0.12 + l * 0.35, 0.12, 0.28), c.a);    // dark greys stay dark, a little lifted
  }
  const hue = isBlue(h, s) ? TINT : h;                                  // blue notices join the aubergine
  if (l > 0.72) return hsl(hue, clamp(s * 0.45, 0.2, 0.5), 0.17, c.a);  // pastel chips and notices
  if (l > 0.45) return hsl(hue, clamp(s * 0.8, 0.2, 0.75), 0.28, c.a);
  return hsl(hue, s, clamp(l, 0.2, 0.4), c.a);
}
export function mapText(c) {
  const { h, s, l } = toHsl(c);
  if (s < 0.2) {
    if (l > 0.62) return hsl(TINT, 0.12, Math.max(l, 0.82), c.a);
    return hsl(TINT, 0.1, clamp(0.97 - l * 0.65, 0.62, 0.95), c.a);     // dark text→light, grey stays quieter
  }
  if (isBlue(h, s)) return hsl(ACCENT_TEXT, 1, 0.71, c.a);              // links, as in Friis
  return hsl(h, clamp(s, 0.35, 0.85), clamp(1 - l * 0.45, 0.72, 0.9), c.a);
}
function mapBorder(c) {
  const { h, s, l } = toHsl(c);
  if (s < 0.2) return hsl(TINT, 0.16, clamp(0.26 - l * 0.09, 0.15, 0.26), c.a);
  return hsl(isBlue(h, s) ? TINT : h, clamp(s * 0.6, 0.2, 0.6), clamp(l * 0.55, 0.25, 0.42), c.a);
}
export function remap(value, fn) {
  return value.replace(new RegExp(COLOR_SRC, 'gi'), m => {
    const c = parse(m);
    return c && c.a > 0 ? fn(c) : m;
  });
}
export { mapBg };

/* ---------- a small CSS walker: enough for minified, well-formed stylesheets ---------- */
function* blocks(css) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) return;
    let depth = 1, j = open + 1, q = null;
    for (; j < css.length && depth; j++) {
      const ch = css[j];
      if (q) { if (ch === q && css[j - 1] !== '\\') q = null; }
      else if (ch === '"' || ch === "'") q = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    yield [css.slice(i, open).trim(), css.slice(open + 1, j - 1)];
    i = j;
  }
}
const splitTop = (str, sep) => {
  const out = []; let d = 0, q = null, cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (q) { if (ch === q && str[i - 1] !== '\\') q = null; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(') d++;
    else if (ch === ')') d--;
    else if (ch === sep && d === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
};

// Course colour classes are kept out: theme.css styles them through --jl-course.
const SKIP_SELECTOR = /\.[a-z]+--[1-9]00\b|::-moz|-ms-|:-ms|\.lt-ie/;
// The site's dark icons disappear on a dark page.
const DARK_ICON = /url\([^)]*--(?:gray--[3-9]00|black|brand--[5-9]00)[^)]*\.svg/;

function declarations(body, iconUrl) {
  const out = [];
  for (const raw of splitTop(body, ';')) {
    const at = raw.indexOf(':');
    if (at < 0) continue;
    const prop = raw.slice(0, at).trim().toLowerCase();
    let value = raw.slice(at + 1).trim();
    const important = /!important/i.test(value);
    value = value.replace(/\s*!important/i, '');
    const plain = value.replace(/url\([^)]*\)/g, '');
    const found = colors(plain);
    let decl = null;
    if (prop === 'font-family') {
      if (/\b(Lato|LatoRegular|Open Sans)\b/.test(value)) decl = ['font-family', 'var(--jl-font)'];
    } else if ((prop === 'background' || prop === 'background-image') && DARK_ICON.test(value)) {
      const icon = iconUrl(value.match(/url\(["']?([^"')]*)["']?\)/)[1]);
      if (icon) out.push(`background-image:url(${icon})${important ? '!important' : ''}`);
      if (prop === 'background' && found.length) decl = ['background-color', remap(found[0], mapBg)];
    } else if (!found.length && !/gradient\(/.test(plain)) {
      continue;
    } else if (prop === 'color') {
      decl = ['color', remap(value, mapText)];
    } else if (prop === 'background-color') {
      decl = ['background-color', remap(value, mapBg)];
    } else if (prop === 'background' || prop === 'background-image') {
      if (/gradient\(/.test(plain)) decl = ['background-image', remap(value, mapBg)];
      else if (prop === 'background') decl = ['background-color', remap(found[0], mapBg)];
    } else if (/^border(-(top|right|bottom|left))?(-color)?$/.test(prop)) {
      const name = prop.endsWith('-color') ? prop : `${prop}-color`;
      decl = [name, prop.endsWith('-color') ? remap(value, mapBorder) : remap(found[0], mapBorder)];
    }
    if (decl) out.push(`${decl[0]}:${decl[1]}${important ? '!important' : ''}`);
  }
  return out;
}

/** The sheet's colour rules, ready to nest under html[data-jl="dark"]. */
export function transform(css, iconUrl = () => null) {
  const out = [];
  for (const [head, body] of blocks(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    if (head.startsWith('@media')) {
      if (/print/.test(head) && !/screen/.test(head)) continue;
      const inner = transform(body, iconUrl);
      if (inner.length) out.push(`${head}{${inner.join('')}}`);
      continue;
    }
    if (/^@(supports|container)/.test(head)) {
      const inner = transform(body, iconUrl);
      if (inner.length) out.push(`${head}{${inner.join('')}}`);
      continue;
    }
    if (head.startsWith('@layer')) {   // our rules beat any layer anyway, so its contents can sit flat
      if (body) out.push(...transform(body, iconUrl));
      continue;
    }
    if (head.startsWith('@')) continue;
    const decls = declarations(body, iconUrl);
    if (!decls.length) continue;
    const clean = head.slice(head.lastIndexOf(';') + 1);
    const selectors = splitTop(clean, ',').map(s => s.trim()).filter(s => s && !SKIP_SELECTOR.test(s));
    if (!selectors.length) continue;
    // nested under the prefix, so root selectors become the nesting parent itself
    const scoped = selectors.map(s => s.replace(/^(html|:root)(?=[\s.>:[]|$)/, '&'));
    out.push(`${scoped.join(',')}{${decls.join(';')}}`);
  }
  return out;
}
