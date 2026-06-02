/**
 * options.js - 设置页面逻辑
 * 负责：模型管理、提示词模板、飞书配置、历史记录配置
 */

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await loadModels();
  await loadPromptTemplate();
  await loadFeishuConfig();
  await loadHistorySettings();
  bindEvents();
});

// ==================== 标签页切换 ====================

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

// ==================== 模型管理 ====================

let modelConfigs = [];
let activeModelId = null;

// 预设服务商配置
const MODEL_PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini'],
    requestType: 'openai',
    note: '',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-vl-max',
    models: ['qwen-vl-max', 'qwen-vl-plus'],
    requestType: 'openai',
    note: '',
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4v',
    models: ['glm-4v', 'glm-4v-flash'],
    requestType: 'openai',
    note: '',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k-vision',
    models: ['moonshot-v1-8k-vision'],
    requestType: 'openai',
    note: '',
  },
  {
    id: 'doubao',
    name: '豆包 (火山引擎)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
    models: [],
    requestType: 'openai',
    note: '模型名称填写控制台中的 Endpoint ID',
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: '',
    models: [],
    requestType: 'openai',
    note: '模型名称填写平台上托管的视觉模型名',
  },
];

async function loadModels() {
  modelConfigs = await Storage.getModelConfigs();
  const data = await Storage.get('activeModelId');
  activeModelId = data.activeModelId || null;
  renderModelList();
}

function renderModelList() {
  const container = document.getElementById('modelList');

  if (modelConfigs.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">暂无模型配置，请点击"添加模型"</p>';
    return;
  }

  container.innerHTML = modelConfigs.map(model => `
    <div class="model-card ${model.id === activeModelId ? 'active' : ''}">
      <div class="model-info">
        <h4>
          ${escapeHtml(model.name)}
          ${model.id === activeModelId ? '<span class="badge">当前使用</span>' : ''}
        </h4>
        <p>模型: ${escapeHtml(model.model)}</p>
        <p>API: ${escapeHtml(model.baseUrl)}</p>
        <p>类型: ${model.requestType || 'openai'} | 视觉: ${model.vision ? '是' : '否'}</p>
      </div>
      <div class="model-actions">
        ${model.id !== activeModelId ? `<button class="btn btn-secondary btn-sm" data-action="set-active" data-model-id="${model.id}">设为默认</button>` : ''}
        <button class="btn btn-secondary btn-sm" data-action="edit" data-model-id="${model.id}">编辑</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-model-id="${model.id}">删除</button>
      </div>
    </div>
  `).join('');
}

// 事件委托：处理模型列表按钮点击（MV3 禁止 inline event handler）
document.getElementById('modelList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const modelId = btn.dataset.modelId;

  switch (action) {
    case 'edit': {
      const model = modelConfigs.find(m => m.id === modelId);
      if (model) openModelModal(model);
      break;
    }
    case 'delete': {
      if (!confirm('确认删除此模型配置？')) return;
      await Storage.deleteModelConfig(modelId);
      if (activeModelId === modelId) {
        await Storage.set({ activeModelId: '' });
      }
      showToast('模型已删除', 'success');
      await loadModels();
      break;
    }
    case 'set-active': {
      await Storage.setActiveModel(modelId);
      showToast('已设为默认模型', 'success');
      await loadModels();
      break;
    }
  }
});

function openModelModal(model = null, preset = null) {
  const modal = document.getElementById('modelModal');

  if (model) {
    // 编辑模式
    document.getElementById('modalTitle').textContent = '编辑模型';
    document.getElementById('modelId').value = model.id;
    document.getElementById('modelName').value = model.name;
    document.getElementById('modelBaseUrl').value = model.baseUrl;
    document.getElementById('modelApiKey').value = model.apiKey;
    document.getElementById('modelModel').value = model.model;
    document.getElementById('modelType').value = model.requestType || 'openai';
    document.getElementById('modelVision').checked = model.vision !== false;
  } else if (preset) {
    // 快速添加模式
    document.getElementById('modalTitle').textContent = '快速添加 - ' + preset.name;
    document.getElementById('modelId').value = '';
    document.getElementById('modelName').value = preset.name;
    document.getElementById('modelBaseUrl').value = preset.baseUrl;
    document.getElementById('modelApiKey').value = '';
    document.getElementById('modelModel').value = preset.model;
    document.getElementById('modelType').value = preset.requestType || 'openai';
    document.getElementById('modelVision').checked = true;
  } else {
    // 空白添加模式
    document.getElementById('modalTitle').textContent = '添加模型';
    document.getElementById('modelId').value = '';
    document.getElementById('modelName').value = '';
    document.getElementById('modelBaseUrl').value = '';
    document.getElementById('modelApiKey').value = '';
    document.getElementById('modelModel').value = '';
    document.getElementById('modelType').value = 'openai';
    document.getElementById('modelVision').checked = true;
  }

  modal.classList.remove('hidden');
}

