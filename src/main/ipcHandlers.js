const { createRepositories } = require('./repositories');
const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

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
}

module.exports = {
  setupIpcHandlers
};
