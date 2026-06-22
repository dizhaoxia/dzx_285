const AccountRepository = require('./AccountRepository');
const TransactionRepository = require('./TransactionRepository');
const TagRepository = require('./TagRepository');
const AttachmentRepository = require('./AttachmentRepository');
const BudgetRepository = require('./BudgetRepository');
const ChartRepository = require('./ChartRepository');
const SettingsRepository = require('./SettingsRepository');
const BackupRepository = require('./BackupRepository');

function createRepositories(db) {
  return {
    accounts: new AccountRepository(db),
    transactions: new TransactionRepository(db),
    tags: new TagRepository(db),
    attachments: new AttachmentRepository(db),
    budgets: new BudgetRepository(db),
    charts: new ChartRepository(db),
    settings: new SettingsRepository(db),
    backups: new BackupRepository(db)
  };
}

module.exports = {
  createRepositories,
  AccountRepository,
  TransactionRepository,
  TagRepository,
  AttachmentRepository,
  BudgetRepository,
  ChartRepository,
  SettingsRepository,
  BackupRepository
};
