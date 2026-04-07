import fs from 'fs';
import path from 'path';

export interface SmtpConfig {
  host: string;
  port: string;
  secure: boolean;
  from: string;
  user: string;
  pass: string;
}

export interface SmtpConfigPublic {
  host: string;
  port: string;
  secure: boolean;
  from: string;
  user: string;
  pass: string;
}

const CONFIG_PATH = path.join(__dirname, '../data/smtpConfig.json');
const MASKED = '***set***';

function parseBoolean(value?: string): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function envDefaults(): SmtpConfig {
  return {
    host: process.env.SMTP_HOST ?? '',
    port: process.env.SMTP_PORT ?? '587',
    secure: parseBoolean(process.env.SMTP_SECURE),
    from: process.env.SMTP_FROM ?? '',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  };
}

class SmtpConfigService {
  private cache: SmtpConfig | null = null;

  getConfig(): SmtpConfig {
    if (this.cache) return this.cache;

    const defaults = envDefaults();

    if (fs.existsSync(CONFIG_PATH)) {
      try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const stored = JSON.parse(raw) as Partial<SmtpConfig>;
        this.cache = {
          host: stored.host ?? defaults.host,
          port: stored.port ?? defaults.port,
          secure: typeof stored.secure === 'boolean' ? stored.secure : defaults.secure,
          from: stored.from ?? defaults.from,
          user: stored.user ?? defaults.user,
          pass: stored.pass ?? defaults.pass,
        };
        return this.cache;
      } catch {
        // Ignore corrupt config and fall back to env defaults.
      }
    }

    this.cache = defaults;
    return this.cache;
  }

  updateConfig(patch: Partial<SmtpConfigPublic>): SmtpConfig {
    const current = this.getConfig();

    const updated: SmtpConfig = {
      host: patch.host ?? current.host,
      port: patch.port ?? current.port,
      secure: typeof patch.secure === 'boolean' ? patch.secure : current.secure,
      from: patch.from ?? current.from,
      user: patch.user ?? current.user,
      pass: patch.pass === MASKED ? current.pass : (patch.pass ?? current.pass),
    };

    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');

    this.cache = updated;
    return updated;
  }

  getPublicConfig(): SmtpConfigPublic {
    const cfg = this.getConfig();
    return {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      from: cfg.from,
      user: cfg.user,
      pass: cfg.pass ? MASKED : '',
    };
  }
}

export const smtpConfigService = new SmtpConfigService();