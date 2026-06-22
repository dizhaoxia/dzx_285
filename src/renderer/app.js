const AppState = {
  accounts: [],
  currentAccountId: null,
  transactions: [],
  tags: [],
  selectedTagIds: [],
  newAttachments: [],
  existingAttachments: [],
  attachmentsToDelete: [],
  budgetProgress: null,
  budgetCategoryBudgets: [],
  importState: {
    filePath: null,
    parsedData: null,
    fieldMapping: {},
    mappedRows: [],
    duplicateInfo: null
  },
  filters: {
    type: '',
    category: '',
    start_date: '',
    end_date: '',
    sort_by: 'date',
    sort_order: 'desc'
  }
};

const AccountTypeIcons = {
  cash: '💵',
  bank: '🏦',
  credit: '💳',
  investment: '📈'
};

const AccountTypeLabels = {
  cash: '现金',
  bank: '银行卡',
  credit: '信用卡',
  investment: '投资账户'
};

function formatCurrency(amount, currency = 'CNY') {
  const num = parseFloat(amount) || 0;
  const symbols = { CNY: '¥', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || '¥';
  return symbol + num.toFixed(2);
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

async function loadAccounts() {
  const result = await window.api.accounts.getAll();
  if (result.success) {
    AppState.accounts = result.data;
    renderAccountList();
    updateTotalBalance();
    updateTransactionAccountOptions();
  } else {
    showToast('加载账户失败: ' + result.error, 'error');
  }
}

function renderAccountList() {
  const list = document.getElementById('accountList');
  list.innerHTML = '';

  const allItem = document.createElement('li');
  allItem.className = `account-item all-accounts-item ${!AppState.currentAccountId ? 'active' : ''}`;
  allItem.innerHTML = '<span>📊 全部账户</span>';
  allItem.onclick = () => selectAccount(null);
  list.appendChild(allItem);

  AppState.accounts.forEach(account => {
    const item = document.createElement('li');
    item.className = `account-item ${AppState.currentAccountId === account.id ? 'active' : ''}`;
    item.innerHTML = `
      <div class="account-item-info">
        <div class="account-type-icon ${account.type}">${AccountTypeIcons[account.type] || '💰'}</div>
        <div>
          <div class="account-name">${escapeHtml(account.name)}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="account-balance">${formatCurrency(account.balance, account.currency)}</span>
        <div class="account-actions">
          <button class="account-action-btn" title="编辑" onclick="event.stopPropagation(); editAccount(${account.id})">✏️</button>
          <button class="account-action-btn" title="删除" onclick="event.stopPropagation(); deleteAccount(${account.id})">🗑️</button>
        </div>
      </div>
    `;
    item.onclick = () => selectAccount(account.id);
    list.appendChild(item);
  });
}

function selectAccount(accountId) {
  AppState.currentAccountId = accountId;
  renderAccountList();
  updateCurrentAccountInfo();
  loadTransactions();
  loadSummary();
}

function updateCurrentAccountInfo() {
  const nameEl = document.getElementById('currentAccountName');
  const balanceEl = document.getElementById('currentAccountBalance');

  if (!AppState.currentAccountId) {
    nameEl.textContent = '全部账户';
    const total = AppState.accounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
    balanceEl.textContent = formatCurrency(total);
  } else {
    const account = AppState.accounts.find(a => a.id === AppState.currentAccountId);
    if (account) {
      nameEl.textContent = account.name;
      balanceEl.textContent = formatCurrency(account.balance, account.currency);
    }
  }
}

async function updateTotalBalance() {
  const result = await window.api.accounts.getTotalBalance();
  if (result.success) {
    document.getElementById('totalBalance').textContent = formatCurrency(result.data);
  }
}

function updateTransactionAccountOptions() {
  const select = document.getElementById('transactionAccount');
  const currentValue = select.value;
  
  select.innerHTML = '';
  AppState.accounts.forEach(account => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = `${account.name} (${formatCurrency(account.balance, account.currency)})`;
    select.appendChild(option);
  });

  if (currentValue && AppState.accounts.some(a => a.id == currentValue)) {
    select.value = currentValue;
  } else if (AppState.currentAccountId) {
    select.value = AppState.currentAccountId;
  }
}

function openAccountModal(account = null) {
  const title = document.getElementById('accountModalTitle');
  const form = document.getElementById('accountForm');
  
  if (account) {
    title.textContent = '编辑账户';
    document.getElementById('accountId').value = account.id;
    document.getElementById('accountName').value = account.name;
    document.getElementById('accountType').value = account.type;
    document.getElementById('accountBalance').value = account.balance;
    document.getElementById('accountDescription').value = account.description || '';
    document.getElementById('accountCurrency').value = account.currency || 'CNY';
  } else {
    title.textContent = '添加账户';
    form.reset();
    document.getElementById('accountId').value = '';
    document.getElementById('accountBalance').value = '0';
  }
  
  openModal('accountModal');
}

function editAccount(id) {
  const account = AppState.accounts.find(a => a.id === id);
  if (account) {
    openAccountModal(account);
  }
}

async function deleteAccount(id) {
  const account = AppState.accounts.find(a => a.id === id);
  if (!account) return;

  if (!confirm(`确定要删除账户"${account.name}"吗？相关的交易记录也会被删除。`)) {
    return;
  }

  const result = await window.api.accounts.delete(id);
  if (result.success) {
    showToast('账户删除成功', 'success');
    if (AppState.currentAccountId === id) {
      AppState.currentAccountId = null;
    }
    loadAccounts();
    loadTransactions();
    loadSummary();
  } else {
    showToast('删除失败: ' + result.error, 'error');
  }
}

async function saveAccount(e) {
  e.preventDefault();
  
  const id = document.getElementById('accountId').value;
  const accountData = {
    name: document.getElementById('accountName').value.trim(),
    type: document.getElementById('accountType').value,
    balance: parseFloat(document.getElementById('accountBalance').value) || 0,
    description: document.getElementById('accountDescription').value.trim(),
    currency: document.getElementById('accountCurrency').value
  };

  if (!accountData.name) {
    showToast('请输入账户名称', 'error');
    return;
  }

  let result;
  if (id) {
    result = await window.api.accounts.update(parseInt(id), accountData);
  } else {
    result = await window.api.accounts.create(accountData);
  }

  if (result.success) {
    showToast(id ? '账户更新成功' : '账户创建成功', 'success');
    closeModal('accountModal');
    loadAccounts();
  } else {
    showToast('保存失败: ' + result.error, 'error');
  }
}

async function loadTags() {
  const result = await window.api.tags.getAll();
  if (result.success) {
    AppState.tags = result.data;
    renderTagList();
    renderTagSelector();
  }
}

function renderTagList() {
  const list = document.getElementById('tagList');
  list.innerHTML = '';

  AppState.tags.forEach(tag => {
    const item = document.createElement('span');
    item.className = 'tag-item';
    item.style.background = tag.color;
    item.innerHTML = `
      ${escapeHtml(tag.name)}
      <span class="tag-remove" title="删除标签">×</span>
    `;
    
    item.querySelector('.tag-remove').onclick = (e) => {
      e.stopPropagation();
      deleteTag(tag.id);
    };
    
    item.onclick = () => {
      if (AppState.filters.tag_id === tag.id) {
        delete AppState.filters.tag_id;
      } else {
        AppState.filters.tag_id = tag.id;
      }
      loadTransactions();
    };
    
    list.appendChild(item);
  });
}

function renderTagSelector() {
  const selector = document.getElementById('tagSelector');
  selector.innerHTML = '';

  AppState.tags.forEach(tag => {
    const tagEl = document.createElement('span');
    const isSelected = AppState.selectedTagIds.includes(tag.id);
    tagEl.className = `tag-option ${isSelected ? 'selected' : ''}`;
    tagEl.style.background = tag.color;
    tagEl.textContent = tag.name;
    tagEl.onclick = () => toggleTagSelection(tag.id);
    selector.appendChild(tagEl);
  });
}

function toggleTagSelection(tagId) {
  const index = AppState.selectedTagIds.indexOf(tagId);
  if (index > -1) {
    AppState.selectedTagIds.splice(index, 1);
  } else {
    AppState.selectedTagIds.push(tagId);
  }
  renderTagSelector();
}

async function addTag(name, color = '#3b82f6') {
  if (!name || !name.trim()) return null;
  
  const result = await window.api.tags.getOrCreate(name.trim(), color);
  if (result.success) {
    loadTags();
    return result.data;
  }
  return null;
}

async function deleteTag(id) {
  if (!confirm('确定要删除这个标签吗？')) return;
  
  const result = await window.api.tags.delete(id);
  if (result.success) {
    showToast('标签删除成功', 'success');
    loadTags();
  } else {
    showToast('删除失败: ' + result.error, 'error');
  }
}

function openTagModal() {
  document.getElementById('tagForm').reset();
  document.getElementById('tagColor').value = '#3b82f6';
  openModal('tagModal');
}

async function saveTag(e) {
  e.preventDefault();
  
  const name = document.getElementById('tagName').value.trim();
  const color = document.getElementById('tagColor').value;

  if (!name) {
    showToast('请输入标签名称', 'error');
    return;
  }

  const result = await addTag(name, color);
  if (result) {
    showToast('标签创建成功', 'success');
    closeModal('tagModal');
  } else {
    showToast('创建标签失败', 'error');
  }
}

async function loadTransactions() {
  const filters = { ...AppState.filters };
  if (AppState.currentAccountId) {
    filters.account_id = AppState.currentAccountId;
  }

  const result = await window.api.transactions.list(filters);
  if (result.success) {
    AppState.transactions = result.data.items;
    renderTransactionList();
  } else {
    showToast('加载交易记录失败: ' + result.error, 'error');
  }
}

function renderTransactionList() {
  const tbody = document.getElementById('transactionList');
  const emptyState = document.getElementById('emptyState');
  
  tbody.innerHTML = '';

  if (AppState.transactions.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';

  const accountsMap = {};
  AppState.accounts.forEach(a => { accountsMap[a.id] = a; });

  AppState.transactions.forEach(transaction => {
    const account = accountsMap[transaction.account_id] || {};
    const tr = document.createElement('tr');
    
    const tagsHtml = (transaction.tags || [])
      .map(tag => `<span class="transaction-tag" style="background: ${tag.color}">${escapeHtml(tag.name)}</span>`)
      .join('');
    
    const attachmentsHtml = transaction.attachments && transaction.attachments.length > 0
      ? `<span class="attachment-icon" title="${transaction.attachments.length} 个附件">📎 ${transaction.attachments.length}</span>`
      : '';

    tr.innerHTML = `
      <td>${formatDate(transaction.date)}</td>
      <td><span class="type-badge ${transaction.type}">${transaction.type === 'income' ? '收入' : '支出'}</span></td>
      <td>${escapeHtml(transaction.category)}</td>
      <td class="amount-${transaction.type}">${transaction.type === 'income' ? '+' : '-'}${formatCurrency(transaction.amount)}</td>
      <td>${escapeHtml(account.name || '未知')}</td>
      <td><div class="transaction-tags">${tagsHtml}</div></td>
      <td>${escapeHtml(transaction.note?.substring(0, 20) || '')}${transaction.note?.length > 20 ? '...' : ''}</td>
      <td>${attachmentsHtml}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="event.stopPropagation(); viewTransaction(${transaction.id})">查看</button>
        </div>
      </td>
    `;
    
    tr.onclick = () => viewTransaction(transaction.id);
    tbody.appendChild(tr);
  });
}

async function loadSummary() {
  const result = await window.api.transactions.getSummary(AppState.currentAccountId);
  if (result.success) {
    const data = result.data;
    document.getElementById('totalIncome').textContent = formatCurrency(data.total_income);
    document.getElementById('totalExpense').textContent = formatCurrency(data.total_expense);
    const netEl = document.getElementById('netBalance');
    netEl.textContent = formatCurrency(data.net_balance);
    netEl.style.color = data.net_balance >= 0 ? '#059669' : '#dc2626';
  }
}

function openTransactionModal(type = 'expense', transaction = null) {
  const title = document.getElementById('transactionModalTitle');
  const form = document.getElementById('transactionForm');
  
  AppState.selectedTagIds = [];
  AppState.newAttachments = [];
  AppState.existingAttachments = [];
  AppState.attachmentsToDelete = [];

  if (transaction) {
    title.textContent = '编辑交易';
    document.getElementById('transactionId').value = transaction.id;
    document.getElementById('transactionType').value = transaction.type;
    document.getElementById('transactionAmount').value = transaction.amount;
    document.getElementById('transactionDate').value = transaction.date ? transaction.date.substring(0, 10) : '';
    document.getElementById('transactionCategory').value = transaction.category;
    document.getElementById('transactionAccount').value = transaction.account_id;
    document.getElementById('transactionNote').value = transaction.note || '';
    AppState.selectedTagIds = (transaction.tags || []).map(t => t.id);
    AppState.existingAttachments = (transaction.attachments || []).slice();
  } else {
    title.textContent = type === 'income' ? '添加收入' : '添加支出';
    form.reset();
    document.getElementById('transactionId').value = '';
    document.getElementById('transactionType').value = type;
    document.getElementById('transactionDate').value = new Date().toISOString().split('T')[0];
    
    if (AppState.currentAccountId) {
      document.getElementById('transactionAccount').value = AppState.currentAccountId;
    }
  }

  renderTagSelector();
  renderAllAttachments();
  loadCategorySuggestions(type);
  openModal('transactionModal');
}

async function loadCategorySuggestions(type) {
  const result = await window.api.transactions.getCategories(type);
  if (result.success) {
    const datalist = document.getElementById('categoryList');
    datalist.innerHTML = '';
    result.data.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      datalist.appendChild(option);
    });
  }
}

