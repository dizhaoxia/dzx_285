const fs = require('fs');
const path = require('path');

class ExportService {
  async exportToExcel(data, filePath) {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    if (data.transactions && data.transactions.length > 0) {
      const txData = data.transactions.map(t => ({
        '日期': t.date ? new Date(t.date).toLocaleDateString('zh-CN') : '',
        '类型': t.type === 'income' ? '收入' : '支出',
        '分类': t.category || '',
        '金额': parseFloat(t.amount) || 0,
        '账户': t.account_name || '',
        '备注': t.note || '',
        '标签': (t.tags || []).map(tag => tag.name).join(', ')
      }));
      const ws = XLSX.utils.json_to_sheet(txData);
      XLSX.utils.book_append_sheet(wb, ws, '交易记录');
    }

    if (data.accounts && data.accounts.length > 0) {
      const accData = data.accounts.map(a => ({
        '账户名称': a.name,
        '类型': a.type,
        '余额': parseFloat(a.balance) || 0,
        '货币': a.currency || 'CNY',
        '描述': a.description || ''
      }));
      const ws = XLSX.utils.json_to_sheet(accData);
      XLSX.utils.book_append_sheet(wb, ws, '账户信息');
    }

    if (data.budgets && data.budgets.length > 0) {
      const budgetData = [];
      for (const b of data.budgets) {
        budgetData.push({
          '年月': `${b.year}年${b.month}月`,
          '总预算': parseFloat(b.total_amount) || 0,
          '分类': '',
          '分类预算': ''
        });
        if (b.category_budgets) {
          for (const cb of b.category_budgets) {
            budgetData.push({
              '年月': '',
              '总预算': '',
              '分类': cb.category,
              '分类预算': parseFloat(cb.amount) || 0
            });
          }
        }
      }
      const ws = XLSX.utils.json_to_sheet(budgetData);
      XLSX.utils.book_append_sheet(wb, ws, '预算数据');
    }

    XLSX.writeFile(wb, filePath);
    return filePath;
  }

  async exportToCSV(data, filePath) {
    const lines = [];

    if (data.transactions && data.transactions.length > 0) {
      lines.push('日期,类型,分类,金额,账户,备注,标签');
      for (const t of data.transactions) {
        const tagNames = (t.tags || []).map(tag => tag.name).join(';');
        lines.push([
          t.date ? new Date(t.date).toLocaleDateString('zh-CN') : '',
          t.type === 'income' ? '收入' : '支出',
          this._csvEscape(t.category || ''),
          t.amount,
          this._csvEscape(t.account_name || ''),
          this._csvEscape(t.note || ''),
          this._csvEscape(tagNames)
        ].join(','));
      }
      lines.push('');
    }

    if (data.accounts && data.accounts.length > 0) {
      lines.push('账户名称,类型,余额,货币,描述');
      for (const a of data.accounts) {
        lines.push([
          this._csvEscape(a.name),
          a.type,
          a.balance,
          a.currency || 'CNY',
          this._csvEscape(a.description || '')
        ].join(','));
      }
      lines.push('');
    }

    if (data.budgets && data.budgets.length > 0) {
      lines.push('年月,总预算,分类,分类预算');
      for (const b of data.budgets) {
        lines.push([`${b.year}年${b.month}月`, b.total_amount, '', ''].join(','));
        if (b.category_budgets) {
          for (const cb of b.category_budgets) {
            lines.push(['', '', this._csvEscape(cb.category), cb.amount].join(','));
          }
        }
      }
    }

    fs.writeFileSync(filePath, '\ufeff' + lines.join('\n'), 'utf-8');
    return filePath;
  }

  _csvEscape(value) {
    if (!value) return '';
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  async exportToPDF(data, filePath) {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const registerFont = (doc) => {
      try {
        const fontPath = path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSansSC-Regular.ttf');
        if (fs.existsSync(fontPath)) {
          doc.registerFont('Chinese', fontPath);
          return 'Chinese';
        }
      } catch (e) {}
      return 'Helvetica';
    };

    const fontName = registerFont(doc);

    doc.font(fontName).fontSize(20).text('Personal Finance Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Export Date: ${new Date().toLocaleDateString('zh-CN')}`, { align: 'center' });
    doc.moveDown(1);

    if (data.accounts && data.accounts.length > 0) {
      doc.fontSize(14).text('Accounts', { underline: true });
      doc.moveDown(0.5);

      for (const a of data.accounts) {
        doc.fontSize(10);
        doc.text(`  ${a.name} (${a.type})    Balance: ${a.currency || 'CNY'} ${parseFloat(a.balance || 0).toFixed(2)}`);
      }
      doc.moveDown(1);
    }

    if (data.budgets && data.budgets.length > 0) {
      doc.fontSize(14).text('Budgets', { underline: true });
      doc.moveDown(0.5);

      for (const b of data.budgets) {
        doc.fontSize(10);
        doc.text(`  ${b.year}/${b.month}  Total Budget: ${(parseFloat(b.total_amount) || 0).toFixed(2)}`);
        if (b.category_budgets) {
          for (const cb of b.category_budgets) {
            doc.text(`    - ${cb.category}: ${(parseFloat(cb.amount) || 0).toFixed(2)}`);
          }
        }
      }
      doc.moveDown(1);
    }

    if (data.transactions && data.transactions.length > 0) {
      doc.fontSize(14).text('Transactions', { underline: true });
      doc.moveDown(0.5);

      const pageWidth = doc.page.width - 100;
      const colWidths = [80, 40, 70, 70, 80, pageWidth - 340];

      for (const t of data.transactions) {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
        }
        doc.fontSize(8);
        const dateStr = t.date ? new Date(t.date).toLocaleDateString('zh-CN') : '';
        const typeStr = t.type === 'income' ? 'IN' : 'OUT';
        const amountStr = `${t.type === 'income' ? '+' : '-'}${parseFloat(t.amount).toFixed(2)}`;

        let x = 50;
        doc.text(dateStr, x, doc.y, { width: colWidths[0], continued: false });
        const savedY = doc.y;
        x += colWidths[0];
      }

      doc.moveDown(1);
      doc.fontSize(10).text(`Total: ${data.transactions.length} transactions`, { align: 'right' });
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    });
  }

  async export(data, format, filePath) {
    switch (format) {
      case 'xlsx':
        return this.exportToExcel(data, filePath);
      case 'csv':
        return this.exportToCSV(data, filePath);
      case 'pdf':
        return this.exportToPDF(data, filePath);
      default:
        throw new Error(`不支持的导出格式: ${format}`);
    }
  }
}

module.exports = ExportService;
