// The parts of our player Panopto's doesn't have as a button: a speed button that remembers your speed, keys, and Danish labels.
// Everything goes through Panopto's own controls and menus, so its streams, captions and quizzes stay in step.
(() => {
  const root = document.documentElement;
  const on = () => root.dataset.jlReader === 'video';
  const LABELS = {
    Play: 'Afspil', Pause: 'Pause', 'Skip back 10 seconds': '10 sekunder tilbage', 'Skip forward 10 seconds': '10 sekunder frem',
    Unmuted: 'Slå lyd fra', Muted: 'Slå lyd til', 'Watch in Panopto': 'Se i Panopto', 'Captions not available': 'Ingen undertekster',
    Captions: 'Undertekster', 'Enter fullscreen': 'Fuld skærm', 'Exit fullscreen': 'Afslut fuld skærm',
  };
  const stored = async key => { try { return (await chrome.storage.local.get(key))[key]; } catch { return undefined; } };
  const store = (key, value) => { try { chrome.storage.local.set({ [key]: value }); } catch {} };

  const speedItems = () => [...document.querySelectorAll('#playbackSpeedMenu .item')];
  const speedOf = item => parseFloat(item.textContent);
  const shown = speed => `${String(speed).replace('.', ',')}×`;
  const video = () => document.querySelector('#player video');

  let button, menu;
  function setSpeed(speed) {
    const item = speedItems().find(other => speedOf(other) === speed);
    if (item) item.click();
    else if (video()) video().playbackRate = speed;
    paint();
  }
  function paint() {
    const speed = video()?.playbackRate ?? 1;
    if (button) button.textContent = shown(speed);
    for (const item of menu?.children ?? []) item.setAttribute('aria-checked', Number(item.dataset.speed) === speed);
  }

  function addSpeed() {
    const list = document.getElementById('navigationControls');
    if (!list || !speedItems().length) return;
    if (!button) {
      button = document.createElement('div');
      button.className = 'button-control jl-speed';
      button.title = 'Hastighed';
      button.setAttribute('role', 'button');
      button.tabIndex = 0;
      menu = document.createElement('div');
      menu.className = 'jl-speed-menu';
      menu.hidden = true;
      for (const speed of speedItems().map(speedOf)) {
        const item = document.createElement('button');
        item.type = 'button';
        item.dataset.speed = speed;
        item.textContent = shown(speed);
        item.addEventListener('click', () => {
          setSpeed(speed);
          store('videoSpeed', speed);
          menu.hidden = true;
        });
        menu.append(item);
      }
      button.addEventListener('click', () => { menu.hidden = !menu.hidden; });
      document.addEventListener('pointerdown', event => {
        if (!event.composedPath().includes(menu) && !event.composedPath().includes(button)) menu.hidden = true;
      }, true);
    }
    if (!button.isConnected) list.prepend(button);
    if (!menu.isConnected) document.getElementById('player')?.append(menu);
    paint();
  }

  // your speed, once Panopto has started the video (it sets its own when it starts)
  let applied = false;
  document.addEventListener('playing', async () => {
    if (!on() || applied) return;
    applied = true;
    const speed = await stored('videoSpeed');
    if (speed && speed !== video()?.playbackRate) setSpeed(speed);
  }, true);
  document.addEventListener('ratechange', paint, true);

  // Keys, on top of Panopto's own. They press its buttons, so they do exactly what the buttons do.
  const press = selector => document.querySelector(`#hoverButtonContainer ${selector}`)?.click();
  const nudge = by => { if (video()) video().currentTime = Math.max(0, video().currentTime + by); };
  document.addEventListener('keydown', event => {
    if (!on() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('textarea, select, [contenteditable], input:not([type=range]), .MuiPopover-root')) return;
    const speeds = speedItems().map(speedOf).sort((a, b) => a - b);
    const step = by => { const next = speeds[speeds.indexOf(video()?.playbackRate) + by]; if (next) { setSpeed(next); store('videoSpeed', next); } };
    const actions = {
      ' ': () => press('.play-pause'),
      k: () => press('.play-pause'),
      j: () => press('.rewind-forward:nth-of-type(2)'),
      l: () => press('.rewind-forward:nth-of-type(3)'),
      m: () => press('.volume-control .button-control'),
      f: () => press('#navigationControls > .button-control:last-child'),
      '>': () => step(1),
      '<': () => step(-1),
    };
    if (event.target.matches?.('input[type=range]') === false) {
      actions.ArrowLeft = () => nudge(-5);
      actions.ArrowRight = () => nudge(5);
    }
    const key = event.key.length === 1 && !/[<>]/.test(event.key) ? event.key.toLowerCase() : event.key;
    if (key === ' ' && event.target.matches?.('button, .jl-speed')) return;
    if (!actions[key]) return;
    event.preventDefault();
    event.stopPropagation();
    actions[key]();
  }, true);

  function relabel() {
    for (const el of document.querySelectorAll('#hoverButtonContainer [title]')) {
      if (LABELS[el.title]) el.title = LABELS[el.title];
    }
  }

  let queued = false;
  const tidy = () => {
    queued = false;
    if (!on()) {
      button?.remove();
      menu?.remove();
      return;
    }
    addSpeed();
    relabel();
  };
  addEventListener('DOMContentLoaded', () => {
    if (window !== parent) parent.postMessage({ jlPanopto: true }, '*');   // the page around it shows the switch
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(tidy);
    }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'data-jl-reader'] });
    tidy();
  });
})();
