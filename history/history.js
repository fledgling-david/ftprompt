/**
 * history.js - 历史记录页面逻辑
 * 展示、搜索、管理历史记录
 */

const PAGE_SIZE = 20;
let allHistory = [];
let filteredHistory = [];
let currentPage = 1;
let currentRecord = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadHistory();
  bindEvents();
});

/**
 * 加载历史记录
 */
async function loadHistory() {
  allHistory = await Storage.getHistory();
  filteredHistory = allHistory;
  currentPage = 1;
  renderHistory();
  updateStats();
}

/**
 * 渲染历史列表
 */
function renderHistory() {
  const container = document.getElementById('historyList');
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageData = filteredHistory.slice(start, end);

  if (pageData.length === 0) {
    container.innerHTML = '<p class="empty-text">暂无记录</p>';
    document.getElementById('pagination').classList.add('hidden');
    return;
  }

  container.innerHTML = pageData.map(record => `
    <div class="history-card" data-id="${record.id}">
      <img class="card-image" src="${escapeHtml(record.imageUrl)}" alt="图片" onerror="this.style.display='none'">
      <div class="card-body">
        <div class="card-model">
          ${escapeHtml(record.modelName || '未知模型')}
          ${record.sentToFeishu ? '<span class="feishu-badge">已发飞书</span>' : ''}
        </div>
        <div class="card-prompt">${escapeHtml(record.chinesePrompt || record.description || '无提示词')}</div>
        <div class="card-footer">
          <span>${formatTime(record.createdAt)}</span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-copy" data-id="${record.id}">复制</button>
            <button class="btn btn-danger btn-delete" data-id="${record.id}">删除</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  // 绑定卡片点击
  container.querySelectorAll('.history-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      const id = card.dataset.id;
      showDetail(id);
    });
  });

  // 绑定复制按钮
  container.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const record = allHistory.find(r => r.id === id);
      if (record) {
        const text = [
          '【中文提示词】', record.chinesePrompt,
          '', '【英文提示词】', record.englishPrompt,
          '', '【Negative Prompt】', record.negativePrompt,
        ].join('\n');
        await navigator.clipboard.writeText(text);
        showToast('已复制', 'success');
      }
    });
  });

  // 绑定删除按钮
  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('确认删除此记录？')) return;
      const id = btn.dataset.id;
      await Storage.deleteHistoryRecord(id);
      showToast('已删除', 'success');
      await loadHistory();
    });
  });

  // 分页
  const totalPages = Math.ceil(filteredHistory.length / PAGE_SIZE);
  const pagination = document.getElementById('pagination');
  if (totalPages > 1) {
    pagination.classList.remove('hidden');
    document.getElementById('pageInfo').textContent = `第 ${currentPage} / ${totalPages} 页`;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage === totalPages;
  } else {
    pagination.classList.add('hidden');
  }
}

/**
 * 更新统计
 */
function updateStats() {
  document.getElementById('totalCount').textContent = `共 ${filteredHistory.length} 条记录`;
}

/**
 * 显示详情
 */
function showDetail(id) {
  currentRecord = allHistory.find(r => r.id === id);
  if (!currentRecord) return;

  const modal = document.getElementById('detailModal');
  const body = document.getElementById('modalBody');

  body.innerHTML = `
    <img class="detail-image" src="${escapeHtml(currentRecord.imageUrl)}" alt="图片" onerror="this.style.display='none'">
    <div class="detail-meta">
      <span>模型: ${escapeHtml(currentRecord.modelName || '未知')}</span>
      <span>时间: ${formatTime(currentRecord.createdAt)}</span>
      <span>飞书: ${currentRecord.sentToFeishu ? '已发送' : '未发送'}</span>
    </div>
    ${currentRecord.sourceUrl ? `
      <div class="detail-section">
        <h4>来源网页</h4>
        <p><a href="${escapeHtml(currentRecord.sourceUrl)}" target="_blank">${escapeHtml(currentRecord.sourceUrl)}</a></p>
      </div>
    ` : ''}
    ${currentRecord.description ? `
      <div class="detail-section">
        <h4>图片描述</h4>
        <p>${escapeHtml(currentRecord.description)}</p>
      </div>
    ` : ''}
    ${currentRecord.styleAnalysis ? `
      <div class="detail-section">
        <h4>风格分析</h4>
        <p>${escapeHtml(currentRecord.styleAnalysis)}</p>
      </div>
    ` : ''}
    ${currentRecord.chinesePrompt ? `
      <div class="detail-section">
        <h4>中文提示词</h4>
        <p>${escapeHtml(currentRecord.chinesePrompt)}</p>
      </div>
    ` : ''}
    ${currentRecord.englishPrompt ? `
      <div class="detail-section">
        <h4>英文提示词</h4>
        <p>${escapeHtml(currentRecord.englishPrompt)}</p>
      </div>
    ` : ''}
    ${currentRecord.negativePrompt ? `
      <div class="detail-section">
        <h4>Negative Prompt</h4>
        <p>${escapeHtml(currentRecord.negativePrompt)}</p>
      </div>
    ` : ''}
    <div class="detail-section">
      <h4>原始返回</h4>
      <p>${escapeHtml(currentRecord.rawText || '无')}</p>
    </div>
  `;

  modal.classList.remove('hidden');
}

/**
 * 绑定事件
 */
function bindEvents() {
  // 搜索
  document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase().trim();
    if (!keyword) {
      filteredHistory = allHistory;
    } else {
      filteredHistory = allHistory.filter(r =>
        (r.chinesePrompt && r.chinesePrompt.toLowerCase().includes(keyword)) ||
        (r.englishPrompt && r.englishPrompt.toLowerCase().includes(keyword)) ||
        (r.description && r.description.toLowerCase().includes(keyword)) ||
        (r.modelName && r.modelName.toLowerCase().includes(keyword))
      );
    }
    currentPage = 1;
    renderHistory();
    updateStats();
  });

  // 导出
  document.getElementById('exportBtn').addEventListener('click', async () => {
    const json = await Storage.exportHistoryJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('导出成功', 'success');
  });

  // 清空
  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (!confirm('确认清空所有历史记录？此操作不可恢复。')) return;
    await Storage.clearHistory();
    showToast('已清空', 'success');
    await loadHistory();
  });

  // 分页
  document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderHistory();
    }
  });

  document.getElementById('nextBtn').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredHistory.length / PAGE_SIZE);
    if (currentPage < totalPages) {
      currentPage++;
      renderHistory();
    }
  });

  // 关闭弹窗
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('detailModal').classList.add('hidden');
  });

  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target.id === 'detailModal') {
      document.getElementById('detailModal').classList.add('hidden');
    }
  });

  // 复制详情
  document.getElementById('copyDetailBtn').addEventListener('click', async () => {
    if (!currentRecord) return;
    const text = [
      '【中文提示词】', currentRecord.chinesePrompt,
      '', '【英文提示词】', currentRecord.englishPrompt,
      '', '【Negative Prompt】', currentRecord.negativePrompt,
      '', '【描述】', currentRecord.description,
      '', '【风格】', currentRecord.styleAnalysis,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    showToast('已复制', 'success');
  });

  // 发送飞书
  document.getElementById('sendFeishuDetailBtn').addEventListener('click', async () => {
    if (!currentRecord) return;
    const btn = document.getElementById('sendFeishuDetailBtn');
    btn.disabled = true;
    btn.textContent = '发送中...';

    const response = await chrome.runtime.sendMessage({
      type: 'SEND_TO_FEISHU',
      record: currentRecord,
    });

    if (response.success) {
      currentRecord.sentToFeishu = true;
      showToast('已发送到飞书', 'success');
      btn.textContent = '已发送';
      await loadHistory();
    } else {
      showToast('发送失败: ' + response.message, 'error');
      btn.textContent = '发送飞书';
      btn.disabled = false;
    }
  });

  // 删除详情
  document.getElementById('deleteDetailBtn').addEventListener('click', async () => {
    if (!currentRecord) return;
    if (!confirm('确认删除此记录？')) return;
    await Storage.deleteHistoryRecord(currentRecord.id);
    document.getElementById('detailModal').classList.add('hidden');
    showToast('已删除', 'success');
    await loadHistory();
  });
}

/**
 * 格式化时间
 */
function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 显示提示
 */
function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
