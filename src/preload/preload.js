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

  budgets: {
    getByMonth: (year, month) => ipcRenderer.invoke('budgets:getByMonth', year, month),
    create: (budgetData) => ipcRenderer.invoke('budgets:create', budgetData),
    update: (id, budgetData) => ipcRenderer.invoke('budgets:update', id, budgetData),
    delete: (id) => ipcRenderer.invoke('budgets:delete', id),
    list: (year) => ipcRenderer.invoke('budgets:list', year),
    getProgress: (year, month) => ipcRenderer.invoke('budgets:getProgress', year, month),
    ensureCurrentMonth: () => ipcRenderer.invoke('budgets:ensureCurrentMonth')
  },

  importApi: {
    parseFile: (filePath, options) => ipcRenderer.invoke('import:parseFile', filePath, options),
    mapFields: (rows, fieldMapping) => ipcRenderer.invoke('import:mapFields', rows, fieldMapping),
    detectDuplicates: (mappedRows) => ipcRenderer.invoke('import:detectDuplicates', mappedRows),
    confirmImport: (rows, accountId) => ipcRenderer.invoke('import:confirmImport', rows, accountId)
  },

  exportApi: {
    generate: (format, filters, filePath) => ipcRenderer.invoke('export:generate', format, filters, filePath)
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
  },

  charts: {
    getIncomeExpenseTrend: (filters) => ipcRenderer.invoke('charts:getIncomeExpenseTrend', filters),
    getExpenseByCategory: (filters) => ipcRenderer.invoke('charts:getExpenseByCategory', filters),
    getMonthlyComparison: (year) => ipcRenderer.invoke('charts:getMonthlyComparison', year),
    getAccountBalanceDistribution: () => ipcRenderer.invoke('charts:getAccountBalanceDistribution'),
    getDashboardData: (accountId, targetCurrency) => ipcRenderer.invoke('charts:getDashboardData', accountId, targetCurrency)
  },

  currencies: {
    getAll: () => ipcRenderer.invoke('currencies:getAll'),
    getActive: () => ipcRenderer.invoke('currencies:getActive'),
    getRate: (baseCurrency, targetCurrency) => ipcRenderer.invoke('currencies:getRate', baseCurrency, targetCurrency),
    convert: (amount, fromCurrency, toCurrency) => ipcRenderer.invoke('currencies:convert', amount, fromCurrency, toCurrency),
    fetchRates: (baseCurrency) => ipcRenderer.invoke('currencies:fetchRates', baseCurrency),
    setManualRate: (baseCurrency, targetCurrency, rate, date) => ipcRenderer.invoke('currencies:setManualRate', baseCurrency, targetCurrency, rate, date),
    getRateHistory: (baseCurrency, targetCurrency, days) => ipcRenderer.invoke('currencies:getRateHistory', baseCurrency, targetCurrency, days)
  },

  settings: {
    get: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value)
  },

  security: {
    setPassword: (password) => ipcRenderer.invoke('security:setPassword', password),
    verifyPassword: (password) => ipcRenderer.invoke('security:verifyPassword', password),
    hasPassword: () => ipcRenderer.invoke('security:hasPassword'),
    changePassword: (oldPassword, newPassword) => ipcRenderer.invoke('security:changePassword', oldPassword, newPassword)
  },

  backups: {
    create: (options) => ipcRenderer.invoke('backups:create', options),
    restore: (backupId, options) => ipcRenderer.invoke('backups:restore', backupId, options),
    list: (limit) => ipcRenderer.invoke('backups:list', limit),
    delete: (backupId) => ipcRenderer.invoke('backups:delete', backupId),
    checkAutoBackup: () => ipcRenderer.invoke('backups:checkAutoBackup')
  }
});
