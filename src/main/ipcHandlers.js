const { createRepositories } = require('./repositories');
const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const ImportService = require('./services/ImportService');
const ExportService = require('./services/ExportService');

const importService = new ImportService();
const exportService = new ExportService();

function setupIpcHandlers(ipcMain, dbModule, dialog, app, mainWindow) {
  const db = dbModule.getDb();
  const repos = createRepositories(db);

  ipcMain.handle('accounts:getAll', async () => {
    try {
      const accounts = await repos.accounts.getAll();
      return { success: true, data: accounts };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounts:getById', async (_, id) => {
    try {
      const account = await repos.accounts.getById(id);
      return { success: true, data: account };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounts:create', async (_, accountData) => {
    try {
      const account = await repos.accounts.create(accountData);
      return { success: true, data: account };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounts:update', async (_, id, accountData) => {
    try {
      const account = await repos.accounts.update(id, accountData);
      return { success: true, data: account };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounts:delete', async (_, id) => {
    try {
      await repos.accounts.delete(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounts:getTotalBalance', async () => {
    try {
      const total = await repos.accounts.getTotalBalance();
      return { success: true, data: total };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transactions:list', async (_, filters) => {
    try {
      const transactions = await repos.transactions.list(filters);
      const total = await repos.transactions.count(filters);
      return { success: true, data: { items: transactions, total } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transactions:getById', async (_, id) => {
    try {
      const transaction = await repos.transactions.getById(id);
      return { success: true, data: transaction };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transactions:create', async (_, transactionData, tagIds) => {
    try {
      const transaction = await repos.transactions.create(transactionData, tagIds);
      return { success: true, data: transaction };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transactions:update', async (_, id, transactionData, tagIds) => {
    try {
      const transaction = await repos.transactions.update(id, transactionData, tagIds);
      return { success: true, data: transaction };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transactions:delete', async (_, id) => {
    try {
      await repos.transactions.delete(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transactions:getSummary', async (_, accountId) => {
    try {
      const summary = await repos.transactions.getSummary(accountId);
      return { success: true, data: summary };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transactions:getCategories', async (_, type) => {
    try {
      const categories = await repos.transactions.getCategoriesByType(type);
      return { success: true, data: categories };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tags:getAll', async () => {
    try {
      const tags = await repos.tags.getAll();
      return { success: true, data: tags };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tags:create', async (_, tagData) => {
    try {
      const tag = await repos.tags.create(tagData);
      return { success: true, data: tag };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tags:getOrCreate', async (_, name, color) => {
    try {
      const tag = await repos.tags.getOrCreate(name, color);
      return { success: true, data: tag };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tags:update', async (_, id, tagData) => {
    try {
      const tag = await repos.tags.update(id, tagData);
      return { success: true, data: tag };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tags:delete', async (_, id) => {
    try {
      await repos.tags.delete(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('attachments:getByTransactionId', async (_, transactionId) => {
    try {
      const attachments = await repos.attachments.getByTransactionId(transactionId);
      return { success: true, data: attachments };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('attachments:add', async (_, transactionId, sourcePath, originalName) => {
    try {
      const attachment = await repos.attachments.addAttachmentToTransaction(
        transactionId, sourcePath, originalName
      );
      return { success: true, data: attachment };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('attachments:delete', async (_, id) => {
    try {
      await repos.attachments.delete(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dialog:openFile', async (_, options = {}) => {
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow();
      const dialogOptions = {
        properties: ['openFile'],
        ...options
      };
      const result = win 
        ? await dialog.showOpenDialog(win, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      console.log('dialog:openFile result:', result);
      return { success: true, data: result };
    } catch (error) {
      console.error('dialog:openFile error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dialog:showSaveDialog', async (_, options = {}) => {
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow();
      const result = win 
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('app:getPath', async (_, name) => {
    try {
      const p = app.getPath(name);
      return { success: true, data: p };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('fs:readFile', async (_, filePath, encoding = 'utf-8') => {
    try {
      const content = await fs.promises.readFile(filePath, encoding);
      return { success: true, data: content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('fs:stat', async (_, filePath) => {
    try {
      const stats = await fs.promises.stat(filePath);
      return { success: true, data: stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('attachments:openFile', async (_, filePath) => {
    try {
      const { shell } = require('electron');
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('attachments:showInFolder', async (_, filePath) => {
    try {
      const { shell } = require('electron');
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('budgets:getByMonth', async (_, year, month) => {
    try {
      const budget = await repos.budgets.getByMonth(year, month);
      return { success: true, data: budget };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('budgets:create', async (_, budgetData) => {
    try {
      const budget = await repos.budgets.create(budgetData);
      return { success: true, data: budget };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('budgets:update', async (_, id, budgetData) => {
    try {
      const budget = await repos.budgets.update(id, budgetData);
      return { success: true, data: budget };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('budgets:delete', async (_, id) => {
    try {
      await repos.budgets.delete(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('budgets:list', async (_, year) => {
    try {
      const budgets = await repos.budgets.list(year);
      return { success: true, data: budgets };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('budgets:getProgress', async (_, year, month) => {
    try {
      const progress = await repos.budgets.getProgress(year, month);
      return { success: true, data: progress };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('budgets:ensureCurrentMonth', async () => {
    try {
      const budget = await repos.budgets.ensureCurrentMonthBudget();
      return { success: true, data: budget };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('import:parseFile', async (_, filePath, options) => {
    try {
      const result = importService.parseFile(filePath, options || {});
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('import:mapFields', async (_, rows, fieldMapping) => {
    try {
      const mapped = importService.mapFields(rows, fieldMapping);
      return { success: true, data: mapped };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('import:detectDuplicates', async (_, mappedRows) => {
    try {
      const result = await importService.detectDuplicates(mappedRows, db);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('import:confirmImport', async (_, rows, accountId) => {
    try {
      const imported = [];
      for (const row of rows) {
        if (!row.date || !row.amount) continue;
        const txData = {
          type: row.type || 'expense',
          amount: parseFloat(row.amount) || 0,
          date: new Date(row.date).toISOString(),
          category: row.category || '未分类',
          account_id: parseInt(accountId),
          note: row.note || ''
        };
        const transaction = await repos.transactions.create(txData, []);
        imported.push(transaction);
      }
      return { success: true, data: { imported: imported.length, total: rows.length } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('export:generate', async (_, format, filters, filePath) => {
    try {
      const txFilters = {};
      if (filters.start_date) txFilters.start_date = filters.start_date;
      if (filters.end_date) txFilters.end_date = filters.end_date;
      if (filters.account_id) txFilters.account_id = filters.account_id;
      if (filters.category) txFilters.category = filters.category;
      if (filters.type) txFilters.type = filters.type;

      const transactions = await repos.transactions.list(txFilters);
      for (const t of transactions) {
        const account = await repos.accounts.getById(t.account_id);
        t.account_name = account ? account.name : '';
      }

      let accounts = [];
      if (filters.include_accounts !== false) {
        accounts = await repos.accounts.getAll();
      }

      let budgets = [];
      if (filters.include_budgets !== false) {
        const now = new Date();
        budgets = await repos.budgets.list(now.getFullYear());
      }

      const data = { transactions, accounts, budgets };
      const result = await exportService.export(data, format, filePath);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  setupIpcHandlers
};
