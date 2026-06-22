class TransactionRepository {
  constructor(db) {
    this.db = db;
  }

  async create(transactionData, tagIds = []) {
    const trx = await this.db.transaction();
    try {
      const now = new Date().toISOString();
      const [id] = await trx('transactions').insert({
        type: transactionData.type,
        amount: transactionData.amount,
        date: transactionData.date,
        category: transactionData.category,
        note: transactionData.note || '',
        account_id: transactionData.account_id,
        created_at: now,
        updated_at: now
      });

      if (tagIds && tagIds.length > 0) {
        const tagRelations = tagIds.map(tagId => ({
          transaction_id: id,
          tag_id: tagId
        }));
        await trx('transaction_tags').insert(tagRelations);
      }

      const account = await trx('accounts').where('id', transactionData.account_id).first();
      if (account) {
        const balanceChange = transactionData.type === 'income' 
          ? parseFloat(transactionData.amount) 
          : -parseFloat(transactionData.amount);
        const newBalance = parseFloat(account.balance) + balanceChange;
        await trx('accounts').where('id', transactionData.account_id).update({
          balance: newBalance,
          updated_at: now
        });
      }

      await trx.commit();
      return this.getById(id);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async getById(id) {
    const transaction = await this.db('transactions').where({ id }).first();
    if (transaction) {
      const tags = await this.db('tags')
        .join('transaction_tags', 'tags.id', '=', 'transaction_tags.tag_id')
        .where('transaction_tags.transaction_id', id)
        .select('tags.*');
      transaction.tags = tags;

      const attachments = await this.db('attachments').where('transaction_id', id).select();
      transaction.attachments = attachments;
    }
    return transaction;
  }

  async list(filters = {}) {
    let query = this.db('transactions');

    if (filters.account_id) {
      query = query.where('account_id', filters.account_id);
    }

    if (filters.type) {
      query = query.where('type', filters.type);
    }

    if (filters.category) {
      query = query.where('category', filters.category);
    }

    if (filters.start_date) {
      query = query.where('date', '>=', filters.start_date);
    }

    if (filters.end_date) {
      query = query.where('date', '<=', filters.end_date);
    }

    if (filters.tag_id) {
      query = query
        .join('transaction_tags', 'transactions.id', '=', 'transaction_tags.transaction_id')
        .where('transaction_tags.tag_id', filters.tag_id);
    }

    const sortField = filters.sort_by || 'date';
    const sortOrder = filters.sort_order || 'desc';
    query = query.orderBy(sortField, sortOrder);

    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const transactions = await query.select('transactions.*');

    for (const transaction of transactions) {
      const tags = await this.db('tags')
        .join('transaction_tags', 'tags.id', '=', 'transaction_tags.tag_id')
        .where('transaction_tags.transaction_id', transaction.id)
        .select('tags.*');
      transaction.tags = tags;

      const attachments = await this.db('attachments').where('transaction_id', transaction.id).select();
      transaction.attachments = attachments;
    }

    return transactions;
  }

  async count(filters = {}) {
    let query = this.db('transactions');

    if (filters.account_id) {
      query = query.where('account_id', filters.account_id);
    }
    if (filters.type) {
      query = query.where('type', filters.type);
    }
    if (filters.category) {
      query = query.where('category', filters.category);
    }
    if (filters.start_date) {
      query = query.where('date', '>=', filters.start_date);
    }
    if (filters.end_date) {
      query = query.where('date', '<=', filters.end_date);
    }
    if (filters.tag_id) {
      query = query
        .join('transaction_tags', 'transactions.id', '=', 'transaction_tags.transaction_id')
        .where('transaction_tags.tag_id', filters.tag_id);
    }

    const result = await query.count('* as count').first();
    return result.count;
  }

  async update(id, transactionData, tagIds = null) {
    const trx = await this.db.transaction();
    try {
      const now = new Date().toISOString();
      const oldTransaction = await trx('transactions').where({ id }).first();
      if (!oldTransaction) {
        throw new Error('交易不存在');
      }

      const oldAmount = oldTransaction.type === 'income' 
        ? parseFloat(oldTransaction.amount) 
        : -parseFloat(oldTransaction.amount);

      await trx('transactions')
        .where({ id })
        .update({
          type: transactionData.type,
          amount: transactionData.amount,
          date: transactionData.date,
          category: transactionData.category,
          note: transactionData.note || '',
          account_id: transactionData.account_id,
          updated_at: now
        });

      if (tagIds !== null) {
        await trx('transaction_tags').where('transaction_id', id).del();
        if (tagIds.length > 0) {
          const tagRelations = tagIds.map(tagId => ({
            transaction_id: id,
            tag_id: tagId
          }));
          await trx('transaction_tags').insert(tagRelations);
        }
      }

      if (oldTransaction.account_id !== transactionData.account_id || 
          oldTransaction.amount !== transactionData.amount ||
          oldTransaction.type !== transactionData.type) {
        
        const oldAccount = await trx('accounts').where('id', oldTransaction.account_id).first();
        if (oldAccount) {
          const newBalance = parseFloat(oldAccount.balance) - oldAmount;
          await trx('accounts').where('id', oldTransaction.account_id).update({
            balance: newBalance,
            updated_at: now
          });
        }

        const newAccount = await trx('accounts').where('id', transactionData.account_id).first();
        if (newAccount) {
          const newAmount = transactionData.type === 'income' 
            ? parseFloat(transactionData.amount) 
            : -parseFloat(transactionData.amount);
          const newBalance = parseFloat(newAccount.balance) + newAmount;
          await trx('accounts').where('id', transactionData.account_id).update({
            balance: newBalance,
            updated_at: now
          });
        }
      }

      await trx.commit();
      return this.getById(id);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async delete(id) {
    const trx = await this.db.transaction();
    try {
      const now = new Date().toISOString();
      const transaction = await trx('transactions').where({ id }).first();
      if (!transaction) {
        await trx.commit();
        return 0;
      }

      const balanceChange = transaction.type === 'income' 
        ? -parseFloat(transaction.amount) 
        : parseFloat(transaction.amount);

      const account = await trx('accounts').where('id', transaction.account_id).first();
      if (account) {
        const newBalance = parseFloat(account.balance) + balanceChange;
        await trx('accounts').where('id', transaction.account_id).update({
          balance: newBalance,
          updated_at: now
        });
      }

      const deletedCount = await trx('transactions').where({ id }).del();
      await trx.commit();
      return deletedCount;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async getSummary(accountId = null) {
    let incomeQuery = this.db('transactions').where('type', 'income');
    let expenseQuery = this.db('transactions').where('type', 'expense');

    if (accountId) {
      incomeQuery = incomeQuery.where('account_id', accountId);
      expenseQuery = expenseQuery.where('account_id', accountId);
    }

    const [incomeResult, expenseResult] = await Promise.all([
      incomeQuery.sum('amount as total').first(),
      expenseQuery.sum('amount as total').first()
    ]);

    return {
      total_income: incomeResult.total || 0,
      total_expense: expenseResult.total || 0,
      net_balance: (incomeResult.total || 0) - (expenseResult.total || 0)
    };
  }

  async getCategoriesByType(type) {
    const categories = await this.db('transactions')
      .where('type', type)
      .distinct('category')
      .orderBy('category', 'asc')
      .select('category');
    return categories.map(c => c.category);
  }
}

module.exports = TransactionRepository;
