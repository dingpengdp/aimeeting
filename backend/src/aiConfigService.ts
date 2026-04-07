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

export type AsrProvider = 'local' | 'openai' | 'nvidia';

export const DEFAULT_LOCAL_ASR_URL = 'http://localhost:8000';
export const DEFAULT_LOCAL_ASR_MODEL = 'mlx-community/whisper-small-mlx';
export const DEFAULT_OPENAI_ASR_MODEL = 'whisper-1';
export const DEFAULT_NVIDIA_ASR_URL = 'https://integrate.api.nvidia.com/v1';
export const DEFAULT_NVIDIA_ASR_MODEL = 'nvidia/parakeet-ctc-1.1b';

function isAsrProvider(value: unknown): value is AsrProvider {
  return value === 'local' || value === 'openai' || value === 'nvidia';
}

export function normalizeAsrProvider(
  provider: unknown,
  fallback?: { asrBaseUrl?: string; asrModel?: string },
): AsrProvider {
  if (isAsrProvider(provider)) {
    return provider;
  }

  const baseUrl = fallback?.asrBaseUrl?.trim() || '';
  const model = fallback?.asrModel?.trim() || '';
  if (baseUrl.includes('nvidia.com')) {
    return 'nvidia';
  }
  if (baseUrl || model.startsWith('mlx-community/')) {
    return 'local';
  }
  return 'openai';
}

export function defaultAsrModel(provider: AsrProvider): string {
  if (provider === 'local') return DEFAULT_LOCAL_ASR_MODEL;
  if (provider === 'nvidia') return DEFAULT_NVIDIA_ASR_MODEL;
  return DEFAULT_OPENAI_ASR_MODEL;
}

export interface AiServiceConfig {
  asrProvider: AsrProvider;
  asrBaseUrl: string;
  asrModel: string;
  asrApiKey: string;
  /** ISO 639-1 language code, e.g. 'zh', 'en', 'yue'. Empty = auto-detect. */
  asrLanguage: string;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  hfToken: string;
}

/** Sent to the frontend — API keys are masked. */
export interface AiServiceConfigPublic {
  asrProvider: AsrProvider;
  asrBaseUrl: string;
  asrModel: string;
  /** `'***set***'` when a key has been configured; `''` otherwise. */
  asrApiKey: string;
  asrLanguage: string;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  hfToken: string;
}

const CONFIG_PATH = path.join(__dirname, '../data/aiConfig.json');
const MASKED = '***set***';

function envDefaults(): AiServiceConfig {
  const asrBaseUrl = process.env.ASR_BASE_URL ?? '';
  const asrProvider = normalizeAsrProvider(process.env.ASR_PROVIDER, {
    asrBaseUrl,
    asrModel: process.env.ASR_MODEL ?? '',
  });

  return {
    asrProvider,
    asrBaseUrl,
    asrModel: process.env.ASR_MODEL ?? defaultAsrModel(asrProvider),
    asrApiKey: process.env.ASR_API_KEY ?? '',
    asrLanguage: process.env.ASR_LANGUAGE ?? '',
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
        const asrProvider = normalizeAsrProvider(stored.asrProvider, {
          asrBaseUrl: stored.asrBaseUrl ?? defaults.asrBaseUrl,
          asrModel: stored.asrModel ?? defaults.asrModel,
        });
        this.cache = {
          asrProvider,
          asrBaseUrl: stored.asrBaseUrl ?? defaults.asrBaseUrl,
          asrModel: stored.asrModel ?? defaultAsrModel(asrProvider),
          asrApiKey: stored.asrApiKey ?? defaults.asrApiKey,
          asrLanguage: stored.asrLanguage ?? defaults.asrLanguage,
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
    const asrProvider = normalizeAsrProvider(patch.asrProvider ?? current.asrProvider, {
      asrBaseUrl: patch.asrBaseUrl ?? current.asrBaseUrl,
      asrModel: patch.asrModel ?? current.asrModel,
    });

    const updated: AiServiceConfig = {
      asrProvider,
      asrBaseUrl: patch.asrBaseUrl ?? current.asrBaseUrl,
      asrModel: patch.asrModel ?? current.asrModel ?? defaultAsrModel(asrProvider),
      asrApiKey: patch.asrApiKey === MASKED ? current.asrApiKey : (patch.asrApiKey ?? current.asrApiKey),
      asrLanguage: patch.asrLanguage ?? current.asrLanguage,
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
      asrProvider: cfg.asrProvider,
      asrBaseUrl: cfg.asrBaseUrl,
      asrModel: cfg.asrModel,
      asrApiKey: cfg.asrApiKey ? MASKED : '',
      asrLanguage: cfg.asrLanguage,
      llmBaseUrl: cfg.llmBaseUrl,
      llmModel: cfg.llmModel,
      llmApiKey: cfg.llmApiKey ? MASKED : '',
      hfToken: cfg.hfToken ? MASKED : '',
    };
  }
}

export const aiConfigService = new AiConfigService();