async function saveTransaction(e) {
  e.preventDefault();

  const id = document.getElementById('transactionId').value;
  const type = document.getElementById('transactionType').value;
  const amount = parseFloat(document.getElementById('transactionAmount').value);
  const date = document.getElementById('transactionDate').value;
  const category = document.getElementById('transactionCategory').value.trim();
  const accountId = parseInt(document.getElementById('transactionAccount').value);
  const note = document.getElementById('transactionNote').value.trim();

  if (!amount || amount <= 0) {
    showToast('请输入有效金额', 'error');
    return;
  }
  if (!date) {
    showToast('请选择日期', 'error');
    return;
  }
  if (!category) {
    showToast('请输入分类', 'error');
    return;
  }
  if (!accountId) {
    showToast('请选择账户', 'error');
    return;
  }

  const transactionData = {
    type,
    amount,
    date: new Date(date).toISOString(),
    category,
    account_id: accountId,
    note
  };

  try {
    let result;
    if (id) {
      result = await window.api.transactions.update(parseInt(id), transactionData, AppState.selectedTagIds);
    } else {
      result = await window.api.transactions.create(transactionData, AppState.selectedTagIds);
    }

    if (result.success) {
      const transactionId = result.data.id;
      
      for (const attId of AppState.attachmentsToDelete) {
        console.log('删除已有附件:', attId);
        const delResult = await window.api.attachments.delete(attId);
        if (!delResult.success) {
          console.error('删除附件失败:', attId, delResult.error);
          showToast(`删除附件失败: ${delResult.error}`, 'error');
        }
      }
      
      for (let i = 0; i < AppState.newAttachments.length; i++) {
        const attachment = AppState.newAttachments[i];
        console.log(`上传附件 ${i + 1}/${AppState.newAttachments.length}:`, attachment.name);
        const attResult = await window.api.attachments.add(transactionId, attachment.path, attachment.name);
        if (!attResult.success) {
          console.error('附件上传失败:', attachment.name, attResult.error);
          showToast(`附件 ${attachment.name} 上传失败: ${attResult.error}`, 'error');
        }
      }

      showToast(id ? '交易更新成功' : '交易创建成功', 'success');
      closeModal('transactionModal');
      loadTransactions();
      loadAccounts();
      loadSummary();
      loadCategorySuggestions(type);
    } else {
      showToast('保存失败: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('保存交易错误:', error);
    showToast('保存失败: ' + error.message, 'error');
  }
}

async function viewTransaction(id) {
  const transaction = AppState.transactions.find(t => t.id === id);
  if (!transaction) return;

  const account = AppState.accounts.find(a => a.id === transaction.account_id);
  
  const tagsHtml = (transaction.tags || [])
    .map(tag => `<span class="transaction-tag" style="background: ${tag.color}">${escapeHtml(tag.name)}</span>`)
    .join('');

  const attachmentsHtml = (transaction.attachments || []).map(att => `
    <div class="attachment-item">
      <span class="attachment-name" onclick="openAttachment('${escapeHtml(att.file_path)}')">📎 ${escapeHtml(att.original_name)}</span>
    </div>
  `).join('');

  const content = document.getElementById('transactionDetailContent');
  content.innerHTML = `
    <div class="detail-row">
      <span class="detail-label">类型</span>
      <span class="detail-value ${transaction.type}">
        <span class="type-badge ${transaction.type}">${transaction.type === 'income' ? '收入' : '支出'}</span>
      </span>
    </div>
    <div class="detail-row">
      <span class="detail-label">金额</span>
      <span class="detail-value ${transaction.type}">${formatCurrency(transaction.amount)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">日期</span>
      <span class="detail-value">${formatDate(transaction.date)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">分类</span>
      <span class="detail-value">${escapeHtml(transaction.category)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">账户</span>
      <span class="detail-value">${escapeHtml(account?.name || '未知')}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">标签</span>
      <span class="detail-value"><div class="transaction-tags">${tagsHtml || '无'}</div></span>
    </div>
    <div class="detail-row">
      <span class="detail-label">备注</span>
      <span class="detail-value">${escapeHtml(transaction.note) || '无'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">附件</span>
      <span class="detail-value">${attachmentsHtml || '无'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">创建时间</span>
      <span class="detail-value">${formatDate(transaction.created_at)}</span>
    </div>
  `;

  document.getElementById('editTransactionBtn').onclick = () => {
    closeModal('transactionDetailModal');
    openTransactionModal(transaction.type, transaction);
  };

  document.getElementById('deleteTransactionBtn').onclick = () => {
    deleteTransaction(id);
  };

  openModal('transactionDetailModal');
}

async function deleteTransaction(id) {
  if (!confirm('确定要删除这条交易记录吗？')) return;

  const result = await window.api.transactions.delete(id);
  if (result.success) {
    showToast('交易删除成功', 'success');
    closeModal('transactionDetailModal');
    loadTransactions();
    loadAccounts();
    loadSummary();
  } else {
    showToast('删除失败: ' + result.error, 'error');
  }
}

async function openAttachment(filePath) {
  await window.api.attachments.openFile(filePath);
}

async function addAttachment() {
  try {
    const result = await window.api.dialog.openFile({
      properties: ['openFile', 'multiSelections']
    });
    console.log('选择文件结果:', result);

    if (result.success && result.data && !result.data.canceled && result.data.filePaths && result.data.filePaths.length > 0) {
      for (const filePath of result.data.filePaths) {
        const name = filePath.split(/[\\/]/).pop();
        AppState.newAttachments.push({ path: filePath, name });
        console.log('添加附件:', name, filePath);
      }
      renderAllAttachments();
      showToast(`成功添加 ${result.data.filePaths.length} 个附件`, 'success');
    } else if (result.data && result.data.canceled) {
      console.log('用户取消了文件选择');
    } else {
      showToast('选择文件失败', 'error');
    }
  } catch (error) {
    console.error('添加附件错误:', error);
    showToast('添加附件失败: ' + error.message, 'error');
  }
}

function renderAllAttachments() {
  const list = document.getElementById('attachmentsList');
  list.innerHTML = '';

  AppState.existingAttachments.forEach((att, index) => {
    const isDeleted = AppState.attachmentsToDelete.includes(att.id);
    const item = document.createElement('div');
    item.className = 'attachment-item';
    if (isDeleted) {
      item.style.opacity = '0.5';
      item.style.textDecoration = 'line-through';
    }
    item.innerHTML = `
      <span class="attachment-name" title="已有附件">📎 ${escapeHtml(att.original_name)}</span>
      <button class="attachment-remove" onclick="toggleExistingAttachment(${att.id})">${isDeleted ? '↩' : '×'}</button>
    `;
    list.appendChild(item);
  });

  AppState.newAttachments.forEach((att, index) => {
    const item = document.createElement('div');
    item.className = 'attachment-item';
    item.innerHTML = `
      <span class="attachment-name" title="新添加的附件">📎 ${escapeHtml(att.name)}</span>
      <button class="attachment-remove" onclick="removeNewAttachment(${index})">×</button>
    `;
    list.appendChild(item);
  });
}

function toggleExistingAttachment(attId) {
  const idx = AppState.attachmentsToDelete.indexOf(attId);
  if (idx > -1) {
    AppState.attachmentsToDelete.splice(idx, 1);
  } else {
    AppState.attachmentsToDelete.push(attId);
  }
  renderAllAttachments();
}

function removeNewAttachment(index) {
  AppState.newAttachments.splice(index, 1);
  renderAllAttachments();
}

function applyFilters() {
  AppState.filters.type = document.getElementById('filterType').value;
  AppState.filters.category = document.getElementById('filterCategory').value;
  AppState.filters.start_date = document.getElementById('filterStartDate').value;
  AppState.filters.end_date = document.getElementById('filterEndDate').value;
  AppState.filters.sort_by = document.getElementById('sortBy').value;
  AppState.filters.sort_order = document.getElementById('sortOrder').value;
  loadTransactions();
}

function resetFilters() {
  document.getElementById('filterType').value = '';
  document.getElementById('filterCategory').value = '';
  document.getElementById('filterStartDate').value = '';
  document.getElementById('filterEndDate').value = '';
  document.getElementById('sortBy').value = 'date';
  document.getElementById('sortOrder').value = 'desc';
  
  AppState.filters = {
    type: '',
    category: '',
    start_date: '',
    end_date: '',
    sort_by: 'date',
    sort_order: 'desc'
  };
  
  delete AppState.filters.tag_id;
  loadTransactions();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadBudgetProgress() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const result = await window.api.budgets.getProgress(year, month);
  if (result.success) {
    AppState.budgetProgress = result.data;
    renderBudgetSidebar();
  }
}

function renderBudgetSidebar() {
  const progress = AppState.budgetProgress;
  if (!progress || !progress.budget) {
    document.getElementById('budgetTotalAmount').textContent = '未设置';
    document.getElementById('budgetTotalSpent').textContent = '¥0.00';
    document.getElementById('budgetTotalProgressFill').style.width = '0%';
    document.getElementById('budgetTotalProgressFill').className = 'budget-progress-fill';
    document.getElementById('budgetTotalProgressText').textContent = '0%';
    document.getElementById('budgetCategoryList').innerHTML = '<p class="budget-empty">点击 ✎ 设置预算</p>';
    return;
  }

  const budget = progress.budget;
  document.getElementById('budgetTotalAmount').textContent = formatCurrency(budget.total_amount);
  document.getElementById('budgetTotalSpent').textContent = formatCurrency(progress.total_spent);

  const pct = progress.total_percentage;
  const fill = document.getElementById('budgetTotalProgressFill');
  fill.style.width = Math.min(pct, 100) + '%';
  fill.className = 'budget-progress-fill';
  if (progress.total_warning_level === 'red') {
    fill.classList.add('budget-danger');
  } else if (progress.total_warning_level === 'yellow') {
    fill.classList.add('budget-warning');
  }
  document.getElementById('budgetTotalProgressText').textContent = pct + '%';

  const catList = document.getElementById('budgetCategoryList');
  catList.innerHTML = '';
  (progress.category_progress || []).forEach(cp => {
    const item = document.createElement('div');
    item.className = 'budget-category-item';
    const barClass = cp.warning_level === 'red' ? 'budget-danger' : cp.warning_level === 'yellow' ? 'budget-warning' : '';
    item.innerHTML = `
      <div class="budget-cat-header">
        <span class="budget-cat-name">${escapeHtml(cp.category)}</span>
        <span class="budget-cat-amount">${formatCurrency(cp.spent)} / ${formatCurrency(cp.budget_amount)}</span>
      </div>
      <div class="budget-progress-container">
        <div class="budget-progress-bar budget-progress-bar-sm">
          <div class="budget-progress-fill ${barClass}" style="width: ${Math.min(cp.percentage, 100)}%"></div>
        </div>
        <span class="budget-progress-text">${cp.percentage}%</span>
      </div>
    `;
    catList.appendChild(item);
  });
}

function openBudgetModal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  document.getElementById('budgetYear').value = year;
  document.getElementById('budgetMonth').value = month;
  document.getElementById('budgetId').value = '';

  AppState.budgetCategoryBudgets = [];

  const progress = AppState.budgetProgress;
  if (progress && progress.budget) {
    document.getElementById('budgetId').value = progress.budget.id;
    document.getElementById('budgetTotalAmountInput').value = progress.budget.total_amount;
    if (progress.budget.category_budgets) {
      AppState.budgetCategoryBudgets = progress.budget.category_budgets.map(cb => ({
        category: cb.category,
        amount: parseFloat(cb.amount)
      }));
    }
  } else {
    document.getElementById('budgetTotalAmountInput').value = 0;
  }

  renderCategoryBudgetList();
  openModal('budgetModal');
}

function renderCategoryBudgetList() {
  const list = document.getElementById('categoryBudgetList');
  list.innerHTML = '';

  AppState.budgetCategoryBudgets.forEach((cb, idx) => {
    const row = document.createElement('div');
    row.className = 'category-budget-row';
    row.innerHTML = `
      <span class="cb-name">${escapeHtml(cb.category)}</span>
      <span class="cb-amount">${formatCurrency(cb.amount)}</span>
      <button type="button" class="cb-remove" onclick="removeCategoryBudget(${idx})">×</button>
    `;
    list.appendChild(row);
  });
}

function removeCategoryBudget(idx) {
  AppState.budgetCategoryBudgets.splice(idx, 1);
  renderCategoryBudgetList();
}

async function saveBudget(e) {
  e.preventDefault();

  const id = document.getElementById('budgetId').value;
  const year = parseInt(document.getElementById('budgetYear').value);
  const month = parseInt(document.getElementById('budgetMonth').value);
  const totalAmount = parseFloat(document.getElementById('budgetTotalAmountInput').value) || 0;

  if (!year || !month) {
    showToast('请选择年月', 'error');
    return;
  }

  const budgetData = {
    year,
    month,
    total_amount: totalAmount,
    category_budgets: AppState.budgetCategoryBudgets
  };

  let result;
  if (id) {
    result = await window.api.budgets.update(parseInt(id), budgetData);
  } else {
    result = await window.api.budgets.create(budgetData);
  }

  if (result.success) {
    showToast(id ? '预算更新成功' : '预算创建成功', 'success');
    closeModal('budgetModal');
    loadBudgetProgress();
  } else {
    showToast('保存失败: ' + result.error, 'error');
  }
}

function openImportModal() {
  AppState.importState = {
    filePath: null,
    parsedData: null,
    fieldMapping: {},
    mappedRows: [],
    duplicateInfo: null
  };

  document.getElementById('importFileName').textContent = '未选择文件';
  document.getElementById('importNextStep1Btn').disabled = true;
  document.getElementById('importStep1').style.display = '';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = 'none';

  const importAccountSelect = document.getElementById('importAccount');
  importAccountSelect.innerHTML = '';
  AppState.accounts.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    importAccountSelect.appendChild(opt);
  });
  if (AppState.currentAccountId) {
    importAccountSelect.value = AppState.currentAccountId;
  }

  openModal('importModal');
}

