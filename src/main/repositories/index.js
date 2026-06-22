const AccountRepository = require('./AccountRepository');
const TransactionRepository = require('./TransactionRepository');
const TagRepository = require('./TagRepository');
const AttachmentRepository = require('./AttachmentRepository');

function createRepositories(db) {
  return {
    accounts: new AccountRepository(db),
    transactions: new TransactionRepository(db),
    tags: new TagRepository(db),
    attachments: new AttachmentRepository(db)
  };
}

module.exports = {
  createRepositories,
  AccountRepository,
  TransactionRepository,
  TagRepository,
  AttachmentRepository
};
