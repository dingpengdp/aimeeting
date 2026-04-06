import { useState, useEffect, useRef } from 'react';
import { Settings, X, Save, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, FlaskConical, Download } from 'lucide-react';
import { apiFetch } from '../services/api';
import type { AiServiceConfig } from '../types';

interface AiSettingsPanelProps {
  onClose: () => void;
}

const MASKED = '***set***';

function SectionHeader({
  title,
  subtitle,
  open,
  onToggle,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 text-left group"
    >
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-slate-400 text-xs">{subtitle}</p>
      </div>
      {open ? (
        <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
      ) : (
        <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
      )}
    </button>
  );
}

const ASR_MODELS = [
  { value: 'mlx-community/whisper-small-mlx',        label: 'whisper-small（已缓存，~500MB，速度快）' },
  { value: 'mlx-community/whisper-medium-mlx',       label: 'whisper-medium（~1.5GB，均衡）' },
  { value: 'mlx-community/whisper-large-v3',         label: 'whisper-large-v3（~3GB，最高精度）' },
  { value: 'mlx-community/whisper-large-v3-turbo',   label: 'whisper-large-v3-turbo（~1.5GB，速度优先）' },
  { value: 'mlx-community/whisper-large-v3-mlx',     label: 'whisper-large-v3-mlx（~3GB，MLX 优化版）' },
];