async function importSelectFile() {
  const result = await window.api.dialog.openFile({
    properties: ['openFile'],
    filters: [{ name: '账单文件', extensions: ['csv', 'qif'] }]
  });

  if (result.success && result.data && !result.data.canceled && result.data.filePaths.length > 0) {
    const filePath = result.data.filePaths[0];
    AppState.importState.filePath = filePath;
    document.getElementById('importFileName').textContent = filePath.split(/[\\/]/).pop();
    document.getElementById('importNextStep1Btn').disabled = false;
  }
}

async function importGoToStep2() {
  if (!AppState.importState.filePath) return;

  const parseResult = await window.api.importApi.parseFile(AppState.importState.filePath, {});
  if (!parseResult.success) {
    showToast('解析文件失败: ' + parseResult.error, 'error');
    return;
  }

  AppState.importState.parsedData = parseResult.data;
  AppState.importState.fieldMapping = {};

  const systemFields = [
    { value: '', label: '-- 不映射 --' },
    { value: 'date', label: '日期' },
    { value: 'type', label: '类型(收入/支出)' },
    { value: 'amount', label: '金额' },
    { value: 'category', label: '分类' },
    { value: 'note', label: '备注' }
  ];

  const mappingContainer = document.getElementById('importFieldMapping');
  mappingContainer.innerHTML = '';

  const headers = parseResult.data.headers || [];
  headers.forEach(header => {
    const row = document.createElement('div');
    row.className = 'field-mapping-row';

    const label = document.createElement('span');
    label.className = 'fm-source';
    label.textContent = header;

    const arrow = document.createElement('span');
    arrow.textContent = '→';

    const select = document.createElement('select');
    select.className = 'fm-target';
    systemFields.forEach(sf => {
      const opt = document.createElement('option');
      opt.value = sf.value;
      opt.textContent = sf.label;
      select.appendChild(opt);
    });

    const lowerHeader = header.toLowerCase();
    if (lowerHeader.includes('date') || lowerHeader.includes('日期')) select.value = 'date';
    else if (lowerHeader.includes('amount') || lowerHeader.includes('金额')) select.value = 'amount';
    else if (lowerHeader.includes('type') || lowerHeader.includes('类型')) select.value = 'type';
    else if (lowerHeader.includes('categor') || lowerHeader.includes('分类')) select.value = 'category';
    else if (lowerHeader.includes('note') || lowerHeader.includes('memo') || lowerHeader.includes('备注')) select.value = 'note';

    AppState.importState.fieldMapping[header] = select.value;

    select.onchange = () => {
      AppState.importState.fieldMapping[header] = select.value;
    };

    row.appendChild(label);
    row.appendChild(arrow);
    row.appendChild(select);
    mappingContainer.appendChild(row);
  });

  document.getElementById('importStep1').style.display = 'none';
  document.getElementById('importStep2').style.display = '';
}

