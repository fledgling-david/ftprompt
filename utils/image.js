/**
 * image.js - 图片处理工具集
 * 负责图片下载、跨域处理、格式转换、压缩等
 */

const ImageUtils = {
  /**
   * 下载图片并转为 Blob
   * 优先使用 fetch 以绕过跨域限制
   * @param {string} imageUrl - 图片 URL
   * @returns {Promise<{blob: Blob, mimeType: string}>}
   */
  async downloadImageAsBlob(imageUrl) {
    // 处理 data:image URL
    if (imageUrl.startsWith('data:')) {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      return { blob, mimeType: blob.type || 'image/png' };
    }

    // 尝试直接 fetch（可解决部分跨域问题）
    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const mimeType = blob.type || this.getImageMimeTypeFromUrl(imageUrl);
      return { blob, mimeType };
    } catch (e) {
      // 回退：尝试 no-cors（只能得到 opaque response，不可读）
      console.warn('[ImageUtils] fetch cors failed, trying no-cors:', e.message);
    }

    // 回退：通过创建 Image + Canvas 获取
    try {
      const base64 = await this.imageToCanvasBase64(imageUrl);
      const blob = this.base64ToBlob(base64.data, base64.mimeType);
      return { blob, mimeType: base64.mimeType };
    } catch (e2) {
      throw new Error(`无法获取图片内容: ${e2.message}`);
    }
  },

  /**
   * 通过 Image + Canvas 将图片转为 base64
   * @param {string} url
   * @returns {Promise<{data: string, mimeType: string}>}
   */
  imageToCanvasBase64(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const mimeType = 'image/png';
        try {
          const dataUrl = canvas.toDataURL(mimeType);
          const base64Data = dataUrl.split(',')[1];
          resolve({ data: base64Data, mimeType });
        } catch (e) {
          reject(new Error('Canvas 被污染，无法读取图片数据'));
        }
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = url;
    });
  },

  /**
   * Blob 转 Base64 字符串（不含 data URI 前缀）
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  /**
   * 将图片 base64 压缩到指定最长边
   * @param {string} base64 - 不含 data URI 前缀的 base64
   * @param {string} mimeType
   * @param {number} maxSize - 最长边像素，默认 1024
   * @returns {Promise<{base64: string, mimeType: string, width: number, height: number}>}
   */
  async resizeImage(base64, mimeType = 'image/jpeg', maxSize = 1024) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // 如果不需要缩放
        if (width <= maxSize && height <= maxSize) {
          resolve({ base64, mimeType: mimeType || 'image/jpeg', width, height });
          return;
        }

        // 等比缩放
        if (width > height) {
          height = Math.round((height / width) * maxSize);
          width = maxSize;
        } else {
          width = Math.round((width / height) * maxSize);
          height = maxSize;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const outputMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputMime, 0.9);
        const newBase64 = dataUrl.split(',')[1];

        resolve({ base64: newBase64, mimeType: outputMime, width, height });
      };
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = `data:${mimeType};base64,${base64}`;
    });
  },

  /**
   * 根据 URL 推断 MIME 类型
   * @param {string} url
   * @returns {string}
   */
  getImageMimeTypeFromUrl(url) {
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    if (clean.endsWith('.png')) return 'image/png';
    if (clean.endsWith('.gif')) return 'image/gif';
    if (clean.endsWith('.webp')) return 'image/webp';
    if (clean.endsWith('.bmp')) return 'image/bmp';
    if (clean.endsWith('.svg')) return 'image/svg+xml';
    return 'image/jpeg'; // 默认 JPEG
  },

  /**
   * Base64 字符串转 Blob
   * @param {string} base64
   * @param {string} mimeType
   * @returns {Blob}
   */
  base64ToBlob(base64, mimeType) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  },

  /**
   * 验证 base64 图片大小（字节数估算）
   * @param {string} base64
   * @param {number} maxMB - 最大 MB 数
   * @returns {{sizeMB: number, ok: boolean}}
   */
  validateImageSize(base64, maxMB = 20) {
    const sizeBytes = (base64.length * 3) / 4;
    const sizeMB = sizeBytes / (1024 * 1024);
    return { sizeMB: Math.round(sizeMB * 100) / 100, ok: sizeMB <= maxMB };
  },

  /**
   * 完整的图片处理流水线
   * 输入 URL -> 下载 -> 转 base64 -> 压缩 -> 验证大小
   * @param {string} imageUrl
   * @param {number} maxSize - 最长边像素
   * @returns {Promise<{base64: string, mimeType: string, width: number, height: number, originalUrl: string}>}
   */
  async processImage(imageUrl, maxSize = 1024) {
    // 下载
    const { blob, mimeType } = await this.downloadImageAsBlob(imageUrl);
    // 转 base64
    let base64 = await this.blobToBase64(blob);
    // 压缩
    const resized = await this.resizeImage(base64, mimeType, maxSize);
    // 验证
    const validation = this.validateImageSize(resized.base64);
    if (!validation.ok) {
      console.warn(`[ImageUtils] 图片仍较大 (${validation.sizeMB}MB)，尝试进一步压缩`);
      // 再次压缩到更小
      const smaller = await this.resizeImage(resized.base64, 'image/jpeg', 512);
      return { ...smaller, originalUrl: imageUrl };
    }
    return { ...resized, originalUrl: imageUrl };
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.ImageUtils = ImageUtils;
}
