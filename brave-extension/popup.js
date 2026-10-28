'use strict';

const API = 'http://127.0.0.1:47823';
const status = document.getElementById('status');
const openButton = document.getElementById('open');

async function openWindow() {
  openButton.disabled = true;
  status.textContent = 'Abrindo a janela normal do Brave...';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'open-capri-window' });
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível abrir o Brave.');
    window.close();
  } catch (error) {
    openButton.disabled = false;
    status.textContent = `Não consegui abrir o Brave: ${error.message}`;
  }
}

openButton.addEventListener('click', openWindow);

fetch(`${API}/browser/health`, { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(() => openWindow())
  .catch((error) => {
    status.textContent = `Bridge Capri indisponível (${error.name || 'Error'}). Abra a Capri e tente novamente.`;
    openButton.hidden = false;
  });