async function importGoToStep3() {
  const rows = AppState.importState.parsedData.rows || [];
  const fieldMapping = AppState.importState.fieldMapping;

  const mapResult = await window.api.importApi.mapFields(rows, fieldMapping);
  if (!mapResult.success) {
    showToast('字段映射失败: ' + mapResult.error, 'error');
    return;
  }

  AppState.importState.mappedRows = mapResult.data;

  const dupResult = await window.api.importApi.detectDuplicates(mapResult.data);
  if (dupResult.success) {
    AppState.importState.duplicateInfo = dupResult.data;
  }

  const dupInfo = document.getElementById('importDuplicateInfo');
  if (AppState.importState.duplicateInfo) {
    const d = AppState.importState.duplicateInfo;
    dupInfo.innerHTML = `<span class="dup-info">共 ${d.unique.length + d.duplicates.length} 条记录，检测到 ${d.duplicates.length} 条重复，将导入 ${d.unique.length} 条新记录</span>`;
  }

  const previewRows = AppState.importState.duplicateInfo
    ? AppState.importState.duplicateInfo.unique
    : AppState.importState.mappedRows;

  const thead = document.getElementById('importPreviewHead');
  const tbody = document.getElementById('importPreviewBody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const previewHeaders = ['日期', '类型', '金额', '分类', '备注'];
  const headerRow = document.createElement('tr');
  previewHeaders.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const displayRows = previewRows.slice(0, 20);
  displayRows.forEach(row => {
    const tr = document.createElement('tr');
    const typeLabel = row.type === 'income' ? '收入' : '支出';
    tr.innerHTML = `
      <td>${escapeHtml(row.date || '')}</td>
      <td>${typeLabel}</td>
      <td>${row.amount || 0}</td>
      <td>${escapeHtml(row.category || '')}</td>
      <td>${escapeHtml(row.note || '')}</td>
    `;
    tbody.appendChild(tr);
  });

  if (previewRows.length > 20) {
    const moreRow = document.createElement('tr');
    const moreCell = document.createElement('td');
    moreCell.colSpan = 5;
    moreCell.style.textAlign = 'center';
    moreCell.style.color = '#999';
    moreCell.textContent = `还有 ${previewRows.length - 20} 条记录...`;
    moreRow.appendChild(moreCell);
    tbody.appendChild(moreRow);
  }

  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = '';
}

async function importConfirm() {
  const accountId = document.getElementById('importAccount').value;
  if (!accountId) {
    showToast('请选择导入账户', 'error');
    return;
  }

  const rowsToImport = AppState.importState.duplicateInfo
    ? AppState.importState.duplicateInfo.unique
    : AppState.importState.mappedRows;

  if (rowsToImport.length === 0) {
    showToast('没有可导入的记录', 'error');
    return;
  }

  const result = await window.api.importApi.confirmImport(rowsToImport, accountId);
  if (result.success) {
    showToast(`成功导入 ${result.data.imported} 条记录`, 'success');
    closeModal('importModal');
    loadTransactions();
    loadAccounts();
    loadSummary();
    loadBudgetProgress();
  } else {
    showToast('导入失败: ' + result.error, 'error');
  }
}

function openExportModal() {
  const accountSelect = document.getElementById('exportAccount');
  accountSelect.innerHTML = '<option value="">全部账户</option>';
  AppState.accounts.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    accountSelect.appendChild(opt);
  });

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  document.getElementById('exportStartDate').value = firstDay;
  document.getElementById('exportEndDate').value = lastDay;
  document.getElementById('exportFormat').value = 'xlsx';

  loadExportCategories();

  openModal('exportModal');
}

