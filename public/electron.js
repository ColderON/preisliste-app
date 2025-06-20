const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('cross-spawn');
const waitOn = require('wait-on');
const isDev = process.env.NODE_ENV === 'development';
//const isDev = false;

let mainWindow;
let server;
let serverProcess;

const NEXT_PORT = 3000;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;

async function startNextServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['node_modules/next/dist/bin/next', 'start'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'production' }
    });
    serverProcess.stdout.on('data', (data) => {
      process.stdout.write(`[next] ${data}`);
    });
    serverProcess.stderr.on('data', (data) => {
      process.stderr.write(`[next] ${data}`);
    });
    serverProcess.on('error', (err) => {
      reject(err);
    });
    // Ждем, пока сервер поднимется
    waitOn({ resources: [NEXT_URL], timeout: 20000 }, (err) => {
      if (err) {
        reject(new Error('Next.js server did not start in time'));
      } else {
        resolve();
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadURL(NEXT_URL);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (server) {
      server.stop();
    }
  });

  // Создаем меню
  const template = [
    {
      label: 'Datei',
      submenu: [
        {
          label: 'Speichern',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            // Запрашиваем у renderer текущий путь к файлу
            const filePath = await mainWindow.webContents.executeJavaScript('window.getCurrentFilePath && window.getCurrentFilePath()');
            if (filePath) {
              // Если путь есть, отправляем событие на сохранение
              mainWindow.webContents.send('trigger-save-current-file', filePath);
            } else {
              // Если пути нет, вызываем диалог "Speichern als"
              mainWindow.webContents.send('trigger-save-as-json-dialog');
            }
          }
        },
        {
          label: 'Speichern als',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => {
            mainWindow.webContents.send('trigger-save-as-json-dialog');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC обработчик для чтения файла
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
});

// IPC обработчик для сохранения файла
ipcMain.on('save-current-file', (event, { filePath, data }) => {
  fs.writeFile(filePath, data, (err) => {
    event.reply('save-current-file-result', { success: !err, error: err ? err.message : null });
  });
});

// IPC обработчик для открытия диалога выбора JSON-файла
ipcMain.handle('open-json-dialog', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return { filePath, data: JSON.parse(data) };
    } catch (err) {
      return { filePath, data: [] };
    }
  }
  return null;
});

// IPC обработчик для сохранения файла через диалог (Speichern als)
ipcMain.handle('save-as-json-dialog', async (event, data) => {
  const result = await dialog.showSaveDialog({
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ]
  });
  if (!result.canceled && result.filePath) {
    try {
      await fs.promises.writeFile(result.filePath, data, 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.on('blur-window', () => {
  if (mainWindow) {
    mainWindow.blur();
  }
});

app.whenReady().then(async () => {
  if (!isDev) {
    try {
      await startNextServer();
    } catch (err) {
      console.error('Failed to start Next.js server:', err);
      app.quit();
      return;
    }
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});