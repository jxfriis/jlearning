// Builds generated/. No dependencies: `node tools/generate.js [cdn-version]`.
// site-dark.css is itslearning's own stylesheets reduced to their colour declarations and remapped to
// the skin's dark palette, so every page is covered with no runtime work in the browser.
// Re-run after itslearning changes its CSS; class names are stable across their version bumps.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'generated');
const SHEETS = [
  'skins/itsl.css', 'skins/itsl-inuit.min.css', 'skins/ccl.css', 'skins/Platform/controls-layout.css',
  'skins/Platform/widgets-layout.css', 'skins/JQuery/theme/jquery-ui-1.11.4.custom.css', 'skins/lato.css',
  'css/global.min.css', 'css/prometheus.modern.css', 'application/course/common.modern.bundle.css',
  ...['main-menu', 'topmenu', 'instant-message', 'profile-card-dialog', 'auto-logout', 'course-cards', 'all-courses',
    'dashboard', 'activities', 'contentarea-main', 'schedule', 'planner-plans', 'planner-plan', 'planner-element',
    'planner-table-view', 'planner-this-week', 'planner-calendar-cards', 'planner-dashboard-plans', 'resources',
    'status-and-follow-up-menu', 'about-course', 'course-participants', 'student-parent-task-list', 'latest-changes',
    'keep-attendance-dialog', 'self-registration-dialog', 'your-settings', 'private-files', 'eportfolio-app',
    'attendee-overview-attendee', 'ilp-student-report-view', 'learning-tool-element-header', 'notifications', 'search',
    'login-page'].map(a => `apps/${a}/index.min.css`),
];
const PREFIX = 'html[data-jl="dark"]';
const COURSE_RE = /\.coursecard\.([a-z]+)--100>\.coursecard__main:before\{border-color:(#[0-9a-f]+)\}/g;
const ICON_BASE = 'chrome-extension://__MSG_@@extension_id__/generated/icons/';

/* ---------- Friis's easings: WPF ElasticEase / BackEase sampled into linear(), as in its motion.js ---------- */
const elasticIn = (oscillations, springiness) => t => {
  const expo = springiness === 0 ? t : (Math.exp(springiness * t) - 1) / (Math.exp(springiness) - 1);
  return expo * Math.sin((Math.PI * 2 * oscillations + Math.PI / 2) * t);
};
const backIn = amplitude => t => t * t * t - t * amplitude * Math.sin(Math.PI * t);
const easeOut = f => t => 1 - f(1 - t);
const sample = (f, n = 72) => `linear(${Array.from({ length: n + 1 }, (_, i) => +f(i / n).toFixed(4)).join(',')})`;

function writeEasing() {
  const css = `html[data-jl]{--jl-spring:${sample(easeOut(elasticIn(2, 6)), 96)};` +
    `--jl-bouncy:${sample(easeOut(elasticIn(1, 4)))};` +
    `--jl-back:${sample(easeOut(backIn(0.45)))};` +
    `--jl-settle:${sample(easeOut(backIn(0.22)))};` +
    `--jl-quick:cubic-bezier(.25,.46,.45,.94)}\n`;
  fs.writeFileSync(path.join(OUT, 'easing.css'), css);
}

async function main() {
  const { transform, parse, toHsl, hsl, clamp, remap, mapText, TINT } = await import('../transform.mjs');
  fs.mkdirSync(OUT, { recursive: true });
  writeEasing();
  const version = process.argv[2] || 'v2026.10.4.5595';
  const seen = new Set(), rules = [], courses = new Map(), icons = new Map();

  for (const sheet of SHEETS) {
    const sheetUrl = `https://cdn.itslearning.com/${version}/${sheet}`;
    const res = await fetch(sheetUrl);
    if (!res.ok) { console.warn(`skip ${sheet}: ${res.status}`); continue; }
    let n = 0;
    const text = await res.text();
    for (const [, name, color] of text.matchAll(COURSE_RE)) courses.set(name, color);
    const iconUrl = url => {
      const name = path.basename(url);
      icons.set(name, new URL(url, sheetUrl).href);
      return ICON_BASE + name;
    };
    for (const rule of transform(text, iconUrl)) {
      if (!seen.has(rule)) { seen.add(rule); rules.push(rule); n++; }
    }
    console.log(`${sheet}: ${n} rules`);
  }

  // recoloured copies of the dark icons; pages load only the ones they show
  const iconDir = path.join(OUT, 'icons');
  fs.rmSync(iconDir, { recursive: true, force: true });
  fs.mkdirSync(iconDir, { recursive: true });
  const used = [...icons].filter(([name]) => rules.some(rule => rule.includes(ICON_BASE + name)));
  const missing = [];
  await Promise.all(used.map(async ([name, url]) => {
    // some sheets' relative paths don't resolve from where they're served; the icons all live under one folder
    const base = `https://cdn.itslearning.com/${version}/Common/semiotic/icons/`;
    let res;
    for (const candidate of [url, base + name, `${base}fa7/${name}`, `${base}custom/${name}`]) {
      res = await fetch(candidate);
      if (res.ok) break;
    }
    if (!res.ok) { missing.push(name); return; }
    let svg = remap(await res.text(), mapText);
    if (!/#[0-9a-f]{3,8}\b/i.test(svg)) svg = svg.replace('<svg', `<svg fill="${hsl(TINT, 0.12, 0.8)}"`);   // black by default
    fs.writeFileSync(path.join(iconDir, name), svg);
  }));

  if (missing.length) console.warn(`icons not found: ${missing.join(' ')}`);

  // merge neighbours with an identical body to save bytes without changing cascade order
  const merged = [];
  for (const rule of rules) {
    const at = rule.indexOf('{'), sel = rule.slice(0, at), body = rule.slice(at);
    const prev = merged[merged.length - 1];
    if (prev && prev.body === body && !sel.startsWith('@')) prev.sel += `,${sel}`;
    else merged.push({ sel, body });
  }
  const css = `${PREFIX}{\n${merged.map(r => r.sel + r.body).join('\n')}\n}\n`;
  fs.writeFileSync(path.join(OUT, 'site-dark.css'), css);

  // each course's own colour, for theme.css to tint its card with
  const courseCss = [...courses].map(([name, color]) => {
    const { h, s } = toHsl(parse(color));
    return `.${name}--100{--jl-course:${hsl(h, clamp(s * 1.25, 0.3, 0.8), 0.62)}}`;
  }).join('');
  fs.appendFileSync(path.join(OUT, 'easing.css'), `html[data-jl]{${courseCss}}\n`);

  // lets content.js spot a sheet the build hasn't seen
  fs.writeFileSync(path.join(OUT, 'known.js'), `const JL_KNOWN = new Set(${JSON.stringify(SHEETS)});\n`);
  console.log(`site-dark.css: ${(css.length / 1024).toFixed(0)} KB, ${merged.length} rules, ${used.length} icons`);
}
main();
