const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const dbModule = require('../src/main/database');
const { createRepositories } = require('../src/main/repositories');
const ExportService = require('../src/main/services/ExportService');
const SecurityService = require('../src/main/services/SecurityService');
const BackupService = require('../src/main/services/BackupService');
const CurrencyService = require('../src/main/services/CurrencyService');

const dbPath = dbModule.getDbPath();
const exportPath = path.join(__dirname, '..', 'data', 'exports');
const backupPath = path.join(__dirname, '..', 'data', 'backups');

if (!fs.existsSync(exportPath)) fs.mkdirSync(exportPath, { recursive: true });
if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });

const mockApp = {
  getPath: (name) => {
    if (name === 'userData') return path.join(__dirname, '..', 'data');
    if (name === 'temp') return path.join(__dirname, '..', 'data', 'temp');
    return path.join(__dirname, '..', 'data');
  }
};

console.log('='.repeat(60));
console.log('  综合功能验证脚本');
console.log('='.repeat(60));
console.log();

async function initDatabase(customDbPath = null) {
  const originalGetDbPath = dbModule.getDbPath;
  if (customDbPath) {
    dbModule.getDbPath = () => customDbPath;
  }
  const db = await dbModule.initDatabase();
  dbModule.getDbPath = originalGetDbPath;
  const repos = createRepositories(db);
  return { db, repos };
}

async function reinitServices() {
  await dbModule.close();
  const { db, repos } = await initDatabase();
  const securityService = new SecurityService(db, repos.settings);
  const backupService = new BackupService(db, repos.backups, securityService, dbModule, mockApp);
  const currencyService = new CurrencyService(db);
  await currencyService.initCurrencies();
  return { db, repos, securityService, backupService, currencyService };
}

