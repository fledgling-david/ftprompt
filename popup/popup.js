/**
 * popup.js - Popup 页面逻辑
 * 显示当前模型、快捷入口、最近记录
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadActiveModel();
  await loadRecentHistory();
  bindEvents();
});

/**
 * 加载当前启用的模型
 */
async function loadActiveModel() {
  const model = await Storage.getActiveModel();
  const el = document.getElementById('activeModel');

  if (model) {
    el.textContent = model.name + ' (' + model.model + ')';
  } else {
    el.textContent = '未配置';
    el.style.color = '#ef4444';
  }
}

/**
 * 加载最近 5 条历史记录
 */
async function loadRecentHistory() {
  const history = await Storage.getHistory();
  const container = document.getElementById('recentList');

  if (history.length === 0) {
    container.innerHTML = '<p class="empty-text">暂无记录</p>';
    return;
  }

  const recent = history.slice(0, 5);
  container.innerHTML = recent.map(record => `
    <div class="recent-item" data-id="${record.id}">
      <img class="recent-thumb" src="${escapeHtml(record.imageUrl)}" alt="缩略图" onerror="this.style.display='none'">
      <div class="recent-info">
        <p><strong>${escapeHtml(record.modelName || '未知模型')}</strong></p>
        <p>${escapeHtml(record.chinesePrompt || record.description || '无提示词')}</p>
        <p class="time">${formatTime(record.createdAt)}</p>
      </div>
    </div>
  `).join('');

  // 点击记录复制到剪贴板
  container.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const record = history.find(r => r.id === id);
      if (record) {
        const text = [
          '【中文提示词】',
          record.chinesePrompt,
          '',
          '【英文提示词】',
          record.englishPrompt,
        ].join('\n');
        navigator.clipboard.writeText(text).then(() => {
          showToast('已复制到剪贴板');
        });
      }
    });
  });
}

/**
 * 绑定按钮事件
 */
function bindEvents() {
  // 选择图片反推 - 进入选图模式
  document.getElementById('selectImageBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // 发送消息到 content script 进入选图模式
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'ENTER_PICKER_MODE' });
    } catch (e) {
      // 如果 content script 未加载，先注入
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'ENTER_PICKER_MODE' });
    }

    // 关闭 popup
    window.close();
  });

  // 打开设置
  document.getElementById('openSettingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 打开历史记录页面
  document.getElementById('openHistoryBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
  });
}

/**
 * 格式化时间
 */
function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: #333;
    color: #fff;
    border-radius: 6px;
    font-size: 12px;
    z-index: 1000;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
