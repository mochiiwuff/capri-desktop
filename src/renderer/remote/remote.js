'use strict';

const translations = {
  en: {
    connecting: 'Connecting to your desktop…', connected: 'Secure local session connected.',
    disconnected: 'Disconnected. Reopen the local link to reconnect.', auth: 'Authentication required. Open the link from Capri’s desktop menu.',
    failed: 'Request failed. Check that Capri is running, then retry.',
    status: ['Global privacy pause', 'Learning', 'Activity learning', 'Screen observation', 'Screen authorization', 'Assistant'],
    on: 'ON', paused: 'PAUSED', authorized: 'AUTHORIZED', revoked: 'NOT AUTHORIZED', connectedState: 'CONNECTED',
    facts: 'Conversation memories', apps: 'App usage (approx.)', routines: 'Routines', none: 'No entries.',
    reportTitle: 'REPORT', generate: 'Generate', generatedAt: 'Generated',
    reportFacts: 'Learned facts', reportApps: 'Tracked apps', reportRoutines: 'Routines',
    topApps: 'Most used apps', noNotifications: 'No remote actions in this Capri session.',
    notificationsTitle: 'NOTIFICATIONS', refresh: 'Refresh',
    mobileTitle: 'ANDROID ACCESS',
    mobileHint: 'On Windows, run tailscale serve --bg http://127.0.0.1:<port> using the port in this dashboard’s address, then get the HTTPS address with tailscale serve status. Open it only from Android in the same private tailnet. Keep the generated link secret.',
    mobileLabel: 'Tailscale HTTPS address', mobilePlaceholder: 'https://desktop.example.ts.net',
    mobileButton: 'Copy Android link', mobileInvalid: 'Enter the HTTPS address for this device on your private Tailscale network.',
    mobileCopied: 'Private Android link copied. Only open it on a device in your tailnet.',
    buttons: {
      'privacy.pause': 'Pause all learning and observation', 'privacy.resume': 'Resume authorized learning',
      'learning.pause': 'Pause learning', 'learning.resume': 'Resume learning',
      'activity.pause': 'Pause activity', 'activity.resume': 'Resume activity',
      'screen.pause': 'Pause screen checks', 'screen.resume': 'Resume screen checks',
      'screen.revoke': 'Revoke screen permission',
    },
    done: 'Control applied.', actions: {
      'privacy.pause': 'All learning and screen observation paused.', 'privacy.resume': 'Authorized learning and observation resumed.',
      'learning.pause': 'Learning paused.', 'learning.resume': 'Learning resumed.',
      'activity.pause': 'Activity learning paused.', 'activity.resume': 'Activity learning resumed.',
      'screen.pause': 'Screen observation paused.', 'screen.resume': 'Screen observation resumed.',
      'screen.revoke': 'Screen permission revoked.',
    },
  },
  pt: {
    connecting: 'Conectando ao computador…', connected: 'Sessão local autenticada.',
    disconnected: 'Desconectado. Abra o link local da Capri para reconectar.', auth: 'Autenticação necessária. Abra o link pelo menu da Capri.',
    failed: 'Falha na solicitação. Confira se a Capri está aberta e tente novamente.',
    status: ['Pausa global de privacidade', 'Aprendizado', 'Aprendizado de atividade', 'Observação de tela', 'Autorização de tela', 'Assistente'],
    on: 'ATIVO', paused: 'PAUSADO', authorized: 'AUTORIZADA', revoked: 'NÃO AUTORIZADA', connectedState: 'CONECTADA',
    facts: 'Memórias de conversa', apps: 'Uso de apps (aprox.)', routines: 'Rotinas', none: 'Sem registros.',
    reportTitle: 'RELATÓRIO', generate: 'Gerar', generatedAt: 'Gerado em',
    reportFacts: 'Fatos aprendidos', reportApps: 'Apps registrados', reportRoutines: 'Rotinas',
    topApps: 'Apps mais usados', noNotifications: 'Nenhuma ação remota nesta sessão da Capri.',
    notificationsTitle: 'NOTIFICAÇÕES', refresh: 'Atualizar',
    mobileTitle: 'ACESSO ANDROID',
    mobileHint: 'No Windows, execute tailscale serve --bg http://127.0.0.1:<porta> usando a porta deste painel; depois obtenha o endereço HTTPS com tailscale serve status. Abra-o somente no Android conectado à mesma rede privada. Não compartilhe o link gerado.',
    mobileLabel: 'Endereço HTTPS do Tailscale', mobilePlaceholder: 'https://desktop.example.ts.net',
    mobileButton: 'Copiar link Android', mobileInvalid: 'Informe o endereço HTTPS deste computador na sua rede privada Tailscale.',
    mobileCopied: 'Link privado copiado. Abra-o somente em um dispositivo da sua tailnet.',
    buttons: {
      'privacy.pause': 'Pausar todo aprendizado e observação', 'privacy.resume': 'Retomar aprendizado autorizado',
      'learning.pause': 'Pausar aprendizado', 'learning.resume': 'Retomar aprendizado',
      'activity.pause': 'Pausar atividades', 'activity.resume': 'Retomar atividades',
      'screen.pause': 'Pausar tela', 'screen.resume': 'Retomar tela',
      'screen.revoke': 'Revogar permissão da tela',
    },
    done: 'Controle aplicado.', actions: {
      'privacy.pause': 'Todo aprendizado e observação de tela pausados.', 'privacy.resume': 'Aprendizado e observação autorizados retomados.',
      'learning.pause': 'Aprendizado pausado.', 'learning.resume': 'Aprendizado retomado.',
      'activity.pause': 'Aprendizado de atividade pausado.', 'activity.resume': 'Aprendizado de atividade retomado.',
      'screen.pause': 'Observação de tela pausada.', 'screen.resume': 'Observação de tela retomada.',
      'screen.revoke': 'Autorização de tela revogada.',
    },
  },
};

