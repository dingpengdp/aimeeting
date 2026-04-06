/*
Copyright 2024 mark.ding

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import OpenAI from 'openai';
import fs from 'fs';
import { aiConfigService } from './aiConfigService';

export class AIService {
  private openai: OpenAI | null = null;
  private asrClient: OpenAI | null = null;
  private llmClient: OpenAI | null = null;

  /** Normalize a base URL to always end with /v1, regardless of whether the user included it. */
  private static toBaseUrl(url: string): string {
    return url.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';
  }

  /** Call after updating AI config so new connections are created. */
  resetClients() {
    this.asrClient = null;
    this.llmClient = null;
  }

  private getClient(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
      }
      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }

  /** 返回用于纪要生成的客户端和模型名。
   *  优先使用自定义 LLM（LLM_BASE_URL），否则回退到 OpenAI GPT-4o。 */
  private getLlmClient(): { client: OpenAI; model: string } {
    const cfg = aiConfigService.getConfig();
    const llmBaseUrl = cfg.llmBaseUrl;
    if (llmBaseUrl) {
      if (!this.llmClient) {
        this.llmClient = new OpenAI({
          baseURL: AIService.toBaseUrl(llmBaseUrl),
          apiKey: cfg.llmApiKey || 'EMPTY',
        });
      }
      const model = cfg.llmModel || 'qwen3';
      return { client: this.llmClient, model };
    }
    return { client: this.getClient(), model: cfg.llmModel || 'gpt-4o' };
  }

  /** 返回用于语音转录的客户端和模型名。
   *  优先使用本地 ASR 服务（ASR_BASE_URL），否则回退到 OpenAI Whisper。 */
  private getAsrClient(): { client: OpenAI; model: string } {
    const cfg = aiConfigService.getConfig();
    const asrBaseUrl = cfg.asrBaseUrl;
    if (asrBaseUrl) {
      if (!this.asrClient) {
        this.asrClient = new OpenAI({
          baseURL: AIService.toBaseUrl(asrBaseUrl),
          apiKey: cfg.asrApiKey || 'EMPTY',
        });
      }
      const model = cfg.asrModel || 'mlx-community/whisper-small-mlx';
      return { client: this.asrClient, model };
    }
    return { client: this.getClient(), model: 'whisper-1' };
  }

  async transcribe(filePath: string): Promise<string> {
    const { client, model } = this.getAsrClient();
    const fileStream = fs.createReadStream(filePath);
    const language = aiConfigService.getConfig().asrLanguage || undefined;

    const response = await client.audio.transcriptions.create({
      file: fileStream,
      model,
      response_format: 'text',
      ...(language ? { language } : {}),
    });

    return response as unknown as string;
  }

  async generateMinutes(transcription: string): Promise<string> {
    const { client, model } = this.getLlmClient();

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `你是一个专业的会议纪要助手。请根据会议转录文本，生成一份结构清晰的中文会议纪要。

纪要格式要求（使用 Markdown）：
# 会议纪要

**会议主题**：（根据内容推断）
**会议时间**：（如有提及）
**参会人员**：（如有提及）

## 一、主要讨论内容
（按主题分类，用简洁清楚的语言描述）

## 二、重要决议与结论

## 三、行动项与待办事项
| 任务 | 负责人 | 截止时间 |
|------|--------|----------|

## 四、下一步计划

---
*本纪要由 AI 自动生成，请核实后归档。*`,
        },
        {
          role: 'user',
          content: `请根据以下会议录音转录内容生成会议纪要：\n\n${transcription}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });

    return response.choices[0].message.content ?? '';
  }

  /**
   * Test connectivity for ASR or LLM using the given (potentially unsaved) config.
   * If apiKey is the masked sentinel, falls back to the currently stored key.
   */
  async testConnection(
    type: 'asr' | 'llm',
    params: { baseUrl?: string; model?: string; apiKey?: string },
  ): Promise<{ ok: boolean; message: string }> {
    const MASKED = '***set***';
    const stored = aiConfigService.getConfig();
    const start = Date.now();

    const resolveKey = (provided: string | undefined, stored: string | undefined, fallback: string | undefined) =>
      provided === MASKED ? (stored || fallback || '') : (provided || stored || fallback || '');

    try {
      if (type === 'asr') {
        const baseUrl = (params.baseUrl ?? stored.asrBaseUrl ?? '').trim();
        const apiKey = resolveKey(params.apiKey, stored.asrApiKey, process.env.OPENAI_API_KEY);
        const model = params.model || stored.asrModel;

        if (baseUrl) {
          // Use the standard OpenAI-compatible /v1/models endpoint — works with
          // both vLLM and our custom asr_server.py (which also exposes it below).
          const client = new OpenAI({
            baseURL: AIService.toBaseUrl(baseUrl),
            apiKey: apiKey || 'EMPTY',
          });
          await client.models.list({ timeout: 8000 } as never);
          const latency = Date.now() - start;
          return { ok: true, message: `本地 ASR 连接成功（${latency}ms）${model ? '，模型：' + model : ''}` };
        } else {
          if (!apiKey) return { ok: false, message: '未配置 OpenAI API Key' };
          const client = new OpenAI({ apiKey });
          await client.models.retrieve('whisper-1', { timeout: 8000 });
          return { ok: true, message: `OpenAI Whisper-1 可用（${Date.now() - start}ms）` };
        }
      } else {
        const baseUrl = (params.baseUrl ?? stored.llmBaseUrl ?? '').trim();
        const apiKey = resolveKey(params.apiKey, stored.llmApiKey, process.env.OPENAI_API_KEY);
        const model = params.model || stored.llmModel || (baseUrl ? 'qwen3' : 'gpt-4o');

        const client = new OpenAI({
          baseURL: baseUrl ? AIService.toBaseUrl(baseUrl) : undefined,
          apiKey: apiKey || (baseUrl ? 'EMPTY' : 'sk-placeholder'),
        });
        const resp = await client.chat.completions.create(
          { model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 },
          { timeout: 15000 },
        );
        const latency = Date.now() - start;
        return { ok: true, message: `${baseUrl ? '本地 LLM' : 'OpenAI'} 连接成功，模型：${resp.model}（${latency}ms）` };
      }
    } catch (e: unknown) {
      // Node.js native fetch wraps the real error in error.cause
      const withCause = e as { cause?: unknown };
      const root = withCause?.cause instanceof Error ? withCause.cause : (e instanceof Error ? e : null);
      let msg = root?.message ?? '连接失败';
      if (msg.includes('ECONNREFUSED')) msg = '连接被拒绝（服务未启动？请确认 ASR/LLM 服务正在运行）';
      else if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN')) msg = '域名解析失败，请检查服务地址是否正确';
      else if (msg.includes('ETIMEDOUT') || msg.includes('abort') || msg.includes('AbortError')) msg = '连接超时，请检查地址或防火墙设置';
      return { ok: false, message: msg };
    }
  }

  async testHfToken(token: string): Promise<{ ok: boolean; message: string }> {
    const MASKED = '***set***';
    const stored = aiConfigService.getConfig();
    const resolved = token === MASKED ? stored.hfToken : token;
    if (!resolved) return { ok: false, message: '未填写 HuggingFace Token' };
    try {
      const resp = await fetch('https://huggingface.co/api/whoami-v2', {
        headers: { Authorization: `Bearer ${resolved}` },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.status === 401) return { ok: false, message: 'Token 无效或已过期' };
      if (!resp.ok) return { ok: false, message: `HuggingFace 返回 ${resp.status}` };
      const data = await resp.json() as { name?: string };
      return { ok: true, message: `认证成功，用户：${data.name ?? '未知'}` };
    } catch (e: unknown) {
      const root = (e as { cause?: Error }).cause ?? (e instanceof Error ? e : null);
      const msg = (root as Error | null)?.message ?? '请求失败';
      if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN')) return { ok: false, message: '无法连接 HuggingFace，请检查网络' };
      if (msg.includes('abort') || msg.includes('TimeoutError')) return { ok: false, message: '请求超时，请检查网络' };
      return { ok: false, message: msg };
    }
  }
}

export const aiService = new AIService();
