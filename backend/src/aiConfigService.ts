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

import fs from 'fs';
import path from 'path';

export interface AiServiceConfig {
  asrBaseUrl: string;
  asrModel: string;
  asrApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  hfToken: string;
}

/** Sent to the frontend — API keys are masked. */
export interface AiServiceConfigPublic {
  asrBaseUrl: string;
  asrModel: string;
  /** `'***set***'` when a key has been configured; `''` otherwise. */
  asrApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  hfToken: string;
}

const CONFIG_PATH = path.join(__dirname, '../data/aiConfig.json');
const MASKED = '***set***';

function envDefaults(): AiServiceConfig {
  return {
    asrBaseUrl: process.env.ASR_BASE_URL ?? '',
    asrModel: process.env.ASR_MODEL ?? 'mlx-community/whisper-small-mlx',
    asrApiKey: process.env.ASR_API_KEY ?? '',
    llmBaseUrl: process.env.LLM_BASE_URL ?? '',
    llmModel: process.env.LLM_MODEL ?? '',
    llmApiKey: process.env.LLM_API_KEY ?? '',
    hfToken: process.env.HF_TOKEN ?? '',
  };
}

class AiConfigService {
  private cache: AiServiceConfig | null = null;

  /** Load config from disk (merged over env defaults). */
  getConfig(): AiServiceConfig {
    if (this.cache) return this.cache;

    const defaults = envDefaults();

    if (fs.existsSync(CONFIG_PATH)) {
      try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const stored = JSON.parse(raw) as Partial<AiServiceConfig>;
        this.cache = {
          asrBaseUrl: stored.asrBaseUrl ?? defaults.asrBaseUrl,
          asrModel: stored.asrModel ?? defaults.asrModel,
          asrApiKey: stored.asrApiKey ?? defaults.asrApiKey,
          llmBaseUrl: stored.llmBaseUrl ?? defaults.llmBaseUrl,
          llmModel: stored.llmModel ?? defaults.llmModel,
          llmApiKey: stored.llmApiKey ?? defaults.llmApiKey,
          hfToken: stored.hfToken ?? defaults.hfToken,
        };
        return this.cache;
      } catch {
        // Ignore corrupt file, fall through to defaults.
      }
    }

    this.cache = defaults;
    return this.cache;
  }

  /** Persist updated config to disk.
   *  Fields whose value equals `MASKED` are kept unchanged. */
  updateConfig(patch: Partial<AiServiceConfigPublic>): AiServiceConfig {
    const current = this.getConfig();

    const updated: AiServiceConfig = {
      asrBaseUrl: patch.asrBaseUrl ?? current.asrBaseUrl,
      asrModel: patch.asrModel ?? current.asrModel,
      asrApiKey: patch.asrApiKey === MASKED ? current.asrApiKey : (patch.asrApiKey ?? current.asrApiKey),
      llmBaseUrl: patch.llmBaseUrl ?? current.llmBaseUrl,
      llmModel: patch.llmModel ?? current.llmModel,
      llmApiKey: patch.llmApiKey === MASKED ? current.llmApiKey : (patch.llmApiKey ?? current.llmApiKey),
      hfToken: patch.hfToken === MASKED ? current.hfToken : (patch.hfToken ?? current.hfToken),
    };

    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');

    this.cache = updated;
    return updated;
  }

  /** Return public-safe view (mask non-empty API keys). */
  getPublicConfig(): AiServiceConfigPublic {
    const cfg = this.getConfig();
    return {
      asrBaseUrl: cfg.asrBaseUrl,
      asrModel: cfg.asrModel,
      asrApiKey: cfg.asrApiKey ? MASKED : '',
      llmBaseUrl: cfg.llmBaseUrl,
      llmModel: cfg.llmModel,
      llmApiKey: cfg.llmApiKey ? MASKED : '',
      hfToken: cfg.hfToken ? MASKED : '',
    };
  }
}

export const aiConfigService = new AiConfigService();