async function loadExportCategories() {
  const result = await window.api.transactions.getCategories('');
  if (result.success) {
    const select = document.getElementById('exportCategory');
    const currentVal = select.value;
    select.innerHTML = '<option value="">全部分类</option>';
    result.data.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  }
}

async function handleExport(e) {
  e.preventDefault();

  const format = document.getElementById('exportFormat').value;
  const filters = {
    start_date: document.getElementById('exportStartDate').value || '',
    end_date: document.getElementById('exportEndDate').value || '',
    account_id: document.getElementById('exportAccount').value || '',
    category: document.getElementById('exportCategory').value || '',
    type: document.getElementById('exportType').value || '',
    include_accounts: document.getElementById('exportIncludeAccounts').checked,
    include_budgets: document.getElementById('exportIncludeBudgets').checked
  };

  const extensions = { xlsx: 'xlsx', csv: 'csv', pdf: 'pdf' };
  const result = await window.api.dialog.showSaveDialog({
    defaultPath: `财务数据导出.${extensions[format]}`,
    filters: [{ name: format.toUpperCase(), extensions: [extensions[format]] }]
  });

  if (!result.success || !result.data || result.data.canceled) return;

  const exportResult = await window.api.exportApi.generate(format, filters, result.data.filePath);
  if (exportResult.success) {
    showToast('导出成功', 'success');
    closeModal('exportModal');
  } else {
    showToast('导出失败: ' + exportResult.error, 'error');
  }
}

