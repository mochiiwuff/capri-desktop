'use strict';

const API = 'http://127.0.0.1:47823';
let windowId = null;
let busy = false;
let retryTimer = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'open-capri-window' || sender.id !== chrome.runtime.id) return;
  openCapriWindow()
    .then((win) => sendResponse({ ok: true, id: win.id }))
    .catch((error) => sendResponse({ ok: false, error: error.message || 'Could not open Brave.' }));
  return true;
});

chrome.windows.onRemoved.addListener((id) => {
  if (windowId === id) {
    windowId = null;
    chrome.storage.session.remove('capriWindowId');
  }
});

chrome.alarms.create('capri-browser-poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => schedulePoll(0));
poll();

function schedulePoll(delay = 500) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    poll();
  }, delay);
}

async function getWindow() {
  if (windowId !== null) {
    try {
      const win = await chrome.windows.get(windowId);
      if (win && !win.incognito) return win;
      windowId = null;
      await chrome.storage.session.remove('capriWindowId');
    } catch {
      windowId = null;
    }
  }
  const stored = await chrome.storage.session.get('capriWindowId');
  if (Number.isInteger(stored.capriWindowId)) {
    try {
      const win = await chrome.windows.get(stored.capriWindowId);
      if (win && !win.incognito) {
        windowId = win.id;
        return win;
      }
      await chrome.storage.session.remove('capriWindowId');
    } catch {}
  }
  try {
    const lastFocused = await chrome.windows.getLastFocused?.({ populate: false, windowTypes: ['normal'] });
    if (lastFocused && !lastFocused.incognito) return lastFocused;
  } catch {}
  try {
    const windows = await chrome.windows.getAll?.({ populate: false, windowTypes: ['normal'] });
    const normal = windows?.find((w) => !w.incognito);
    if (normal) return normal;
  } catch {}
  return null;
}

async function openCapriWindow() {
  const win = await getWindow();
  if (win) {
    windowId = win.id;
    await chrome.storage.session.set({ capriWindowId: windowId });
    await chrome.windows.update(win.id, { focused: true });
    return win;
  }
  return (await ensureWindow('https://search.brave.com/')).window;
}

async function currentTab() {
  const win = await getWindow();
  if (!win) return null;
  const [tab] = await chrome.tabs.query({ windowId: win.id, active: true });
  return tab || null;
}

async function ensureWindow(url) {
  const win = await getWindow();
  if (win) {
    windowId = win.id;
    await chrome.storage.session.set({ capriWindowId: windowId });
    const tabs = await chrome.tabs.query({ windowId: win.id, active: true });
    const current = tabs?.[0];
    if (current && (current.url === 'about:blank' || current.url?.startsWith('chrome://newtab') || current.url?.startsWith('brave://newtab'))) {
      await chrome.tabs.update(current.id, { url, active: true });
      await chrome.windows.update(win.id, { focused: true });
      return { window: win, tabId: current.id };
    }
    const createdTab = await chrome.tabs.create({ windowId: win.id, url, active: true });
    await chrome.windows.update(win.id, { focused: true });
    return { window: win, tabId: createdTab.id };
  }
  const created = await chrome.windows.create({ url, focused: true, type: 'normal', incognito: false });
  windowId = created.id;
  await chrome.storage.session.set({ capriWindowId: windowId });
  return { window: created, tabId: created.tabs?.[0]?.id };
}

function waitForLoad(tabId, timeout = 12000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    const timer = setTimeout(finish, timeout);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => tab.status === 'complete' && finish()).catch(finish);
  });
}

async function inspect(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const labelFor = (el) => {
        const label = el.labels?.[0]?.innerText || '';
        return [label, el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('name')]
          .filter(Boolean).join(' — ').slice(0, 140);
      };
      const controls = [...document.querySelectorAll('a,button,input:not([type="password"]),textarea,select,[role="button"]')]
        .filter(visible)
        .slice(0, 100)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: (el.getAttribute('type') || '').toLowerCase(),
          text: (['input', 'textarea', 'select'].includes(el.tagName.toLowerCase()) ? labelFor(el) : el.innerText || labelFor(el))
            .trim().slice(0, 140),
          label: labelFor(el),
          href: el.tagName === 'A' ? el.href : '',
        }));
      return {
        title: document.title.slice(0, 180),
        url: location.href,
        text: (document.body?.innerText || '').slice(0, 7000),
        controls,
      };
    },
  });
  return result?.result || null;
}

