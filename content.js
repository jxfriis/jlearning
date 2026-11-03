// All styling is plain CSS gated on html[data-jl]; this only sets that attribute.
// localStorage is read first because it is synchronous, so the page never paints unskinned.
(() => {
  const root = document.documentElement;
  const dark = matchMedia('(prefers-color-scheme: dark)');
  let theme = 'dark';

  // The PDF and PowerPoint viewers are readers of ours unless switched off, in which case they're left alone.
  const reader = location.pathname.startsWith('/PdfViewer/') ? 'pdf'
    : location.hostname === 'powerpoint.officeapps.live.com' ? 'ppt' : null;
  let readerOn = true;

  const apply = () => {
    if (theme === 'off' || (reader && !readerOn)) {
      delete root.dataset.jl;
      delete root.dataset.jlReader;
      return;
    }
    root.dataset.jl = theme === 'auto' ? (dark.matches ? 'dark' : 'light') : theme;
    if (reader) root.dataset.jlReader = reader;
  };
  const remember = (key, value) => {
    try { localStorage.setItem(`jl-${key}`, value); } catch {}   // sandboxed frames have no storage
  };
  const setTheme = value => {
    theme = value;
    remember('theme', value);
    apply();
  };
  const setReader = on => {
    readerOn = on;
    remember('reader', on);
    apply();
    dispatchEvent(new Event('resize'));   // both viewers lay themselves out from the window
  };

  try {
    theme = localStorage.getItem('jl-theme') || theme;
    readerOn = localStorage.getItem('jl-reader') !== 'false';
  } catch {}
  apply();

  const readerKey = kind => (kind === 'pdf' ? 'readerPdf' : 'readerPpt');
  chrome.storage.sync.get(['theme', readerKey(reader)], saved => {
    if (saved.theme && saved.theme !== theme) setTheme(saved.theme);
    if (reader && (saved[readerKey(reader)] ?? true) !== readerOn) setReader(!readerOn);
  });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.theme) setTheme(changes.theme.newValue);
    if (reader && changes[readerKey(reader)]) setReader(changes[readerKey(reader)].newValue);
  });
  dark.addEventListener('change', apply);
  if (reader) addEventListener('load', () => dispatchEvent(new Event('resize')));

  function readerSwitch(key, onShow, text = 'jlearning reader', fallback = true) {
    const button = document.createElement('button');
    const label = document.createElement('span');
    const track = document.createElement('b');
    label.textContent = text;
    track.append(document.createElement('i'));
    button.type = 'button';
    button.className = 'jl-reader-switch';
    button.title = text;
    button.setAttribute('role', 'switch');
    button.append(label, track);
    const show = on => {
      button.setAttribute('aria-checked', on);
      onShow?.(on);
    };
    chrome.storage.sync.get(key, saved => show(saved[key] ?? fallback));
    chrome.storage.onChanged.addListener(changes => { if (changes[key]) show(changes[key].newValue); });
    button.addEventListener('click', () => {
      const on = button.getAttribute('aria-checked') !== 'true';
      show(on);
      chrome.storage.sync.set({ [key]: on });
    });
    return button;
  }

  // The page around a viewer holds its "open" link; the switch between our reader and theirs goes beside it.
  // With our reader on, that row joins the viewer's toolbar (see the end of readers.css).
  if (location.pathname === '/File/View.aspx') {
    document.addEventListener('DOMContentLoaded', () => {
      const kind = /.pptx?$/i.test(document.title) ? 'ppt' : /.pdf$/i.test(document.title) ? 'pdf' : null;
      const link = document.querySelector('a.ccl-iconlink');
      if (!kind || !link) return;
      link.before(readerSwitch(readerKey(kind), on => {
        if (on) root.dataset.jlMerge = kind;
        else delete root.dataset.jlMerge;
      }));
    });
  }

  // PDF.js fills its toolbar, so the switch and the new tab button live inside it.
  if (reader === 'pdf') {
    document.addEventListener('DOMContentLoaded', () => {
      const print = document.getElementById('printButton');
      if (!print) return;
      print.before(readerSwitch(readerKey('pdf')));

      customizeSearch();

      if (window === top) return;   // already in its own tab
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'toolbarButton jl-open-tab';
      open.title = 'Åbn i ny fane';
      open.setAttribute('aria-label', 'Åbn i ny fane');
      open.addEventListener('click', () => window.open(location.href, '_blank', 'noopener'));
      print.before(open);
    });
  }

  // Our search field on PDF.js's search engine: its input and buttons stay and keep working, and get our labels,
  // a result count inside the field, a close button, and closing on a click elsewhere.
  function customizeSearch() {
    const find = document.getElementById('findbar');
    const findButton = document.getElementById('viewFindButton');
    const input = document.getElementById('findInput');
    const results = document.getElementById('findResultsCount');
    if (!find || !findButton || !input || !results) return;

    const relabel = (el, text, attr) => {
      el?.removeAttribute('data-l10n-id');   // or PDF.js translates it back
      if (attr) el?.setAttribute(attr, text);
      else if (el) el.textContent = text;
    };
    relabel(input, 'Søg i dokumentet', 'placeholder');
    relabel(document.getElementById('findPreviousButton'), 'Forrige', 'title');
    relabel(document.getElementById('findNextButton'), 'Næste', 'title');
    for (const [id, text] of [['findHighlightAll', 'Fremhæv alle'], ['findMatchCase', 'Store/små'],
      ['findMatchDiacritics', 'Accenter'], ['findEntireWord', 'Hele ord']]) {
      relabel(document.querySelector(`label[for="${id}"]`), text);
    }

    const count = document.createElement('output');
    count.className = 'jl-find-count';
    const showCount = () => {
      if (!input.value) count.textContent = '';
      else if (input.getAttribute('data-status') === 'notFound') count.textContent = 'Ingen';
      else {
        const { current, total } = JSON.parse(results.getAttribute('data-l10n-args') || '{}');
        count.textContent = total ? `${current} af ${total}` : '';
      }
    };
    const watch = new MutationObserver(showCount);
    watch.observe(results, { attributes: true, attributeFilter: ['data-l10n-args'] });
    watch.observe(input, { attributes: true, attributeFilter: ['data-status'] });
    input.addEventListener('input', showCount);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'jl-find-close';
    close.title = 'Luk søgning';
    close.setAttribute('aria-label', 'Luk søgning');
    close.addEventListener('click', () => findButton.click());   // through its button, to keep PDF.js's state right

    document.getElementById('findInputContainer').append(close);
    input.after(count);

    document.addEventListener('pointerdown', event => {
      if (!root.dataset.jlReader || find.classList.contains('hidden')) return;
      if (!find.contains(event.target) && !findButton.contains(event.target)) findButton.click();
    });
  }

  // The site's scripts render the room's bar after the page loads, so wait for what's needed.
  function whenReady(find, then, patience = 8000) {
    const found = find();
    if (found) return then(found);
    const watch = new MutationObserver(() => {
      const el = find();
      if (el) { watch.disconnect(); then(el); }
    });
    watch.observe(root, { childList: true, subtree: true });
    setTimeout(() => watch.disconnect(), patience);
  }

  const makeButton = (label, cls, go) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = cls;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', go);
    return button;
  };

  // Back and forward: always first in the room's title row, on every page in a room, so they never move. A PDF or
  // PowerPoint opens in a frame whose history this page's navigation can't see, so only a folder list, which is
  // all this page's own history, greys out forward.
  function makeHistoryButtons() {
    const back = makeButton('Tilbage', 'jl-back', () => history.back());
    const forward = makeButton('Frem', 'jl-forward', () => history.forward());
    const arrows = document.createElement('div');
    arrows.className = 'jl-history';
    arrows.append(back, forward);
    const refresh = () => {
      back.disabled = history.length <= 1;
      forward.disabled = location.pathname.startsWith('/Resources') && window.navigation?.canGoForward === false;
    };
    window.navigation?.addEventListener('currententrychange', refresh);
    refresh();
    return arrows;
  }

  // Folders always open from the top, with the newest first, through the site's own sort menu. Once per folder, so
  // choosing another sort still works until the next folder. Going back keeps your place instead.
  function sortNewestFirst() {
    // The site scrolls down to the list after a sort, which makes sense when you chose it yourself but not when a
    // folder opens. So the page stays put for a moment, unless you start scrolling yourself.
    let release = () => {};
    function holdScroll(y) {
      release();
      const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
      const stay = () => { if (scrollY !== y) scrollTo({ top: y, behavior: 'instant' }); };
      const stop = () => {
        removeEventListener('scroll', stay);
        for (const type of inputs) removeEventListener(type, stop, true);
      };
      release = stop;
      addEventListener('scroll', stay);
      for (const type of inputs) addEventListener(type, stop, true);
      setTimeout(stop, 2500);
      stay();
    }
    window.navigation?.addEventListener('currententrychange', event => {
      if (event.navigationType !== 'traverse' && location.pathname.startsWith('/Resources')) holdScroll(0);
    });

    let clicked = null;
    const check = () => {
      if (clicked === location.search || !root.dataset.jl) return;
      const current = [...document.querySelectorAll('.prom-table__header-cell')].find(cell => /Udgivet/.test(cell.textContent));
      const newest = [...document.querySelectorAll('.prom-dropdown__listitem')].find(item => /nyeste først/i.test(item.textContent));
      if (!current || !newest || current.getAttribute('aria-sort') === 'descending') return;
      clicked = location.search;
      holdScroll(scrollY);
      newest.click();
    };
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; check(); });
    }).observe(root, { childList: true, subtree: true });
    check();
  }

  // A folder tree in Ressourcer's side panel: the path to where you are stays open, the rest folds. Branches load when
  // opened. It moves between folders the way the site's own links do, through its router, so nothing reloads.
  function addFolderTree() {
    const folderIn = url => url?.match(/FolderID=(\d+)/)?.[1];
    const tree = document.createElement('nav');
    tree.className = 'jl-tree';
    tree.setAttribute('aria-label', 'Mapper');
    const heading = document.createElement('div');
    heading.className = 'jl-tree-heading';
    heading.textContent = 'Mapper';
    const top = document.createElement('ul');
    tree.append(heading, top);

    const asked = new Map();
    const foldersIn = id => {
      if (!asked.has(id)) {
        asked.set(id, fetch(`/restapi/resources/folder/${id}/v1`)
          .then(response => (response.ok ? response.json() : Promise.reject(response)))
          .then(folder => folder.folderElements.elements.filter(item => item.isFolder))
          .catch(() => { asked.delete(id); return []; }));
      }
      return asked.get(id);
    };

    const nodes = new Map();
    function makeNode(item) {
      const id = String(item.elementId);
      const node = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'jl-tree-row';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'jl-tree-toggle';
      toggle.setAttribute('aria-label', item.title);
      toggle.setAttribute('aria-expanded', 'false');
      const link = document.createElement('a');
      link.href = item.elementUrl;
      link.textContent = item.title;
      link.title = item.title;
      const branch = document.createElement('ul');
      branch.hidden = true;
      row.append(toggle, link);
      node.append(row, branch);

      let filled = false;
      const open = async show => {
        toggle.setAttribute('aria-expanded', show);
        branch.hidden = !show;
        if (!show || filled) return;
        filled = true;
        const children = await foldersIn(id);
        branch.replaceChildren(...children.map(makeNode));
        if (!children.length) {
          row.classList.add('jl-tree-leaf');
          branch.hidden = true;
        }
      };
      toggle.addEventListener('click', () => open(toggle.getAttribute('aria-expanded') !== 'true'));
      link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        if (folderIn(location.search) === id) return;
        const state = { __historySync: { FolderID: Number(id) } };
        history.pushState(state, '', item.elementUrl);
        dispatchEvent(new PopStateEvent('popstate', { state }));
      });
      nodes.set(id, { row, link, open });
      return node;
    }

    // keep the path to the current folder open and marked
    async function follow() {
      const current = folderIn(location.search);
      if (!current) return;
      for (const { row, link } of nodes.values()) {
        row.classList.remove('jl-tree-current');
        link.removeAttribute('aria-current');
      }
      const response = await fetch(`/restapi/resources/breadcrumbs/${current}/v1?useContentArea=false`).catch(() => null);
      if (!response?.ok || folderIn(location.search) !== current) return;
      const { breadcrumbList } = await response.json();
      for (const crumb of breadcrumbList.slice(1)) await nodes.get(folderIn(crumb.url))?.open(true);
      const here = nodes.get(current);
      here?.row.classList.add('jl-tree-current');
      here?.link.setAttribute('aria-current', 'page');
    }

    const place = () => {
      const primary = document.querySelector('.prom-navigation-panel__primary-items');
      if (primary && tree.previousElementSibling !== primary) primary.after(tree);
    };
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; place(); });
    }).observe(root, { childList: true, subtree: true });
    window.navigation?.addEventListener('currententrychange', follow);

    whenReady(() => document.getElementById('resources-page'), async homeLink => {
      const home = folderIn(homeLink.href);
      if (!home) return;
      top.replaceChildren(...(await foldersIn(home)).map(makeNode));
      place();
      follow();
    });
  }

  // The clearer view of a room: nothing under the title, Ressourcer and Planer as the front page's main cards, and the
  // rest under "Mere" in the title row. The layout is in theme.css. The site's scripts can redraw its bar after we've
  // added to it, so this checks on every change and puts back what went missing.
  function addRoomView() {
    const arrows = makeHistoryButtons();
    const toggle = readerSwitch('roomView', on => {
      if (on) root.dataset.jlRoom = '';
      else delete root.dataset.jlRoom;
    }, 'Overskuelig visning');

    const more = document.createElement('details');
    more.className = 'jl-room-more';
    const summary = document.createElement('summary');
    summary.textContent = 'Mere';
    const list = document.createElement('div');
    more.append(summary, list);
    document.addEventListener('pointerdown', event => { if (!more.contains(event.target)) more.open = false; });

    const shortcuts = document.createElement('nav');
    shortcuts.className = 'jl-room-shortcuts';

    const home = document.createElement('a');
    home.className = 'jl-room-home';
    home.title = 'Til rummets forside';
    home.setAttribute('aria-label', 'Til rummets forside');

    const place = () => {
      const resources = document.getElementById('resources');
      const title = document.querySelector('.prom-secondary-menu__title');
      if (!resources || !title) return;
      if (arrows.parentElement !== title) title.prepend(arrows);
      if (toggle.parentElement !== title) title.append(toggle);

      if (more.parentElement !== title) {
        const sources = document.querySelectorAll('.prom-secondary-navigation :is(#dashboard, #planner, #resources, #status, #participants, .prom-navigation_submenu a, #settings)');
        const links = [...new Map([...sources].map(source => [source.href, source])).values()];
        list.replaceChildren(...links.map(source => {
          const link = document.createElement('a');
          link.href = source.href;
          link.textContent = source.textContent.trim();
          return link;
        }));
        toggle.before(more);
      }

      // the room's name is its home button, now the tabs are gone: a real link, so Ctrl+click and the like work
      const name = title.querySelector('.prom-secondary-menu__text');
      const dashboard = document.getElementById('dashboard');
      if (name && dashboard && home.parentElement !== name) {
        home.href = dashboard.href;
        name.append(home);
      }

      const layout = document.querySelector('.il-widgetslayout');
      if (layout && dashboard?.classList.contains('prom-navigation__item--selected') && shortcuts.nextElementSibling !== layout) {
        shortcuts.replaceChildren(...[[resources, 'Ressourcer', 'Filer fra dine undervisere', 'jl-go-files'], [document.getElementById('planner'), 'Planer', 'Forløb og undervisning', 'jl-go-plans']].filter(([source]) => source).map(([source, text, note, cls]) => {
          const link = document.createElement('a');
          link.href = source.href;
          link.className = cls;
          const strong = document.createElement('strong');
          strong.textContent = text;
          const small = document.createElement('small');
          small.textContent = note;
          link.append(strong, small);
          return link;
        }));
        layout.before(shortcuts);
      }
    };
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; place(); });
    }).observe(root, { childList: true, subtree: true });
    place();
  }

  // The top search closes on a click elsewhere, including in a frame like the PowerPoint or PDF reader. A click there
  // never reaches this page, so that shows up as this window losing focus to the frame.
  function closeSearchOnLeave() {
    const close = () => {
      const search = document.querySelector('.prom-global-search:has(.prom-global-search__popup-container)');
      const input = search?.querySelector('input');
      if (!input) return;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      input.blur();
    };
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest?.('.prom-global-search')) close();
    }, true);
    addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement?.tagName === 'IFRAME') close();
    }));
  }

  if (window === top && !reader && location.hostname.endsWith('.itslearning.com')) {
    document.addEventListener('DOMContentLoaded', () => {
      closeSearchOnLeave();
      whenReady(() => document.getElementById('resources'), addRoomView);
      if (location.pathname.startsWith('/Resources')) {
        sortNewestFirst();
        addFolderTree();
      }
    });
  }

  // The light/dark switch in the top bar. The menu is rendered by the site's own script, so wait for it.
  function addSwitch(menu) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jl-switch';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', 'Light mode');
    button.title = 'Light / dark';
    button.append(document.createElement('i'));
    const sync = () => button.setAttribute('aria-checked', root.dataset.jl === 'light');
    sync();
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-jl'] });
    button.addEventListener('click', () => chrome.storage.sync.set({ theme: root.dataset.jl === 'light' ? 'dark' : 'light' }));
    menu.before(button);
  }
  if (window === top) {
    const place = () => {
      const menu = document.querySelector('.personal');
      if (menu) { waiting.disconnect(); addSwitch(menu); }
    };
    const waiting = new MutationObserver(place);
    waiting.observe(root, { childList: true, subtree: true });
    addEventListener('load', () => setTimeout(() => waiting.disconnect(), 5000));
  }

  // Most of a page's wait is the server building it, about a second. So a link is fetched as soon as the pointer
  // touches it, and rendered unseen once it rests there, which makes the click instant when the browser allows it.
  // Listed pages only: nothing that marks an element as read or signs out.
  if (window === top) {
    document.addEventListener('DOMContentLoaded', () => {
      if (!HTMLScriptElement.supports?.('speculationrules')) return;
      const where = {
        and: [
          { or: ['/CourseCards', '/AllCourses', '/Dashboard/*', '/Course/Course.aspx*', '/main.aspx\\?CourseID=*',
            '/main.aspx\\?TextURL=Calendar*', '/main.aspx\\?TextURL=Project*', '/ContentArea/ContentArea.aspx*', '/Resources*',
            '/CourseParticipantsV2*', '/StatusAndFollowUpMenu*', '/Courses/*/about', '/plans/courses/*'].map(href_matches => ({ href_matches })) },
          { not: { href_matches: '/plans/courses/*/element/*' } },
        ],
      };
      const rules = document.createElement('script');
      rules.type = 'speculationrules';
      rules.textContent = JSON.stringify({
        prefetch: [{ eagerness: 'eager', where }],
        prerender: [{ eagerness: 'moderate', where }],
      });
      document.head.append(rules);
    });
    document.addEventListener('prerenderingchange', () => { root.dataset.jlArrived = ''; });
  }

  // A click answers at once: the link breathes, the nav pill hops to it, and a bar runs along the top.
  let clicked = null;
  const settle = () => {
    delete root.dataset.jlLoading;
    clicked?.classList.remove('jl-pending');
    clicked = null;
  };
  document.addEventListener('click', event => { clicked = event.target.closest?.('a[href]') ?? null; }, true);
  window.navigation?.addEventListener('navigate', event => {
    if (event.destination.sameDocument || event.downloadRequest !== null) return;
    if (root.dataset.jl) root.dataset.jlLoading = '';
    clicked?.classList.add('jl-pending');
    setTimeout(settle, 15000);   // a link that didn't lead anywhere
  });
  addEventListener('pageshow', settle);   // back to a page kept in memory

  // A stylesheet the build hadn't seen (a new itslearning app, say) gets converted once, here, and cached.
  // transform.mjs only loads when that happens, so ordinary pages pay for one list lookup.
  const sheetName = href => {
    const url = new URL(href);
    if (!url.hostname.endsWith('.itslearning.com')) return null;
    const path = url.pathname.replace(/^\/v[\d.]+\//, '').replace(/^\//, '');
    return url.hostname === 'cdn.itslearning.com' ? path : url.hostname + url.pathname;
  };
  async function adoptNewSheets() {
    if (root.dataset.jl !== 'dark') return;
    const fresh = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map(link => [link.href, sheetName(link.href)])
      .filter(([, name]) => name && !JL_KNOWN.has(name));
    if (!fresh.length) return;
    const cached = await chrome.storage.local.get(fresh.map(([, name]) => `sheet:${name}`));
    let css = '';
    for (const [href, name] of fresh) {
      let rules = cached[`sheet:${name}`];
      if (rules === undefined) {
        try {
          const { transform } = await import(chrome.runtime.getURL('transform.mjs'));
          const res = await fetch(href);
          if (!res.ok) continue;
          rules = transform(await res.text()).join('\n');
          chrome.storage.local.set({ [`sheet:${name}`]: rules });
        } catch { continue; }   // a host that won't share its sheet; the check below covers it
      }
      css += rules;
    }
    if (!css) return;
    const style = document.createElement('style');
    style.textContent = `html[data-jl="dark"]{${css}}`;
    root.appendChild(style);
  }

  // Some tools (the quiz player, say) paint a white page from styles this can't reach, and our light text then
  // vanishes on it. A frame that's still white in the middle goes back to the site's own colours: plain, but readable.
  function keepFrameReadable() {
    if (window === top || reader || root.dataset.jl !== 'dark') return;
    for (const el of document.elementsFromPoint(innerWidth / 2, innerHeight / 2)) {
      const [r, g, b, a = 1] = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number);
      if (a < 0.9) continue;
      if (Math.min(r, g, b) > 200 && el.offsetWidth * el.offsetHeight > innerWidth * innerHeight * 0.25) {
        theme = 'off';   // for this frame only: not remembered
        apply();
      }
      return;
    }
  }

  document.addEventListener('DOMContentLoaded', () => adoptNewSheets().catch(() => {}));
  addEventListener('load', () => {
    setTimeout(keepFrameReadable, 300);
    setTimeout(keepFrameReadable, 2000);   // for tools that render after loading
  });
})();
