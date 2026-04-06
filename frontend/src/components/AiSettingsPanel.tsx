import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, X, Save, Loader2, CheckCircle, AlertCircle, FlaskConical, Download, Key, Mic, Sparkles } from 'lucide-react';
import { apiFetch } from '../services/api';
import type { AiServiceConfig } from '../types';

interface AiSettingsPanelProps {
  onClose: () => void;
}

const MASKED = '***set***';



function SelectField({ label, value, options, hint, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; hint?: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400 font-medium">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-3 py-2 text-sm
                   text-white focus:outline-none focus:border-meeting-accent focus:ring-1
                   focus:ring-meeting-accent/50 transition-colors appearance-none cursor-pointer">
        {options.map((o) => <option key={o.value} value={o.value} className="bg-[#1e2433]">{o.label}</option>)}
      </select>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Field({ label, value, placeholder, type = 'text', hint, onChange }: {
  label: string; value: string; placeholder?: string; type?: string; hint?: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400 font-medium">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-3 py-2 text-sm
                   text-white placeholder-slate-500 focus:outline-none focus:border-meeting-accent
                   focus:ring-1 focus:ring-meeting-accent/50 transition-colors" />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function TestButton({ onClick, status, label }: { onClick: () => void; status: string; label: string }) {
  return (
    <button onClick={onClick} disabled={status === 'testing'}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border
                 border-meeting-border text-slate-400 hover:text-white hover:border-slate-500
                 disabled:opacity-50 transition-colors">
      {status === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

function TestResult({ status, message }: { status: string; message: string }) {
  if (status === 'idle' || status === 'testing') return null;
  const ok = status === 'ok';
  return (
    <div className={`flex items-start gap-1.5 text-xs rounded-lg px-3 py-2 ${ok ? 'bg-green-500/10 border border-green-500/20 text-green-300' : 'bg-red-500/10 border border-red-500/20 text-red-300'}`}>
      {ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
      {message}
    </div>
  );
}

type Tab = 'hf' | 'asr' | 'llm';
type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message: string };
type DlState = { status: 'idle' | 'checking' | 'cached' | 'needed' | 'downloading' | 'done' | 'error'; percent: number; file: string; total: number; message: string };

export default function AiSettingsPanel({ onClose }: AiSettingsPanelProps) {
  const { t } = useTranslation();

  const ASR_MODELS = [
    { value: 'mlx-community/whisper-small-mlx',        label: t('aiSettings.asr.modelSmall') },
    { value: 'mlx-community/whisper-medium-mlx',       label: t('aiSettings.asr.modelMedium') },
    { value: 'mlx-community/whisper-large-v3',         label: t('aiSettings.asr.modelLargeV3') },
    { value: 'mlx-community/whisper-large-v3-turbo',   label: t('aiSettings.asr.modelLargeV3Turbo') },
    { value: 'mlx-community/whisper-large-v3-mlx',     label: t('aiSettings.asr.modelLargeV3Mlx') },
  ];

  const ASR_LANGUAGES = [
    { value: '',    label: t('aiSettings.asr.langAuto') },
    { value: 'zh',  label: t('aiSettings.asr.langZh') },
    { value: 'yue', label: t('aiSettings.asr.langYue') },
    { value: 'en',  label: t('aiSettings.asr.langEn') },
    { value: 'ja',  label: t('aiSettings.asr.langJa') },
    { value: 'ko',  label: t('aiSettings.asr.langKo') },
    { value: 'fr',  label: t('aiSettings.asr.langFr') },
    { value: 'de',  label: t('aiSettings.asr.langDe') },
    { value: 'es',  label: t('aiSettings.asr.langEs') },
    { value: 'ru',  label: t('aiSettings.asr.langRu') },
    { value: 'ar',  label: t('aiSettings.asr.langAr') },
    { value: 'pt',  label: t('aiSettings.asr.langPt') },
    { value: 'it',  label: t('aiSettings.asr.langIt') },
    { value: 'vi',  label: t('aiSettings.asr.langVi') },
    { value: 'th',  label: t('aiSettings.asr.langTh') },
    { value: 'id',  label: t('aiSettings.asr.langId') },
  ];

  const [config, setConfig] = useState<AiServiceConfig>({
    asrBaseUrl: '', asrModel: '', asrApiKey: '', asrLanguage: '',
    llmBaseUrl: '', llmModel: '', llmApiKey: '',
    hfToken: '',
  });
  const [activeTab, setActiveTab] = useState<Tab>('hf');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hfTest,  setHfTest]  = useState<TestState>({ status: 'idle', message: '' });
  const [asrTest, setAsrTest] = useState<TestState>({ status: 'idle', message: '' });
  const [llmTest, setLlmTest] = useState<TestState>({ status: 'idle', message: '' });

  const [dlState, setDlState] = useState<DlState>({ status: 'idle', percent: 0, file: '', total: 0, message: '' });
  const dlAbortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    apiFetch<AiServiceConfig>('/api/config/ai')
      .then((cfg) => setConfig(cfg))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof AiServiceConfig) => (v: string) =>
    setConfig((prev) => ({ ...prev, [key]: v }));

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const updated = await apiFetch<AiServiceConfig>('/api/config/ai', { method: 'PUT', body: JSON.stringify(config) });
      setConfig(updated); setSaved(true);
      setTimeout(() => onClose(), 800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('aiSettings.errors.saveFailed'));
    } finally { setSaving(false); }
  };

  const handleTest = async (type: 'asr' | 'llm') => {
    const setState = type === 'asr' ? setAsrTest : setLlmTest;
    setState({ status: 'testing', message: '' });
    try {
      const body = type === 'asr'
        ? { type, baseUrl: config.asrBaseUrl, model: config.asrModel, apiKey: config.asrApiKey }
        : { type, baseUrl: config.llmBaseUrl, model: config.llmModel, apiKey: config.llmApiKey };
      const result = await apiFetch<{ ok: boolean; message: string }>('/api/config/ai/test', { method: 'POST', body: JSON.stringify(body) });
      setState({ status: result.ok ? 'ok' : 'fail', message: result.message });
    } catch (e: unknown) {
      setState({ status: 'fail', message: e instanceof Error ? e.message : t('aiSettings.errors.connectionFailed') });
    }
  };

  const handleTestHf = async () => {
    setHfTest({ status: 'testing', message: '' });
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>('/api/config/ai/test', { method: 'POST', body: JSON.stringify({ type: 'hf', token: config.hfToken }) });
      setHfTest({ status: result.ok ? 'ok' : 'fail', message: result.message });
    } catch (e: unknown) {
      setHfTest({ status: 'fail', message: e instanceof Error ? e.message : t('aiSettings.errors.requestFailed') });
    }
  };

  const checkModelCache = async (model: string) => {
    if (!model || !config.asrBaseUrl.trim()) return;
    setDlState({ status: 'checking', percent: 0, file: '', total: 0, message: '' });
    try {
      const r = await fetch(`/api/asr/check?model=${encodeURIComponent(model)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      });
      const data = await r.json() as { cached: boolean };
      setDlState((s) => ({ ...s, status: data.cached ? 'cached' : 'needed' }));
    } catch {
      setDlState((s) => ({ ...s, status: 'idle' }));
    }
  };

  const handleModelChange = (model: string) => {
    set('asrModel')(model);
    setDlState({ status: 'idle', percent: 0, file: '', total: 0, message: '' });
    void checkModelCache(model);
  };

  const startDownload = () => {
    const model = config.asrModel || ASR_MODELS[0].value;
    setDlState({ status: 'downloading', percent: 0, file: '', total: 0, message: '' });
    const controller = new AbortController();
    dlAbortRef.current = () => controller.abort();
    (async () => {
      try {
        const resp = await fetch(`/api/asr/download?model=${encodeURIComponent(model)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
          signal: controller.signal,
        });
        if (!resp.body) throw new Error('无响应体');
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const msg = JSON.parse(line.slice(6)) as { type: string; percent?: number; file?: string; total?: number; message?: string };
              if (msg.type === 'listing') setDlState((s) => ({ ...s, file: t('aiSettings.asr.listingFiles') }));
              else if (msg.type === 'start') setDlState((s) => ({ ...s, total: msg.total ?? 0, percent: 0 }));
              else if (msg.type === 'file') setDlState((s) => ({ ...s, file: msg.file ?? '', percent: msg.percent ?? s.percent, total: msg.total ?? s.total }));
              else if (msg.type === 'done') setDlState((s) => ({ ...s, status: 'done', percent: 100, file: '' }));
              else if (msg.type === 'error') setDlState((s) => ({ ...s, status: 'error', message: msg.message ?? t('aiSettings.asr.downloading') }));
            } catch { /* ignore */ }
          }
        }
      } catch (e: unknown) {
        if ((e as { name?: string }).name !== 'AbortError')
          setDlState((s) => ({ ...s, status: 'error', message: e instanceof Error ? e.message : t('aiSettings.errors.connectionFailed') }));
      }
    })();
  };

  const asrUsingLocal = config.asrBaseUrl.trim() !== '';
  const llmUsingLocal = config.llmBaseUrl.trim() !== '';
  const hfConfigured = config.hfToken && config.hfToken !== '';

  const TABS: { id: Tab; icon: React.ReactNode; label: string; badge?: boolean }[] = [
    { id: 'hf',  icon: <Key className="w-3.5 h-3.5" />,      label: t('aiSettings.tabs.hfToken'),  badge: !hfConfigured },
    { id: 'asr', icon: <Mic className="w-3.5 h-3.5" />,      label: t('aiSettings.tabs.asr') },
    { id: 'llm', icon: <Sparkles className="w-3.5 h-3.5" />, label: t('aiSettings.tabs.llm') },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-meeting-border flex-shrink-0">
        <div className="flex items-center gap-2 text-white font-medium">
          <Settings className="w-4 h-4 text-meeting-accent" />
          {t('aiSettings.title')}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-meeting-border">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors whitespace-nowrap
              ${activeTab === tab.id
                ? 'text-meeting-accent border-b-2 border-meeting-accent -mb-px'
                : 'text-slate-400 hover:text-slate-200'}`}>
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-meeting-accent" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ─── Tab: HF Token ─────────────────────────────────────── */}
          {activeTab === 'hf' && (
            <div className="space-y-4">
              {/* Banner */}
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 space-y-1">
                <p className="text-amber-300 text-sm font-semibold flex items-center gap-1.5">
                  <Key className="w-4 h-4" /> HuggingFace Token
                </p>
                <p className="text-amber-200/70 text-xs leading-relaxed">
                  {t('aiSettings.hf.bannerDescPre')} <span className="text-amber-300 font-medium">whisper-large-v3</span> {t('aiSettings.hf.bannerDescMid')}
                  <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer"
                    className="underline hover:text-amber-200">huggingface.co/settings/tokens</a> {t('aiSettings.hf.bannerDescSuffix')}
                </p>
              </div>

              <Field
                label={t('aiSettings.hf.label')}
                value={config.hfToken}
                type="password"
                placeholder={config.hfToken === MASKED ? t('aiSettings.hf.placeholderSet') : t('aiSettings.hf.placeholder')}
                onChange={set('hfToken')}
                hint={config.hfToken === MASKED ? t('aiSettings.hf.hint') : undefined}
              />

              <div className="flex items-center gap-2">
                <TestButton onClick={handleTestHf} status={hfTest.status} label={t('aiSettings.hf.testBtn')} />
                <TestResult status={hfTest.status} message={hfTest.message} />
              </div>
            </div>
          )}

          {/* ─── Tab: ASR ──────────────────────────────────────────── */}
          {activeTab === 'asr' && (
            <div className="space-y-4">
              <Field
                label={t('aiSettings.asr.serviceUrl')}
                value={config.asrBaseUrl}
                placeholder={t('aiSettings.asr.serviceUrlPlaceholder')}
                onChange={set('asrBaseUrl')}
                hint={t('aiSettings.asr.serviceUrlHint')}
              />

              {asrUsingLocal ? (
                <div className="space-y-3">
                  <SelectField
                    label={t('aiSettings.asr.model')}
                    value={config.asrModel || ASR_MODELS[0].value}
                    options={ASR_MODELS}
                    hint={t('aiSettings.asr.modelHint')}
                    onChange={handleModelChange}
                  />

                  {/* Download status */}
                  {dlState.status === 'checking' && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('aiSettings.asr.checking')}
                    </div>
                  )}
                  {dlState.status === 'cached' && (
                    <div className="flex items-center gap-1.5 text-xs text-green-400">
                      <CheckCircle className="w-3.5 h-3.5" /> {t('aiSettings.asr.cached')}
                    </div>
                  )}
                  {dlState.status === 'needed' && (
                    <button onClick={startDownload}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border
                                 border-blue-500/50 text-blue-300 hover:bg-blue-500/10 transition-colors">
                      <Download className="w-3.5 h-3.5" /> {t('aiSettings.asr.notCached')}
                    </button>
                  )}
                  {dlState.status === 'downloading' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> {t('aiSettings.asr.downloading')}</span>
                        <span>{dlState.percent}%</span>
                      </div>
                      <div className="w-full bg-meeting-border rounded-full h-1.5">
                        <div className="bg-meeting-accent h-1.5 rounded-full transition-all duration-300" style={{ width: `${dlState.percent}%` }} />
                      </div>
                      {dlState.file && <p className="text-xs text-slate-500 truncate">{dlState.file}</p>}
                    </div>
                  )}
                  {dlState.status === 'done' && (
                    <div className="space-y-1.5">
                      <div className="w-full bg-meeting-border rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full w-full" />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-green-400">
                        <CheckCircle className="w-3.5 h-3.5" /> {t('aiSettings.asr.downloadDone')}
                      </div>
                    </div>
                  )}
                  {dlState.status === 'error' && (
                    <div className="flex items-start gap-1.5 text-xs text-red-400">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {dlState.message}
                    </div>
                  )}
                </div>
              ) : (
                <Field label={t('aiSettings.asr.modelName')} value={config.asrModel} placeholder={t('aiSettings.asr.modelNamePlaceholder')} onChange={set('asrModel')} />
              )}

              <SelectField
                label={t('aiSettings.asr.language')}
                value={config.asrLanguage || ''}
                options={ASR_LANGUAGES}
                hint={t('aiSettings.asr.languageHint')}
                onChange={set('asrLanguage')}
              />

              <Field
                label={t('aiSettings.asr.apiKey')}
                value={config.asrApiKey}
                type="password"
                placeholder={config.asrApiKey === MASKED ? t('aiSettings.asr.apiKeyPlaceholderSet') : t('aiSettings.asr.apiKeyPlaceholder')}
                onChange={set('asrApiKey')}
                hint={config.asrApiKey === MASKED ? t('aiSettings.asr.apiKeyHint') : undefined}
              />

              <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
                asrUsingLocal ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300' : 'bg-meeting-bg border border-meeting-border text-slate-400'
              }`}>
                {asrUsingLocal ? t('aiSettings.asr.usingLocal') : t('aiSettings.asr.usingOpenAI')}
              </div>

              <TestButton onClick={() => handleTest('asr')} status={asrTest.status} label={t('aiSettings.asr.testBtn')} />
              <TestResult status={asrTest.status} message={asrTest.message} />
            </div>
          )}

          {/* ─── Tab: LLM ──────────────────────────────────────────── */}
          {activeTab === 'llm' && (
            <div className="space-y-4">
              <Field
                label={t('aiSettings.llm.serviceUrl')}
                value={config.llmBaseUrl}
                placeholder={t('aiSettings.llm.serviceUrlPlaceholder')}
                onChange={set('llmBaseUrl')}
                hint={t('aiSettings.llm.serviceUrlHint')}
              />
              <Field
                label={t('aiSettings.llm.model')}
                value={config.llmModel}
                placeholder={llmUsingLocal ? 'qwen3' : 'gpt-4o'}
                onChange={set('llmModel')}
              />
              <Field
                label={t('aiSettings.llm.apiKey')}
                value={config.llmApiKey}
                type="password"
                placeholder={config.llmApiKey === MASKED ? t('aiSettings.llm.apiKeyPlaceholderSet') : t('aiSettings.llm.apiKeyPlaceholder')}
                onChange={set('llmApiKey')}
                hint={config.llmApiKey === MASKED ? t('aiSettings.llm.apiKeyHint') : undefined}
              />

              <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
                llmUsingLocal ? 'bg-purple-500/10 border border-purple-500/20 text-purple-300' : 'bg-meeting-bg border border-meeting-border text-slate-400'
              }`}>
                {llmUsingLocal
                  ? (config.llmModel ? t('aiSettings.llm.usingLocal', { model: config.llmModel }) : t('aiSettings.llm.usingLocalNoModel'))
                  : t('aiSettings.llm.usingOpenAI')}
              </div>

              <TestButton onClick={() => handleTest('llm')} status={llmTest.status} label={t('aiSettings.llm.testBtn')} />
              <TestResult status={llmTest.status} message={llmTest.message} />
            </div>
          )}

          {/* Error / Success */}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-sm">{t('aiSettings.saved')}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-meeting-border">
        <button onClick={handleSave} disabled={loading || saving}
          className="w-full flex items-center justify-center gap-2 bg-meeting-accent hover:bg-blue-600
                     disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? t('aiSettings.saving') : t('aiSettings.saveBtn')}
        </button>
      </div>
    </div>
  );
}

