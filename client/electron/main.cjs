// electron/main.cjs — Electron main process
// Работает БЕЗ внешнего сервера: грузит собранный dist/

const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

// В dev-режиме (npm run electron:dev) Vite уже запущен отдельно
// В prod (npm run electron:build) грузим dist/index.html
const isDev  = process.env.NODE_ENV === 'development';
const DEV_URL = 'http://localhost:5173';
const DIST_HTML = path.join(__dirname, '../dist/index.html');

function distReady() {
  return fs.existsSync(DIST_HTML);
}

async function createWindow() {
  const win = new BrowserWindow({
    width:  1280,
    height: 820,
    minWidth:  900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#050810',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      true,
    },
    show: false,
  });

  if (isDev) {
    // dev: ждём пока Vite поднимется (до 15 сек)
    const loaded = await waitForVite(DEV_URL, 15000);
    if (loaded) {
      win.loadURL(DEV_URL);
      win.webContents.openDevTools();
    } else {
      // Vite не поднялся — грузим dist если он есть
      if (distReady()) {
        win.loadFile(DIST_HTML);
      } else {
        win.loadURL(`data:text/html,<h2 style="font-family:sans-serif;padding:40px;color:#f87171">
          Запусти <code>npm run dev</code> или <code>npm run build</code> сначала
        </h2>`);
      }
    }
  } else {
    // prod: грузим собранный файл — НЕТ зависимости от сервера
    win.loadFile(DIST_HTML);
  }

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

// Ждём пока Vite поднимется
async function waitForVite(url, timeout) {
  const http = require('http');
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ok = await new Promise(resolve => {
      const req = http.get(url, () => resolve(true));
      req.on('error', () => resolve(false));
      req.setTimeout(500, () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

function buildMenu() {
  const template = [
    {
      label: 'ANDRUHA MESSENGER',
      submenu: [
        { label: 'О приложении', role: 'about' },
        { type: 'separator' },
        { label: 'Выход', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  buildMenu();
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
