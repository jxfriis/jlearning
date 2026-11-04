const buttons = [...document.querySelectorAll('.seg button')];
const rows = [...document.querySelectorAll('.row')];
const pill = document.querySelector('.pill');

function show(theme) {
  buttons.forEach((b, i) => {
    const on = b.dataset.v === theme;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
    if (on) pill.style.translate = `${i * 100}% 0`;
  });
}

chrome.storage.sync.get(['theme', 'roomView', 'readerPdf', 'readerPpt', 'readerVideo'], saved => {
  show(saved.theme || 'dark');
  for (const row of rows) row.setAttribute('aria-checked', saved[row.dataset.key] ?? true);
});
for (const b of buttons) {
  b.addEventListener('click', () => {
    show(b.dataset.v);
    chrome.storage.sync.set({ theme: b.dataset.v });
  });
}
for (const row of rows) {
  row.addEventListener('click', () => {
    const on = row.getAttribute('aria-checked') !== 'true';
    row.setAttribute('aria-checked', on);
    chrome.storage.sync.set({ [row.dataset.key]: on });
  });
}
