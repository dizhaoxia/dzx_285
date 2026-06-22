const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const AdmZip = require('adm-zip');

class BackupService {
  constructor(db, backupRepo, securityService, dbModule, app) {
    this.db = db;
    this.backupRepo = backupRepo;
    this.securityService = securityService;
    this.dbModule = dbModule;
    this.app = app;
  }

  getBackupDir() {
    const backupDir = path.join(this.app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
  }

  async createBackup(options = {}) {
    const {
      compress = true,
      encrypt = false,
      password = null,
      keepCount = 10
    } = options;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbPath = this.dbModule.getDbPath();
    const backupDir = this.getBackupDir();
    
    let backupFileName = `finance-backup-${timestamp}.db`;
    let backupFilePath = path.join(backupDir, backupFileName);

    try {
      await this.db.raw('PRAGMA wal_checkpoint(FULL)');
      
      fs.copyFileSync(dbPath, backupFilePath);
      
      let finalPath = backupFilePath;
      let isCompressed = false;
      let isEncrypted = false;

      if (compress) {
        const compressedPath = backupFilePath + '.zip';
        await this.compressBackup(backupFilePath, compressedPath);
        fs.unlinkSync(backupFilePath);
        finalPath = compressedPath;
        backupFileName = path.basename(compressedPath);
        isCompressed = true;
      }

      if (encrypt && password) {
        const encryptedPath = finalPath + '.enc';
        await this.securityService.encryptFile(finalPath, encryptedPath, password);
        fs.unlinkSync(finalPath);
        finalPath = encryptedPath;
        backupFileName = path.basename(encryptedPath);
        isEncrypted = true;
      }

      const stats = fs.statSync(finalPath);
      const checksum = await this.securityService.calculateChecksum(finalPath);

      const backupRecord = await this.backupRepo.create({
        file_path: finalPath,
        file_name: backupFileName,
        file_size: stats.size,
        is_encrypted: isEncrypted,
        is_compressed: isCompressed,
        checksum: checksum
      });

      const oldBackups = await this.backupRepo.cleanupOldBackups(keepCount);
      for (const oldBackup of oldBackups) {
        try {
          if (fs.existsSync(oldBackup.file_path)) {
            fs.unlinkSync(oldBackup.file_path);
          }
        } catch (err) {
          console.error('删除旧备份失败:', err);
        }
      }

      return {
        success: true,
        backup: backupRecord,
        deleted_old: oldBackups.length
      };
    } catch (error) {
      console.error('创建备份失败:', error);
      return { success: false, error: error.message };
    }
  }

  async compressBackup(sourcePath, targetPath) {
    return new Promise((resolve, reject) => {
      try {
        const zip = new AdmZip();
        zip.addLocalFile(sourcePath);
        zip.writeZip(targetPath);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async decompressBackup(sourcePath, targetPath) {
    return new Promise((resolve, reject) => {
      try {
        const zip = new AdmZip(sourcePath);
        const zipEntries = zip.getEntries();
        if (zipEntries.length === 0) {
          reject(new Error('备份文件为空'));
          return;
        }
        zip.extractEntryTo(zipEntries[0], path.dirname(targetPath), false, true);
        const extractedName = zipEntries[0].entryName;
        const extractedPath = path.join(path.dirname(targetPath), extractedName);
        fs.renameSync(extractedPath, targetPath);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async restoreBackup(backupId, options = {}) {
    const { password = null } = options;

    const backup = await this.backupRepo.getById(backupId);
    if (!backup) {
      return { success: false, error: '备份记录不存在' };
    }

    if (!fs.existsSync(backup.file_path)) {
      return { success: false, error: '备份文件不存在' };
    }

    try {
      const isValid = await this.securityService.verifyChecksum(backup.file_path, backup.checksum);
      if (!isValid) {
        return { success: false, error: '备份文件校验失败，文件可能已损坏' };
      }

      const tempDir = path.join(this.app.getPath('temp'), 'finance-restore');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      let workingPath = path.join(tempDir, 'restore.db');
      let sourcePath = backup.file_path;

      if (backup.is_encrypted) {
        if (!password) {
          return { success: false, error: '备份已加密，需要提供密码' };
        }
        const decryptedPath = path.join(tempDir, 'decrypted.tmp');
        await this.securityService.decryptFile(sourcePath, decryptedPath, password);
        sourcePath = decryptedPath;
      }

      if (backup.is_compressed) {
        const decompressedPath = path.join(tempDir, 'decompressed.db');
        await this.decompressBackup(sourcePath, decompressedPath);
        workingPath = decompressedPath;
      } else if (!backup.is_encrypted) {
        fs.copyFileSync(sourcePath, workingPath);
      }

      const dbPath = this.dbModule.getDbPath();
      
      await this.db.destroy();
      
      const backupCurrentPath = dbPath + '.before-restore';
      fs.copyFileSync(dbPath, backupCurrentPath);

      try {
        fs.copyFileSync(workingPath, dbPath);
      } catch (copyError) {
        fs.copyFileSync(backupCurrentPath, dbPath);
        await this.dbModule.initDatabase();
        throw copyError;
      }

      await this.dbModule.initDatabase();
      const newDb = this.dbModule.getDb();
      Object.assign(this.db, newDb);

      if (fs.existsSync(backupCurrentPath)) {
        fs.unlinkSync(backupCurrentPath);
      }

      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }

      return { success: true, message: '恢复成功' };
    } catch (error) {
      console.error('恢复备份失败:', error);
      try {
        await this.dbModule.initDatabase();
        const newDb = this.dbModule.getDb();
        Object.assign(this.db, newDb);
      } catch (e) {}
      return { success: false, error: error.message };
    }
  }

  async checkAutoBackup() {
    const today = new Date().toISOString().split('T')[0];
    const lastBackupDate = await this.db('settings')
      .where('key', 'last_auto_backup_date')
      .first();

    if (!lastBackupDate || lastBackupDate.value !== today) {
      const result = await this.createBackup({
        compress: true,
        encrypt: false,
        keepCount: 10
      });

      if (result.success) {
        await this.db('settings')
          .insert({
            key: 'last_auto_backup_date',
            value: today,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .onConflict('key')
          .merge({
            value: today,
            updated_at: new Date().toISOString()
          });
      }

      return result;
    }

    return { success: true, skipped: true, message: '今日已自动备份' };
  }

  async listBackups(limit = 20) {
    return this.backupRepo.list(limit);
  }

  async deleteBackup(backupId) {
    const backup = await this.backupRepo.getById(backupId);
    if (!backup) {
      return { success: false, error: '备份记录不存在' };
    }

    try {
      if (fs.existsSync(backup.file_path)) {
        fs.unlinkSync(backup.file_path);
      }
      await this.backupRepo.delete(backupId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = BackupService;
