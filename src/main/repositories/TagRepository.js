class TagRepository {
  constructor(db) {
    this.db = db;
  }

  async create(tagData) {
    try {
      const now = new Date().toISOString();
      const [id] = await this.db('tags').insert({
        name: tagData.name,
        color: tagData.color || '#3b82f6',
        created_at: now
      });
      return this.getById(id);
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return this.getByName(tagData.name);
      }
      throw error;
    }
  }

  async getById(id) {
    return this.db('tags').where({ id }).first();
  }

  async getByName(name) {
    return this.db('tags').where({ name }).first();
  }

  async getAll() {
    return this.db('tags').orderBy('name', 'asc');
  }

  async getByTransactionId(transactionId) {
    return this.db('tags')
      .join('transaction_tags', 'tags.id', '=', 'transaction_tags.tag_id')
      .where('transaction_tags.transaction_id', transactionId)
      .select('tags.*');
  }

  async update(id, tagData) {
    await this.db('tags')
      .where({ id })
      .update({
        name: tagData.name,
        color: tagData.color || '#3b82f6'
      });
    return this.getById(id);
  }

  async delete(id) {
    return this.db('tags').where({ id }).del();
  }

  async getOrCreate(name, color = '#3b82f6') {
    const tag = await this.getByName(name);
    if (tag) {
      return tag;
    }
    return this.create({ name, color });
  }
}

module.exports = TagRepository;