function initEventListeners() {
  document.getElementById('addAccountBtn').onclick = () => openAccountModal();
  document.getElementById('addTagBtn').onclick = openTagModal;
  document.getElementById('addIncomeBtn').onclick = () => openTransactionModal('income');
  document.getElementById('addExpenseBtn').onclick = () => openTransactionModal('expense');
  document.getElementById('emptyAddExpenseBtn').onclick = () => openTransactionModal('expense');
  
  document.getElementById('accountForm').onsubmit = saveAccount;
  document.getElementById('transactionForm').onsubmit = saveTransaction;
  document.getElementById('tagForm').onsubmit = saveTag;
  document.getElementById('budgetForm').onsubmit = saveBudget;
  document.getElementById('exportForm').onsubmit = handleExport;

  document.getElementById('addAttachmentBtn').onclick = addAttachment;
  
  document.getElementById('addTagInlineBtn').onclick = async () => {
    const input = document.getElementById('newTagInput');
    const name = input.value.trim();
    if (name) {
      const tag = await addTag(name);
      if (tag) {
        AppState.selectedTagIds.push(tag.id);
        renderTagSelector();
      }
      input.value = '';
    }
  };

  document.getElementById('transactionType').onchange = (e) => {
    loadCategorySuggestions(e.target.value);
  };

  document.getElementById('filterType').onchange = applyFilters;
  document.getElementById('filterCategory').onchange = applyFilters;
  document.getElementById('filterStartDate').onchange = applyFilters;
  document.getElementById('filterEndDate').onchange = applyFilters;
  document.getElementById('sortBy').onchange = applyFilters;
  document.getElementById('sortOrder').onchange = applyFilters;
  document.getElementById('resetFilterBtn').onclick = resetFilters;

  document.getElementById('editBudgetBtn').onclick = openBudgetModal;
  document.getElementById('openImportBtn').onclick = openImportModal;
  document.getElementById('openExportBtn').onclick = openExportModal;

  document.getElementById('addCategoryBudgetBtn').onclick = () => {
    const name = document.getElementById('newCategoryName').value.trim();
    const amount = parseFloat(document.getElementById('newCategoryAmount').value) || 0;
    if (name) {
      AppState.budgetCategoryBudgets.push({ category: name, amount });
      document.getElementById('newCategoryName').value = '';
      document.getElementById('newCategoryAmount').value = '';
      renderCategoryBudgetList();
    }
  };

  document.getElementById('importSelectFileBtn').onclick = importSelectFile;
  document.getElementById('importNextStep1Btn').onclick = importGoToStep2;
  document.getElementById('importBackStep2Btn').onclick = () => {
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importStep1').style.display = '';
  };
  document.getElementById('importNextStep2Btn').onclick = importGoToStep3;
  document.getElementById('importBackStep3Btn').onclick = () => {
    document.getElementById('importStep3').style.display = 'none';
    document.getElementById('importStep2').style.display = '';
  };
  document.getElementById('importConfirmBtn').onclick = importConfirm;

  document.querySelectorAll('.close-btn, [data-modal]').forEach(btn => {
    btn.onclick = (e) => {
      const modalId = e.target.getAttribute('data-modal') || e.target.closest('[data-modal]')?.getAttribute('data-modal');
      if (modalId) {
        closeModal(modalId);
      }
    };
  });

  document.querySelectorAll('.modal').forEach(modal => {
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    };
  });
}

async function init() {
  initEventListeners();
  await Promise.all([
    loadAccounts(),
    loadTags()
  ]);
  loadTransactions();
  loadSummary();
  loadBudgetProgress();
}

window.onload = init;
