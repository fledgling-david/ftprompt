/**
 * models.js - AI 视觉模型调用封装
 * 支持 OpenAI Compatible API / Gemini / 自定义适配器
 */

const ModelCaller = {
  /**
   * 主入口：调用视觉模型
   * @param {string} imageBase64 - 不含 data URI 前缀的 base64
   * @param {string} mimeType - 图片 MIME 类型
   * @param {object} modelConfig - 模型配置 { baseUrl, apiKey, model, requestType }
   * @param {{systemPrompt: string, userPrompt: string}} promptTemplate
   * @returns {Promise<string>} 模型返回的文本内容
   */
  async callVisionModel(imageBase64, mimeType, modelConfig, promptTemplate) {
    const { requestType } = modelConfig;

    switch (requestType) {
      case 'gemini':
        return this.callGeminiVisionModel(imageBase64, mimeType, modelConfig, promptTemplate);
      case 'custom':
        return this.callCustomAdapter(imageBase64, mimeType, modelConfig, promptTemplate);
      case 'openai':
      default:
        return this.callOpenAICompatible(imageBase64, mimeType, modelConfig, promptTemplate);
    }
  },

  /**
   * OpenAI Compatible API 调用
   * 支持: OpenAI / Claude中转 / DeepSeek / 通义千问 / 智谱 / 火山方舟 / 硅基流动 等
   */
  async callOpenAICompatible(imageBase64, mimeType, modelConfig, promptTemplate) {
    const { baseUrl, apiKey, model } = modelConfig;
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    const body = {
      model: model,
      messages: [
        {
          role: 'system',
          content: promptTemplate.systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: promptTemplate.userPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60秒超时

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`模型请求失败 (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      return this.parseModelResponse(result);
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('请求超时（60秒），请检查网络连接或换用更快的模型');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Gemini API 调用（预留适配）
   */
  async callGeminiVisionModel(imageBase64, mimeType, modelConfig, promptTemplate) {
    const { baseUrl, apiKey, model } = modelConfig;
    // Gemini API 格式
    const url = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          parts: [
            { text: promptTemplate.systemPrompt + '\n\n' + promptTemplate.userPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini 请求失败 (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      if (result.candidates && result.candidates[0]?.content?.parts) {
        return result.candidates[0].content.parts.map(p => p.text).join('\n');
      }
      return JSON.stringify(result);
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('请求超时（60秒），请检查网络连接或换用更快的模型');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * 自定义适配器（预留扩展）
   * 用户可以在此实现特殊 API 格式
   */
  async callCustomAdapter(imageBase64, mimeType, modelConfig, promptTemplate) {
    // 默认回退到 OpenAI Compatible
    console.warn('[ModelCaller] 自定义适配器未实现，回退到 OpenAI Compatible');
    return this.callOpenAICompatible(imageBase64, mimeType, modelConfig, promptTemplate);
  },

  /**
   * 解析 OpenAI Compatible 响应
   * @param {object} response
   * @returns {string}
   */
  parseModelResponse(response) {
    try {
      if (response.choices && response.choices.length > 0) {
        const choice = response.choices[0];
        if (choice.message && choice.message.content) {
          return choice.message.content;
        }
      }
      // 某些 API 返回格式不同
      if (response.output && response.output.text) {
        return response.output.text;
      }
      return JSON.stringify(response);
    } catch (e) {
      throw new Error('解析模型响应失败: ' + e.message);
    }
  },

  /**
   * 测试模型连接
   * @param {object} modelConfig
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testModelConnection(modelConfig) {
    try {
      const { baseUrl, apiKey, model, requestType } = modelConfig;

      if (requestType === 'gemini') {
        const url = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Hello, reply with "OK".' }] }],
          }),
        });
        if (response.ok) {
          return { success: true, message: '连接成功' };
        }
        const errText = await response.text();
        return { success: false, message: `请求失败 (${response.status}): ${errText}` };
      }

      // OpenAI Compatible
      const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hello, reply with "OK".' }],
          max_tokens: 10,
        }),
      });

      if (response.ok) {
        return { success: true, message: '连接成功' };
      }
      const errText = await response.text();
      return { success: false, message: `请求失败 (${response.status}): ${errText}` };
    } catch (e) {
      return { success: false, message: `网络错误: ${e.message}` };
    }
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.ModelCaller = ModelCaller;
}