const locale = location.pathname ? (navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en') : 'en';
const t = translations[locale];
const token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('capri-session');
if (location.hash) history.replaceState(null, '', location.pathname);
if (token) sessionStorage.setItem('capri-session', token);

const notice = document.querySelector('#notice');
const status = document.querySelector('#status');
const memory = document.querySelector('#memory');
const report = document.querySelector('#report');
const notifications = document.querySelector('#notifications');
const linkState = document.querySelector('#link-state');
const text = (node, value) => { node.textContent = value; };

function showNotice(message, kind = '') {
  text(notice, message);
  notice.dataset.kind = kind;
}

async function request(path, options = {}) {
  const session = sessionStorage.getItem('capri-session');
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(session && { authorization: `Bearer ${session}` }),
      ...(options.body && { 'content-type': 'application/json' }),
      ...options.headers,
    },
  });
  if (response.status === 401) {
    sessionStorage.removeItem('capri-session');
    throw new Error('auth');
  }
  if (!response.ok) throw new Error('request');
  return response.json();
}

function clear(node) {
  node.replaceChildren();
}

function addStatus(label, value) {
  const cell = document.createElement('div');
  const term = document.createElement('dt');
  const detail = document.createElement('dd');
  text(term, label);
  text(detail, value);
  cell.append(term, detail);
  status.append(cell);
}

async function refreshState() {
  const state = await request('/api/state');
  clear(status);
  const values = [
    state.privacyPaused ? t.paused : t.on,
    state.learningEnabled ? t.on : t.paused,
    state.activityEnabled ? t.on : t.paused,
    state.screenEnabled ? t.on : t.paused,
    state.screenAuthorized ? t.authorized : t.revoked,
    state.assistant || '—',
  ];
  t.status.forEach((label, index) => addStatus(label, values[index]));
  linkState.textContent = t.connectedState;
  return state;
}

function group(container, title, rows) {
  const section = document.createElement('section');
  section.className = 'memory-group';
  const heading = document.createElement('h3');
  const list = document.createElement('ul');
  text(heading, title);
  for (const row of rows.length ? rows : [t.none]) {
    const item = document.createElement('li');
    text(item, row);
    list.append(item);
  }
  section.append(heading, list);
  container.append(section);
}

async function refreshMemory() {
  const state = await request('/api/memory');
  clear(memory);
  group(memory, `${t.facts} (${state.facts.length})`, state.facts.map((fact) => `${fact.category}: ${fact.text}`));
  group(memory, t.apps, state.apps.map((app) => `${app.label} — ${app.duration}`));
  group(memory, t.routines, state.routines.map((item) => `${item.routine}: ${item.count}`));
}

function addReportCell(label, value) {
  const cell = document.createElement('dl');
  cell.className = 'report-cell';
  const term = document.createElement('dt');
  const detail = document.createElement('dd');
  text(term, label);
  text(detail, value);
  cell.append(term, detail);
  report.append(cell);
}