// 添加模型
document.getElementById('addModelBtn').addEventListener('click', () => {
  openModelModal();
});

// 快速添加
document.getElementById('quickAddBtn').addEventListener('click', () => {
  const selectValue = document.getElementById('quickAddSelect').value;

  if (!selectValue) {
    showToast('请先选择一个服务商');
    return;
  }

  if (selectValue === 'custom') {
    openModelModal();
    return;
  }

  const preset = MODEL_PRESETS.find(p => p.id === selectValue);
  if (preset) {
    openModelModal(null, preset);
  }
});

// 关闭弹窗
document.getElementById('closeModalBtn').addEventListener('click', () => {
  document.getElementById('modelModal').classList.add('hidden');
});

// 保存模型
document.getElementById('saveModelBtn').addEventListener('click', async () => {
  const id = document.getElementById('modelId').value;
  const config = {
    name: document.getElementById('modelName').value.trim(),
    baseUrl: document.getElementById('modelBaseUrl').value.trim(),
    apiKey: document.getElementById('modelApiKey').value.trim(),
    model: document.getElementById('modelModel').value.trim(),
    requestType: document.getElementById('modelType').value,
    vision: document.getElementById('modelVision').checked,
  };

  if (!config.name || !config.baseUrl || !config.apiKey || !config.model) {
    showToast('请填写所有必填字段', 'error');
    return;
  }

  if (id) {
    await Storage.updateModelConfig(id, config);
    showToast('模型已更新', 'success');
  } else {
    const newConfig = await Storage.addModelConfig(config);
    // 如果是第一个模型，自动设为默认
    const configs = await Storage.getModelConfigs();
    if (configs.length === 1) {
      await Storage.setActiveModel(newConfig.id);
    }
    showToast('模型已添加', 'success');
  }

  document.getElementById('modelModal').classList.add('hidden');
  await loadModels();
});

// 测试模型
document.getElementById('testModelBtn').addEventListener('click', async () => {
  const config = {
    baseUrl: document.getElementById('modelBaseUrl').value.trim(),
    apiKey: document.getElementById('modelApiKey').value.trim(),
    model: document.getElementById('modelModel').value.trim(),
    requestType: document.getElementById('modelType').value,
  };

  if (!config.baseUrl || !config.apiKey || !config.model) {
    showToast('请先填写完整配置', 'error');
    return;
  }

  showToast('正在测试连接...');

  const response = await chrome.runtime.sendMessage({
    type: 'TEST_MODEL',
    modelConfig: config,
  });

  if (response.success) {
    showToast('连接成功！', 'success');
  } else {
    showToast('连接失败: ' + response.message, 'error');
  }
});

// ==================== 提示词模板 ====================

async function loadPromptTemplate() {
  const template = await Storage.getPromptTemplate();
  document.getElementById('systemPrompt').value = template.systemPrompt;
  document.getElementById('userPrompt').value = template.userPrompt;
}

document.getElementById('savePromptBtn').addEventListener('click', async () => {
  const systemPrompt = document.getElementById('systemPrompt').value;
  const userPrompt = document.getElementById('userPrompt').value;
  await Storage.savePromptTemplate(systemPrompt, userPrompt);
  showToast('提示词模板已保存', 'success');
});

document.getElementById('resetPromptBtn').addEventListener('click', async () => {
  document.getElementById('systemPrompt').value = Storage.DEFAULT_PROMPT_TEMPLATE;
  document.getElementById('userPrompt').value = Storage.DEFAULT_USER_PROMPT;
  showToast('已恢复默认模板');
});

