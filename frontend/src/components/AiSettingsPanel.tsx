import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, X, Save, Loader2, CheckCircle, AlertCircle, FlaskConical, Download, Key, Mic, Sparkles, Mail, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../services/api';
import type { AiServiceConfig, AsrProvider, SmtpConfig } from '../types';

interface AiSettingsPanelProps {
  onClose: () => void;
}

const MASKED = '***set***';
const LOCAL_ASR_URL = 'http://localhost:8000';
const LOCAL_ASR_MODEL = 'mlx-community/whisper-small-mlx';
const OPENAI_ASR_MODEL = 'whisper-1';
const NVIDIA_ASR_URL = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_ASR_MODEL = 'nvidia/parakeet-ctc-1.1b';



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

function ToggleField({ label, checked, hint, onChange }: {
  label: string; checked: boolean; hint?: string; onChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400 font-medium">{label}</label>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
          checked
            ? 'border-meeting-accent bg-meeting-accent/10 text-white'
            : 'border-meeting-border bg-meeting-bg text-slate-300'
        }`}
      >
        <span>{checked ? 'ON' : 'OFF'}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${checked ? 'bg-green-400' : 'bg-slate-500'}`} />
      </button>
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

type Tab = 'asr' | 'llm' | 'smtp';
type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message: string };
type DlState = { status: 'idle' | 'checking' | 'cached' | 'needed' | 'downloading' | 'done' | 'error'; percent: number; file: string; total: number; message: string };

const IDLE_DL_STATE: DlState = { status: 'idle', percent: 0, file: '', total: 0, message: '' };

function defaultAsrModel(provider: AsrProvider): string {
  if (provider === 'local') return LOCAL_ASR_MODEL;
  if (provider === 'nvidia') return NVIDIA_ASR_MODEL;
  return OPENAI_ASR_MODEL;
}

