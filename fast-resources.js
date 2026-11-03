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
      return kept.answer.then(response => response.clone(), () => siteFetch.call(window, input, init));
    }
    const request = siteFetch.apply(this, arguments).then(response => arrange(key, response));
    remember(key, request.then(response => response.clone()));
    return request;
  };

  // Newest changed first, with folders above files. The server has already sorted by date, so moving the folders up
  // keeps each group in that order. Only for this sort: any other one you choose stays as the server sends it.
  async function arrange(key, response) {
    if (!response.ok || !decodeURIComponent(key).endsWith('sortBy=ModifiedDT:Descending')) return response;
    const list = await response.clone().json();
    if (!Array.isArray(list.elements)) return response;
    list.elements = [...list.elements.filter(item => item.isFolder), ...list.elements.filter(item => !item.isFolder)];
    return new Response(JSON.stringify(list), { status: response.status, statusText: response.statusText, headers: response.headers });
  }

  function prepare(folder) {
    for (const path of [
      `/restapi/resources/folder/${folder}/v1`,
      `/restapi/resources/breadcrumbs/${folder}/v1?useContentArea=false`,
      `/restapi/resources/folder/${folder}/elements/v1?pageIndex=0&pageSize=100&searchString=&sortBy=ModifiedDT:Descending`,
    ]) {
      const key = keyFor(path);
      const kept = answers.get(key);
      if (!kept || Date.now() - kept.at >= KEEP_MS) remember(key, siteFetch.call(window, path).then(response => arrange(key, response)));
    }
  }

  document.addEventListener('pointerover', event => {
    if (!skinOn()) return;
    const link = event.target.closest?.('a[href*="/Resources?FolderID="]');
    const folder = link?.href.match(/FolderID=(\d+)/)?.[1];
    if (folder) prepare(folder);
  }, { capture: true, passive: true });
})();