// ==================== 飞书多维表格配置 ====================

async function loadFeishuConfig() {
  const config = await Storage.getFeishuConfig();
  document.getElementById('feishuEnabled').checked = config.enabled;
  document.getElementById('feishuAppId').value = config.appId || '';
  document.getElementById('feishuAppSecret').value = config.appSecret || '';
  document.getElementById('feishuAppToken').value = config.appToken || '';
  document.getElementById('feishuTableId').value = config.tableId || '';
  document.getElementById('feishuUploadImage').checked = config.uploadImage === true;
}

document.getElementById('saveFeishuBtn').addEventListener('click', async () => {
  const config = {
    enabled: document.getElementById('feishuEnabled').checked,
    appId: document.getElementById('feishuAppId').value.trim(),
    appSecret: document.getElementById('feishuAppSecret').value.trim(),
    appToken: document.getElementById('feishuAppToken').value.trim(),
    tableId: document.getElementById('feishuTableId').value.trim(),
    uploadImage: document.getElementById('feishuUploadImage').checked,
  };
  await Storage.saveFeishuConfig(config);
  showToast('飞书配置已保存', 'success');
});

document.getElementById('testFeishuBtn').addEventListener('click', async () => {
  const config = {
    appId: document.getElementById('feishuAppId').value.trim(),
    appSecret: document.getElementById('feishuAppSecret').value.trim(),
    appToken: document.getElementById('feishuAppToken').value.trim(),
    tableId: document.getElementById('feishuTableId').value.trim(),
  };

  if (!config.appId || !config.appSecret) {
    showToast('请先填写 App ID 和 App Secret', 'error');
    return;
  }

  showToast('正在测试连接...');

  const response = await chrome.runtime.sendMessage({
    type: 'TEST_FEISHU',
    config,
  });

  if (response.success) {
    showToast(response.message, 'success');
  } else {
    showToast('测试失败: ' + response.message, 'error');
  }
});

document.getElementById('testWriteBtn').addEventListener('click', async () => {
  const config = {
    enabled: true,
    appId: document.getElementById('feishuAppId').value.trim(),
    appSecret: document.getElementById('feishuAppSecret').value.trim(),
    appToken: document.getElementById('feishuAppToken').value.trim(),
    tableId: document.getElementById('feishuTableId').value.trim(),
    uploadImage: document.getElementById('feishuUploadImage').checked,
  };

  if (!config.appId || !config.appSecret || !config.appToken || !config.tableId) {
    showToast('请先填写完整配置', 'error');
    return;
  }

  showToast('正在测试写入...');

  const response = await chrome.runtime.sendMessage({
    type: 'TEST_FEISHU_WRITE',
    config,
  });

  if (response.success) {
    showToast('写入成功！请检查多维表格是否新增了测试记录', 'success');
  } else {
    showToast('写入失败: ' + response.message, 'error');
  }
});

// ==================== 历史记录配置 ====================

async function loadHistorySettings() {
  const settings = await Storage.getHistorySettings();
  document.getElementById('historyEnabled').checked = settings.enabled;
  document.getElementById('historyMaxCount').value = settings.maxCount;
}

document.getElementById('saveHistoryBtn').addEventListener('click', async () => {
  const enabled = document.getElementById('historyEnabled').checked;
  const maxCount = parseInt(document.getElementById('historyMaxCount').value);
  await Storage.saveHistorySettings(enabled, maxCount);
  showToast('历史记录配置已保存', 'success');
});

document.getElementById('viewHistoryBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
});

document.getElementById('exportHistoryBtn').addEventListener('click', async () => {
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

document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
  if (!confirm('确认清空所有历史记录？此操作不可恢复。')) return;
  await Storage.clearHistory();
  showToast('历史记录已清空', 'success');
});

// ==================== 通用事件 ====================

function bindEvents() {
  // 点击弹窗外部关闭
  document.getElementById('modelModal').addEventListener('click', (e) => {
    if (e.target.id === 'modelModal') {
      document.getElementById('modelModal').classList.add('hidden');
    }
  });
}

// ==================== 工具函数 ====================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
