const AppState = {
  accounts: [],
  currentAccountId: null,
  transactions: [],
  tags: [],
  selectedTagIds: [],
  newAttachments: [],
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
  renderNewAttachments();
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

  let result;
  if (id) {
    result = await window.api.transactions.update(parseInt(id), transactionData, AppState.selectedTagIds);
  } else {
    result = await window.api.transactions.create(transactionData, AppState.selectedTagIds);
  }

  if (result.success) {
    const transactionId = result.data.id;
    
    for (const attachment of AppState.newAttachments) {
      await window.api.attachments.add(transactionId, attachment.path, attachment.name);
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
  const result = await window.api.dialog.openFile({
    properties: ['openFile', 'multiSelections']
  });

  if (result.success && result.data && !result.data.canceled && result.data.filePaths) {
    const fs = require ? null : null;
    for (const filePath of result.data.filePaths) {
      const name = filePath.split(/[\\/]/).pop();
      AppState.newAttachments.push({ path: filePath, name });
    }
    renderNewAttachments();
  }
}

function renderNewAttachments() {
  const list = document.getElementById('attachmentsList');
  list.innerHTML = '';

  AppState.newAttachments.forEach((att, index) => {
    const item = document.createElement('div');
    item.className = 'attachment-item';
    item.innerHTML = `
      <span class="attachment-name">📎 ${escapeHtml(att.name)}</span>
      <button class="attachment-remove" onclick="removeNewAttachment(${index})">×</button>
    `;
    list.appendChild(item);
  });
}

function removeNewAttachment(index) {
  AppState.newAttachments.splice(index, 1);
  renderNewAttachments();
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

function initEventListeners() {
  document.getElementById('addAccountBtn').onclick = () => openAccountModal();
  document.getElementById('addTagBtn').onclick = openTagModal;
  document.getElementById('addIncomeBtn').onclick = () => openTransactionModal('income');
  document.getElementById('addExpenseBtn').onclick = () => openTransactionModal('expense');
  document.getElementById('emptyAddExpenseBtn').onclick = () => openTransactionModal('expense');
  
  document.getElementById('accountForm').onsubmit = saveAccount;
  document.getElementById('transactionForm').onsubmit = saveTransaction;
  document.getElementById('tagForm').onsubmit = saveTag;

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
}

window.onload = init;
