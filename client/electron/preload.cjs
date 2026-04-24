// electron/preload.js — безопасный мост между renderer и main
// contextBridge позволяет открыть только нужные API

const { contextBridge, ipcRenderer } = require('electron');

// Открываем минимальный API для renderer-процесса
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // При необходимости — добавить IPC каналы здесь
  // onUpdateAvailable: (cb) => ipcRenderer.on('update-available', cb),
});
