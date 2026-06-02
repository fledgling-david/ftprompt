/**
 * background.js - Chrome Extension Service Worker
 * 负责：右键菜单创建、消息路由、API 调用
 */

// 导入工具模块（Service Worker 中使用 importScripts）
importScripts('utils/storage.js', 'utils/models.js', 'utils/feishu.js', 'utils/promptTemplate.js');

// ==================== 右键菜单 ====================

/**
 * 插件安装时创建右键菜单
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'reverse-prompt-image',
    title: '反推图片提示词',
    contexts: ['image'], // 仅在图片上右键时显示
  });
  console.log('[Background] 右键菜单已创建');
});

// ==================== 键盘快捷键 ====================

/**
 * 监听键盘快捷键命令
 * Alt+R: 分析鼠标当前悬停的图片
 */
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Background] 收到命令:', command);
  if (command === 'reverse-prompt-hover') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      console.warn('[Background] 未找到活动标签页');
      return;
    }

    console.log('[Background] Alt+R 快捷键触发，正在发送 ANALYZE_HOVERED_IMAGE...');
    // 通知 content script 获取当前悬停的图片 URL 并分析
    await sendToContent(tab.id, { type: 'ANALYZE_HOVERED_IMAGE' });
  }
});

/**
 * 右键菜单点击事件
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'reverse-prompt-image') return;

  const imageUrl = info.srcUrl;
  const sourceUrl = tab.url;

  console.log('[Background] 右键点击图片:', imageUrl);

  // 获取当前启用的模型
  const model = await Storage.getActiveModel();
  if (!model) {
    // 发送错误消息到 content script
    await sendToContent(tab.id, {
      type: 'SHOW_ERROR',
      error: '请先在插件设置中配置并启用 AI 模型',
    });
    return;
  }

  // 获取提示词模板
  const promptTemplate = await Storage.getPromptTemplate();

  // 通知 content script 开始处理
  await sendToContent(tab.id, {
    type: 'START_PROCESSING',
    imageUrl,
  });

  try {
    // 调用模型 API
    const result = await processImageWithModel(imageUrl, model, promptTemplate, tab.id);

    // 解析模型返回
    const parsed = parsePromptResponse(result);

    // 构建记录
    const record = {
      imageUrl,
      sourceUrl,
      modelName: model.model,
      ...parsed,
      createdAt: new Date().toISOString(),
      sentToFeishu: false,
    };

    // 自动保存到历史记录
    const historySettings = await Storage.getHistorySettings();
    if (historySettings.enabled) {
      await Storage.addHistoryRecord(record);
    }

    // 自动备份到飞书多维表格
    const feishuConfig = await Storage.getFeishuConfig();
    if (feishuConfig.enabled && feishuConfig.appToken && feishuConfig.tableId) {
      const feishuResult = await FeishuAPI.writeToBitable(record, feishuConfig);
      if (feishuResult.success) {
        record.sentToFeishu = true;
        await Storage.updateHistoryRecord(record.id, { sentToFeishu: true });
      } else {
        console.warn('[Background] 飞书自动备份失败:', feishuResult.message);
      }
    }

    // 发送结果到 content script 显示浮层
    await sendToContent(tab.id, {
      type: 'SHOW_RESULT',
      record,
    });
  } catch (error) {
    console.error('[Background] 处理失败:', error);
    await sendToContent(tab.id, {
      type: 'SHOW_ERROR',
      error: error.message,
      imageUrl,
    });
  }
});

/**
 * 处理图片：下载 -> 压缩 -> 调用模型
 * @param {string} imageUrl - 图片 URL
 * @param {object} model - 模型配置
 * @param {object} promptTemplate - 提示词模板
 * @param {number} [tabId] - 当前标签页 ID（用于回退获取图片）
 */