function normalizeAsrConfig(config: AiServiceConfig): AiServiceConfig {
  const asrProvider = config.asrProvider || (config.asrBaseUrl.trim().includes('nvidia.com') ? 'nvidia' : (config.asrBaseUrl.trim() ? 'local' : 'openai'));
  return {
    ...config,
    asrProvider,
    asrModel: config.asrModel || defaultAsrModel(asrProvider),
  };
}

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

  const ASR_PROVIDERS = [
    { value: 'local', label: t('aiSettings.asr.providerLocal') },
    { value: 'openai', label: t('aiSettings.asr.providerOpenAI') },
    { value: 'nvidia', label: t('aiSettings.asr.providerNvidia') },
  ];

  const [config, setConfig] = useState<AiServiceConfig>({
    asrProvider: 'openai',
    asrBaseUrl: '', asrModel: '', asrApiKey: '', asrLanguage: '',
    llmBaseUrl: '', llmModel: '', llmApiKey: '',
    hfToken: '',
  });
  const [activeTab, setActiveTab] = useState<Tab>('asr');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hfTest,  setHfTest]  = useState<TestState>({ status: 'idle', message: '' });
  const [asrTest, setAsrTest] = useState<TestState>({ status: 'idle', message: '' });
  const [llmTest, setLlmTest] = useState<TestState>({ status: 'idle', message: '' });
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({
    host: '',
    port: '587',
    secure: false,
    from: '',
    user: '',
    pass: '',
  });
  const [smtpTest, setSmtpTest] = useState<TestState>({ status: 'idle', message: '' });

  const [dlState, setDlState] = useState<DlState>(IDLE_DL_STATE);
  const dlAbortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<AiServiceConfig>('/api/config/ai'),
      apiFetch<SmtpConfig>('/api/config/smtp'),
    ])
      .then(([aiCfg, smtpCfg]) => {
        const nextConfig = normalizeAsrConfig(aiCfg);
        setConfig(nextConfig);
        setSmtpConfig(smtpCfg);
        if (nextConfig.asrProvider === 'local') {
          void checkModelCache(nextConfig.asrModel || LOCAL_ASR_MODEL, nextConfig.asrBaseUrl, nextConfig.asrProvider);
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => {
    dlAbortRef.current?.();
  }, []);

  const set = (key: keyof AiServiceConfig) => (v: string) => {
    setSaved(false);
    setConfig((prev) => ({ ...prev, [key]: v }));
  };

  const setSmtp = (key: keyof SmtpConfig) => (value: string | boolean) => {
    setSaved(false);
    setSmtpConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const [updatedAi, updatedSmtp] = await Promise.all([
        apiFetch<AiServiceConfig>('/api/config/ai', { method: 'PUT', body: JSON.stringify(config) }),
        apiFetch<SmtpConfig>('/api/config/smtp', { method: 'PUT', body: JSON.stringify(smtpConfig) }),
      ]);
      setConfig(normalizeAsrConfig(updatedAi));
      setSmtpConfig(updatedSmtp);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('aiSettings.errors.saveFailed'));
    } finally { setSaving(false); }
  };

  const handleTest = async (type: 'asr' | 'llm') => {
    const setState = type === 'asr' ? setAsrTest : setLlmTest;
    setState({ status: 'testing', message: '' });
    try {
      const body = type === 'asr'
        ? { type, provider: config.asrProvider, baseUrl: config.asrBaseUrl, model: config.asrModel, apiKey: config.asrApiKey }
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

  const handleTestSmtp = async () => {
    setSmtpTest({ status: 'testing', message: '' });
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>('/api/config/smtp/test', {
        method: 'POST',
        body: JSON.stringify(smtpConfig),
      });
      setSmtpTest({ status: result.ok ? 'ok' : 'fail', message: result.message });
    } catch (e: unknown) {
      setSmtpTest({ status: 'fail', message: e instanceof Error ? e.message : t('aiSettings.errors.connectionFailed') });
    }
  };

  const checkModelCache = async (
    model: string,
    baseUrl = config.asrBaseUrl,
    provider = config.asrProvider,
  ) => {
    if (!model || provider !== 'local') return;

    const effectiveBaseUrl = baseUrl.trim() || LOCAL_ASR_URL;
    setDlState({ status: 'checking', percent: 0, file: '', total: 0, message: '' });
    try {
      const r = await fetch(`/api/asr/check?model=${encodeURIComponent(model)}&baseUrl=${encodeURIComponent(effectiveBaseUrl)}`, {
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
    setDlState(IDLE_DL_STATE);
    void checkModelCache(model);
  };

  const handleAsrProviderChange = (providerValue: string) => {
    const provider = providerValue as AsrProvider;
    let nextBaseUrl = config.asrBaseUrl;
    let nextModel = config.asrModel;

    if (provider === 'local') {
      nextBaseUrl = config.asrProvider === 'local' ? config.asrBaseUrl : '';
      if (config.asrProvider !== 'local' || !nextModel.startsWith('mlx-community/')) {
        nextModel = LOCAL_ASR_MODEL;
      }
    } else if (provider === 'openai') {
      nextBaseUrl = config.asrProvider === 'openai' ? config.asrBaseUrl : '';
      if (config.asrProvider !== 'openai' || !nextModel || nextModel.startsWith('mlx-community/')) {
        nextModel = OPENAI_ASR_MODEL;
      }
    } else {
      nextBaseUrl = config.asrProvider === 'nvidia' && config.asrBaseUrl ? config.asrBaseUrl : NVIDIA_ASR_URL;
      if (config.asrProvider !== 'nvidia' || !nextModel || nextModel.startsWith('mlx-community/')) {
        nextModel = NVIDIA_ASR_MODEL;
      }
    }

    const nextConfig = {
      ...config,
      asrProvider: provider,
      asrBaseUrl: nextBaseUrl,
      asrModel: nextModel,
    };

    dlAbortRef.current?.();
    dlAbortRef.current = null;
    setSaved(false);
    setDlState(IDLE_DL_STATE);
    setAsrTest({ status: 'idle', message: '' });
    setHfTest({ status: 'idle', message: '' });
    setConfig(nextConfig);

    if (provider === 'local') {
      void checkModelCache(nextModel, nextBaseUrl, provider);
    }
  };

  const startDownload = () => {
    if (config.asrProvider !== 'local') return;

    const model = config.asrModel || ASR_MODELS[0].value;
    const effectiveBaseUrl = config.asrBaseUrl.trim() || LOCAL_ASR_URL;
    setDlState({ status: 'downloading', percent: 0, file: '', total: 0, message: '' });
    const controller = new AbortController();
    dlAbortRef.current = () => controller.abort();
    (async () => {
      try {
        const resp = await fetch(`/api/asr/download?model=${encodeURIComponent(model)}&baseUrl=${encodeURIComponent(effectiveBaseUrl)}`, {
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

  const asrUsingLocal = config.asrProvider === 'local';
  const asrUsingOpenAI = config.asrProvider === 'openai';
  const llmUsingLocal = config.llmBaseUrl.trim() !== '';
  const hfConfigured = config.hfToken && config.hfToken !== '';
  const asrStatusText = asrUsingLocal
    ? t('aiSettings.asr.usingLocal')
    : asrUsingOpenAI
      ? t('aiSettings.asr.usingOpenAI')
      : t('aiSettings.asr.usingNvidia');

  const TABS: { id: Tab; icon: React.ReactNode; label: string; badge?: boolean }[] = [
    { id: 'asr', icon: <Mic className="w-3.5 h-3.5" />,      label: t('aiSettings.tabs.asr') },
    { id: 'llm', icon: <Sparkles className="w-3.5 h-3.5" />, label: t('aiSettings.tabs.llm') },
    { id: 'smtp', icon: <Mail className="w-3.5 h-3.5" />, label: t('aiSettings.tabs.smtp') },
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

          {/* ─── Tab: ASR ──────────────────────────────────────────── */}
          {activeTab === 'asr' && (
            <div className="space-y-4">
              <SelectField
                label={t('aiSettings.asr.provider')}
                value={config.asrProvider}
                options={ASR_PROVIDERS}
                hint={t('aiSettings.asr.providerHint')}
                onChange={handleAsrProviderChange}
              />

              {asrUsingLocal ? (
                <div className="space-y-3">
                  <Field
                    label={t('aiSettings.asr.serviceUrl')}
                    value={config.asrBaseUrl}
                    placeholder={t('aiSettings.asr.serviceUrlPlaceholder')}
                    onChange={set('asrBaseUrl')}
                    hint={t('aiSettings.asr.serviceUrlHint')}
                  />

                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 space-y-1">
                    <p className="text-amber-300 text-sm font-semibold flex items-center gap-1.5">
                      <Key className="w-4 h-4" /> {t('aiSettings.hf.bannerTitle')}
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

                  <SelectField
                    label={t('aiSettings.asr.model')}
                    value={config.asrModel || LOCAL_ASR_MODEL}
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
                <div className="space-y-4">
                  <Field
                    label={t('aiSettings.asr.cloudUrl')}
                    value={config.asrBaseUrl}
                    placeholder={asrUsingOpenAI ? t('aiSettings.asr.cloudUrlPlaceholderOpenAI') : t('aiSettings.asr.cloudUrlPlaceholderNvidia')}
                    onChange={set('asrBaseUrl')}
                    hint={asrUsingOpenAI ? t('aiSettings.asr.cloudUrlHintOpenAI') : t('aiSettings.asr.cloudUrlHintNvidia')}
                  />

                  <Field
                    label={t('aiSettings.asr.modelName')}
                    value={config.asrModel}
                    placeholder={asrUsingOpenAI ? t('aiSettings.asr.modelNamePlaceholderOpenAI') : t('aiSettings.asr.modelNamePlaceholderNvidia')}
                    onChange={set('asrModel')}
                    hint={t('aiSettings.asr.modelNameHint')}
                  />

                  <Field
                    label={t('aiSettings.asr.apiKey')}
                    value={config.asrApiKey}
                    type="password"
                    placeholder={config.asrApiKey === MASKED ? t('aiSettings.asr.apiKeyPlaceholderSet') : t('aiSettings.asr.apiKeyPlaceholderCloud')}
                    onChange={set('asrApiKey')}
                    hint={config.asrApiKey === MASKED ? t('aiSettings.asr.apiKeyHint') : undefined}
                  />
                </div>
              )}

              <SelectField
                label={t('aiSettings.asr.language')}
                value={config.asrLanguage || ''}
                options={ASR_LANGUAGES}
                hint={t('aiSettings.asr.languageHint')}
                onChange={set('asrLanguage')}
              />

              <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
                asrUsingLocal
                  ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
                  : asrUsingOpenAI
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
              }`}>
                {asrStatusText}
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

          {activeTab === 'smtp' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 space-y-1">
                <p className="text-amber-300 text-sm font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> {t('aiSettings.smtp.adminOnlyTitle')}
                </p>
                <p className="text-amber-200/70 text-xs leading-relaxed">
                  {t('aiSettings.smtp.adminOnlyDesc')}
                </p>
              </div>

              <Field
                label={t('aiSettings.smtp.host')}
                value={smtpConfig.host}
                placeholder={t('aiSettings.smtp.hostPlaceholder')}
                onChange={setSmtp('host')}
              />

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={t('aiSettings.smtp.port')}
                  value={smtpConfig.port}
                  placeholder="587"
                  onChange={setSmtp('port')}
                />
                <ToggleField
                  label={t('aiSettings.smtp.secure')}
                  checked={smtpConfig.secure}
                  hint={t('aiSettings.smtp.secureHint')}
                  onChange={(checked) => setSmtp('secure')(checked)}
                />
              </div>

              <Field
                label={t('aiSettings.smtp.from')}
                value={smtpConfig.from}
                placeholder={t('aiSettings.smtp.fromPlaceholder')}
                onChange={setSmtp('from')}
              />

              <Field
                label={t('aiSettings.smtp.user')}
                value={smtpConfig.user}
                placeholder={t('aiSettings.smtp.userPlaceholder')}
                onChange={setSmtp('user')}
              />

              <Field
                label={t('aiSettings.smtp.pass')}
                value={smtpConfig.pass}
                type="password"
                placeholder={smtpConfig.pass === MASKED ? t('aiSettings.smtp.passPlaceholderSet') : t('aiSettings.smtp.passPlaceholder')}
                onChange={setSmtp('pass')}
                hint={smtpConfig.pass === MASKED ? t('aiSettings.smtp.passHint') : undefined}
              />

              <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2 bg-meeting-bg border border-meeting-border text-slate-400">
                {smtpConfig.host.trim() && smtpConfig.from.trim()
                  ? t('aiSettings.smtp.ready')
                  : t('aiSettings.smtp.notConfigured')}
              </div>

              <TestButton onClick={handleTestSmtp} status={smtpTest.status} label={t('aiSettings.smtp.testBtn')} />
              <TestResult status={smtpTest.status} message={smtpTest.message} />
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

