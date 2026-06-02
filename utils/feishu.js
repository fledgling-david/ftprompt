/**
 * feishu.js - 飞书多维表格 (Bitable) 备份功能
 * 通过飞书开放平台 API 将反推记录写入多维表格
 *
 * 需要配置：
 * - appId / appSecret：飞书开放平台创建应用后获取
 * - appToken：多维表格的 app_token（URL 中获取）
 * - tableId：数据表的 table_id
 */

const FeishuAPI = {
  // token 缓存
  _tokenCache: { token: null, expiresAt: 0 },

  /**
   * 获取 tenant_access_token（带缓存）
   * @param {string} appId
   * @param {string} appSecret
   * @returns {Promise<string>}
   */
  async getAccessToken(appId, appSecret) {
    const now = Date.now();
    if (this._tokenCache.token && this._tokenCache.expiresAt > now + 60000) {
      return this._tokenCache.token;
    }

    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });

    if (!response.ok) {
      throw new Error(`获取 token 请求失败 (${response.status})`);
    }

    const result = await response.json();
    if (result.code !== 0) {
      throw new Error(`获取 token 失败: ${result.msg}`);
    }

    this._tokenCache = {
      token: result.tenant_access_token,
      expiresAt: now + (result.expire || 7200) * 1000,
    };

    return this._tokenCache.token;
  },

  /**
   * 将反推记录写入多维表格
   * @param {object} record - 反推记录
   * @param {object} config - 飞书配置
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async writeToBitable(record, config) {
    if (!config.enabled) {
      return { success: false, message: '飞书备份未启用' };
    }
    if (!config.appId || !config.appSecret || !config.appToken || !config.tableId) {
      return { success: false, message: '飞书多维表格配置不完整' };
    }

    try {
      const token = await this.getAccessToken(config.appId, config.appSecret);
      const fields = this.buildRecordFields(record);

      // 如果启用了图片上传，先上传图片再关联附件字段
      if (config.uploadImage && record.imageUrl) {
        try {
          const fileToken = await this.uploadImage(token, record.imageUrl, config.appToken);
          if (fileToken) {
            fields['图片附件'] = [{ file_token: fileToken }];
          }
        } catch (uploadErr) {
          console.warn('[FeishuAPI] 图片上传失败，仅写入文本:', uploadErr.message);
        }
      }

      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, message: `请求失败 (${response.status}): ${errText}` };
      }

      const result = await response.json();
      if (result.code === 0) {
        return { success: true, message: '已写入多维表格' };
      }
      return { success: false, message: `飞书返回错误: ${result.msg}` };
    } catch (e) {
      return { success: false, message: `网络错误: ${e.message}` };
    }
  },

  /**
   * 上传图片到飞书云盘，返回 file_token
   * @param {string} token - tenant_access_token
   * @param {string} imageUrl - 图片 URL
   * @param {string} appToken - 多维表格 app_token（作为上传父节点）
   * @returns {Promise<string|null>} file_token
   */
  async uploadImage(token, imageUrl, appToken) {
    // 1. 下载图片
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      throw new Error(`下载图片失败 (${imgResponse.status})`);
    }
    const blob = await imgResponse.blob();

    // 2. 生成文件名
    const ext = (blob.type.split('/')[1] || 'jpg').split(';')[0];
    const fileName = `prompt-reverse-${Date.now()}.${ext}`;

    // 3. 构建 multipart/form-data 上传
    const formData = new FormData();
    formData.append('file_name', fileName);
    formData.append('parent_type', 'bitable_file');
    formData.append('parent_node', appToken);
    formData.append('size', blob.size.toString());
    formData.append('file', blob, fileName);

    // 4. 上传到飞书云盘
    const uploadResponse = await fetch('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`上传失败 (${uploadResponse.status}): ${errText}`);
    }

    const result = await uploadResponse.json();
    if (result.code === 0 && result.data?.file_token) {
      return result.data.file_token;
    }
    throw new Error(`飞书返回错误: ${result.msg || JSON.stringify(result)}`);
  },

  /**
   * 构建多维表格的字段数据
   * 字段名需要与多维表格中的列名一致
   */
  buildRecordFields(record) {
    const fields = {};

    if (record.createdAt) {
      fields['生成时间'] = new Date(record.createdAt).toLocaleString('zh-CN');
    }
    if (record.imageUrl) {
      fields['图片链接'] = record.imageUrl;
    }
    if (record.sourceUrl) {
      fields['来源网页'] = record.sourceUrl;
    }
    if (record.modelName) {
      fields['使用模型'] = record.modelName;
    }
    if (record.chinesePrompt) {
      fields['中文提示词'] = record.chinesePrompt;
    }
    if (record.englishPrompt) {
      fields['英文提示词'] = record.englishPrompt;
    }
    if (record.negativePrompt) {
      fields['反向提示词'] = record.negativePrompt;
    }
    if (record.sceneDescription) {
      fields['画面描述'] = record.sceneDescription;
    }
    if (record.styleAnalysis) {
      fields['风格分析'] = record.styleAnalysis;
    }

    return fields;
  },

  /**
   * 测试飞书连接（获取 token + 读取表格字段列表）
   * @param {object} config - 包含 appId, appSecret, appToken, tableId
   * @returns {Promise<{success: boolean, message: string, fields?: Array}>}
   */
  async testConnection(config) {
    try {
      // 第一步：获取 token
      const token = await this.getAccessToken(config.appId, config.appSecret);

      // 第二步：读取数据表字段列表
      if (!config.appToken || !config.tableId) {
        return { success: true, message: 'Token 获取成功！请填写表格 ID 后测试写入。' };
      }

      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, message: `读取表格失败 (${response.status}): ${errText}` };
      }

      const result = await response.json();
      if (result.code === 0) {
        const fieldNames = (result.data?.items || []).map(f => f.field_name);
        return {
          success: true,
          message: `连接成功！表格字段: ${fieldNames.join(', ')}`,
          fields: result.data?.items || [],
        };
      }
      return { success: false, message: `飞书返回错误: ${result.msg}` };
    } catch (e) {
      return { success: false, message: `网络错误: ${e.message}` };
    }
  },

  /**
   * 测试写入一条记录
   * @param {object} config
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testWrite(config) {
    const testConfig = { ...config };
    // 测试写入时禁用图片上传（没有真实图片可上传）
    if (testConfig.uploadImage) {
      testConfig.uploadImage = false;
    }
    const testRecord = {
      createdAt: new Date().toISOString(),
      imageUrl: 'https://example.com/test.jpg',
      sourceUrl: 'https://example.com',
      modelName: '测试模型',
      chinesePrompt: '这是一条测试记录，用于验证多维表格写入是否正常。',
      englishPrompt: 'This is a test record for Bitable write verification.',
      negativePrompt: 'test, low quality',
      sceneDescription: '测试场景描述',
      styleAnalysis: '测试风格分析',
    };
    return this.writeToBitable(testRecord, testConfig);
  },

  /**
   * [兼容] 旧的 Webhook 发送方法（保留，以防部分用户仍在使用）
   */
  async sendToFeishuWebhook(record, feishuConfig) {
    if (!feishuConfig.enabled) {
      return { success: false, message: '飞书备份未启用' };
    }
    if (!feishuConfig.webhookUrl) {
      return { success: false, message: '飞书 Webhook URL 未配置' };
    }

    try {
      const response = await fetch(feishuConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: `图片反推提示词备份\n模型: ${record.modelName || '未知'}\n中文提示词: ${record.chinesePrompt || '无'}\n英文提示词: ${record.englishPrompt || '无'}` },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, message: `飞书请求失败 (${response.status}): ${errText}` };
      }

      const result = await response.json();
      if (result.code === 0 || result.StatusCode === 0) {
        return { success: true, message: '已发送到飞书' };
      }
      return { success: false, message: `飞书返回错误: ${result.msg || JSON.stringify(result)}` };
    } catch (e) {
      return { success: false, message: `网络错误: ${e.message}` };
    }
  },

  /**
   * [兼容] 旧的 Webhook 测试方法
   */
  async testFeishuWebhook(webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: 'AI图片提示词反推插件 - 连接测试成功！' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, message: `请求失败 (${response.status}): ${errText}` };
      }

      const result = await response.json();
      if (result.code === 0 || result.StatusCode === 0) {
        return { success: true, message: '测试消息已发送，请检查飞书群' };
      }
      return { success: false, message: `飞书返回: ${result.msg || JSON.stringify(result)}` };
    } catch (e) {
      return { success: false, message: `网络错误: ${e.message}` };
    }
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.FeishuAPI = FeishuAPI;
}
