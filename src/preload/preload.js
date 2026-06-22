const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  accounts: {
    getAll: () => ipcRenderer.invoke('accounts:getAll'),
    getById: (id) => ipcRenderer.invoke('accounts:getById', id),
    create: (accountData) => ipcRenderer.invoke('accounts:create', accountData),
    update: (id, accountData) => ipcRenderer.invoke('accounts:update', id, accountData),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id),
    getTotalBalance: () => ipcRenderer.invoke('accounts:getTotalBalance')
  },

  transactions: {
    list: (filters) => ipcRenderer.invoke('transactions:list', filters),
    getById: (id) => ipcRenderer.invoke('transactions:getById', id),
    create: (transactionData, tagIds) => ipcRenderer.invoke('transactions:create', transactionData, tagIds),
    update: (id, transactionData, tagIds) => ipcRenderer.invoke('transactions:update', id, transactionData, tagIds),
    delete: (id) => ipcRenderer.invoke('transactions:delete', id),
    getSummary: (accountId) => ipcRenderer.invoke('transactions:getSummary', accountId),
    getCategories: (type) => ipcRenderer.invoke('transactions:getCategories', type)
  },

  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    create: (tagData) => ipcRenderer.invoke('tags:create', tagData),
    getOrCreate: (name, color) => ipcRenderer.invoke('tags:getOrCreate', name, color),
    update: (id, tagData) => ipcRenderer.invoke('tags:update', id, tagData),
    delete: (id) => ipcRenderer.invoke('tags:delete', id)
  },

  attachments: {
    getByTransactionId: (transactionId) => ipcRenderer.invoke('attachments:getByTransactionId', transactionId),
    add: (transactionId, sourcePath, originalName) => ipcRenderer.invoke('attachments:add', transactionId, sourcePath, originalName),
    delete: (id) => ipcRenderer.invoke('attachments:delete', id),
    openFile: (filePath) => ipcRenderer.invoke('attachments:openFile', filePath),
    showInFolder: (filePath) => ipcRenderer.invoke('attachments:showInFolder', filePath)
  },

  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options)
  },

  app: {
    getPath: (name) => ipcRenderer.invoke('app:getPath', name)
  },

  fs: {
    readFile: (filePath, encoding) => ipcRenderer.invoke('fs:readFile', filePath, encoding),
    stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath)
  }
});
