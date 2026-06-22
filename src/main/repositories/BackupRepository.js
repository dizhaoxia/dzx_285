class BackupRepository {
  constructor(db) {
    this.db = db;
  }

  async create(backupData) {
    const now = new Date().toISOString();
    const [id] = await this.db('backups').insert({
      file_path: backupData.file_path,
      file_name: backupData.file_name,
      file_size: backupData.file_size,
      is_encrypted: backupData.is_encrypted || false,
      is_compressed: backupData.is_compressed || false,
      checksum: backupData.checksum || null,
      created_at: now
    });
    return this.getById(id);
  }

  async getById(id) {
    return this.db('backups').where({ id }).first();
  }

  async list(limit = 20) {
    return this.db('backups')
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  async delete(id) {
    return this.db('backups').where({ id }).del();
  }

  async getOldBackups(keepCount = 10) {
    return this.db('backups')
      .orderBy('created_at', 'desc')
      .offset(keepCount);
  }

  async cleanupOldBackups(keepCount = 10) {
    const oldBackups = await this.getOldBackups(keepCount);
    const ids = oldBackups.map(b => b.id);
    if (ids.length > 0) {
      await this.db('backups').whereIn('id', ids).del();
    }
    return oldBackups;
  }
}

module.exports = BackupRepository;