function SelectField({
  label,
  value,
  options,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400 font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-3 py-2 text-sm
                   text-white focus:outline-none focus:border-meeting-accent
                   focus:ring-1 focus:ring-meeting-accent/50 transition-colors appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1e2433]">{o.label}</option>
        ))}
      </select>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  type = 'text',
  hint,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400 font-medium">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-3 py-2 text-sm
                   text-white placeholder-slate-500 focus:outline-none focus:border-meeting-accent
                   focus:ring-1 focus:ring-meeting-accent/50 transition-colors"
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function AiSettingsPanel({ onClose }: AiSettingsPanelProps) {
  const [config, setConfig] = useState<AiServiceConfig>({
    asrBaseUrl: '',
    asrModel: '',
    asrApiKey: '',
    llmBaseUrl: '',
    llmModel: '',
    llmApiKey: '',
    hfToken: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asrOpen, setAsrOpen] = useState(true);
  const [llmOpen, setLlmOpen] = useState(true);

  type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message: string };
  const [asrTest, setAsrTest] = useState<TestState>({ status: 'idle', message: '' });
  const [llmTest, setLlmTest] = useState<TestState>({ status: 'idle', message: '' });

  useEffect(() => {
    apiFetch<AiServiceConfig>('/api/config/ai')
      .then((cfg) => setConfig(cfg))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<AiServiceConfig>('/api/config/ai', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      setConfig(updated);
      setSaved(true);
      setTimeout(() => onClose(), 800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof AiServiceConfig) => (v: string) =>
    setConfig((prev) => ({ ...prev, [key]: v }));

  const [hfTest, setHfTest] = useState<TestState>({ status: 'idle', message: '' });

  // ── ASR model download ────────────────────────────────────────────────────
  type DlState = { status: 'idle' | 'checking' | 'cached' | 'needed' | 'downloading' | 'done' | 'error'; percent: number; file: string; total: number; message: string };
  const [dlState, setDlState] = useState<DlState>({ status: 'idle', percent: 0, file: '', total: 0, message: '' });
  const dlAbortRef = useRef<(() => void) | null>(null);

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
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const msg = JSON.parse(line.slice(6)) as { type: string; percent?: number; file?: string; total?: number; message?: string };
              if (msg.type === 'listing') {
                setDlState((s) => ({ ...s, file: '获取文件列表…' }));
              } else if (msg.type === 'start') {
                setDlState((s) => ({ ...s, total: msg.total ?? 0, percent: 0 }));
              } else if (msg.type === 'file') {
                setDlState((s) => ({ ...s, file: msg.file ?? '', percent: msg.percent ?? s.percent, total: msg.total ?? s.total }));
              } else if (msg.type === 'done') {
                setDlState((s) => ({ ...s, status: 'done', percent: 100, file: '' }));
              } else if (msg.type === 'error') {
                setDlState((s) => ({ ...s, status: 'error', message: msg.message ?? '下载失败' }));
              }
            } catch { /* ignore */ }
          }
        }
      } catch (e: unknown) {
        if ((e as { name?: string }).name !== 'AbortError') {
          setDlState((s) => ({ ...s, status: 'error', message: e instanceof Error ? e.message : '下载失败' }));
        }
      }
    })();
  };

  const handleTestHf = async () => {
    setHfTest({ status: 'testing', message: '' });
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>('/api/config/ai/test', {
        method: 'POST',
        body: JSON.stringify({ type: 'hf', token: config.hfToken }),
      });
      setHfTest({ status: result.ok ? 'ok' : 'fail', message: result.message });
    } catch (e: unknown) {
      setHfTest({ status: 'fail', message: e instanceof Error ? e.message : '请求失败' });
    }
  };

  const handleTest = async (type: 'asr' | 'llm') => {
    const setState = type === 'asr' ? setAsrTest : setLlmTest;
    setState({ status: 'testing', message: '' });
    try {
      const body = type === 'asr'
        ? { type, baseUrl: config.asrBaseUrl, model: config.asrModel, apiKey: config.asrApiKey }
        : { type, baseUrl: config.llmBaseUrl, model: config.llmModel, apiKey: config.llmApiKey };
      const result = await apiFetch<{ ok: boolean; message: string }>('/api/config/ai/test', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setState({ status: result.ok ? 'ok' : 'fail', message: result.message });
    } catch (e: unknown) {
      setState({ status: 'fail', message: e instanceof Error ? e.message : '连接失败' });
    }
  };

  const asrUsingLocal = config.asrBaseUrl.trim() !== '';
  const llmUsingLocal = config.llmBaseUrl.trim() !== '';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-meeting-border flex-shrink-0">
        <div className="flex items-center gap-2 text-white font-medium">
          <Settings className="w-4 h-4 text-meeting-accent" />
          AI 服务配置
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-meeting-accent" />
          </div>
        )}

        {!loading && (
          <>
            {/* ── ASR Section ── */}
            <div className="bg-meeting-surface border border-meeting-border rounded-xl p-3 space-y-3">
              <SectionHeader
                title="🎙 语音识别（ASR）"
                subtitle={asrUsingLocal ? '使用本地模型' : '使用 OpenAI Whisper-1'}
                open={asrOpen}
                onToggle={() => setAsrOpen((o) => !o)}
              />

              {asrOpen && (
                <div className="space-y-3 pt-1">
                  <Field
                    label="本地服务地址"
                    value={config.asrBaseUrl}
                    placeholder="留空使用 OpenAI Whisper，如 http://localhost:8000"
                    onChange={set('asrBaseUrl')}
                    hint="填写后优先使用本地模型，跳过 OpenAI"
                  />
                  {asrUsingLocal ? (
                    <>
                    <SelectField
                      label="ASR 模型"
                      value={config.asrModel || ASR_MODELS[0].value}
                      options={ASR_MODELS}
                      hint="更换模型需下载；大模型需配置 HF Token"
                      onChange={handleModelChange}
                    />
                    {/* ── Download status / progress ── */}
                    {dlState.status === 'checking' && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 检查本地缓存…
                      </div>
                    )}
                    {dlState.status === 'cached' && (
                      <div className="flex items-center gap-1.5 text-xs text-green-400">
                        <CheckCircle className="w-3.5 h-3.5" /> 模型已缓存，可直接使用
                      </div>
                    )}
                    {dlState.status === 'needed' && (
                      <button
                        onClick={startDownload}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border
                                   border-blue-500/50 text-blue-300 hover:bg-blue-500/10 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> 模型未缓存，点击下载
                      </button>
                    )}
                    {dlState.status === 'downloading' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> 下载中…</span>
                          <span>{dlState.percent}%</span>
                        </div>
                        <div className="w-full bg-meeting-border rounded-full h-1.5">
                          <div
                            className="bg-meeting-accent h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${dlState.percent}%` }}
                          />
                        </div>
                        {dlState.file && (
                          <p className="text-xs text-slate-500 truncate">{dlState.file}</p>
                        )}
                      </div>
                    )}
                    {dlState.status === 'done' && (
                      <div className="space-y-1.5">
                        <div className="w-full bg-meeting-border rounded-full h-1.5">
                          <div className="bg-green-500 h-1.5 rounded-full w-full" />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle className="w-3.5 h-3.5" /> 下载完成，重启 ASR 服务后生效
                        </div>
                      </div>
                    )}
                    {dlState.status === 'error' && (
                      <div className="flex items-start gap-1.5 text-xs text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {dlState.message}
                      </div>
                    )}
                    </>
                  ) : (
                    <Field
                      label="模型名称"
                      value={config.asrModel}
                      placeholder="whisper-1（自动）"
                      onChange={set('asrModel')}
                    />
                  )}
                  <Field
                    label="API Key"
                    value={config.asrApiKey}
                    type="password"
                    placeholder={config.asrApiKey === MASKED ? '已设置（修改请重新输入）' : '留空（本地服务通常不需要）'}
                    onChange={set('asrApiKey')}
                    hint={config.asrApiKey === MASKED ? '当前已配置，不修改请留空' : undefined}
                  />
                  <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
                    asrUsingLocal
                      ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
                      : 'bg-meeting-bg border border-meeting-border text-slate-400'
                  }`}>
                    {asrUsingLocal
                      ? '✓ 将使用本地 ASR 服务进行语音转录'
                      : '将使用 OpenAI Whisper-1（需配置 OPENAI_API_KEY）'}
                  </div>

                  <button
                    onClick={() => handleTest('asr')}
                    disabled={asrTest.status === 'testing'}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border
                               border-meeting-border text-slate-400 hover:text-white hover:border-slate-500
                               disabled:opacity-50 transition-colors"
                  >
                    {asrTest.status === 'testing'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FlaskConical className="w-3.5 h-3.5" />}
                    测试连接
                  </button>

                  {asrTest.status !== 'idle' && asrTest.status !== 'testing' && (
                    <div className={`flex items-start gap-1.5 text-xs rounded-lg px-3 py-2 ${
                      asrTest.status === 'ok'
                        ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                        : 'bg-red-500/10 border border-red-500/20 text-red-300'
                    }`}>
                      {asrTest.status === 'ok'
                        ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                      {asrTest.message}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── LLM Section ── */}
            <div className="bg-meeting-surface border border-meeting-border rounded-xl p-3 space-y-3">
              <SectionHeader
                title="✨ 纪要生成（LLM）"
                subtitle={llmUsingLocal ? '使用本地/自定义模型' : '使用 OpenAI GPT-4o'}
                open={llmOpen}
                onToggle={() => setLlmOpen((o) => !o)}
              />

              {llmOpen && (
                <div className="space-y-3 pt-1">
                  <Field
                    label="本地服务地址"
                    value={config.llmBaseUrl}
                    placeholder="留空使用 OpenAI GPT-4o，如 http://localhost:11434"
                    onChange={set('llmBaseUrl')}
                    hint="兼容 OpenAI Chat Completions API 的服务均可使用（Ollama、vllm 等）"
                  />
                  <Field
                    label="模型名称"
                    value={config.llmModel}
                    placeholder={llmUsingLocal ? 'qwen3' : 'gpt-4o（自动）'}
                    onChange={set('llmModel')}
                  />
                  <Field
                    label="API Key"
                    value={config.llmApiKey}
                    type="password"
                    placeholder={config.llmApiKey === MASKED ? '已设置（修改请重新输入）' : '留空（本地服务通常不需要）'}
                    onChange={set('llmApiKey')}
                    hint={config.llmApiKey === MASKED ? '当前已配置，不修改请留空' : undefined}
                  />
                  <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
                    llmUsingLocal
                      ? 'bg-purple-500/10 border border-purple-500/20 text-purple-300'
                      : 'bg-meeting-bg border border-meeting-border text-slate-400'
                  }`}>
                    {llmUsingLocal
                      ? `✓ 将使用本地 LLM 生成会议纪要${config.llmModel ? `（${config.llmModel}）` : ''}`
                      : '将使用 OpenAI GPT-4o（需配置 OPENAI_API_KEY）'}
                  </div>

                  <button
                    onClick={() => handleTest('llm')}
                    disabled={llmTest.status === 'testing'}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border
                               border-meeting-border text-slate-400 hover:text-white hover:border-slate-500
                               disabled:opacity-50 transition-colors"
                  >
                    {llmTest.status === 'testing'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FlaskConical className="w-3.5 h-3.5" />}
                    测试连接
                  </button>

                  {llmTest.status !== 'idle' && llmTest.status !== 'testing' && (
                    <div className={`flex items-start gap-1.5 text-xs rounded-lg px-3 py-2 ${
                      llmTest.status === 'ok'
                        ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                        : 'bg-red-500/10 border border-red-500/20 text-red-300'
                    }`}>
                      {llmTest.status === 'ok'
                        ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                      {llmTest.message}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── HuggingFace Token ── */}
            <div className="bg-meeting-surface border border-meeting-border rounded-xl p-3 space-y-3">
              <div>
                <p className="text-white text-sm font-medium">🔑 HuggingFace Token</p>
                <p className="text-slate-400 text-xs mt-0.5">下载需要登录的模型（如 whisper-large-v3）时使用</p>
              </div>
              <Field
                label="HF Token"
                value={config.hfToken}
                type="password"
                placeholder={config.hfToken === MASKED ? '已设置（修改请重新输入）' : 'hf_xxxxxxxxxxxxxxxx'}
                onChange={set('hfToken')}
                hint={config.hfToken === MASKED ? '当前已配置，不修改请留空' : '从 huggingface.co/settings/tokens 获取，免费申请'}
              />
              <button
                onClick={handleTestHf}
                disabled={hfTest.status === 'testing'}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border
                           border-meeting-border text-slate-400 hover:text-white hover:border-slate-500
                           disabled:opacity-50 transition-colors"
              >
                {hfTest.status === 'testing'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FlaskConical className="w-3.5 h-3.5" />}
                测试 Token
              </button>
              {hfTest.status !== 'idle' && hfTest.status !== 'testing' && (
                <div className={`flex items-start gap-1.5 text-xs rounded-lg px-3 py-2 ${
                  hfTest.status === 'ok'
                    ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                    : 'bg-red-500/10 border border-red-500/20 text-red-300'
                }`}>
                  {hfTest.status === 'ok'
                    ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                  {hfTest.message}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Success */}
            {saved && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="text-green-400 text-sm">配置已保存</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer save button */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-meeting-border">
        <button
          onClick={handleSave}
          disabled={loading || saving}
          className="w-full flex items-center justify-center gap-2 bg-meeting-accent hover:bg-blue-600
                     disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? '保存中…' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
