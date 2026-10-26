'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const listener = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('host', {
  onClaudeEvent: on('claude:event'),
  onCommand: on('capri:command'),
  onConfig: on('capri:config'),
  onResize: on('overlay:resize'),
  onWindows: on('windows:update'),
  setInteractive: (on) => ipcRenderer.send('overlay:interactive', Boolean(on)),
  cursor: () => ipcRenderer.invoke('overlay:cursor'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  listSounds: () => ipcRenderer.invoke('sounds:list'),
  hooksStatus: () => ipcRenderer.invoke('hooks:status'),
  demoWindow: (open) => ipcRenderer.invoke('demo:window', Boolean(open)),
  openMenu: () => ipcRenderer.send('menu:open'),
  installHooks: () => ipcRenderer.invoke('hooks:install'),
  claudeFound: () => ipcRenderer.invoke('claude:found'),
  openClaudeHelp: () => ipcRenderer.send('claude:help'),
  windowsNow: () => ipcRenderer.invoke('windows:get'),
  trayPlace: () => ipcRenderer.invoke('guide:tray'),
  openClaudeFolder: () => ipcRenderer.invoke('guide:claudeFolder'),
  copyImage: (rect) => ipcRenderer.invoke('panel:copy', rect),
  chatStatus: () => ipcRenderer.invoke('chat:status'),
  chatSend: (request) => ipcRenderer.invoke('chat:send', request),
  chatStop: (id) => ipcRenderer.send('chat:stop', id),
  chatMemory: () => ipcRenderer.invoke('chat:memory'),
  chatRemember: (history) => ipcRenderer.send('chat:remember', history),
  onChatDelta: on('chat:delta'),
  openOllama: () => ipcRenderer.send('chat:ollama'),
  openApps: () => ipcRenderer.invoke('apps:list'),
  findApp: (wanted) => ipcRenderer.invoke('apps:find', wanted),
  closeApp: (name, force) => ipcRenderer.invoke('apps:close', { name, force: Boolean(force) }),
  focusOverlay: (on) => ipcRenderer.send('overlay:focus', Boolean(on)),
});
