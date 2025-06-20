const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
// No longer need child_process
// const { fork } = require('child_process');
// const waitOn = require('wait-on'); // No longer needed
const isDev = !app.isPackaged;
//const isDev = false;

let mainWindow;
// let serverProcess; // No longer needed
// let server; // No longer needed
// let nextProcess; // No longer needed

const NEXT_PORT = 3000;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;

// The startNextServer function is no longer needed with the standalone build
/*
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
*/

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

  if (isDev) {
    // In development, we still point to the dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, the standalone server is copied to the `standalone` folder in resources.
    const serverPath = path.join(process.resourcesPath, 'standalone', 'server.js');
    const serverCwd = path.dirname(serverPath);

    try {
      // Change the current working directory to the server's location.
      // This is crucial for the server to find its own dependencies.
      process.chdir(serverCwd);
      console.log(`[PROD] CWD set to: ${process.cwd()}`);

      console.log(`[PROD] Requiring server from: ${serverPath}`);
      require(serverPath);
    } catch (err) {
      dialog.showErrorBox('Server Error', `Failed to start the application server.\n\n${err.stack || err}`);
      app.quit();
      return; // Stop execution if server fails to start
    }

    // We need to wait for the server to be ready before loading the URL
    const loadURLWithRetry = () => {
      mainWindow.loadURL('http://localhost:3000').catch(() => {
        console.log('Failed to load URL, retrying in 200ms...');
        setTimeout(loadURLWithRetry, 200);
      });
    };
    loadURLWithRetry();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    // if (server) {
    //   server.stop();
    // }
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

  // Открывать внешние ссылки в браузере по умолчанию
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
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

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  // No need to kill a process anymore
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // No longer need to kill a separate process
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});