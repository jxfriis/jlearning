// Makes Ressourcer's folders open at once. Opening one takes three requests in a row, about 400ms in all, so they're
// fetched as soon as the pointer touches the folder, and the site's own request gets that answer when it asks.
// Answers are kept for a minute, which also makes the back button instant. Runs in the page, as only there can the
// site's fetch be answered. A reload always asks the server again.
(() => {
  const KEEP_MS = 60000;
  const WANTED = /^\/restapi\/resources\/(?:folder\/\d+(?:\/elements)?|breadcrumbs\/\d+)\/v1$/;
  const IGNORED_PARAM = 'planner2-sb-collapsed';   // copied from the page's address; it doesn't change the answer
  const answers = new Map();
  const siteFetch = window.fetch;

  const keyFor = input => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !WANTED.test(url.pathname)) return null;
    url.searchParams.delete(IGNORED_PARAM);
    return url.pathname + url.search;
  };
  const skinOn = () => document.documentElement.dataset.jl !== undefined;

  function remember(key, request) {
    const entry = { at: Date.now(), answer: request.then(response => (response.ok ? response : Promise.reject(response))) };
    entry.answer.catch(() => answers.delete(key));
    answers.set(key, entry);
    return entry;
  }

  window.fetch = function (input, init) {
    const method = (init?.method || input?.method || 'GET').toUpperCase();
    const key = method === 'GET' && skinOn() ? keyFor(input) : null;
    if (!key) return siteFetch.apply(this, arguments);
    const kept = answers.get(key);
    if (kept && Date.now() - kept.at < KEEP_MS) {
      return kept.answer.then(response => arrange(key, response.clone()), () => siteFetch.call(window, input, init));
    }
    const request = siteFetch.apply(this, arguments);
    remember(key, request.then(response => response.clone()));
    return request.then(response => arrange(key, response));
  };

  // Favorite folders, then other folders, then files. The server has already sorted by date, so this keeps each group in
  // that order. Only for this sort and the first view of a folder: any other sort you choose stays as the server sends
  // it. Done as each answer is handed over, so a new favorite counts at once. content.js keeps the list in localStorage.
  const favourites = () => {
    try { return new Set(JSON.parse(localStorage.getItem('jl-fav-folders')) || []); } catch { return new Set(); }
  };
  const ordered = items => {
    const favs = favourites();
    const isFav = item => favs.has(String(item.elementId));
    return [...items.filter(isFav), ...items.filter(item => item.isFolder && !isFav(item)), ...items.filter(item => !item.isFolder && !isFav(item))];
  };
  async function arrange(key, response) {
    const plain = decodeURIComponent(key);
    const sorted = plain.endsWith('sortBy=ModifiedDT:Descending');
    const first = /\/folder\/\d+\/v1$/.test(plain);
    if (!response.ok || (!sorted && !first)) return response;
    const answer = await response.clone().json();
    const list = sorted ? answer : answer.folderElements;
    if (!Array.isArray(list?.elements)) return response;
    list.elements = ordered(list.elements);
    return new Response(JSON.stringify(answer), { status: response.status, statusText: response.statusText, headers: response.headers });
  }

  function prepare(folder) {
    for (const path of [
      `/restapi/resources/folder/${folder}/v1`,
      `/restapi/resources/breadcrumbs/${folder}/v1?useContentArea=false`,
      `/restapi/resources/folder/${folder}/elements/v1?pageIndex=0&pageSize=100&searchString=&sortBy=ModifiedDT:Descending`,
    ]) {
      const key = keyFor(path);
      const kept = answers.get(key);
      if (!kept || Date.now() - kept.at >= KEEP_MS) remember(key, siteFetch.call(window, path));
    }
  }

  document.addEventListener('pointerover', event => {
    if (!skinOn()) return;
    const link = event.target.closest?.('a[href*="/Resources?FolderID="]');
    const folder = link?.href.match(/FolderID=(\d+)/)?.[1];
    if (folder) prepare(folder);
  }, { capture: true, passive: true });
})();
