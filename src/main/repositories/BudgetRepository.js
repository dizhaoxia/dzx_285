class BudgetRepository {
  constructor(db) {
    this.db = db;
  }

  async getByMonth(year, month) {
    const budget = await this.db('budgets')
      .where({ year, month })
      .first();

    if (!budget) return null;

    const categoryBudgets = await this.db('category_budgets')
      .where('budget_id', budget.id)
      .orderBy('category', 'asc');

    budget.category_budgets = categoryBudgets;
    return budget;
  }

  async create(budgetData) {
    const now = new Date().toISOString();
    const trx = await this.db.transaction();
    try {
      const [id] = await trx('budgets').insert({
        year: budgetData.year,
        month: budgetData.month,
        total_amount: budgetData.total_amount || 0,
        created_at: now,
        updated_at: now
      });

      if (budgetData.category_budgets && budgetData.category_budgets.length > 0) {
        const catBudgets = budgetData.category_budgets.map(cb => ({
          budget_id: id,
          category: cb.category,
          amount: cb.amount,
          created_at: now,
          updated_at: now
        }));
        await trx('category_budgets').insert(catBudgets);
      }

      await trx.commit();
      return this.getByMonth(budgetData.year, budgetData.month);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async update(id, budgetData) {
    const now = new Date().toISOString();
    const trx = await this.db.transaction();
    try {
      await trx('budgets').where({ id }).update({
        total_amount: budgetData.total_amount,
        updated_at: now
      });

      if (budgetData.category_budgets !== undefined) {
        await trx('category_budgets').where('budget_id', id).del();
        if (budgetData.category_budgets.length > 0) {
          const catBudgets = budgetData.category_budgets.map(cb => ({
            budget_id: id,
            category: cb.category,
            amount: cb.amount,
            created_at: now,
            updated_at: now
          }));
          await trx('category_budgets').insert(catBudgets);
        }
      }

      await trx.commit();
      const budget = await this.db('budgets').where({ id }).first();
      budget.category_budgets = await this.db('category_budgets')
        .where('budget_id', id)
        .orderBy('category', 'asc');
      return budget;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async delete(id) {
    return this.db('budgets').where({ id }).del();
  }

  async list(year) {
    let query = this.db('budgets').orderBy('year', 'desc').orderBy('month', 'desc');
    if (year) {
      query = query.where('year', year);
    }
    const budgets = await query;
    for (const budget of budgets) {
      budget.category_budgets = await this.db('category_budgets')
        .where('budget_id', budget.id)
        .orderBy('category', 'asc');
    }
    return budgets;
  }

  async getProgress(year, month) {
    const budget = await this.getByMonth(year, month);
    if (!budget) {
      return { budget: null, total_spent: 0, category_progress: [] };
    }

    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    const totalSpentResult = await this.db('transactions')
      .where('type', 'expense')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .sum('amount as total')
      .first();

    const totalSpent = parseFloat(totalSpentResult.total) || 0;

    const categoryProgress = [];
    for (const cb of budget.category_budgets) {
      const catSpentResult = await this.db('transactions')
        .where('type', 'expense')
        .where('category', cb.category)
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .sum('amount as total')
        .first();

      const catSpent = parseFloat(catSpentResult.total) || 0;
      const percentage = cb.amount > 0 ? Math.round((catSpent / cb.amount) * 100) : 0;

      categoryProgress.push({
        category: cb.category,
        budget_amount: cb.amount,
        spent: catSpent,
        percentage,
        warning_level: percentage >= 100 ? 'red' : percentage >= 80 ? 'yellow' : 'none'
      });
    }

    const totalPercentage = budget.total_amount > 0
      ? Math.round((totalSpent / budget.total_amount) * 100)
      : 0;

    return {
      budget,
      total_spent: totalSpent,
      total_percentage: totalPercentage,
      total_warning_level: totalPercentage >= 100 ? 'red' : totalPercentage >= 80 ? 'yellow' : 'none',
      category_progress: categoryProgress
    };
  }

  async ensureCurrentMonthBudget() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const existing = await this.getByMonth(year, month);
    if (!existing) {
      return this.create({ year, month, total_amount: 0, category_budgets: [] });
    }
    return existing;
  }
}

module.exports = BudgetRepository;
