const fs = require('fs');
const path = require('path');

class ImportService {
  parseCSV(filePath, options = {}) {
    const encoding = options.encoding || 'utf-8';
    const delimiter = options.delimiter || ',';
    const hasHeader = options.hasHeader !== false;

    const content = fs.readFileSync(filePath, encoding);
    const lines = content.split(/\r?\n/).filter(line => line.trim());

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = hasHeader ? this._parseCSVLine(lines[0], delimiter) : this._generateHeaders(this._parseCSVLine(lines[0], delimiter).length);
    const startIdx = hasHeader ? 1 : 0;

    const rows = [];
    for (let i = startIdx; i < lines.length; i++) {
      const values = this._parseCSVLine(lines[i], delimiter);
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  _parseCSVLine(line, delimiter) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  _generateHeaders(count) {
    return Array.from({ length: count }, (_, i) => `Column_${i + 1}`);
  }

  parseQIF(filePath, options = {}) {
    const encoding = options.encoding || 'utf-8';
    const content = fs.readFileSync(filePath, encoding);
    const lines = content.split(/\r?\n/);

    const transactions = [];
    let current = null;
    let currentType = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('!Type:')) {
        currentType = line.substring(6).trim();
        continue;
      }

      if (line.startsWith('^')) {
        if (current) {
          transactions.push(current);
        }
        current = null;
        continue;
      }

      if (!current) {
        current = { raw: {} };
      }

      if (line.length < 2) continue;

      const fieldCode = line[0];
      const fieldValue = line.substring(1);

      switch (fieldCode) {
        case 'D':
          current.raw.date = fieldValue;
          current.date = this._parseQIFDate(fieldValue);
          break;
        case 'T':
          current.raw.amount = fieldValue;
          current.amount = Math.abs(parseFloat(fieldValue.replace(/,/g, '')) || 0);
          current.type = parseFloat(fieldValue.replace(/,/g, '')) < 0 ? 'expense' : 'income';
          if (currentType === 'CCard' || currentType === 'Bank') {
            if (fieldValue.startsWith('-')) {
              current.type = 'expense';
            } else {
              current.type = currentType === 'CCard' ? 'expense' : 'income';
            }
          }
          break;
        case 'P':
          current.raw.payee = fieldValue;
          current.category = fieldValue;
          current.note = fieldValue;
          break;
        case 'L':
          current.raw.category = fieldValue;
          current.category = fieldValue.split(':')[0];
          break;
        case 'M':
          current.raw.memo = fieldValue;
          current.note = fieldValue;
          break;
        case 'N':
          current.raw.number = fieldValue;
          break;
        case 'C':
          current.raw.cleared = fieldValue;
          break;
      }
    }

    if (current) {
      transactions.push(current);
    }

    return transactions.map((t, idx) => ({
      index: idx + 1,
      date: t.date || '',
      type: t.type || 'expense',
      amount: t.amount || 0,
      category: t.category || '',
      note: t.note || ''
    }));
  }

  _parseQIFDate(dateStr) {
    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/
    ];

    for (const fmt of formats) {
      const match = dateStr.match(fmt);
      if (match) {
        if (fmt === formats[2]) {
          return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        }
        const year = match[3].length === 2 ? `20${match[3]}` : match[3];
        const month = match[1].padStart(2, '0');
        const day = match[2].padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch (e) {}

    return dateStr;
  }

  mapFields(rows, fieldMapping) {
    return rows.map(row => {
      const mapped = {};
      for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
        if (targetField && row[sourceField] !== undefined) {
          mapped[targetField] = row[sourceField];
        }
      }
      return mapped;
    });
  }

  async detectDuplicates(mappedRows, db) {
    const duplicates = [];
    const unique = [];

    for (const row of mappedRows) {
      if (!row.date || !row.amount) {
        unique.push(row);
        continue;
      }

      const rowDate = new Date(row.date);
      const dayStart = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate()).toISOString();
      const dayEnd = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate(), 23, 59, 59).toISOString();

      const existing = await db('transactions')
        .where('amount', parseFloat(row.amount))
        .where('date', '>=', dayStart)
        .where('date', '<=', dayEnd)
        .where('type', row.type || 'expense')
        .first();

      if (existing) {
        duplicates.push({ ...row, duplicate_of: existing.id });
      } else {
        unique.push(row);
      }
    }

    return { duplicates, unique };
  }

  parseFile(filePath, options = {}) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.csv':
        return { format: 'csv', ...this.parseCSV(filePath, options) };
      case '.qif':
        const qifTransactions = this.parseQIF(filePath, options);
        return { format: 'qif', headers: ['date', 'type', 'amount', 'category', 'note'], rows: qifTransactions };
      default:
        throw new Error(`不支持的文件格式: ${ext}`);
    }
  }
}

module.exports = ImportService;
