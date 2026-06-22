class SettingsRepository {
  constructor(db) {
    this.db = db;
  }

  async get(key, defaultValue = null) {
    const setting = await this.db('settings').where({ key }).first();
    if (!setting) return defaultValue;
    try {
      return JSON.parse(setting.value);
    } catch {
      return setting.value;
    }
  }

  async set(key, value) {
    const now = new Date().toISOString();
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    const existing = await this.db('settings').where({ key }).first();
    if (existing) {
      await this.db('settings').where({ key }).update({
        value: stringValue,
        updated_at: now
      });
    } else {
      await this.db('settings').insert({
        key,
        value: stringValue,
        created_at: now,
        updated_at: now
      });
    }
    return true;
  }

  async getAll() {
    const settings = await this.db('settings').select();
    const result = {};
    for (const s of settings) {
      try {
        result[s.key] = JSON.parse(s.value);
      } catch {
        result[s.key] = s.value;
      }
    }
    return result;
  }

  async delete(key) {
    return this.db('settings').where({ key }).del();
  }
}

module.exports = SettingsRepository;
