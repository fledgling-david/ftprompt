/**
 * feishu.js - 飞书 Webhook 备份功能
 * 支持飞书机器人 Webhook 消息发送
 */

const FeishuAPI = {
  /**
   * 发送反推记录到飞书 Webhook
   * @param {object} record - 反推记录
   * @param {object} feishuConfig - 飞书配置
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async sendToFeishuWebhook(record, feishuConfig) {
    if (!feishuConfig.enabled) {
      return { success: false, message: '飞书备份未启用' };
    }
    if (!feishuConfig.webhookUrl) {
      return { success: false, message: '飞书 Webhook URL 未配置' };
    }

    const message = this.formatFeishuMessage(record, feishuConfig);

    try {
      const response = await fetch(feishuConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, message: `飞书请求失败 (${response.status}): ${errText}` };
      }

      const result = await response.json();
      // 飞书 Webhook 返回 code: 0 表示成功
      if (result.code === 0 || result.StatusCode === 0) {
        return { success: true, message: '已发送到飞书' };
      }
      return { success: false, message: `飞书返回错误: ${result.msg || JSON.stringify(result)}` };
    } catch (e) {
      return { success: false, message: `网络错误: ${e.message}` };
    }
  },

  /**
   * 格式化飞书消息体
   * @param {object} record
   * @param {object} feishuConfig
   * @returns {object} 飞书消息 JSON
   */
  formatFeishuMessage(record, feishuConfig) {
    const format = feishuConfig.format || 'markdown';

    if (format === 'json') {
      return this._formatJsonMessage(record, feishuConfig);
    }

    // 默认使用富文本 (post) 消息，支持 Markdown 风格
    return this._formatRichMessage(record, feishuConfig);
  },

  /**
   * 飞书富文本消息格式
   */
  _formatRichMessage(record, feishuConfig) {
    const lines = [];

    if (feishuConfig.sendTimestamp && record.createdAt) {
      lines.push(['生成时间：', new Date(record.createdAt).toLocaleString('zh-CN')]);
    }
    if (feishuConfig.sendSourceUrl && record.sourceUrl) {
      lines.push(['来源网页：', record.sourceUrl]);
    }
    if (feishuConfig.sendImageUrl && record.imageUrl) {
      lines.push(['图片链接：', record.imageUrl]);
    }
    if (record.modelName) {
      lines.push(['使用模型：', record.modelName]);
    }
    if (feishuConfig.sendPromptContent) {
      if (record.chinesePrompt) {
        lines.push(['', '']);
        lines.push(['【中文提示词】', '']);
        lines.push([record.chinesePrompt, '']);
      }
      if (record.englishPrompt) {
        lines.push(['【英文提示词】', '']);
        lines.push([record.englishPrompt, '']);
      }
      if (record.negativePrompt) {
        lines.push(['【Negative Prompt】', '']);
        lines.push([record.negativePrompt, '']);
      }
    }

    // 构建飞书 post 消息格式
    const content = lines.map(([text, extra]) => {
      const elements = [];
      if (text) {
        // 检查是否是 URL
        if (text.startsWith('http://') || text.startsWith('https://')) {
          elements.push({ tag: 'a', text: text, href: text });
        } else {
          elements.push({ tag: 'text', text: text });
        }
      }
      if (extra) {
        elements.push({ tag: 'text', text: extra });
      }
      return elements;
    });

    return {
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title: '图片反推提示词备份',
            content: content,
          },
        },
      },
    };
  },

  /**
   * JSON 格式消息（用于自定义 Webhook）
   */
  _formatJsonMessage(record, feishuConfig) {
    const payload = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: '图片反推提示词备份' },
          template: 'blue',
        },
        elements: [],
      },
    };

    const fields = [];
    if (feishuConfig.sendTimestamp && record.createdAt) {
      fields.push({ is_short: true, text: { tag: 'lark_md', content: `**生成时间：** ${new Date(record.createdAt).toLocaleString('zh-CN')}` } });
    }
    if (record.modelName) {
      fields.push({ is_short: true, text: { tag: 'lark_md', content: `**使用模型：** ${record.modelName}` } });
    }
    if (fields.length) {
      payload.card.elements.push({ tag: 'div', fields });
    }

    if (feishuConfig.sendSourceUrl && record.sourceUrl) {
      payload.card.elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `**来源网页：** [${record.sourceUrl}](${record.sourceUrl})` },
      });
    }

    if (feishuConfig.sendImageUrl && record.imageUrl) {
      payload.card.elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `**图片链接：** [${record.imageUrl}](${record.imageUrl})` },
      });
    }

    if (feishuConfig.sendPromptContent) {
      if (record.chinesePrompt) {
        payload.card.elements.push({ tag: 'hr' });
        payload.card.elements.push({
          tag: 'div',
          text: { tag: 'lark_md', content: `**中文提示词：**\n${record.chinesePrompt}` },
        });
      }
      if (record.englishPrompt) {
        payload.card.elements.push({
          tag: 'div',
          text: { tag: 'lark_md', content: `**英文提示词：**\n${record.englishPrompt}` },
        });
      }
      if (record.negativePrompt) {
        payload.card.elements.push({
          tag: 'div',
          text: { tag: 'lark_md', content: `**Negative Prompt：**\n${record.negativePrompt}` },
        });
      }
    }

    return payload;
  },

  /**
   * 测试飞书 Webhook 连接
   * @param {string} webhookUrl
   * @returns {Promise<{success: boolean, message: string}>}
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
