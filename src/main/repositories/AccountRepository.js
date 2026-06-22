class AccountRepository {
  constructor(db) {
    this.db = db;
  }

  async create(accountData) {
    const now = new Date().toISOString();
    const [id] = await this.db('accounts').insert({
      name: accountData.name,
      balance: accountData.balance || 0,
      type: accountData.type,
      description: accountData.description || '',
      currency: accountData.currency || 'CNY',
      created_at: now,
      updated_at: now
    });
    return this.getById(id);
  }

  async getById(id) {
    return this.db('accounts').where({ id }).first();
  }

  async getAll() {
    return this.db('accounts').orderBy('created_at', 'desc');
  }

  async update(id, accountData) {
    const now = new Date().toISOString();
    await this.db('accounts')
      .where({ id })
      .update({
        name: accountData.name,
        type: accountData.type,
        description: accountData.description || '',
        currency: accountData.currency || 'CNY',
        updated_at: now
      });
    return this.getById(id);
  }

  async updateBalance(id, balance) {
    const now = new Date().toISOString();
    await this.db('accounts')
      .where({ id })
      .update({ balance, updated_at: now });
    return this.getById(id);
  }

  async delete(id) {
    return this.db('accounts').where({ id }).del();
  }

  async getTotalBalance() {
    const result = await this.db('accounts')
      .sum('balance as total')
      .first();
    return result.total || 0;
  }
}

module.exports = AccountRepository;
