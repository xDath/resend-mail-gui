const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    sendEmail: (payload) => ipcRenderer.invoke('send-email', payload),
    pickFiles: () => ipcRenderer.invoke('pick-files'),
    getSentEmail: (id) => ipcRenderer.invoke('get-sent-email', id),
    getReceivedEmail: (id) => ipcRenderer.invoke('get-received-email', id),
    listReceivedEmails: () => ipcRenderer.invoke('list-received-emails'),
    notifyNewEmail: (data) => ipcRenderer.invoke('notify-new-email', data),
    getConfig: () => ipcRenderer.invoke('get-config'),
    readEnv: () => ipcRenderer.invoke('read-env'),
    saveEnv: (vars) => ipcRenderer.invoke('save-env', vars),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
});