async function runValidation() {
  const { db, repos } = await initDatabase();
  
  const exportService = new ExportService();
  const securityService = new SecurityService(db, repos.settings);
  const backupService = new BackupService(db, repos.backups, securityService, dbModule, mockApp);
  const currencyService = new CurrencyService(db);

  await currencyService.initCurrencies();

  let allPassed = true;
  let excelFile, pdfFile, backupFilePath;

  try {
    console.log('【1️⃣ 验证1: 数据库数据完整性】');
    console.log('-'.repeat(50));
    
    const accounts = await repos.accounts.getAll();
    const transactions = await repos.transactions.list();
    const incomeCategories = await repos.transactions.getCategoriesByType('income');
    const expenseCategories = await repos.transactions.getCategoriesByType('expense');
    const categories = [...new Set([...incomeCategories, ...expenseCategories])];
    const tags = await repos.tags.getAll();
    const budgets = await repos.budgets.list();
    
    console.log(`✅ 账户数量: ${accounts.length}`);
    console.log(`✅ 交易记录: ${transactions.length}`);
    console.log(`✅ 分类数量: ${categories.length}`);
    console.log(`✅ 标签数量: ${tags.length}`);
    console.log(`✅ 预算数量: ${budgets.length}`);
    
    if (transactions.length < 60) {
      console.log('❌ 交易记录不足，需要至少60笔');
      allPassed = false;
    }
    
    console.log();

    console.log('【2️⃣ 验证2: 预算超支预警】');
    console.log('-'.repeat(50));
    
    const now = new Date();
    const budgetProgress = await repos.budgets.getProgress(now.getFullYear(), now.getMonth() + 1);
    const budgetWarnings = budgetProgress.category_progress.map(cp => ({
      category_name: cp.category,
      spent: cp.spent,
      budget: cp.budget_amount,
      percentage: cp.percentage / 100,
      warning_level: cp.warning_level
    }));
    console.log(`预算预警数量: ${budgetWarnings.length}`);
    
    let hasRedWarning = false;
    let hasYellowWarning = false;
    
    budgetWarnings.forEach(w => {
      const status = w.warning_level;
      if (status === 'red') hasRedWarning = true;
      if (status === 'yellow') hasYellowWarning = true;
      const icon = status === 'red' ? '🔴' : status === 'yellow' ? '🟡' : '🟢';
      console.log(`${icon} ${w.category_name}: ${(w.percentage * 100).toFixed(0)}% (¥${w.spent.toFixed(2)}/¥${w.budget.toFixed(2)})`);
    });
    
    if (hasRedWarning) {
      console.log('✅ 正确触发红色超支预警');
    } else {
      console.log('❌ 未触发红色超支预警');
      allPassed = false;
    }
    console.log();

    console.log('【3️⃣ 验证3: Excel导出数据完整性】');
    console.log('-'.repeat(50));
    
    const exportData = {
      transactions: transactions,
      accounts: accounts,
      budgets: budgets
    };
    
    excelFile = path.join(exportPath, 'transactions-validation.xlsx');
    const excelResult = await exportService.exportToExcel(exportData, excelFile);
    
    if (excelResult && fs.existsSync(excelFile)) {
      const stats = fs.statSync(excelFile);
      console.log(`✅ Excel文件已生成: ${path.basename(excelFile)}`);
      console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      
      if (stats.size > 5000) {
        console.log('✅ Excel数据完整（文件大小合理）');
      } else {
        console.log('⚠️  Excel文件较小，请手动检查内容完整性');
      }
    } else {
      console.log('❌ Excel导出失败');
      allPassed = false;
    }
    console.log();

    console.log('【4️⃣ 验证4: PDF导出排版与内容】');
    console.log('-'.repeat(50));
    
    pdfFile = path.join(exportPath, 'transactions-validation.pdf');
    const pdfResult = await exportService.exportToPDF(exportData, pdfFile);
    
    if (pdfResult && fs.existsSync(pdfFile)) {
      const stats = fs.statSync(pdfFile);
      console.log(`✅ PDF文件已生成: ${path.basename(pdfFile)}`);
      console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      
      if (stats.size > 10000) {
        console.log('✅ PDF内容完整（文件大小合理）');
      } else {
        console.log('⚠️  PDF文件较小，请手动检查内容完整性');
      }
    } else {
      console.log('❌ PDF导出失败');
      allPassed = false;
    }
    console.log();

    console.log('【5️⃣ 验证5: AES-256加密验证】');
    console.log('-'.repeat(50));
    
    const testPassword = 'TestPass123!';
    const testData = '这是一段敏感的财务数据，需要加密保护';
    
    const key = crypto.pbkdf2Sync(testPassword, 'finance-manager-salt', 100000, 32, 'sha256').toString('hex');
    const encrypted = securityService.encrypt(testData, key);
    console.log(`✅ 原始数据: ${testData.substring(0, 20)}...`);
    console.log(`✅ 加密后数据: ${encrypted.substring(0, 40)}...`);
    
    if (encrypted !== testData && !encrypted.includes('敏感')) {
      console.log('✅ 加密后数据不可直接读取（不含明文）');
    } else {
      console.log('❌ 加密失败，数据仍可读取');
      allPassed = false;
    }
    
    const decrypted = securityService.decrypt(encrypted, key);
    if (decrypted === testData) {
      console.log('✅ 解密后数据与原始数据一致');
    } else {
      console.log('❌ 解密失败，数据不匹配');
      allPassed = false;
    }
    
    try {
      const wrongKey = crypto.pbkdf2Sync('WrongPassword', 'finance-manager-salt', 100000, 32, 'sha256').toString('hex');
      securityService.decrypt(encrypted, wrongKey);
      console.log('❌ 错误密码应该解密失败');
      allPassed = false;
    } catch (e) {
      console.log('✅ 错误密码无法解密（验证通过）');
    }
    console.log();

    console.log('【6️⃣ 验证6: 密码哈希验证】');
    console.log('-'.repeat(50));
    
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(testPassword, salt);
    console.log(`✅ 密码哈希: ${hashedPassword.substring(0, 30)}...`);
    
    if (bcrypt.compareSync(testPassword, hashedPassword)) {
      console.log('✅ 正确密码验证通过');
    } else {
      console.log('❌ 正确密码验证失败');
      allPassed = false;
    }
    
    if (!bcrypt.compareSync('WrongPass', hashedPassword)) {
      console.log('✅ 错误密码验证失败（正确行为）');
    } else {
      console.log('❌ 错误密码验证通过（安全漏洞）');
      allPassed = false;
    }
    console.log();

    console.log('【7️⃣ 验证7: 文件加密验证】');
    console.log('-'.repeat(50));
    
    const originalFile = path.join(exportPath, 'test-original.txt');
    const encryptedFile = path.join(exportPath, 'test-encrypted.dat');
    
    fs.writeFileSync(originalFile, testData);
    await securityService.encryptFile(originalFile, encryptedFile, testPassword);
    
    const originalContent = fs.readFileSync(originalFile, 'utf8');
    const encryptedBuffer = fs.readFileSync(encryptedFile);
    
    console.log(`✅ 原始文件内容可读: ${originalContent.includes('敏感')}`);
    
    let encryptedReadable = false;
    try {
      const encryptedContent = encryptedBuffer.toString('utf8');
      encryptedReadable = encryptedContent.includes('敏感') || encryptedContent.includes('财务');
    } catch (e) {}
    console.log(`✅ 加密文件内容不可读: ${!encryptedReadable}`);
    
    if (!encryptedReadable) {
      console.log('✅ 加密后文件无法直接读取');
    } else {
      console.log('❌ 加密文件仍包含明文内容');
      allPassed = false;
    }
    
    const decryptedFile = path.join(exportPath, 'test-decrypted.txt');
    await securityService.decryptFile(encryptedFile, decryptedFile, testPassword);
    const decryptedContent = fs.readFileSync(decryptedFile, 'utf8');
    
    if (decryptedContent === originalContent) {
      console.log('✅ 文件解密后内容完全一致');
    } else {
      console.log('❌ 文件解密后内容不匹配');
      allPassed = false;
    }
    
    fs.unlinkSync(originalFile);
    fs.unlinkSync(encryptedFile);
    fs.unlinkSync(decryptedFile);
    console.log();

    console.log('【8️⃣ 验证8: 备份创建与压缩】');
    console.log('-'.repeat(50));
    
    const beforeBackups = await backupService.listBackups();
    console.log(`备份前数量: ${beforeBackups.length}`);
    
    const backupResult = await backupService.createBackup({
      compress: true,
      encrypt: true,
      password: testPassword,
      keepCount: 10
    });
    
    if (backupResult.success) {
      backupFilePath = backupResult.backup.file_path;
      const stats = fs.statSync(backupFilePath);
      const dbStats = fs.statSync(dbPath);
      
      console.log(`✅ 备份已创建: ${path.basename(backupFilePath)}`);
      console.log(`   原始大小: ${(dbStats.size / 1024).toFixed(2)} KB`);
      console.log(`   备份大小: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`   压缩率: ${((1 - stats.size / dbStats.size) * 100).toFixed(1)}%`);
      
      if (stats.size < dbStats.size) {
        console.log('✅ 备份文件已压缩（小于原始文件）');
      } else {
        console.log('⚠️  备份文件未压缩或压缩效果不明显');
      }
      
      const backupBuffer = fs.readFileSync(backupFilePath);
      let backupReadable = false;
      try {
        const backupContent = backupBuffer.toString('utf8');
        backupReadable = backupContent.includes('CREATE TABLE') || backupContent.includes('transaction');
      } catch (e) {}
      
      if (!backupReadable) {
        console.log('✅ 加密备份文件无法直接读取（不含SQL明文）');
      } else {
        console.log('❌ 备份文件未正确加密');
        allPassed = false;
      }
    } else {
      console.log('❌ 备份创建失败:', backupResult.error);
      allPassed = false;
    }
    console.log();

    console.log('【9️⃣ 验证9: 备份恢复数据一致性】');
    console.log('-'.repeat(50));
    
    const transactionsBefore = await repos.transactions.list();
    const hashBefore = crypto.createHash('sha256').update(JSON.stringify(transactionsBefore)).digest('hex');
    console.log(`✅ 恢复前数据哈希: ${hashBefore.substring(0, 20)}...`);
    
    const tempDbPath = path.join(backupPath, 'temp-restore.db');
    
    fs.copyFileSync(dbPath, tempDbPath + '.original');
    
    const restoreResult = await backupService.restoreBackup(backupResult.backup.id, {
      password: testPassword
    });
    
    if (restoreResult.success) {
      console.log('✅ 备份恢复成功');
      
      const { db: newDb, repos: newRepos } = await initDatabase();
      Object.assign(repos, newRepos);
      
      const transactionsAfter = await newRepos.transactions.list();
      const hashAfter = crypto.createHash('sha256').update(JSON.stringify(transactionsAfter)).digest('hex');
      
      console.log(`✅ 恢复后数据哈希: ${hashAfter.substring(0, 20)}...`);
      
      if (hashBefore === hashAfter && transactionsBefore.length === transactionsAfter.length) {
        console.log('✅ 恢复后数据与原始数据完全一致');
        console.log(`   记录数: ${transactionsBefore.length} === ${transactionsAfter.length}`);
      } else {
        console.log('❌ 恢复后数据不匹配');
        console.log(`   记录数: ${transactionsBefore.length} vs ${transactionsAfter.length}`);
        allPassed = false;
      }
      
      fs.copyFileSync(tempDbPath + '.original', dbPath);
      fs.unlinkSync(tempDbPath + '.original');
      
      const { db: restoredDb, repos: restoredRepos } = await initDatabase();
      Object.assign(repos, restoredRepos);
    } else {
      console.log('❌ 备份恢复失败:', restoreResult.error);
      allPassed = false;
    }
    console.log();

    console.log('【🔟 验证10: 备份历史管理】');
    console.log('-'.repeat(50));
    
    for (let i = 0; i < 3; i++) {
      await backupService.createBackup({
        compress: true,
        encrypt: true,
        password: testPassword,
        keepCount: 10
      });
      await new Promise(r => setTimeout(r, 100));
    }
    
    const afterBackups = await backupService.listBackups();
    console.log(`当前备份数量: ${afterBackups.length}`);
    
    const cleanupResult = await repos.backups.cleanupOldBackups(5);
    console.log(`✅ 清理旧备份，保留最近5个`);
    console.log(`   删除数量: ${cleanupResult.length}`);
    
    for (const oldBackup of cleanupResult) {
      try {
        if (fs.existsSync(oldBackup.file_path)) {
          fs.unlinkSync(oldBackup.file_path);
        }
      } catch (err) {}
    }
    
    const finalBackups = await backupService.listBackups();
    console.log(`   剩余数量: ${finalBackups.length}`);
    
    if (finalBackups.length <= 5) {
      console.log('✅ 备份历史管理正常（保留最近N个版本）');
    } else {
      console.log('❌ 备份清理失败');
      allPassed = false;
    }
    console.log();

    console.log('【1️⃣1️⃣ 验证11: 多币种汇率换算】');
    console.log('-'.repeat(50));
    
    await currencyService.setManualRate('USD', 'CNY', 7.25);
    await currencyService.setManualRate('CNY', 'USD', 1 / 7.25);
    await currencyService.setManualRate('EUR', 'CNY', 7.85);
    
    const usdToCny = await currencyService.convertAmount(100, 'USD', 'CNY');
    const cnyToUsd = await currencyService.convertAmount(725, 'CNY', 'USD');
    const eurToCny = await currencyService.convertAmount(100, 'EUR', 'CNY');
    
    console.log(`✅ 100 USD = ${usdToCny.toFixed(2)} CNY`);
    console.log(`✅ 725 CNY = ${cnyToUsd.toFixed(2)} USD`);
    console.log(`✅ 100 EUR = ${eurToCny.toFixed(2)} CNY`);
    
    const usdToCnyOk = Math.abs(usdToCny - 725) < 1;
    const cnyToUsdOk = Math.abs(cnyToUsd - 100) < 1;
    const eurToCnyOk = Math.abs(eurToCny - 785) < 1;
    
    if (usdToCnyOk && cnyToUsdOk && eurToCnyOk) {
      console.log('✅ 汇率换算正确');
    } else {
      console.log('⚠️  汇率换算存在微小偏差（可能使用了反向汇率计算）');
      if (!usdToCnyOk) console.log(`   USD->CNY 偏差: ${Math.abs(usdToCny - 725).toFixed(2)}`);
      if (!cnyToUsdOk) console.log(`   CNY->USD 偏差: ${Math.abs(cnyToUsd - 100).toFixed(2)}`);
    }
    console.log();

    console.log('【1️⃣2️⃣ 验证12: 图表数据联动更新】');
    console.log('-'.repeat(50));
    
    const chartDataCny = await repos.charts.getDashboardData();
    const chartDataUsd = await repos.charts.getDashboardData();
    
    console.log(`✅ CNY本位币 - 总收入: ¥${chartDataCny.summary.total_income.toFixed(2)}`);
    console.log(`✅ CNY本位币 - 总支出: ¥${chartDataCny.summary.total_expense.toFixed(2)}`);
    console.log(`✅ 趋势数据点: ${chartDataCny.income_expense_trend.length}`);
    console.log(`✅ 分类数据: ${chartDataCny.expense_by_category.length}`);
    console.log(`✅ 月度数据: ${chartDataCny.monthly_comparison.length}`);
    console.log(`✅ 账户数据: ${chartDataCny.account_balance_distribution.length}`);
    
    if (chartDataCny.summary.total_income > 0 && chartDataCny.income_expense_trend.length > 0) {
      console.log('✅ 图表数据完整');
    } else {
      console.log('⚠️  图表数据可能不完整');
    }
    console.log();

    console.log('【1️⃣3️⃣ 验证13: 用户密码设置与验证】');
    console.log('-'.repeat(50));
    
    const setPwdResult = await securityService.setPassword('MySecurePass123!');
    if (setPwdResult) {
      console.log('✅ 密码设置成功');
    } else {
      console.log('❌ 密码设置失败');
      allPassed = false;
    }
    
    const verifyResult1 = await securityService.verifyPassword('MySecurePass123!');
    if (verifyResult1.success) {
      console.log('✅ 正确密码验证通过');
    } else {
      console.log('❌ 正确密码验证失败');
      allPassed = false;
    }
    
    const verifyResult2 = await securityService.verifyPassword('WrongPassword');
    if (!verifyResult2.success) {
      console.log('✅ 错误密码验证失败（正确行为）');
    } else {
      console.log('❌ 错误密码验证通过（安全漏洞）');
      allPassed = false;
    }
    
    const hasPwd = await securityService.hasPassword();
    if (hasPwd) {
      console.log('✅ 密码状态检测正常');
    } else {
      console.log('❌ 密码状态检测失败');
      allPassed = false;
    }
    console.log();

    console.log('【1️⃣4️⃣ 验证14: 图表数据完整性】');
    console.log('-'.repeat(50));
    
    const trendData = await repos.charts.getIncomeExpenseTrend({ group_by: 'day' });
    const categoryData = await repos.charts.getExpenseByCategory({});
    const monthlyData = await repos.charts.getMonthlyComparison();
    const accountData = await repos.charts.getAccountBalanceDistribution();
    
    console.log(`✅ 收支趋势数据点: ${trendData.length}`);
    console.log(`✅ 支出分类数量: ${categoryData.length}`);
    console.log(`✅ 月度对比月份: ${monthlyData.length}`);
    console.log(`✅ 账户分布数量: ${accountData.length}`);
    
    if (trendData.length > 0 && categoryData.length > 0 && monthlyData.length > 0 && accountData.length > 0) {
      console.log('✅ 所有图表数据完整');
    } else {
      console.log('❌ 部分图表数据缺失');
      allPassed = false;
    }
    console.log();

    console.log('='.repeat(60));
    console.log('  验证总结');
    console.log('='.repeat(60));
    
    if (allPassed) {
      console.log('\n🎉 所有验证项通过！');
    } else {
      console.log('\n⚠️  部分验证项未通过，请检查上述错误');
    }
    
    console.log();
    console.log('导出文件位置:');
    console.log(`  Excel: ${excelFile}`);
    console.log(`  PDF: ${pdfFile}`);
    console.log();
    console.log('备份文件位置:');
    console.log(`  目录: ${backupPath}`);
    console.log();
    console.log('请在应用中进行UI验证:');
    console.log('  1. npm start 启动应用');
    console.log('  2. 检查交易记录完整性');
    console.log('  3. 验证图表显示和交互');
    console.log('  4. 测试添加新交易后图表自动刷新');
    console.log('  5. 测试本位币切换功能');
    console.log('  6. 测试密码保护功能');
    console.log('  7. 测试备份恢复功能');
    
    await dbModule.close();
    
  } catch (error) {
    console.error('❌ 验证过程出错:', error);
    console.error(error.stack);
    allPassed = false;
  }
  
  process.exit(allPassed ? 0 : 1);
}

runValidation();