function searchResults(page) {
  if (!page) return [];
  return page.controls
    .filter((control) => control.href && !/search\.brave\.com|brave\.com\/(search|settings)/i.test(control.href))
    .map(({ text, href }) => ({ title: text, url: href }))
    .filter((result) => result.title && /^https?:/.test(result.url))
    .slice(0, 12);
}

async function perform(action) {
  if (action.type === 'search') {
    const url = `https://search.brave.com/search?q=${encodeURIComponent(action.query)}`;
    const { tabId } = await ensureWindow(url);
    await waitForLoad(tabId);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const page = await inspect(tabId);
    return {
      ok: true,
      message: `Pesquisei no Brave por “${action.query}” e abri os resultados na janela da Capri.`,
      context: page ? `Resultados da busca no Brave (“${action.query}”):\n${page.text.slice(0, 4500)}\nLinks encontrados: ${JSON.stringify(searchResults(page))}` : '',
    };
  }
  if (action.type === 'open') {
    let url;
    try {
      url = new URL(action.url);
    } catch {
      return { ok: false, error: 'Endereço inválido.' };
    }
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, error: 'Só posso abrir páginas http ou https.' };
    const { tabId } = await ensureWindow(url.toString());
    await waitForLoad(tabId);
    return { ok: true, message: `Abri ${url.hostname} na janela da Capri.` };
  }

  const tab = await currentTab();
  if (!tab?.id) return { ok: false, error: 'Abra uma página na janela da Capri primeiro.' };
  if (action.type === 'close-tab') {
    if (!action.confirmed) return { ok: false, confirmation: 'Fechar a aba pode descartar alterações não salvas. Quer continuar?' };
    const win = await getWindow();
    const tabs = win ? await chrome.tabs.query({ windowId: win.id }) : [];
    if (tabs.length === 1) await chrome.tabs.create({ windowId: win.id, url: 'about:blank', active: true });
    await chrome.tabs.remove(tab.id);
    return { ok: true, message: 'Fechei a aba atual da janela da Capri.' };
  }
  if (action.type === 'inspect') {
    const page = await inspect(tab.id);
    return page
      ? { ok: true, message: `Página atual: ${page.title} (${page.url})`, context: JSON.stringify(page).slice(0, 7000) }
      : { ok: false, error: 'Não consegui ler esta página.' };
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [action],
    func: (request) => {
      const norm = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const labelFor = (el) => {
        const label = el.labels?.[0]?.innerText || '';
        return [label, el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('name')]
          .filter(Boolean).join(' ');
      };
      const elements = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"]')].filter(visible);
      const sensitive = (text) => /(?:^|[^\p{L}\p{N}])(?:sign[ -]?in|log[ -]?in|password|senha|checkout|pay|payment|buy|purchase|order|publish|post|delete|remove|send|subscribe|confirm|upload|pagamento|comprar|publicar|excluir|apagar|enviar|assinar|entrar|acessar|conta|credit[ -]?card|card number|billing|mot de passe|connexion|paiement|payer|acheter|achat|commande|publier|publication|supprimer|effacer|envoyer|abonnement|inicio de sesi[oó]n|iniciar sesi[oó]n|contrase[nñ]a|pago|pedido|eliminar|borrar|suscribirse|вход|парол[ья]|оплат[а-я]*|купить|покупк[а-я]*|заказ[а-я]*|публик[а-я]*|отправ[а-я]*|удал[а-я]*|подпис[а-я]*)(?:$|[^\p{L}\p{N}])/iu.test(text);
      const target = norm(request.target);
      if (request.type === 'fill') {
        const field = elements.find((el) => ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase())
          && (norm(labelFor(el)) === target || norm(labelFor(el)).includes(target)));
        if (!field) return { ok: false, error: 'Não encontrei esse campo visível.' };
        const fieldType = field.type?.toLowerCase();
        if (fieldType === 'password' || ['hidden', 'file', 'submit', 'button', 'reset', 'image'].includes(fieldType)
            || /password/i.test(field.autocomplete || '')) {
          return { ok: false, error: 'Por segurança, a Capri não acessa nem preenche campos de senha, arquivo ou campos ocultos.' };
        }
        if (sensitive(labelFor(field))) return { ok: false, error: 'Esse campo parece conter dados de login, pagamento ou outra informação sensível. Não vou preenchê-lo.' };
        const form = field.closest('form');
        const formText = form ? `${form.innerText} ${form.action} ${[...form.elements].map(labelFor).join(' ')}` : '';
        if (!request.confirmed && form && (sensitive(formText) || form.querySelector('input[type="password"],input[autocomplete*="cc-"]'))) {
          return { ok: false, confirmation: 'Este campo pertence a um formulário de login, pagamento ou outra ação sensível.' };
        }
        field.focus();
        field.value = request.value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, message: `Preenchi o campo “${labelFor(field).slice(0, 80)}”.` };
      }

      if (request.type === 'submit') {
        const form = target ? elements.find((el) => norm(el.innerText || labelFor(el)).includes(target))?.closest('form')
          : [...document.forms].find(visible);
        if (!form) return { ok: false, error: 'Não encontrei esse formulário visível.' };
        const formText = `${form.innerText} ${form.action} ${[...form.elements].map(labelFor).join(' ')}`;
        if (!request.confirmed && (sensitive(formText) || form.querySelector('input[type="password"],input[autocomplete*="cc-"]'))) {
          return { ok: false, confirmation: 'Este formulário parece envolver login, pagamento, publicação ou uma ação sensível.' };
        }
        const submit = form.querySelector('button[type="submit"],input[type="submit"]');
        if (submit) submit.click();
        else form.requestSubmit();
        return { ok: true, message: 'Enviei o formulário.' };
      }

      const element = elements.find((el) => norm(el.innerText || el.value || labelFor(el)) === target)
        || elements.find((el) => norm(el.innerText || el.value || labelFor(el)).includes(target));
      if (!element) return { ok: false, error: 'Não encontrei esse link ou botão visível.' };
      const form = element.closest('form');
      const actionText = `${element.innerText} ${labelFor(element)} ${element.getAttribute('type') || ''} ${form?.innerText || ''}`;
      if (!request.confirmed && (sensitive(actionText) || form?.querySelector('input[type="password"],input[autocomplete*="cc-"]'))) {
        return { ok: false, confirmation: `A ação “${(element.innerText || labelFor(element)).slice(0, 90)}” pode envolver login, envio, compra, publicação ou exclusão.` };
      }
      element.click();
      return { ok: true, message: `Cliquei em “${(element.innerText || labelFor(element)).slice(0, 90)}”.` };
    },
  });
  return result?.result || { ok: false, error: 'A página não retornou o resultado da ação.' };
}

async function poll() {
  if (busy) return;
  busy = true;
  let retryDelay = 500;
  try {
    const response = await fetch(`${API}/browser/next`, { cache: 'no-store' });
    if (!response.ok) {
      retryDelay = 5000;
      console.error(`[capri] browser bridge returned HTTP ${response.status}`);
      return;
    }
    const command = await response.json();
    if (!command?.id || !command.action) return;
    let result;
    try {
      result = await perform(command.action);
    } catch (error) {
      result = { ok: false, error: error.message || 'Falha ao controlar o Brave.' };
    }
    await fetch(`${API}/browser/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: command.id, result }),
    });
  } catch (error) {
    retryDelay = 5000;
    console.warn(`[capri] browser bridge unavailable (${error.name || 'Error'}):`, error.message);
  } finally {
    busy = false;
    schedulePoll(retryDelay);
  }
}
