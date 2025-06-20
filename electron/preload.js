const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onOpenFile: (callback) => {
    ipcRenderer.on('open-file', (event, filePath) => {
      // Прочитать файл и отправить данные в callback
      window.electronAPI.readFile(filePath, callback);
    });
  },
  readFile: (filePath, callback) => {
    ipcRenderer.invoke('read-file', filePath).then((data) => {
      callback(filePath, data);
    });
  },
  saveCurrentFile: ({ filePath, data }) => {
    ipcRenderer.send('save-current-file', { filePath, data });
  },
  onSaveResult: (callback) => {
    ipcRenderer.on('save-current-file-result', (event, result) => {
      callback(result);
    });
  },
  openJsonDialog: async () => {
    return await ipcRenderer.invoke('open-json-dialog');
  },
  blurWindow: () => ipcRenderer.send('blur-window'),
}); 