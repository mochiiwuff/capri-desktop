// "Set my own times": the four numbers of her focus mode, typed in a little window of their own
// (the overlay never takes the keyboard). Saved in her config; main/focus.js checks them again.

const host = window.host;
const FIELDS = ['work', 'rest', 'long', 'rounds'];
const bad = (template, min, max) => template.replace('{min}', min).replace('{max}', max);

async function boot() {
  const { times, limits, lang, labels } = await host.focusTimes();
  document.documentElement.lang = lang;
  document.title = labels.timesTitle;
  for (const el of document.querySelectorAll('[data-label]')) el.textContent = labels[el.dataset.label] || '';

  const form = document.getElementById('times');
  const error = form.querySelector('.times__error');
  for (const name of FIELDS) {
    const input = form.elements[name];
    const [min, max] = limits[name];
    input.min = min;
    input.max = max;
    input.value = times?.[name] ?? '';
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      error.hidden = true;
    });
  }
  form.elements.work.focus();
  form.elements.work.select();

  // the first field out of its limits, marked, or the numbers
  const read = () => {
    const out = {};
    for (const name of FIELDS) {
      const input = form.elements[name];
      const n = Number(input.value);
      const [min, max] = limits[name];
      if (!Number.isInteger(n) || n < min || n > max) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        error.textContent = bad(labels.timesBad, min, max);
        error.hidden = false;
        return null;
      }
      out[name] = n;
    }
    return out;
  };

  const save = async (start) => {
    const values = read();
    if (!values) return;
    const result = await host.saveFocusTimes(values, start);
    if (!result.ok) {
      const input = form.elements[result.field];
      input?.setAttribute('aria-invalid', 'true');
      error.textContent = bad(labels.timesBad, result.min, result.max);
      error.hidden = false;
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save(true);
  });
  form.querySelector('[data-act="save"]').addEventListener('click', () => save(false));
  form.querySelector('[data-act="cancel"]').addEventListener('click', () => host.closeFocusTimes());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') host.closeFocusTimes();
  });
}

boot().catch((err) => console.error('[capri] focus times failed', err));
