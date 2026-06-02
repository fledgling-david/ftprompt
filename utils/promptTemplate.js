/**
 * promptTemplate.js - 提示词解析工具
 * 负责从模型返回的文本中解析出结构化的提示词
 */

const PromptParser = {
  /**
   * 从模型返回的文本中解析出各部分提示词
   * @param {string} rawText - 模型返回的原始文本
   * @returns {{chinesePrompt: string, englishPrompt: string, negativePrompt: string, description: string, styleAnalysis: string, rawText: string}}
   */
  parse(rawText) {
    const result = {
      chinesePrompt: '',
      englishPrompt: '',
      negativePrompt: '',
      description: '',
      styleAnalysis: '',
      rawText: rawText,
    };

    if (!rawText) return result;

    // 按 Markdown 标题分割
    const sections = this._splitByHeadings(rawText);

    for (const section of sections) {
      const title = section.title.toLowerCase();
      const content = section.content.trim();

      if (this._matchTitle(title, ['中文提示词', 'chinese prompt', '中文prompt', '中文提示'])) {
        result.chinesePrompt = content;
      } else if (this._matchTitle(title, ['英文提示词', 'english prompt', '英文prompt', 'english'])) {
        result.englishPrompt = content;
      } else if (this._matchTitle(title, ['negative prompt', '负面提示词', 'negative', '反面提示'])) {
        result.negativePrompt = content;
      } else if (this._matchTitle(title, ['图片内容描述', '内容描述', '描述', 'description'])) {
        result.description = content;
      } else if (this._matchTitle(title, ['风格分析', '风格', 'style', '画风'])) {
        result.styleAnalysis = content;
      }
    }

    // 如果解析不到中英文提示词，尝试从文本整体中提取
    if (!result.chinesePrompt && !result.englishPrompt) {
      // 将整个文本作为描述
      result.description = rawText;
    }

    return result;
  },

  /**
   * 按 Markdown 标题 (## / **标题**) 分割文本
   */
  _splitByHeadings(text) {
    const sections = [];
    const lines = text.split('\n');
    let currentTitle = '';
    let currentContent = [];

    for (const line of lines) {
      // 匹配 ## 标题 或 ### 标题
      const headingMatch = line.match(/^#{1,4}\s+(.+)/);
      // 匹配 **标题** 或 **标题：**
      const boldMatch = line.match(/^\*\*(.+?)\*\*[：:]*\s*$/);

      if (headingMatch) {
        if (currentTitle || currentContent.length > 0) {
          sections.push({ title: currentTitle, content: currentContent.join('\n') });
        }
        currentTitle = headingMatch[1].trim();
        currentContent = [];
      } else if (boldMatch) {
        if (currentTitle || currentContent.length > 0) {
          sections.push({ title: currentTitle, content: currentContent.join('\n') });
        }
        currentTitle = boldMatch[1].trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    // 最后一段
    if (currentTitle || currentContent.length > 0) {
      sections.push({ title: currentTitle, content: currentContent.join('\n') });
    }

    return sections;
  },

  /**
   * 检查标题是否匹配关键词列表
   */
  _matchTitle(title, keywords) {
    const lower = title.toLowerCase();
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
  },

  /**
   * 将解析结果格式化为纯文本
   */
  toPlainText(parsed) {
    const parts = [];
    if (parsed.description) parts.push(`【图片描述】\n${parsed.description}`);
    if (parsed.styleAnalysis) parts.push(`【风格分析】\n${parsed.styleAnalysis}`);
    if (parsed.chinesePrompt) parts.push(`【中文提示词】\n${parsed.chinesePrompt}`);
    if (parsed.englishPrompt) parts.push(`【英文提示词】\n${parsed.englishPrompt}`);
    if (parsed.negativePrompt) parts.push(`【Negative Prompt】\n${parsed.negativePrompt}`);
    return parts.join('\n\n');
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.PromptParser = PromptParser;
}
