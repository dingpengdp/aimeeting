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

export class AIService {
  private openai: OpenAI | null = null;
  private asrClient: OpenAI | null = null;

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

  /** 返回用于语音转录的客户端和模型名。
   *  优先使用本地 ASR 服务（ASR_BASE_URL），否则回退到 OpenAI Whisper。 */
  private getAsrClient(): { client: OpenAI; model: string } {
    const asrBaseUrl = process.env.ASR_BASE_URL;
    if (asrBaseUrl) {
      if (!this.asrClient) {
        this.asrClient = new OpenAI({
          baseURL: asrBaseUrl.replace(/\/$/, '') + '/v1',
          apiKey: process.env.ASR_API_KEY ?? 'EMPTY',
        });
      }
      const model = process.env.ASR_MODEL ?? 'Qwen/Qwen3-ASR-1.7B';
      return { client: this.asrClient, model };
    }
    return { client: this.getClient(), model: 'whisper-1' };
  }

  async transcribe(filePath: string): Promise<string> {
    const { client, model } = this.getAsrClient();
    const fileStream = fs.createReadStream(filePath);

    const response = await client.audio.transcriptions.create({
      file: fileStream,
      model,
      response_format: 'text',
    });

    return response as unknown as string;
  }

  async generateMinutes(transcription: string): Promise<string> {
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
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
}

export const aiService = new AIService();