async function refreshReport() {
  const data = await request('/api/report');
  clear(report);
  addReportCell(t.generatedAt, new Date(data.generatedAt).toLocaleString());
  addReportCell(t.status[0], data.status.learningEnabled ? t.on : t.paused);
  addReportCell(t.status[1], data.status.activityEnabled ? t.on : t.paused);
  addReportCell(t.status[2], data.status.screenEnabled ? t.on : t.paused);
  addReportCell(t.status[3], data.status.screenAuthorized ? t.authorized : t.revoked);
  addReportCell(t.status[4], data.status.assistant || '—');
  addReportCell(t.reportFacts, String(data.memory.factCount));
  addReportCell(t.reportApps, String(data.memory.appCount));
  addReportCell(t.reportRoutines, String(data.memory.routineCount));
  group(report, t.topApps, data.memory.topApps.map((app) => `${app.label} — ${app.duration}`));
  group(report, t.routines, data.memory.routines.map((item) => `${item.routine}: ${item.count}`));
}

async function refreshNotifications() {
  const data = await request('/api/notifications');
  clear(notifications);
  if (!data.notifications.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    text(empty, t.noNotifications);
    notifications.append(empty);
    return;
  }
  for (const item of data.notifications) {
    const entry = document.createElement('div');
    entry.className = 'notification-item';
    const detail = document.createElement('span');
    const time = document.createElement('time');
    text(detail, t.actions[item.action] || item.action);
    time.dateTime = item.createdAt;
    text(time, new Date(item.createdAt).toLocaleString());
    entry.append(detail, time);
    notifications.append(entry);
  }
}

async function refresh() {
  if (!token) {
    linkState.textContent = 'LOCKED';
    showNotice(t.auth, 'error');
    return;
  }
  try {
    await refreshState();
    await refreshMemory();
    await refreshReport();
    await refreshNotifications();
    showNotice(t.connected, 'ok');
  } catch (err) {
    linkState.textContent = 'OFFLINE';
    showNotice(err.message === 'auth' ? t.auth : t.failed, 'error');
  }
}

document.querySelector('#refresh').addEventListener('click', refresh);
document.querySelector('#memory-refresh').addEventListener('click', async () => {
  try { await refreshMemory(); } catch { showNotice(t.failed, 'error'); }
});
text(document.querySelector('#report-title'), t.reportTitle);
text(document.querySelector('#report-refresh'), t.generate);
document.querySelector('#report-refresh').addEventListener('click', async () => {
  try { await refreshReport(); showNotice(t.connected, 'ok'); } catch { showNotice(t.failed, 'error'); }
});
text(document.querySelector('#notifications-title'), t.notificationsTitle);
text(document.querySelector('#notifications-refresh'), t.refresh);
document.querySelector('#notifications-refresh').addEventListener('click', async () => {
  try { await refreshNotifications(); } catch { showNotice(t.failed, 'error'); }
});
document.querySelectorAll('[data-action]').forEach((button) => {
  text(button, t.buttons[button.dataset.action]);
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const { action } = button.dataset;
      await request('/api/control', { method: 'POST', body: JSON.stringify({ action }) });
      await refreshState();
      await refreshNotifications();
      showNotice(t.actions[action] || t.done, 'ok');
    } catch (err) {
      showNotice(err.message === 'auth' ? t.auth : t.failed, 'error');
    } finally {
      button.disabled = false;
    }
  });
});

text(document.querySelector('#mobile-title'), t.mobileTitle);
text(document.querySelector('#mobile-hint'), t.mobileHint);
text(document.querySelector('#mobile-label'), t.mobileLabel);
document.querySelector('#tailnet-origin').placeholder = t.mobilePlaceholder;
const copyMobileLink = document.querySelector('#copy-mobile-link');
text(copyMobileLink, t.mobileButton);
copyMobileLink.addEventListener('click', async () => {
  let address;
  try {
    address = new URL(document.querySelector('#tailnet-origin').value.trim());
  } catch {
    showNotice(t.mobileInvalid, 'error');
    return;
  }
  const hostname = address.hostname.toLowerCase();
  const session = sessionStorage.getItem('capri-session');
  if (
    address.protocol !== 'https:'
    || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/.test(hostname)
    || address.username
    || address.password
    || address.port
    || address.pathname !== '/'
    || address.search
    || address.hash
    || !session
  ) {
    showNotice(t.mobileInvalid, 'error');
    return;
  }
  const link = new URL('/', address.origin);
  link.hash = `token=${encodeURIComponent(session)}`;
  try {
    await navigator.clipboard.writeText(link.href);
    showNotice(t.mobileCopied, 'ok');
  } catch {
    showNotice(t.failed, 'error');
  }
});

showNotice(t.connecting);
refresh();
setInterval(() => {
  if (token && !document.hidden) {
    refreshNotifications().catch((err) => showNotice(err.message === 'auth' ? t.auth : t.failed, 'error'));
  }
}, 30000);
