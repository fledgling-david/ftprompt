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

  // ==================== 通知系统 ====================

  const CONTAINER_ID = 'ai-prompt-reverse-overlay';
  let shadowRoot = null;
  let overlayContainer = null;
  const taskMap = new Map();

  function ensureContainer() {
    if (overlayContainer) return;
    overlayContainer = document.createElement('div');
    overlayContainer.id = CONTAINER_ID;
    document.body.appendChild(overlayContainer);
    shadowRoot = overlayContainer.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = getNotificationStyles();
    shadowRoot.appendChild(style);
    const container = document.createElement('div');
    container.className = 'notification-container';
    shadowRoot.appendChild(container);
    console.log('[Content] 通知容器已创建');
  }

  // ==================== 通知样式 ====================

  function getNotificationStyles() {
    return `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: #333;
      }
      .notification-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column-reverse;
        gap: 8px;
        max-height: 80vh;
        overflow-y: auto;
      }
      .notification {
        width: 360px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.15);
        overflow: hidden;
        animation: slideInRight 0.3s ease;
        cursor: default;
      }
      @keyframes slideInRight {
        from { transform: translateX(120%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .status-bar {
        height: 3px;
        background: #667eea;
        transition: background 0.3s;
      }
      .notification.loading .status-bar {
        animation: pulse 1.5s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .notification.done .status-bar { background: #10b981; }
      .notification.error .status-bar { background: #ef4444; }
      .card-header {
        display: flex;
        align-items: center;
        padding: 12px 14px;
        gap: 10px;
        cursor: pointer;
        user-select: none;
      }
      .card-header:hover { background: #f8f9fa; }
      .card-thumb {
        width: 40px;
        height: 40px;
        border-radius: 6px;
        object-fit: cover;
        flex-shrink: 0;
        background: #f0f0f0;
      }
      .card-info {
        flex: 1;
        min-width: 0;
      }
      .card-title {
        font-size: 13px;
        font-weight: 600;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .card-subtitle {
        font-size: 12px;
        color: #888;
      }
      .spinner {
        width: 18px;
        height: 18px;
        border: 2px solid #e9ecef;
        border-top: 2px solid #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        flex-shrink: 0;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .status-icon {
        font-size: 16px;
        flex-shrink: 0;
      }
      .close-btn {
        background: none;
        border: none;
        font-size: 18px;
        color: #999;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        flex-shrink: 0;
      }
      .close-btn:hover { color: #333; }
      .result-section {
        display: none;
        border-top: 1px solid #e9ecef;
        max-height: 400px;
        overflow-y: auto;
        padding: 12px 14px;
      }
      .result-section.expanded { display: block; }
      .section {
        margin-bottom: 12px;
      }
      .section-title {
        font-size: 12px;
        font-weight: 600;
        color: #667eea;
        margin-bottom: 4px;
      }
      .section-content {
        background: #f8f9fa;
        padding: 8px 10px;
        border-radius: 6px;
        font-size: 12px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .card-actions {
        display: flex;
        gap: 6px;
        padding: 10px 14px;
        border-top: 1px solid #e9ecef;
        flex-wrap: wrap;
      }
      .btn {
        padding: 5px 10px;
        border: none;
        border-radius: 5px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-primary { background: #667eea; color: #fff; }
      .btn-primary:hover { background: #5568d3; }
      .btn-secondary { background: #fff; color: #667eea; border: 1px solid #667eea; }
      .btn-secondary:hover { background: #f0f4ff; }
      .btn-success { background: #10b981; color: #fff; }
      .btn-success:hover { background: #059669; }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .toast {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 16px;
        background: #333;
        color: #fff;
        border-radius: 8px;
        font-size: 13px;
        z-index: 2147483647;
        animation: toastIn 0.3s ease;
      }
      @keyframes toastIn {
        from { transform: translateX(120%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .hidden { display: none !important; }
    `;
  }



  // ==================== 通知卡片 ====================

  function generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createNotificationCard(taskId, imageUrl) {
    ensureContainer();
    const container = shadowRoot.querySelector('.notification-container');
    const card = document.createElement('div');
    card.className = 'notification loading';
    card.dataset.taskId = taskId;
    card.innerHTML = `
      <div class="status-bar"></div>
      <div class="card-header">
        <img class="card-thumb" src="${imageUrl}" alt="" crossorigin="anonymous" onerror="this.style.display='none'" />
        <div class="card-info">
          <div class="card-title">正在分析图片...</div>
          <div class="card-subtitle">处理中</div>
        </div>
        <div class="spinner"></div>
        <span class="status-icon hidden"></span>
        <button class="close-btn" title="关闭">×</button>
      </div>
      <div class="result-section"></div>
    `;
    card.querySelector('.close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      card.remove();
      taskMap.delete(taskId);
    });
    container.appendChild(card);
    taskMap.set(taskId, { card, record: null, status: 'loading' });
    return card;
  }

  function updateNotificationDone(taskId, record, bitableUrl) {
    const task = taskMap.get(taskId);
    if (!task) return;
    const { card } = task;
    task.record = record;
    task.status = 'done';
    task.bitableUrl = bitableUrl || '';
    card.className = 'notification done';
    card.querySelector('.spinner').classList.add('hidden');
    const icon = card.querySelector('.status-icon');
    icon.textContent = '✓';
    icon.classList.remove('hidden');
    card.querySelector('.card-title').textContent = '分析完成';
    card.querySelector('.card-subtitle').textContent = '点击查看结果';
    const resultSection = card.querySelector('.result-section');
    resultSection.innerHTML = `
      <div class="section"><div class="section-title">画面描述</div><div class="section-content">${esc(record.description) || '无'}</div></div>
      <div class="section"><div class="section-title">风格分析</div><div class="section-content">${esc(record.styleAnalysis) || '无'}</div></div>
      <div class="section"><div class="section-title">中文提示词</div><div class="section-content">${esc(record.chinesePrompt) || '无'}</div></div>
      <div class="section"><div class="section-title">英文提示词</div><div class="section-content">${esc(record.englishPrompt) || '无'}</div></div>
      <div class="section"><div class="section-title">Negative Prompt</div><div class="section-content">${esc(record.negativePrompt) || '无'}</div></div>
    `;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.innerHTML = `
      <button class="btn btn-primary" data-action="copy-cn">复制中文</button>
      <button class="btn btn-primary" data-action="copy-en">复制英文</button>
      <button class="btn btn-secondary" data-action="copy-all">复制全部</button>
      <button class="btn btn-success" data-action="open-feishu">打开飞书</button>
    `;
    card.appendChild(actions);
    card.querySelector('.card-header').addEventListener('click', () => {
      resultSection.classList.toggle('expanded');
      actions.style.display = resultSection.classList.contains('expanded') ? 'flex' : 'none';
    });
    actions.style.display = 'none';
    actions.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = e.target.dataset.action;
      if (action === 'copy-cn') copyText(record.chinesePrompt, '中文提示词已复制');
      else if (action === 'copy-en') copyText(record.englishPrompt, '英文提示词已复制');
      else if (action === 'copy-all') copyAllFields(record);
      else if (action === 'open-feishu') openFeishu(task);
    });
  }

  function updateNotificationError(taskId, error) {
    const task = taskMap.get(taskId);
    if (!task) return;
    const { card } = task;
    task.status = 'error';
    card.className = 'notification error';
    card.querySelector('.spinner').classList.add('hidden');
    const icon = card.querySelector('.status-icon');
    icon.textContent = '✗';
    icon.classList.remove('hidden');
    card.querySelector('.card-title').textContent = '分析失败';
    card.querySelector('.card-subtitle').textContent = error;
  }

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function copyText(text, msg) {
    navigator.clipboard.writeText(text || '').then(() => showToast(msg || '已复制')).catch(e => showToast('复制失败'));
  }

  function copyAllFields(r) {
    const all = ['【中文提示词】', r.chinesePrompt, '', '【英文提示词】', r.englishPrompt, '', '【Negative Prompt】', r.negativePrompt, '', '【描述】', r.description, '', '【风格】', r.styleAnalysis].join('\n');
    copyText(all, '全部内容已复制');
  }

  function openFeishu(task) {
    if (task && task.bitableUrl) {
      window.open(task.bitableUrl, '_blank');
    } else {
      showToast('请先在插件设置中配置飞书多维表格');
    }
  }

  function showToast(message) {
    ensureContainer();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    shadowRoot.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
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
        createNotificationCard(message.taskId, message.imageUrl);
        break;

      case 'SHOW_RESULT':
        updateNotificationDone(message.taskId, message.record, message.bitableUrl);
        break;

      case 'SHOW_ERROR':
        if (message.taskId) {
          updateNotificationError(message.taskId, message.error);
        } else {
          // 无 taskId 的旧式错误，创建临时通知
          const errTaskId = generateTaskId();
          createNotificationCard(errTaskId, message.imageUrl || '');
          updateNotificationError(errTaskId, message.error);
        }
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
    const taskId = generateTaskId();
    createNotificationCard(taskId, imageUrl);
    chrome.runtime.sendMessage({
      type: 'ANALYZE_IMAGE',
      imageUrl: imageUrl,
      taskId: taskId
    });
  }

  console.log('[Content] Content script 已加载（含替代触发方式）');
})();