async function processImageWithModel(imageUrl, model, promptTemplate, tabId) {
  let base64, mimeType;

  // 处理 data: URL
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64 = match[2];
    } else {
      throw new Error('无法解析 data: URL 格式的图片');
    }
  } else {
    // 策略 1：直接 fetch（带浏览器级请求头）
    try {
      const headers = {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      };
      const response = await fetch(imageUrl, { headers, credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      mimeType = blob.type || getMimeTypeFromUrl(imageUrl);

      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64 = btoa(binary);
    } catch (e1) {
      console.warn('[Background] 直接 fetch 失败:', e1.message);

      // 策略 2：通过 content script 获取（利用页面 Cookie/Referer）
      if (tabId) {
        try {
          const result = await fetchImageViaContent(tabId, imageUrl);
          base64 = result.base64;
          mimeType = result.mimeType;
        } catch (e2) {
          console.warn('[Background] content script fetch 失败:', e2.message);

          // 策略 3：通过 scripting.executeScript 注入代码到页面获取
          try {
            const result = await fetchImageViaScripting(tabId, imageUrl);
            base64 = result.base64;
            mimeType = result.mimeType;
          } catch (e3) {
            console.warn('[Background] scripting fetch 失败:', e3.message);

            // 策略 4：通过 declarativeNetRequest 修改请求头绕过防盗链
            try {
              const result = await fetchWithSpoofedHeaders(imageUrl);
              base64 = result.base64;
              mimeType = result.mimeType;
              console.log('[Background] declarativeNetRequest 策略成功');
            } catch (e4) {
              console.warn('[Background] declarativeNetRequest 也失败:', e4.message);
              throw new Error(`无法获取图片 (直接fetch: ${e1.message}, 页面fetch: ${e2.message}, scripting: ${e3.message}, DNR: ${e4.message})`);
            }
          }
        }
      } else {
        throw new Error(`无法获取图片: ${e1.message}`);
      }
    }
  }

  // 验证大小
  const sizeMB = (base64.length * 3 / 4) / (1024 * 1024);
  if (sizeMB > 20) {
    // 不直接报错，而是截断后压缩处理——交给模型端处理
    console.warn(`[Background] 图片较大 (${sizeMB.toFixed(1)}MB)，尝试继续`);
  }

  // 调用模型
  const result = await ModelCaller.callVisionModel(base64, mimeType, model, promptTemplate);
  return result;
}

/**
 * 通过 declarativeNetRequest 修改请求头绕过 CDN 防盗链
 * 原理：创建临时规则，将 Referer 设为图片自身域名，移除 Origin 头
 * 这样 CDN 会认为请求来自图片所在站点，允许访问
 */
async function fetchWithSpoofedHeaders(imageUrl) {
  const RULE_ID = 99901;

  try {
    // 提取图片的源站（如 https://ww3.sinaimg.cn）
    const urlObj = new URL(imageUrl);
    const imageOrigin = urlObj.origin;

    // 创建临时 session 规则：修改请求头
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [RULE_ID],
      addRules: [{
        id: RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Referer', operation: 'set', value: imageOrigin + '/' },
            { header: 'Origin', operation: 'remove' },
          ],
        },
        condition: {
          urlFilter: imageUrl,
          resourceTypes: ['xmlhttprequest', 'image', 'other'],
        },
      }],
    });

    // 使用修改后的请求头 fetch 图片
    const response = await fetch(imageUrl, {
      credentials: 'omit',
      cache: 'no-store',
    });

    // 立即移除规则
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [RULE_ID],
    });

    if (!response.ok) {
      throw new Error(`DNR fetch 返回 HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const mimeType = blob.type || getMimeTypeFromUrl(imageUrl);
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    return { base64, mimeType };
  } catch (e) {
    // 确保规则被清理
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [RULE_ID],
      });
    } catch (_) {}
    throw new Error('DNR 请求失败: ' + e.message);
  }
}

/**
 * 通过 content script 获取图片（回退方案）
 * content script 运行在页面上下文中，拥有页面的 Cookie 和 Referer
 */
async function fetchImageViaContent(tabId, imageUrl) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, {
      type: 'FETCH_IMAGE',
      imageUrl,
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || !response.success) {
        reject(new Error(response ? response.error : 'content script 无响应'));
        return;
      }
      resolve({ base64: response.base64, mimeType: response.mimeType });
    });
  });
}

/**
 * 通过 chrome.scripting.executeScript 注入代码获取图片（最终回退）
 * 在页面的隔离世界中执行，利用页面已加载的图片缓存
 */
async function fetchImageViaScripting(tabId, imageUrl) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (url) => {
      return new Promise((resolve) => {
        // 尝试 1：从 DOM 中找到已加载的图片
        const existingImg = document.querySelector(`img[src="${url}"]`);
        if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = existingImg.naturalWidth;
            canvas.height = existingImg.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(existingImg, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            if (dataUrl && dataUrl !== 'data:,' && dataUrl.length > 100) {
              resolve({ success: true, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
              return;
            }
          } catch (e) { /* 继续尝试 */ }
        }

        // 尝试 2：创建新 Image 不设 crossOrigin（利用缓存）
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            if (dataUrl && dataUrl !== 'data:,' && dataUrl.length > 100) {
              resolve({ success: true, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
            } else {
              resolve({ success: false, error: 'Canvas 数据无效' });
            }
          } catch (e) {
            resolve({ success: false, error: 'Canvas 异常: ' + e.message });
          }
        };
        img.onerror = () => resolve({ success: false, error: 'Image 加载失败' });
        img.src = url;
      });
    },
    args: [imageUrl],
  });

  if (results && results[0] && results[0].result) {
    const r = results[0].result;
    if (r.success) return { base64: r.base64, mimeType: r.mimeType };
    throw new Error(r.error || 'scripting 获取图片失败');
  }
  throw new Error('scripting 无返回结果');
}

/**
 * 根据 URL 推断 MIME 类型
 */
function getMimeTypeFromUrl(url) {
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.bmp')) return 'image/bmp';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

/**
 * 解析模型返回的提示词
 */
function parsePromptResponse(text) {
  const result = {
    chinesePrompt: '',
    englishPrompt: '',
    negativePrompt: '',
    description: '',
    styleAnalysis: '',
    rawText: text,
  };

  if (!text) return result;

  // 简单的正则解析
  const sections = text.split(/^#{1,4}\s+/m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0].trim().toLowerCase();
    const content = lines.slice(1).join('\n').trim();

    if (title.includes('中文提示词')) {
      result.chinesePrompt = content;
    } else if (title.includes('英文提示词') || title.includes('english')) {
      result.englishPrompt = content;
    } else if (title.includes('negative') || title.includes('负面')) {
      result.negativePrompt = content;
    } else if (title.includes('描述')) {
      result.description = content;
    } else if (title.includes('风格')) {
      result.styleAnalysis = content;
    }
  }

  if (!result.description && !result.chinesePrompt) {
    result.description = text;
  }

  return result;
}

/**
 * 发送消息到 content script
 */
async function sendToContent(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    console.error('[Background] 发送消息失败:', e);
  }
}

// ==================== 消息监听 ====================

/**
 * 监听来自 content script / popup / options 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true; // 保持消息通道异步
});

async function handleMessage(message, sender) {
  switch (message.type) {
    // 重新生成提示词
    case 'REGENERATE': {
      const { imageUrl } = message;
      const model = await Storage.getActiveModel();
      if (!model) return { success: false, error: '请先配置并启用 AI 模型' };
      const promptTemplate = await Storage.getPromptTemplate();
      const tabId = sender && sender.tab ? sender.tab.id : null;
      const result = await processImageWithModel(imageUrl, model, promptTemplate, tabId);
      const parsed = parsePromptResponse(result);
      return { success: true, parsed, rawText: result };
    }

    // 发送到飞书多维表格
    case 'SEND_TO_FEISHU': {
      const { record } = message;
      const feishuConfig = await Storage.getFeishuConfig();
      const result = await FeishuAPI.writeToBitable(record, feishuConfig);
      if (result.success && record.id) {
        await Storage.updateHistoryRecord(record.id, { sentToFeishu: true });
      }
      return result;
    }

    // 测试模型连接
    case 'TEST_MODEL': {
      const { modelConfig } = message;
      return ModelCaller.testModelConnection(modelConfig);
    }

    // 测试飞书连接
    case 'TEST_FEISHU': {
      const { config } = message;
      return FeishuAPI.testConnection(config);
    }

    // 测试飞书写入
    case 'TEST_FEISHU_WRITE': {
      const { config } = message;
      return FeishuAPI.testWrite(config);
    }

    // 获取当前模型
    case 'GET_ACTIVE_MODEL': {
      const model = await Storage.getActiveModel();
      return { success: true, model };
    }

    // 获取历史记录
    case 'GET_HISTORY': {
      const history = await Storage.getHistory();
      return { success: true, history };
    }

    // 删除历史记录
    case 'DELETE_HISTORY': {
      const { id } = message;
      await Storage.deleteHistoryRecord(id);
      return { success: true };
    }

    // 清空历史记录
    case 'CLEAR_HISTORY': {
      await Storage.clearHistory();
      return { success: true };
    }

    // 分析指定图片（从 popup 或 content script 触发）
    case 'ANALYZE_IMAGE': {
      const { imageUrl, sourceUrl } = message;
      const model = await Storage.getActiveModel();
      if (!model) return { success: false, error: '请先配置并启用 AI 模型' };

      const promptTemplate = await Storage.getPromptTemplate();
      const tabId = sender && sender.tab ? sender.tab.id : null;

      try {
        const result = await processImageWithModel(imageUrl, model, promptTemplate, tabId);
        const parsed = parsePromptResponse(result);

        const record = {
          imageUrl,
          sourceUrl: sourceUrl || (sender && sender.tab ? sender.tab.url : ''),
          modelName: model.model,
          ...parsed,
          createdAt: new Date().toISOString(),
          sentToFeishu: false,
        };

        // 自动保存到历史记录
        const historySettings = await Storage.getHistorySettings();
        if (historySettings.enabled) {
          await Storage.addHistoryRecord(record);
        }

        // 自动备份到飞书多维表格
        const feishuConfig = await Storage.getFeishuConfig();
        if (feishuConfig.enabled && feishuConfig.appToken && feishuConfig.tableId) {
          const feishuResult = await FeishuAPI.writeToBitable(record, feishuConfig);
          if (feishuResult.success) {
            record.sentToFeishu = true;
            await Storage.updateHistoryRecord(record.id, { sentToFeishu: true });
          } else {
            console.warn('[Background] 飞书自动备份失败:', feishuResult.message);
          }
        }

        // 如果来自 content script，显示结果浮层
        if (tabId) {
          await sendToContent(tabId, { type: 'SHOW_RESULT', record });
        }

        return { success: true, record };
      } catch (error) {
        if (tabId) {
          await sendToContent(tabId, { type: 'SHOW_ERROR', error: error.message, imageUrl });
        }
        return { success: false, error: error.message };
      }
    }

    default:
      return { success: false, error: '未知消息类型' };
  }
}

console.log('[Background] Service Worker 已启动');
