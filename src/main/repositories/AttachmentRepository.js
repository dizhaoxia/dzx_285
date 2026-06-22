const path = require('path');
const fs = require('fs');

class AttachmentRepository {
  constructor(db, attachmentsDir) {
    this.db = db;
    this.attachmentsDir = attachmentsDir || path.join(__dirname, '..', '..', '..', 'data', 'attachments');
    this._ensureAttachmentsDir();
  }

  _ensureAttachmentsDir() {
    if (!fs.existsSync(this.attachmentsDir)) {
      fs.mkdirSync(this.attachmentsDir, { recursive: true });
    }
  }

  async create(attachmentData) {
    const now = new Date().toISOString();
    const [id] = await this.db('attachments').insert({
      original_name: attachmentData.original_name,
      file_path: attachmentData.file_path,
      file_type: attachmentData.file_type || null,
      file_size: attachmentData.file_size || null,
      transaction_id: attachmentData.transaction_id,
      created_at: now
    });
    return this.getById(id);
  }

  async getById(id) {
    return this.db('attachments').where({ id }).first();
  }

  async getByTransactionId(transactionId) {
    return this.db('attachments')
      .where('transaction_id', transactionId)
      .orderBy('created_at', 'desc');
  }

  async delete(id) {
    const attachment = await this.getById(id);
    if (attachment) {
      try {
        if (fs.existsSync(attachment.file_path)) {
          fs.unlinkSync(attachment.file_path);
        }
      } catch (error) {
        console.error('删除附件文件失败:', error);
      }
    }
    return this.db('attachments').where({ id }).del();
  }

  async copyFileToAttachments(sourcePath, originalName) {
    const ext = path.extname(originalName);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const newFileName = `${timestamp}_${random}${ext}`;
    const destPath = path.join(this.attachmentsDir, newFileName);

    await fs.promises.copyFile(sourcePath, destPath);
    
    const stats = await fs.promises.stat(destPath);
    
    return {
      file_path: destPath,
      file_size: stats.size,
      original_name: originalName,
      file_type: ext.substring(1) || null
    };
  }

  async addAttachmentToTransaction(transactionId, sourcePath, originalName) {
    const fileInfo = await this.copyFileToAttachments(sourcePath, originalName);
    return this.create({
      ...fileInfo,
      transaction_id: transactionId
    });
  }

  getAttachmentsDir() {
    return this.attachmentsDir;
  }
}

module.exports = AttachmentRepository;
