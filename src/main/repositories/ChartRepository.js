class ChartRepository {
  constructor(db) {
    this.db = db;
  }

  async getIncomeExpenseTrend(filters = {}) {
    const { start_date, end_date, account_id, group_by = 'day' } = filters;
    
    let query = this.db('transactions')
      .select(this.db.raw(`
        CASE 
          WHEN ? = 'day' THEN DATE(date)
          WHEN ? = 'week' THEN STRFTIME('%Y-W%W', date)
          WHEN ? = 'month' THEN STRFTIME('%Y-%m', date)
          ELSE DATE(date)
        END as period,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      `, [group_by, group_by, group_by]))
      .groupBy('period')
      .orderBy('period', 'asc');

    if (account_id) {
      query = query.where('account_id', account_id);
    }
    if (start_date) {
      query = query.where('date', '>=', start_date);
    }
    if (end_date) {
      query = query.where('date', '<=', end_date);
    }

    const results = await query;
    
    return results.map(r => ({
      period: r.period,
      income: parseFloat(r.income) || 0,
      expense: parseFloat(r.expense) || 0,
      net: (parseFloat(r.income) || 0) - (parseFloat(r.expense) || 0)
    }));
  }

  async getExpenseByCategory(filters = {}) {
    const { start_date, end_date, account_id } = filters;
    
    let query = this.db('transactions')
      .select('category')
      .sum('amount as total')
      .where('type', 'expense')
      .groupBy('category')
      .orderBy('total', 'desc');

    if (account_id) {
      query = query.where('account_id', account_id);
    }
    if (start_date) {
      query = query.where('date', '>=', start_date);
    }
    if (end_date) {
      query = query.where('date', '<=', end_date);
    }

    const results = await query;
    const total = results.reduce((sum, r) => sum + parseFloat(r.total), 0);
    
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
      '#14b8a6', '#a855f7', '#eab308', '#22c55e', '#ef4444'
    ];

    return results.map((r, i) => ({
      category: r.category,
      amount: parseFloat(r.total) || 0,
      percentage: total > 0 ? parseFloat(((parseFloat(r.total) / total) * 100).toFixed(2)) : 0,
      color: colors[i % colors.length]
    }));
  }

  async getMonthlyComparison(year = null) {
    const targetYear = year || new Date().getFullYear();
    const startDate = new Date(targetYear, 0, 1).toISOString();
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59).toISOString();
    
    const results = await this.db('transactions')
      .select(this.db.raw(`
        STRFTIME('%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      `))
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .groupBy('month')
      .orderBy('month', 'asc');

    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', 
                       '7月', '8月', '9月', '10月', '11月', '12月'];
    
    const monthlyData = [];
    for (let i = 0; i < 12; i++) {
      const monthStr = String(i + 1).padStart(2, '0');
      const found = results.find(r => r.month === monthStr);
      monthlyData.push({
        month: monthNames[i],
        month_num: i + 1,
        income: found ? parseFloat(found.income) || 0 : 0,
        expense: found ? parseFloat(found.expense) || 0 : 0,
        net: found 
          ? (parseFloat(found.income) || 0) - (parseFloat(found.expense) || 0)
          : 0
      });
    }

    return monthlyData;
  }

  async getAccountBalanceDistribution() {
    const accounts = await this.db('accounts')
      .select('id', 'name', 'balance', 'currency', 'type')
      .orderBy('balance', 'desc');

    const total = accounts.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    
    const colors = {
      cash: '#10b981',
      bank: '#3b82f6',
      credit: '#ef4444',
      investment: '#f59e0b'
    };

    return accounts.map(a => ({
      id: a.id,
      name: a.name,
      balance: parseFloat(a.balance) || 0,
      currency: a.currency,
      type: a.type,
      percentage: total > 0 ? parseFloat(((parseFloat(a.balance) / total) * 100).toFixed(2)) : 0,
      color: colors[a.type] || '#6b7280'
    }));
  }

  async getDashboardData(accountId = null, targetCurrency = 'CNY') {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    
    const [summary, trend, categoryDistribution, monthlyComparison, accountDistribution] = await Promise.all([
      this.db('transactions')
        .select(
          this.db.raw("SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income"),
          this.db.raw("SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense")
        )
        .where('date', '>=', currentMonthStart)
        .where('date', '<=', currentMonthEnd)
        .modify((qb) => {
          if (accountId) qb.where('account_id', accountId);
        })
        .first(),
      this.getIncomeExpenseTrend({ 
        account_id: accountId,
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
        group_by: 'day'
      }),
      this.getExpenseByCategory({ 
        account_id: accountId,
        start_date: currentMonthStart,
        end_date: currentMonthEnd
      }),
      this.getMonthlyComparison(now.getFullYear()),
      this.getAccountBalanceDistribution()
    ]);

    return {
      summary: {
        total_income: parseFloat(summary?.total_income) || 0,
        total_expense: parseFloat(summary?.total_expense) || 0,
        net_balance: (parseFloat(summary?.total_income) || 0) - (parseFloat(summary?.total_expense) || 0)
      },
      income_expense_trend: trend,
      expense_by_category: categoryDistribution,
      monthly_comparison: monthlyComparison,
      account_balance_distribution: accountDistribution
    };
  }
}

module.exports = ChartRepository;
