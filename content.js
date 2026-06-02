/**
 * content.js - Content Script
 * 负责：页面内浮层 UI 展示、图片处理、与 background 通信
 * 使用 Shadow DOM 隔离样式，不影响原网页
 */

(function() {
  'use strict';

  // 注入选择器和悬浮按钮样式到页面
  const pickerStyleEl = document.createElement('style');
  pickerStyleEl.textContent = getPickerStylesText();
  document.head.appendChild(pickerStyleEl);

  function getPickerStylesText() {
    return `
      #prompt-reverse-picker-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(102, 126, 234, 0.15);
        z-index: 2147483646;
        pointer-events: none;
      }
      #prompt-reverse-picker-overlay .picker-header {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #fff;
        padding: 16px 32px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        text-align: center;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #prompt-reverse-picker-overlay .picker-title {
        font-size: 18px;
        font-weight: 600;
        color: #667eea;
        margin-bottom: 8px;
      }
      #prompt-reverse-picker-overlay .picker-subtitle {
        font-size: 14px;
        color: #666;
      }
      #prompt-reverse-hover-btn {
        position: absolute;
        width: 36px;
        height: 36px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        border-radius: 50%;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        z-index: 2147483645;
        transition: transform 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #prompt-reverse-hover-btn:hover {
        transform: scale(1.15);
      }
    `;
  }

  // ==================== Shadow DOM 容器 ====================

  const CONTAINER_ID = 'ai-prompt-reverse-overlay';
  let shadowRoot = null;
  let overlayContainer = null;

  /**
   * 创建 Shadow DOM 容器
   */
  function createOverlay() {
    if (overlayContainer) return;

    // 创建宿主元素
    overlayContainer = document.createElement('div');
    overlayContainer.id = CONTAINER_ID;
    document.body.appendChild(overlayContainer);

    // 创建 Shadow DOM
    shadowRoot = overlayContainer.attachShadow({ mode: 'open' });

    // 注入样式
    const style = document.createElement('style');
    style.textContent = getOverlayStyles();
    shadowRoot.appendChild(style);

    // 创建浮层主体
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = getPanelHTML();
    shadowRoot.appendChild(panel);

    // 绑定事件
    bindPanelEvents(panel);

    console.log('[Content] 浮层已创建');
  }

  /**
   * 显示浮层
   */
  function showOverlay() {
    if (!overlayContainer) createOverlay();
    overlayContainer.style.display = 'block';
  }

  /**
   * 隐藏浮层
   */
  function hideOverlay() {
    if (overlayContainer) {
      overlayContainer.style.display = 'none';
    }
  }

  // ==================== 浮层样式 ====================

  function getOverlayStyles() {
    return `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: #333;
      }

      .panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 680px;
        max-width: 90vw;
        max-height: 85vh;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
      }

      .header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }

      .close-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        color: #fff;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }

      .close-btn:hover {
        background: rgba(255,255,255,0.3);
      }

      .content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }

      .image-preview {
        width: 100%;
        max-height: 200px;
        object-fit: contain;
        border-radius: 8px;
        background: #f5f5f5;
        margin-bottom: 16px;
      }

      .status {
        padding: 12px 16px;
        background: #f0f4ff;
        border-radius: 8px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .status.loading {
        background: #fff4e6;
      }

      .status.error {
        background: #ffe6e6;
      }

      .status.success {
        background: #e6ffed;
      }

      .spinner {
        width: 20px;
        height: 20px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .section {
        margin-bottom: 20px;
      }

      .section-title {
        font-size: 15px;
        font-weight: 600;
        color: #667eea;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .section-content {
        background: #f8f9fa;
        padding: 12px 16px;
        border-radius: 8px;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.7;
      }

      .btn-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 16px 20px;
        background: #f8f9fa;
        border-top: 1px solid #e9ecef;
      }

      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .btn-primary {
        background: #667eea;
        color: #fff;
      }

      .btn-primary:hover {
        background: #5568d3;
      }

      .btn-secondary {
        background: #fff;
        color: #667eea;
        border: 1px solid #667eea;
      }

      .btn-secondary:hover {
        background: #f0f4ff;
      }

      .btn-success {
        background: #10b981;
        color: #fff;
      }

      .btn-success:hover {
        background: #059669;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .toast {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: #333;
        color: #fff;
        border-radius: 8px;
        font-size: 13px;
        z-index: 2147483647;
        animation: slideIn 0.3s ease;
      }

      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      .hidden {
        display: none !important;
      }
    `;
  }



  // ==================== 浮层 HTML ====================

  function getPanelHTML() {
    return `
      <div class="header">
        <h2>图片反推提示词</h2>
        <button class="close-btn" id="closeBtn">×</button>
      </div>

      <div class="content">
        <img class="image-preview" id="imagePreview" alt="图片预览" />

        <div class="status loading" id="statusBox">
          <div class="spinner"></div>
          <span id="statusText">正在处理中...</span>
        </div>

        <div id="resultArea" class="hidden">
          <div class="section">
            <div class="section-title">图片内容描述</div>
            <div class="section-content" id="descriptionText"></div>
          </div>

          <div class="section">
            <div class="section-title">风格分析</div>
            <div class="section-content" id="styleText"></div>
          </div>

          <div class="section">
            <div class="section-title">中文提示词</div>
            <div class="section-content" id="chineseText"></div>
          </div>

          <div class="section">
            <div class="section-title">英文提示词</div>
            <div class="section-content" id="englishText"></div>
          </div>

          <div class="section">
            <div class="section-title">Negative Prompt</div>
            <div class="section-content" id="negativeText"></div>
          </div>

          <div class="section">
            <div class="section-title">原始返回</div>
            <div class="section-content" id="rawText"></div>
          </div>
        </div>
      </div>

      <div class="btn-group" id="btnGroup">
        <button class="btn btn-primary" id="copyChineseBtn">复制中文</button>
        <button class="btn btn-primary" id="copyEnglishBtn">复制英文</button>
        <button class="btn btn-secondary" id="copyAllBtn">复制全部</button>
        <button class="btn btn-secondary" id="regenerateBtn">重新生成</button>
        <button class="btn btn-success" id="sendFeishuBtn">发送飞书</button>
        <button class="btn btn-success" id="saveBtn">已保存</button>
      </div>
    `;
  }

  // ==================== 事件绑定 ====================

  function bindPanelEvents(panel) {
    // 关闭按钮
    panel.querySelector('#closeBtn').addEventListener('click', hideOverlay);

    // 复制中文
    panel.querySelector('#copyChineseBtn').addEventListener('click', () => {
      const text = panel.querySelector('#chineseText').textContent;
      copyToClipboard(text, '中文提示词已复制');
    });

    // 复制英文
    panel.querySelector('#copyEnglishBtn').addEventListener('click', () => {
      const text = panel.querySelector('#englishText').textContent;
      copyToClipboard(text, '英文提示词已复制');
    });

    // 复制全部
    panel.querySelector('#copyAllBtn').addEventListener('click', () => {
      const record = getCurrentRecord();
      if (!record) return;
      const all = [
        '【中文提示词】',
        record.chinesePrompt,
        '',
        '【英文提示词】',
        record.englishPrompt,
        '',
        '【Negative Prompt】',
        record.negativePrompt,
        '',
        '【描述】',
        record.description,
        '',
        '【风格】',
        record.styleAnalysis,
      ].join('\n');
      copyToClipboard(all, '全部内容已复制');
    });

    // 重新生成
    panel.querySelector('#regenerateBtn').addEventListener('click', async () => {
      const record = getCurrentRecord();
      if (!record) return;

      showLoading('正在重新生成...');

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'REGENERATE',
          imageUrl: record.imageUrl,
        });

        if (response.success) {
          updateRecord(response.parsed);
          showResult(response.parsed);
          showToast('已重新生成');
        } else {
          showError(response.error);
        }
      } catch (e) {
        showError('重新生成失败: ' + e.message);
      }
    });

    // 发送飞书
    panel.querySelector('#sendFeishuBtn').addEventListener('click', async () => {
      const record = getCurrentRecord();
      if (!record) return;

      const btn = panel.querySelector('#sendFeishuBtn');
      btn.disabled = true;
      btn.textContent = '发送中...';

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SEND_TO_FEISHU',
          record,
        });

        if (response.success) {
          showToast('已发送到飞书');
          btn.textContent = '已发送';
        } else {
          showToast('发送失败: ' + response.message);
          btn.textContent = '发送飞书';
          btn.disabled = false;
        }
      } catch (e) {
        showToast('发送失败: ' + e.message);
        btn.textContent = '发送飞书';
        btn.disabled = false;
      }
    });
  }

  // ==================== 数据管理 ====================

  let currentRecord = null;

  function getCurrentRecord() {
    return currentRecord;
  }

  function updateRecord(parsed) {
    if (!currentRecord) return;
    Object.assign(currentRecord, parsed);
  }

  // ==================== UI 更新 ====================

  function showLoading(text) {
    const statusBox = shadowRoot.querySelector('#statusBox');
    const statusText = shadowRoot.querySelector('#statusText');
    const resultArea = shadowRoot.querySelector('#resultArea');

    statusBox.className = 'status loading';
    statusBox.querySelector('.spinner').classList.remove('hidden');
    statusText.textContent = text || '正在处理中...';
    resultArea.classList.add('hidden');
  }

  function showError(error) {
    const statusBox = shadowRoot.querySelector('#statusBox');
    const statusText = shadowRoot.querySelector('#statusText');
    const resultArea = shadowRoot.querySelector('#resultArea');

    statusBox.className = 'status error';
    statusBox.querySelector('.spinner').classList.add('hidden');
    statusText.textContent = '错误: ' + error;
    resultArea.classList.add('hidden');
  }

  function showResult(record) {
    const statusBox = shadowRoot.querySelector('#statusBox');
    const statusText = shadowRoot.querySelector('#statusText');
    const resultArea = shadowRoot.querySelector('#resultArea');

    statusBox.className = 'status success';
    statusBox.querySelector('.spinner').classList.add('hidden');
    statusText.textContent = '生成完成';
    resultArea.classList.remove('hidden');

    // 填充内容
    shadowRoot.querySelector('#descriptionText').textContent = record.description || '无';
    shadowRoot.querySelector('#styleText').textContent = record.styleAnalysis || '无';
    shadowRoot.querySelector('#chineseText').textContent = record.chinesePrompt || '无';
    shadowRoot.querySelector('#englishText').textContent = record.englishPrompt || '无';
    shadowRoot.querySelector('#negativeText').textContent = record.negativePrompt || '无';
    shadowRoot.querySelector('#rawText').textContent = record.rawText || '无';
  }

  function showToast(message) {
    if (!shadowRoot) {
      createOverlay();
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    shadowRoot.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // ==================== 工具函数 ====================

  function copyToClipboard(text, successMessage) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage || '已复制');
    }).catch(err => {
      showToast('复制失败: ' + err.message);
    });
  }

  // ==================== 消息监听 ====================

  /**
   * 监听来自 background 的消息
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Content] 收到消息:', message.type);

    // FETCH_IMAGE 需要异步处理，必须在这里先返回 true 并稍后调用 sendResponse
    if (message.type === 'FETCH_IMAGE') {
      fetchImageInPage(message.imageUrl)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // 保持消息通道异步
    }

    switch (message.type) {
      case 'START_PROCESSING':
        currentRecord = { imageUrl: message.imageUrl };
        createOverlay();
        shadowRoot.querySelector('#imagePreview').src = message.imageUrl;
        showLoading('正在分析图片，请稍候...');
        showOverlay();
        break;

      case 'SHOW_RESULT':
        currentRecord = message.record;
        showResult(message.record);
        break;

      case 'SHOW_ERROR':
        if (message.imageUrl) {
          createOverlay();
          shadowRoot.querySelector('#imagePreview').src = message.imageUrl;
          showOverlay();
        }
        showError(message.error);
        break;

      case 'ENTER_PICKER_MODE':
        enterPickerMode();
        sendResponse({ success: true });
        return true;

      case 'ANALYZE_HOVERED_IMAGE':
        analyzeHoveredImage();
        sendResponse({ success: true });
        return true;
    }

    sendResponse({ received: true });
    return true;
  });

  /**
   * 在页面上下文中获取图片（回退方案）
   * 按优先级尝试多种策略获取图片 base64
   */
  async function fetchImageInPage(imageUrl) {
    // 策略 1：从页面 DOM 中找到已加载的 img 元素，直接绘制到 Canvas
    // 图片已经在页面上显示，浏览器已缓存，无需再次网络请求
    try {
      const existingImg = document.querySelector(`img[src="${imageUrl}"]`);
      if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = existingImg.naturalWidth;
        canvas.height = existingImg.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(existingImg, 0, 0);
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          if (!dataUrl.startsWith('data:')) throw new Error('Canvas 被污染');
          const base64 = dataUrl.split(',')[1];
          if (base64 && base64.length > 100) {
            console.log('[Content] 策略 1 (DOM img) 成功');
            return { base64, mimeType: 'image/jpeg' };
          }
        } catch (e) {
          console.warn('[Content] 策略 1 Canvas 被污染:', e.message);
        }
      }
    } catch (e) {
      console.warn('[Content] 策略 1 失败:', e.message);
    }

    // 策略 2：new Image 不设置 crossOrigin（利用浏览器缓存加载）
    // 不设置 crossOrigin 时，浏览器不会发送 CORS 请求，直接从缓存加载
    try {
      const result = await loadImageToCanvas(imageUrl, null);
      console.log('[Content] 策略 2 (Image 无 CORS) 成功');
      return result;
    } catch (e) {
      console.warn('[Content] 策略 2 失败:', e.message);
    }

    // 策略 3：new Image + crossOrigin='anonymous'（适用于支持 CORS 的 CDN）
    try {
      const result = await loadImageToCanvas(imageUrl, 'anonymous');
      console.log('[Content] 策略 3 (Image CORS anonymous) 成功');
      return result;
    } catch (e) {
      console.warn('[Content] 策略 3 失败:', e.message);
    }

    // 策略 4：fetch + credentials: include（带 Cookie 的 fetch）
    try {
      const response = await fetch(imageUrl, {
        credentials: 'include',
        headers: { 'Accept': 'image/*' },
      });
      if (response.ok) {
        const blob = await response.blob();
        const mimeType = blob.type || guessMimeType(imageUrl);
        const base64 = await blobToBase64Local(blob);
        console.log('[Content] 策略 4 (fetch+credentials) 成功');
        return { base64, mimeType };
      }
    } catch (e) {
      console.warn('[Content] 策略 4 失败:', e.message);
    }

    // 策略 5：fetch + no-cors 模式（不发送 CORS 预检，但可能获取不到 body）
    try {
      const response = await fetch(imageUrl, {
        mode: 'no-cors',
        credentials: 'include',
      });
      // no-cors 模式下 response 是 opaque，无法读取 body
      // 但如果触发了浏览器缓存，后续 Image 加载可能成功
      console.warn('[Content] 策略 5 no-cors fetch: opaque response, 尝试再次用 Image 加载');
      const result = await loadImageToCanvas(imageUrl, null);
      return result;
    } catch (e) {
      console.warn('[Content] 策略 5 失败:', e.message);
    }

    throw new Error('所有图片获取策略均失败，该图片可能受到严格的跨域/防盗链限制');
  }

  /**
   * Blob 转 base64（不含 data URI 前缀）
   */
  function blobToBase64Local(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 通过 Image + Canvas 获取图片 base64
   * @param {string} url - 图片 URL
   * @param {string|null} crossOrigin - null=不设置, 'anonymous', 'use-credentials'
   */
  function loadImageToCanvas(url, crossOrigin) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // 只有明确传入时才设置 crossOrigin
      if (crossOrigin !== null && crossOrigin !== undefined) {
        img.crossOrigin = crossOrigin;
      }
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          // 检查是否被污染（被污染时 toDataURL 会返回 "data:," 或抛出异常）
          if (!dataUrl || dataUrl === 'data:,' || dataUrl.length < 100) {
            reject(new Error('Canvas 被污染，输出数据无效'));
            return;
          }
          const base64 = dataUrl.split(',')[1];
          resolve({ base64, mimeType: 'image/jpeg' });
        } catch (e) {
          reject(new Error('Canvas toDataURL 异常: ' + e.message));
        }
      };
      img.onerror = (e) => reject(new Error('Image 加载失败'));
      img.src = url;
    });
  }

  /**
   * 根据 URL 推断 MIME 类型
   */
  function guessMimeType(url) {
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    if (clean.endsWith('.png')) return 'image/png';
    if (clean.endsWith('.gif')) return 'image/gif';
    if (clean.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  // ==================== 图片选择器模式 ====================

  let pickerMode = false;
  let pickerOverlay = null;
  let hoveredImg = null;
  let hoveredImageUrl = null; // 存储当前悬停元素的图片地址（img.src 或 video.poster）

  /**
   * 进入图片选择器模式
   * 高亮页面所有图片，点击即可分析
   */
  function enterPickerMode() {
    if (pickerMode) return;
    pickerMode = true;

    // 创建全屏遮罩和提示
    pickerOverlay = document.createElement('div');
    pickerOverlay.id = 'prompt-reverse-picker-overlay';
    pickerOverlay.innerHTML = `
      <div class="picker-header">
        <div class="picker-title">选择图片进行反推</div>
        <div class="picker-subtitle">点击页面中的任意图片或视频封面，或按 ESC 取消</div>
      </div>
    `;
    document.body.appendChild(pickerOverlay);

    // 给所有图片和视频封面添加高亮样式
    const mediaElements = document.querySelectorAll('img, video[poster]');
    mediaElements.forEach(el => {
      el.dataset.promptReverseOriginal = el.style.cssText;
      el.style.outline = '3px solid #667eea';
      el.style.outlineOffset = '2px';
      el.style.cursor = 'pointer';
      el.style.transition = 'transform 0.2s, box-shadow 0.2s';
    });

    // 监听图片点击
    document.addEventListener('click', pickerClickHandler, true);
    document.addEventListener('keydown', pickerEscHandler, true);
  }

  /**
   * 退出图片选择器模式
   */
  function exitPickerMode() {
    if (!pickerMode) return;
    pickerMode = false;

    // 移除遮罩
    if (pickerOverlay) {
      pickerOverlay.remove();
      pickerOverlay = null;
    }

    // 恢复图片和视频元素样式
    const mediaElements = document.querySelectorAll('img, video[poster]');
    mediaElements.forEach(el => {
      if (el.dataset.promptReverseOriginal !== undefined) {
        el.style.cssText = el.dataset.promptReverseOriginal;
        delete el.dataset.promptReverseOriginal;
      }
    });

    // 移除事件监听
    document.removeEventListener('click', pickerClickHandler, true);
    document.removeEventListener('keydown', pickerEscHandler, true);
  }

  /**
   * 选择器模式下的点击处理
   */
  function pickerClickHandler(e) {
    // 支持 img 和 video[poster] 元素
    const img = e.target.closest('img');
    const video = !img ? e.target.closest('video[poster]') : null;
    const src = img ? img.src : (video ? video.poster : null);
    if (src) {
      e.preventDefault();
      e.stopPropagation();
      exitPickerMode();
      analyzeImage(src);
    } else {
      // 点击非图片区域退出
      exitPickerMode();
    }
  }

  /**
   * ESC 键退出选择器
   */
  function pickerEscHandler(e) {
    if (e.key === 'Escape') {
      exitPickerMode();
    }
  }

  // ==================== 悬浮按钮 ====================

  let hoverButton = null;
  let currentHoverImg = null;

  /**
   * 创建悬浮分析按钮
   */
  function createHoverButton() {
    if (hoverButton) return;

    hoverButton = document.createElement('div');
    hoverButton.id = 'prompt-reverse-hover-btn';
    hoverButton.innerHTML = 'AI';
    hoverButton.title = '反推提示词 (Alt+R)';
    document.body.appendChild(hoverButton);

    hoverButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (hoveredImageUrl) {
        analyzeImage(hoveredImageUrl);
      }
      hideHoverButton();
    });
  }

  /**
   * 显示悬浮按钮
   */
  function showHoverButton(img) {
    if (!hoverButton) createHoverButton();

    currentHoverImg = img;
    const rect = img.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    hoverButton.style.top = (rect.top + scrollTop + 8) + 'px';
    hoverButton.style.left = (rect.right + scrollLeft - 40) + 'px';
    hoverButton.style.display = 'flex';
  }

  /**
   * 隐藏悬浮按钮
   */
  function hideHoverButton() {
    if (hoverButton) {
      hoverButton.style.display = 'none';
    }
    currentHoverImg = null;
  }

  /**
   * 从元素中提取图片 URL
   * 支持: <img src>, <video poster>, CSS background-image
   */
  function extractMediaUrl(el) {
    if (el.tagName === 'IMG' && el.src) return el.src;
    if (el.tagName === 'VIDEO' && el.poster) return el.poster;
    // 尝试 CSS background-image
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') {
      const match = bg.match(/url\(["']?(.*?)["']?\)/);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  /**
   * 从鼠标事件目标元素中找到可分析的图片/视频
   * 解决两个常见问题：
   * 1. 遮罩层覆盖：e.target 是遮罩元素而非 <img>，需要查找子元素中的图片
   * 2. 懒加载：native lazy 图片在可视区外时 naturalWidth=0，改用 clientWidth 判断
   */
  function findMediaFromEvent(e) {
    // 第一步：向上查找 — 目标是 img/video/背景图 自身或其祖先
    let img = e.target.closest('img');
    let video = !img ? e.target.closest('video[poster]') : null;
    let bgEl = (!img && !video) ? e.target.closest('[style*="background"]') : null;

    // 第二步：如果向上没找到 img，向下查找 — 可能是遮罩/覆盖层元素
    if (!img && !video && !bgEl) {
      const parent = e.target.closest('[class*="cover"], [class*="card"], [class*="note"], [class*="item"], [class*="thumb"], a[href]');
      if (parent) {
        img = parent.querySelector('img');
        if (!img) video = parent.querySelector('video[poster]');
      }
    }

    const targetEl = img || video || bgEl;
    if (!targetEl) return null;

    const url = extractMediaUrl(targetEl);
    if (!url) return null;

    // 尺寸过滤：优先用显示尺寸 clientWidth（懒加载图片 naturalWidth 可能为 0）
    if (img) {
      const w = img.clientWidth || img.naturalWidth || 0;
      const h = img.clientHeight || img.naturalHeight || 0;
      if (w < 80 && h < 80) return null; // 显示尺寸太小的图片（如头像、图标）
    }

    return { targetEl, url };
  }

  // 监听图片/视频悬停
  document.addEventListener('mouseover', (e) => {
    const result = findMediaFromEvent(e);
    if (!result) return;

    hoveredImg = result.targetEl;
    hoveredImageUrl = result.url;
    showHoverButton(result.targetEl);
  });

  document.addEventListener('mouseout', (e) => {
    const result = findMediaFromEvent(e);
    if (result) {
      // 延迟隐藏，给用户时间点击按钮
      setTimeout(() => {
        if (!hoverButton?.matches(':hover')) {
          hideHoverButton();
        }
      }, 200);
    }
  });

  // ==================== 快捷键支持 ====================

  /**
   * 直接在页面中监听 Alt+R 快捷键（兜底方案）
   * 当 manifest.json 的 suggested_key 未被用户在 chrome://extensions/shortcuts 中确认时，
   * 此监听器保证快捷键仍然可用
   */
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'r' || e.key === 'R')) {
      // 避免在输入框中误触发
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

      e.preventDefault();
      e.stopPropagation();
      analyzeHoveredImage();
    }
  }, true);

  /**
   * 分析当前悬停的图片（Alt+R 触发）
   */
  function analyzeHoveredImage() {
    if (hoveredImageUrl) {
      analyzeImage(hoveredImageUrl);
    } else {
      showToast('请先将鼠标悬停在图片或视频封面上');
    }
  }

  // ==================== 核心分析函数 ====================

  /**
   * 分析指定图片
   * 发送 ANALYZE_IMAGE 给 background，由 background 通过 SHOW_RESULT/SHOW_ERROR 消息返回结果
   */
  function analyzeImage(imageUrl) {
    createOverlay();
    shadowRoot.querySelector('#imagePreview').src = imageUrl;
    showLoading('正在分析图片，请稍候...');
    showOverlay();

    chrome.runtime.sendMessage({
      type: 'ANALYZE_IMAGE',
      imageUrl: imageUrl
    });
  }

  console.log('[Content] Content script 已加载（含替代触发方式）');
})();
