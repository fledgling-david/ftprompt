/**
 * storage.js - Chrome Storage 封装
 * 负责所有与 chrome.storage.local 相关的读写操作
 * 包括：模型配置、飞书配置、历史记录、提示词模板、插件设置
 */

const Storage = {
  // ==================== 默认值 ====================

  DEFAULT_PROMPT_TEMPLATE: `你是一名专业 AI 绘图提示词分析师，请根据用户提供的图片，反推出适合 AI 绘图的高质量提示词。请从以下角度分析：

1. 主体内容
2. 画面构图
3. 色彩风格
4. 光影氛围
5. 画风类型
6. 细节元素
7. 材质质感
8. 镜头语言
9. 可用于 AI 绘图的中文提示词
10. 可用于 AI 绘图的英文提示词
11. Negative Prompt

请尽量输出结构化内容，方便用户复制使用。请按以下格式输出：

## 图片内容描述
（描述图片的主体内容）

## 风格分析
（分析画风、色彩、光影等）

## 中文提示词
（给出适合 Midjourney/即梦/可灵 等平台使用的中文提示词）

## 英文提示词
（给出适合 Midjourney/Stable Diffusion/DALL·E 等平台使用的英文提示词）

## Negative Prompt
（给出负面提示词）`,

  DEFAULT_USER_PROMPT: '请根据这张图片反推提示词。',

  // ==================== 通用读写 ====================

  /**
   * 获取存储数据
   * @param {string|string[]|null} keys - 要获取的键名
   * @returns {Promise<object>}
   */
  async get(keys) {
    return chrome.storage.local.get(keys);
  },

  /**
   * 设置存储数据
   * @param {object} data - 要设置的键值对
   * @returns {Promise<void>}
   */
  async set(data) {
    return chrome.storage.local.set(data);
  },

  /**
   * 删除存储数据
   * @param {string|string[]} keys
   * @returns {Promise<void>}
   */
  async remove(keys) {
    return chrome.storage.local.remove(keys);
  },

  // ==================== 模型配置 ====================

  /**
   * 获取所有模型配置列表
   * @returns {Promise<Array>}
   */
  async getModelConfigs() {
    const data = await this.get('modelConfigs');
    return data.modelConfigs || [];
  },

  /**
   * 保存模型配置列表
   * @param {Array} configs
   */
  async saveModelConfigs(configs) {
    await this.set({ modelConfigs: configs });
  },

  /**
   * 添加单个模型配置
   * @param {object} config
   */
  async addModelConfig(config) {
    const configs = await this.getModelConfigs();
    config.id = config.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    configs.push(config);
    await this.saveModelConfigs(configs);
    return config;
  },

  /**
   * 更新单个模型配置
   * @param {string} id
   * @param {object} updates
   */
  async updateModelConfig(id, updates) {
    const configs = await this.getModelConfigs();
    const idx = configs.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('未找到该模型配置');
    configs[idx] = { ...configs[idx], ...updates };
    await this.saveModelConfigs(configs);
    return configs[idx];
  },

  /**
   * 删除单个模型配置
   * @param {string} id
   */
  async deleteModelConfig(id) {
    let configs = await this.getModelConfigs();
    configs = configs.filter(c => c.id !== id);
    await this.saveModelConfigs(configs);
  },

  /**
   * 获取当前启用的默认模型
   * @returns {Promise<object|null>}
   */
  async getActiveModel() {
    const data = await this.get('activeModelId');
    const activeId = data.activeModelId;
    if (!activeId) return null;
    const configs = await this.getModelConfigs();
    return configs.find(c => c.id === activeId) || null;
  },

  /**
   * 设置默认启用的模型
   * @param {string} id
   */
  async setActiveModel(id) {
    await this.set({ activeModelId: id });
  },

  // ==================== 提示词模板 ====================

  /**
   * 获取提示词模板
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async getPromptTemplate() {
    const data = await this.get(['systemPrompt', 'userPrompt']);
    return {
      systemPrompt: data.systemPrompt || this.DEFAULT_PROMPT_TEMPLATE,
      userPrompt: data.userPrompt || this.DEFAULT_USER_PROMPT,
    };
  },

  /**
   * 保存提示词模板
   * @param {string} systemPrompt
   * @param {string} userPrompt
   */
  async savePromptTemplate(systemPrompt, userPrompt) {
    await this.set({ systemPrompt, userPrompt });
  },

  // ==================== 飞书配置 ====================

  /**
   * 获取飞书配置
   * @returns {Promise<object>}
   */
  async getFeishuConfig() {
    const data = await this.get('feishuConfig');
    return data.feishuConfig || {
      webhookUrl: '',
      enabled: false,
      format: 'markdown',       // plain | markdown | json
      sendImageUrl: true,
      sendImageBase64: false,
      sendTimestamp: true,
      sendSourceUrl: true,
      sendPromptContent: true,
    };
  },

  /**
   * 保存飞书配置
   * @param {object} config
   */
  async saveFeishuConfig(config) {
    await this.set({ feishuConfig: config });
  },

  // ==================== 历史记录 ====================

  HISTORY_KEY: 'promptHistory',

  /**
   * 获取历史记录配置
   */
  async getHistorySettings() {
    const data = await this.get(['historyEnabled', 'historyMaxCount']);
    return {
      enabled: data.historyEnabled !== undefined ? data.historyEnabled : true,
      maxCount: data.historyMaxCount || 500,
    };
  },

  /**
   * 保存历史记录配置
   */
  async saveHistorySettings(enabled, maxCount) {
    await this.set({ historyEnabled: enabled, historyMaxCount: maxCount });
  },

  /**
   * 获取全部历史记录
   * @returns {Promise<Array>}
   */
  async getHistory() {
    const data = await this.get(this.HISTORY_KEY);
    return data[this.HISTORY_KEY] || [];
  },

  /**
   * 添加一条历史记录
   * @param {object} record
   */
  async addHistoryRecord(record) {
    const settings = await this.getHistorySettings();
    if (!settings.enabled) return;

    const history = await this.getHistory();
    record.id = record.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    record.createdAt = record.createdAt || new Date().toISOString();
    history.unshift(record);

    // 限制条数
    while (history.length > settings.maxCount) {
      history.pop();
    }

    await this.set({ [this.HISTORY_KEY]: history });
    return record;
  },

  /**
   * 删除一条历史记录
   * @param {string} id
   */
  async deleteHistoryRecord(id) {
    let history = await this.getHistory();
    history = history.filter(r => r.id !== id);
    await this.set({ [this.HISTORY_KEY]: history });
  },

  /**
   * 更新一条历史记录
   * @param {string} id
   * @param {object} updates
   */
  async updateHistoryRecord(id, updates) {
    const history = await this.getHistory();
    const idx = history.findIndex(r => r.id === id);
    if (idx === -1) return;
    history[idx] = { ...history[idx], ...updates };
    await this.set({ [this.HISTORY_KEY]: history });
    return history[idx];
  },

  /**
   * 清空全部历史记录
   */
  async clearHistory() {
    await this.set({ [this.HISTORY_KEY]: [] });
  },

  /**
   * 导出历史记录为 JSON
   * @returns {Promise<string>}
   */
  async exportHistoryJSON() {
    const history = await this.getHistory();
    return JSON.stringify(history, null, 2);
  },
};

// 支持在 content script / background / options 等多种环境中使用
if (typeof globalThis !== 'undefined') {
  globalThis.Storage = Storage;
}
