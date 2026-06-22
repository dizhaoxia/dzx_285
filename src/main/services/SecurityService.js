const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

class SecurityService {
  constructor(db, settingsRepo) {
    this.db = db;
    this.settingsRepo = settingsRepo;
    this.algorithm = 'aes-256-cbc';
    this.keyLength = 32;
    this.ivLength = 16;
    this.saltRounds = 10;
  }

  async setPassword(password) {
    const salt = bcrypt.genSaltSync(this.saltRounds);
    const hash = bcrypt.hashSync(password, salt);
    
    const masterKey = this.deriveKeyFromPassword(password);
    const encryptedKey = this.encrypt(this.generateRandomKey(), masterKey);
    
    await this.settingsRepo.set('password_hash', hash);
    await this.settingsRepo.set('encryption_enabled', true);
    await this.settingsRepo.set('master_key_encrypted,', encryptedKey);
    
    return true;
  }

  async verifyPassword(password) {
    const hash = await this.settingsRepo.get('password_hash', null);
    if (!hash) {
      return { success: false, error: '未设置密码' };
    }
    
    const isValid = bcrypt.compareSync(password, hash);
    if (!isValid) {
      return { success: false, error: '密码错误' };
    }
    
    return { success: true };
  }

  async hasPassword() {
    const hash = await this.settingsRepo.get('password_hash', null);
    return hash !== null;
  }

  async changePassword(oldPassword, newPassword) {
    const verifyResult = await this.verifyPassword(oldPassword);
    if (!verifyResult.success) {
      return verifyResult;
    }
    
    return this.setPassword(newPassword);
  }

  deriveKeyFromPassword(password, salt = 'finance-manager-salt') {
    return crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, 'sha256');
  }

  generateRandomKey() {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  encrypt(text, key) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(key, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(encryptedText, key) {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(key, 'hex'), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async encryptFile(inputPath, outputPath, password) {
    return new Promise((resolve, reject) => {
      try {
        const key = this.deriveKeyFromPassword(password);
        const iv = crypto.randomBytes(this.ivLength);
        
        const input = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath);
        
        const cipher = crypto.createCipheriv(this.algorithm, key, iv);
        
        output.write(iv);
        
        input.pipe(cipher).pipe(output);
        
        output.on('finish', () => {
          resolve({ success: true, outputPath });
        });
        
        output.on('error', reject);
        input.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async decryptFile(inputPath, outputPath, password) {
    return new Promise((resolve, reject) => {
      try {
        const key = this.deriveKeyFromPassword(password);
        
        const input = fs.createReadStream(inputPath, { start: 0, end: 15 });
        let iv = Buffer.alloc(0);
        
        input.on('data', (chunk) => {
          iv = Buffer.concat([iv, chunk]);
        });
        
        input.on('end', () => {
          const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
          const fileInput = fs.createReadStream(inputPath, { start: 16 });
          const output = fs.createWriteStream(outputPath);
          
          fileInput.pipe(decipher).pipe(output);
          
          output.on('finish', () => {
            resolve({ success: true, outputPath });
          });
          
          output.on('error', reject);
          fileInput.on('error', reject);
        });
        
        input.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => {
        hash.update(data);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', reject);
    });
  }

  verifyChecksum(filePath, expectedChecksum) {
    return this.calculateChecksum(filePath)
      .then(actual => actual === expectedChecksum);
  }
}

module.exports = SecurityService;
