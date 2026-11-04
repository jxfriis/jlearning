// Our player for videos that would otherwise get the browser's plain controls. The video element stays and does the playing;
// this puts it in a box with our controls on top. Videos in other players, with their own controls, are left alone.
// With the skin or the switch off, or if a video can't play, the box comes off and the browser's controls come back.
(() => {
  const root = document.documentElement;
  const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const OTHER_PLAYER = '.video-js, .plyr, .jwplayer, .azuremediaplayer, .mejs-container, .kaltura-player-container';
  const players = new Map();
  let wanted = true;

  const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  const ICONS = {
    play: icon('M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z'),
    pause: icon('M7 5h3.5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm6.5 0H17a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'),
    replay: icon('M12 5V2L7 6.5 12 11V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z'),
    back: icon('M11 6v12l-8-6zm9 0v12l-8-6z'),
    forward: icon('M4 6v12l8-6zm9 0v12l8-6z'),
    sound: icon('M4 9v6h4l5 4.5v-15L8 9zm12-.5v7a4 4 0 0 0 0-7zM16 4v2.2a6 6 0 0 1 0 11.6V20a8 8 0 0 0 0-16z'),
    muted: icon('M4 9v6h4l5 4.5v-15L8 9zm11.3.1L14 10.4l1.6 1.6-1.6 1.6 1.3 1.3 1.6-1.6 1.6 1.6 1.3-1.3-1.6-1.6 1.6-1.6-1.3-1.3-1.6 1.6z'),
    captions: icon('M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm3 9.5c1 0 1.800-.4 2.400-1l-1.100-1.100c-.3.3-.7.500-1.200.500-.8 0-1.400-.6-1.400-1.400S6.300 10.600 7.100 10.600c.5 0 .9.200 1.200.5l1.100-1.100c-.6-.6-1.400-1-2.400-1a3 3 0 0 0 0 6zm7 0c1 0 1.800-.4 2.400-1l-1.100-1.100c-.3.3-.7.500-1.200.500-.8 0-1.400-.6-1.400-1.400s.6-1.400 1.400-1.400c.5 0 .9.200 1.200.5l1.100-1.100c-.6-.6-1.400-1-2.400-1a3 3 0 0 0 0 6z'),
    window: icon('M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h16V7zm8 4h7v5h-7z'),
    full: icon('M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z'),
    leave: icon('M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z'),
  };

  const CSS = `
    :host { --jl-track: color-mix(in srgb, var(--jl-text) 24%, transparent); position: relative; display: block; overflow: hidden; background: #000; border-radius: 14px; container-type: inline-size; outline: none; }
    :host(:fullscreen) { border-radius: 0; }
    :host(.jl-page) { position: fixed; inset: 0; border-radius: 0; }
    :host(.idle) { cursor: none; }
    :host(:focus-visible) { outline: 2px solid var(--jl-accent); outline-offset: 2px; }
    * { box-sizing: border-box; }
    svg { display: block; width: 22px; height: 22px; fill: currentColor; }
    button { font: inherit; color: inherit; cursor: pointer; }

    .stage { position: absolute; inset: 0; display: grid; place-items: center; }
    .big {
      display: grid; place-items: center; width: 76px; height: 76px; padding: 0;
      color: var(--jl-on-accent); border: 1px solid transparent; border-bottom-width: 4px; border-radius: 50%;
      background: var(--jl-accent-fill) padding-box, var(--jl-accent-edge) border-box;
      box-shadow: 0 8px 26px rgb(0 0 0 / .45);
      transition: scale 600ms var(--jl-spring), opacity 140ms;
    }
    .big svg { width: 36px; height: 36px; }
    .big:hover { scale: 1.1; }
    .big:active { scale: .92; transition: scale 90ms; }
    :host(.playing) .big { opacity: 0; scale: .6; pointer-events: none; }
    .spin {
      position: absolute; width: 52px; height: 52px; border: 5px solid rgb(255 255 255 / .22); border-top-color: var(--jl-accent); border-radius: 50%;
      opacity: 0; pointer-events: none; transition: opacity 160ms 200ms; animation: spin 800ms linear infinite;
    }
    :host(.waiting) .spin { opacity: 1; }
    @keyframes spin { to { rotate: 360deg; } }
    .flash {
      position: absolute; padding: 8px 16px; font-size: 15px; font-weight: 650; color: #fff; border-radius: 12px; background: rgb(0 0 0 / .62);
      opacity: 0; pointer-events: none;
    }
    .flash.show { animation: flash 700ms var(--jl-spring); }
    @keyframes flash { 0% { opacity: 0; scale: .7; } 25% { opacity: 1; } 70% { opacity: 1; scale: 1; } 100% { opacity: 0; scale: 1; } }

    .bar {
      position: absolute; left: 10px; right: 10px; bottom: 10px; padding: 8px 10px 8px; color: var(--jl-text);
      border: 1px solid transparent; border-bottom-width: 3px; border-radius: 16px;
      background: var(--jl-raised-fill) padding-box, var(--jl-raised-edge) border-box;
      box-shadow: 0 8px 26px rgb(0 0 0 / .4);
      transition: translate 500ms var(--jl-spring), opacity 160ms;
    }
    :host(.idle) .bar { translate: 0 24px; opacity: 0; pointer-events: none; }
    .row { display: flex; align-items: center; gap: 4px; }
    .gap { flex: 1; }
    .time { padding: 0 8px; font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--jl-muted); }
    .time b { font-weight: 600; color: var(--jl-text); }

    .tool {
      display: grid; place-items: center; flex: none; min-width: 40px; height: 40px; padding: 0; border: 0; border-radius: 11px; background: none;
      transition: scale 550ms var(--jl-spring);
    }
    .tool:hover { background: var(--jl-selected-fill); scale: 1.08; }
    .tool:active { scale: .88; transition: scale 90ms; }
    .tool:focus-visible, input:focus-visible { outline: 2px solid var(--jl-accent); outline-offset: 1px; }
    .tool[aria-pressed="true"] { color: var(--jl-accent); }
    .tool.main {
      color: var(--jl-on-accent); border: 1px solid transparent; border-bottom-width: 3px;
      background: var(--jl-accent-fill) padding-box, var(--jl-accent-edge) border-box;
      margin-right: 2px;
    }
    .speed { padding: 0 8px; font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; }

    input[type=range] { display: block; width: 100%; height: 20px; margin: 0; background: none; appearance: none; cursor: pointer; }
    input[type=range]::-webkit-slider-runnable-track {
      height: 6px; border-radius: 3px;
      background: linear-gradient(90deg, var(--jl-accent) var(--p, 0%), var(--b-fill, transparent) var(--p, 0%), var(--b-fill, transparent) var(--b, 0%), var(--jl-track) var(--b, 0%));
      transition: height 120ms;
    }
    input[type=range]::-webkit-slider-thumb {
      appearance: none; width: 14px; height: 14px; margin-top: -4px; border: 0; border-radius: 50%; background: var(--jl-accent); box-shadow: 0 1px 4px rgb(0 0 0 / .5);
      transition: scale 500ms var(--jl-spring);
    }
    input[type=range]:hover::-webkit-slider-thumb { scale: 1.25; }
    input[type=range]:active::-webkit-slider-thumb { scale: 1.05; transition: scale 90ms; }
    .seek { position: relative; margin-bottom: 8px; --b-fill: color-mix(in srgb, var(--jl-accent) 30%, var(--jl-track)); }
    .tip {
      position: absolute; bottom: 24px; left: 0; padding: 3px 8px; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap;
      color: #fff; border-radius: 8px; background: rgb(0 0 0 / .78); translate: -50% 0; opacity: 0; pointer-events: none; transition: opacity 100ms;
    }
    .seek:hover .tip { opacity: 1; }
    input.volume { width: 84px; flex: none; }

    .menu {
      position: absolute; right: 46px; bottom: 112px; display: flex; flex-direction: column; min-width: 96px; padding: 5px; border: 1px solid transparent; border-bottom-width: 3px; border-radius: 13px;
      background: var(--jl-raised-fill) padding-box, var(--jl-raised-edge) border-box; box-shadow: 0 8px 26px rgb(0 0 0 / .4);
      transform-origin: 70% 100%; animation: menu 420ms var(--jl-spring);
    }
    .menu[hidden] { display: none; }
    @keyframes menu { from { scale: .75; opacity: 0; } }
    .menu button { padding: 7px 12px; text-align: left; font-size: 14px; font-variant-numeric: tabular-nums; border: 0; border-radius: 9px; background: none; }
    .menu button:hover { background: var(--jl-selected-fill); }
    .menu button[aria-checked="true"] { color: var(--jl-accent); font-weight: 650; }

    .resume {
      position: absolute; left: 50%; top: 14px; display: flex; align-items: center; gap: 6px; padding: 5px 6px 5px 14px; font-size: 13px; white-space: nowrap; color: var(--jl-text);
      border: 1px solid transparent; border-bottom-width: 3px; border-radius: 12px; translate: -50% 0;
      background: var(--jl-raised-fill) padding-box, var(--jl-raised-edge) border-box; box-shadow: 0 6px 20px rgb(0 0 0 / .4);
      animation: resume 550ms var(--jl-spring);
    }
    .resume[hidden] { display: none; }
    @keyframes resume { from { translate: -50% -60px; } }
    .resume button { padding: 4px 10px; font-size: 13px; font-weight: 600; color: var(--jl-accent); border: 0; border-radius: 8px; background: none; }
    .resume button:hover { background: var(--jl-selected-fill); }

    /* small videos keep what you need most */
    @container (max-width: 560px) { input.volume, .skip { display: none; } }
    @container (max-width: 400px) { .optional { display: none; } .time { padding: 0 2px; font-size: 12px; } .big { width: 60px; height: 60px; } }
  `;
  const HTML = `
    <slot></slot>
    <div class="stage">
      <button class="big" type="button" aria-label="Afspil">${ICONS.play}</button>
      <div class="spin"></div>
      <div class="flash"></div>
    </div>
    <div class="resume" hidden><span></span><button type="button">Start forfra</button></div>
    <div class="bar">
      <div class="seek"><input class="seek-input" type="range" min="0" max="1000" step="1" value="0" aria-label="Spol"><div class="tip"></div></div>
      <div class="row">
        <button class="tool main play" type="button"></button>
        <button class="tool skip" data-by="-10" type="button" title="10 sekunder tilbage (J)" aria-label="10 sekunder tilbage">${ICONS.back}</button>
        <button class="tool skip" data-by="10" type="button" title="10 sekunder frem (L)" aria-label="10 sekunder frem">${ICONS.forward}</button>
        <button class="tool mute" type="button"></button>
        <input class="volume" type="range" min="0" max="100" value="100" aria-label="Lydstyrke">
        <span class="time"><b class="now">0:00</b> / <span class="total">0:00</span></span>
        <span class="gap"></span>
        <button class="tool captions optional" type="button" title="Undertekster (C)" aria-label="Undertekster" hidden>${ICONS.captions}</button>
        <button class="tool speed" type="button" title="Hastighed" aria-haspopup="true" aria-expanded="false">1×</button>
        <button class="tool window optional" type="button" title="Billede i billede (P)" aria-label="Billede i billede">${ICONS.window}</button>
        <button class="tool full" type="button"></button>
      </div>
    </div>
    <div class="menu" role="menu" hidden>
      ${SPEEDS.slice().reverse().map(speed => `<button type="button" role="menuitemradio" data-speed="${speed}">${String(speed).replace('.', ',')}×</button>`).join('')}
    </div>
  `;
  let sheet;

  const clock = seconds => {
    if (!Number.isFinite(seconds)) return '0:00';
    const whole = Math.max(0, Math.floor(seconds));
    const h = Math.floor(whole / 3600), m = Math.floor(whole / 60) % 60, s = String(whole % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  };
  // the extension can be reloaded under an open page, after which its storage throws
  const stored = async key => { try { return (await chrome.storage.local.get(key))[key]; } catch { return undefined; } };
  const store = (key, value) => { try { chrome.storage.local.set({ [key]: value }); } catch {} };

  function mount(video) {
    const before = video.getBoundingClientRect();
    const seen = getComputedStyle(video);
    const parent = video.parentElement;
    const wasPlaying = !video.paused;
    const box = document.createElement('div');
    box.className = 'jl-video';
    box.tabIndex = 0;
    const shadow = box.attachShadow({ mode: 'open' });
    sheet ||= new CSSStyleSheet();
    if (!sheet.cssRules.length) sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
    shadow.innerHTML = HTML;
    const $ = selector => shadow.querySelector(selector);

    // the box takes the place the video had
    const original = { width: video.style.width, height: video.style.height, display: video.style.display, position: video.style.position, maxWidth: video.style.maxWidth, maxHeight: video.style.maxHeight, inset: video.style.inset, margin: video.style.margin };
    const ownPage = document.contentType?.startsWith('video/');
    if (ownPage) box.classList.add('jl-page');
    else if (seen.position === 'absolute' || seen.position === 'fixed') {
      box.style.position = seen.position;
      box.style.inset = `${seen.top} ${seen.right} ${seen.bottom} ${seen.left}`;
      box.style.borderRadius = '0';
    } else {
      const fillsWidth = parent && before.width >= parent.clientWidth - 1;
      const fillsHeight = parent && parent.clientHeight > 0 && before.height >= parent.clientHeight - 1;
      box.style.width = fillsWidth ? '100%' : `${Math.round(before.width) || 640}px`;
      box.style.maxWidth = '100%';
      if (fillsHeight) box.style.height = '100%';
      box.style.margin = seen.margin;
    }
    video.parentNode.insertBefore(box, video);
    box.append(video);
    Object.assign(video.style, { display: 'block', position: 'static', inset: 'auto', margin: '0', maxWidth: 'none', maxHeight: 'none', width: '100%' });
    video.style.height = ownPage || box.style.height === '100%' || seen.position === 'absolute' || seen.position === 'fixed' ? '100%' : 'auto';
    video.controls = false;
    if (wasPlaying) video.play().catch(() => {});

    const stop = new AbortController();
    const on = (target, type, handler, options) => target.addEventListener(type, handler, { signal: stop.signal, ...options });

    /* ---------- what you see follows the video ---------- */
    const seek = $('.seek-input'), volume = $('.volume'), play = $('.play'), big = $('.big'), mute = $('.mute'), full = $('.full');
    const paint = () => {
      const ended = video.ended;
      const name = ended ? 'Afspil igen' : video.paused ? 'Afspil' : 'Pause';
      play.innerHTML = ICONS[ended ? 'replay' : video.paused ? 'play' : 'pause'];
      big.innerHTML = ICONS[ended ? 'replay' : 'play'];
      for (const button of [play, big]) button.setAttribute('aria-label', name);
      play.title = `${name} (mellemrum)`;
      box.classList.toggle('playing', !video.paused && !ended);
      wake();
    };
    const paintTime = () => {
      if (!dragging && video.duration) {
        seek.value = video.currentTime / video.duration * 1000;
        seek.style.setProperty('--p', `${seek.value / 10}%`);
      }
      $('.now').textContent = clock(video.currentTime);
    };
    const paintLoaded = () => {
      const { buffered, currentTime, duration } = video;
      for (let i = 0; i < buffered.length; i++) {
        if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) seek.style.setProperty('--b', `${buffered.end(i) / duration * 100}%`);
      }
    };
    const paintSound = () => {
      const silent = video.muted || video.volume === 0;
      mute.innerHTML = silent ? ICONS.muted : ICONS.sound;
      const name = silent ? 'Slå lyd til (M)' : 'Slå lyd fra (M)';
      mute.title = name;
      mute.setAttribute('aria-label', name);
      volume.value = silent ? 0 : video.volume * 100;
      volume.style.setProperty('--p', `${volume.value}%`);
      volume.style.setProperty('--b', `${volume.value}%`);
    };
    const paintSpeed = () => {
      $('.speed').textContent = `${String(video.playbackRate).replace('.', ',')}×`;
      for (const item of shadow.querySelectorAll('[data-speed]')) item.setAttribute('aria-checked', Number(item.dataset.speed) === video.playbackRate);
    };
    const paintFull = () => {
      const isFull = document.fullscreenElement === box;
      full.innerHTML = isFull ? ICONS.leave : ICONS.full;
      const name = isFull ? 'Afslut fuld skærm (F)' : 'Fuld skærm (F)';
      full.title = name;
      full.setAttribute('aria-label', name);
    };
    const paintCaptions = () => {
      const tracks = [...video.textTracks].filter(track => track.kind === 'subtitles' || track.kind === 'captions');
      const button = $('.captions');
      button.hidden = !tracks.length;
      button.style.display = tracks.length ? '' : 'none';
      button.setAttribute('aria-pressed', tracks.some(track => track.mode === 'showing'));
      return tracks;
    };
    const flash = text => {
      const el = $('.flash');
      el.textContent = text;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    };

    // the controls step aside while you watch
    let idleTimer;
    function wake() {
      box.classList.remove('idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!video.paused && !video.ended && $('.menu').hidden && !$('.bar').matches(':hover')) box.classList.add('idle');
      }, 2600);
    }

    /* ---------- what you can do ---------- */
    const toggle = () => { if (video.paused || video.ended) video.play().catch(() => {}); else video.pause(); };
    const jump = by => {
      video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + by));
      flash(`${by > 0 ? '+' : '−'}${Math.abs(by)} s`);
      wake();
    };
    const setVolume = value => {
      video.volume = Math.max(0, Math.min(1, value));
      video.muted = video.volume === 0;
    };
    const setSpeed = speed => {
      video.playbackRate = speed;
      flash(`${String(speed).replace('.', ',')}×`);
    };
    const toggleFull = () => {
      if (document.fullscreenElement === box) document.exitFullscreen();
      else box.requestFullscreen?.().catch(() => {});
    };
    const togglePicture = () => {
      if (document.pictureInPictureElement === video) document.exitPictureInPicture();
      else video.requestPictureInPicture?.().catch(() => {});
    };
    const toggleCaptions = () => {
      const tracks = paintCaptions();
      if (!tracks.length) return;
      const showing = tracks.some(track => track.mode === 'showing');
      for (const track of tracks) track.mode = 'disabled';
      if (!showing) tracks[0].mode = 'showing';
      paintCaptions();
    };

    // one click plays or pauses; a second right after is full screen instead
    let clickTimer;
    on($('.stage'), 'click', event => {
      if (event.target.closest('.big')) { toggle(); return; }
      if (!$('.menu').hidden) { closeMenu(); return; }
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        toggleFull();
        return;
      }
      clickTimer = setTimeout(() => { clickTimer = null; toggle(); }, 220);
    });
    on(play, 'click', toggle);
    for (const skip of shadow.querySelectorAll('.skip')) on(skip, 'click', () => jump(Number(skip.dataset.by)));
    on(mute, 'click', () => {
      if (video.muted || video.volume === 0) {
        video.muted = false;
        if (video.volume === 0) video.volume = 0.5;
      } else video.muted = true;
    });
    on(volume, 'input', () => setVolume(volume.value / 100));
    on(full, 'click', toggleFull);
    on($('.window'), 'click', togglePicture);
    on($('.captions'), 'click', toggleCaptions);
    if (!document.fullscreenEnabled) full.style.display = 'none';
    if (!document.pictureInPictureEnabled || video.disablePictureInPicture) $('.window').style.display = 'none';

    let dragging = false;
    on(seek, 'pointerdown', () => { dragging = true; });
    on(seek, 'input', () => {
      seek.style.setProperty('--p', `${seek.value / 10}%`);
      if (video.duration) {
        video.currentTime = seek.value / 1000 * video.duration;
        $('.now').textContent = clock(video.currentTime);
      }
    });
    on(window, 'pointerup', () => { dragging = false; });
    on($('.seek'), 'pointermove', event => {
      const area = seek.getBoundingClientRect();
      const at = Math.max(0, Math.min(1, (event.clientX - area.left) / area.width));
      $('.tip').textContent = clock(at * video.duration);
      $('.tip').style.left = `${Math.max(24, Math.min(area.width - 24, at * area.width))}px`;
    });

    const speedButton = $('.speed');
    const closeMenu = () => {
      $('.menu').hidden = true;
      speedButton.setAttribute('aria-expanded', 'false');
    };
    on(speedButton, 'click', () => {
      const opening = $('.menu').hidden;
      $('.menu').hidden = !opening;
      speedButton.setAttribute('aria-expanded', opening);
    });
    for (const item of shadow.querySelectorAll('[data-speed]')) {
      on(item, 'click', () => { setSpeed(Number(item.dataset.speed)); closeMenu(); });
    }
    on(document, 'pointerdown', event => { if (!event.composedPath().includes($('.menu')) && !event.composedPath().includes(speedButton)) closeMenu(); });

    // Keys work when the page has focus and this is its only video, or when focus is on this one.
    on(document, 'keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.composedPath()[0];
      if (target.closest?.('input:not([type=range]), textarea, select, [contenteditable]')) return;
      const inside = event.composedPath().includes(box);
      const free = target === document.body || target === document.documentElement;
      if (!inside && !(free && players.size === 1)) return;
      const onControl = target.matches?.('button') && inside;
      const onSlider = target.matches?.('input[type=range]');
      const actions = {
        ' ': () => { if (!onControl) toggle(); else return false; },
        k: toggle,
        ArrowLeft: () => { if (onSlider) return false; jump(-5); },
        ArrowRight: () => { if (onSlider) return false; jump(5); },
        j: () => jump(-10),
        l: () => jump(10),
        ArrowUp: () => { if (!inside && document.fullscreenElement !== box) return false; setVolume(video.volume + 0.05); flash(`${Math.round(video.volume * 100)} %`); },
        ArrowDown: () => { if (!inside && document.fullscreenElement !== box) return false; setVolume(video.volume - 0.05); flash(`${Math.round(video.volume * 100)} %`); },
        m: () => mute.click(),
        f: toggleFull,
        p: togglePicture,
        c: toggleCaptions,
        '>': () => { const next = SPEEDS[SPEEDS.indexOf(video.playbackRate) + 1]; if (next) setSpeed(next); },
        '<': () => { const next = SPEEDS[SPEEDS.indexOf(video.playbackRate) - 1]; if (next) setSpeed(next); },
        Home: () => { video.currentTime = 0; },
        End: () => { video.currentTime = video.duration; },
      };
      const key = event.key.length === 1 && event.key !== ' ' && !/[<>]/.test(event.key) ? event.key.toLowerCase() : event.key;
      let action = actions[key];
      if (!action && /^[0-9]$/.test(key) && video.duration) action = () => { video.currentTime = video.duration * Number(key) / 10; };
      if (!action || action() === false) return;
      event.preventDefault();
      wake();
    });

    on(box, 'pointermove', wake);
    on(box, 'pointerleave', () => { if (!video.paused) box.classList.add('idle'); });
    on(box, 'focusin', wake);
    on(document, 'fullscreenchange', paintFull);

    for (const [type, handler] of [
      ['play', paint], ['pause', paint], ['ended', paint],
      ['timeupdate', paintTime], ['seeked', paintTime],
      ['progress', paintLoaded], ['volumechange', paintSound], ['ratechange', paintSpeed],
      ['waiting', () => box.classList.add('waiting')],
      ['playing', () => box.classList.remove('waiting')], ['canplay', () => box.classList.remove('waiting')],
      ['durationchange', () => { $('.total').textContent = clock(video.duration); paintTime(); }],
      ['loadedmetadata', () => { $('.total').textContent = clock(video.duration); paintCaptions(); resume(); }],
      ['error', () => unmount(video)],   // whatever the problem is, the browser's own player says it better
    ]) on(video, type, handler);
    on(video.textTracks, 'addtrack', paintCaptions);

    /* ---------- it remembers your speed and volume, and where you got to ---------- */
    stored('videoPrefs').then(prefs => {
      if (!players.has(video)) return;
      if (prefs?.speed) video.playbackRate = prefs.speed;
      if (prefs?.volume !== undefined && !video.muted) video.volume = prefs.volume;
      const savePrefs = () => store('videoPrefs', { speed: video.playbackRate, volume: video.volume });
      on(video, 'ratechange', savePrefs);
      on(video, 'volumechange', savePrefs);
    });
    const spotKey = () => {
      try { const url = new URL(video.currentSrc); return url.protocol === 'blob:' ? null : url.origin + url.pathname; } catch { return null; }
    };
    let resumed = false;
    async function resume() {
      if (resumed) return;
      resumed = true;
      const key = spotKey();
      if (!key) return;
      const spot = (await stored('videoSpots'))?.[key];
      if (!players.has(video) || !spot || spot < 15 || spot > video.duration - 15 || video.currentTime > 5) return;
      video.currentTime = spot;
      const note = $('.resume');
      note.querySelector('span').textContent = `Fortsætter fra ${clock(spot)}`;
      note.hidden = false;
      const hide = () => { note.hidden = true; };
      on(note.querySelector('button'), 'click', () => { video.currentTime = 0; hide(); });
      setTimeout(hide, 7000);
    }
    async function saveSpot() {
      const key = spotKey();
      if (!key || !video.duration) return;
      const spots = (await stored('videoSpots')) || {};
      delete spots[key];
      if (video.currentTime >= 15 && video.currentTime <= video.duration - 15) spots[key] = Math.floor(video.currentTime);
      const newest = Object.entries(spots).slice(-100);   // the last videos are enough
      store('videoSpots', Object.fromEntries(newest));
    }
    let savedAt = 0;
    on(video, 'timeupdate', () => {
      if (Date.now() - savedAt < 10000 || video.paused) return;
      savedAt = Date.now();
      saveSpot();
    });
    on(video, 'pause', saveSpot);
    on(video, 'ended', saveSpot);
    on(window, 'pagehide', saveSpot);

    players.set(video, { box, stop, original, timers: () => { clearTimeout(idleTimer); clearTimeout(clickTimer); } });
    paint();
    paintTime();
    paintLoaded();
    paintSound();
    paintSpeed();
    paintFull();
    paintCaptions();
    if (video.readyState >= 1) {
      $('.total').textContent = clock(video.duration);
      resume();
    }
  }

  function unmount(video) {
    const player = players.get(video);
    if (!player) return;
    players.delete(video);
    player.stop.abort();
    player.timers();
    const wasPlaying = !video.paused;
    player.box.parentNode?.insertBefore(video, player.box);
    player.box.remove();
    Object.assign(video.style, player.original);
    video.controls = true;
    if (wasPlaying) video.play().catch(() => {});
    refused.add(video);   // it stays with the browser's player while this page is open, unless the switch is flipped
  }
  const refused = new WeakSet();

  const wantsUs = video => (video.controls || document.contentType?.startsWith('video/'))
    && !refused.has(video) && !video.closest(OTHER_PLAYER) && !players.has(video);

  function scan() {
    const skinned = wanted && root.dataset.jl !== undefined;
    for (const [video, { box }] of players) {
      if (!skinned || !box.contains(video) || !box.isConnected) unmount(video);
      else if (video.controls) video.controls = false;   // a site script turned them back on
    }
    if (skinned) for (const video of document.getElementsByTagName('video')) if (wantsUs(video)) mount(video);
  }

  // Runs on every page, so it does nothing but look at the list of videos, at most once a frame, while there's a change.
  let queued = false;
  const queueScan = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  };
  function start() {
    new MutationObserver(queueScan).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['controls', 'data-jl'] });
    chrome.storage.sync.get('readerVideo', saved => {
      wanted = saved.readerVideo ?? true;
      scan();
    });
    chrome.storage.onChanged.addListener(changes => {
      if (!changes.readerVideo) return;
      wanted = changes.readerVideo.newValue;
      if (wanted) for (const video of document.getElementsByTagName('video')) refused.delete(video);
      scan();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
