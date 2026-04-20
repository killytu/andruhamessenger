// electron/main.js — Electron desktop wrapper
// Открывает React-приложение в нативном окне

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const DEV_URL = 'http://localhost:5173';

function createWindow() {
  const win = new BrowserWindow({
    width:  1200,
    height: 780,
    minWidth:  820,
    minHeight: 560,
    titleBarStyle: 'hiddenInset', // macOS — скрыть заголовок, оставить кнопки
    backgroundColor: '#050810',
    webPreferences: {
      preload:         path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      // Разрешаем Web Crypto API (нужен для ECDH / AES)
      webSecurity: true,
    },
    icon: path.join(__dirname, '../public/icon.png'),
    show: false, // показываем после ready-to-show
  });

  // Загружаем приложение
  if (isDev) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Плавный показ без белого flash
  win.once('ready-to-show', () => win.show());

  // Внешние ссылки — в браузере, не в Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

// ── Меню ───────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Hybrid Messenger',
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
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
