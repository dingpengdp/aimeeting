import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { AuthService } from './auth';
import { emailService } from './emailService';

interface StoredPasswordResetToken {
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface PasswordResetRequestResult {
  message: string;
  previewResetLink?: string;
}

const TOKENS_FILE_PATH = path.join(__dirname, '../data/password-reset-tokens.json');
const DEFAULT_TOKEN_TTL_MINUTES = 30;

function ensureStorageDir(): void {
  const dirPath = path.dirname(TOKENS_FILE_PATH);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getTokenTtlMinutes(): number {
  const parsed = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? '');
  if (Number.isFinite(parsed) && parsed >= 5 && parsed <= 1440) {
    return Math.floor(parsed);
  }
  return DEFAULT_TOKEN_TTL_MINUTES;
}

function getAppBaseUrl(): string {
  return (process.env.APP_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

function shouldExposePreviewLink(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_PASSWORD_RESET_PREVIEW === 'true';
}

export class PasswordResetService {
  private tokens: StoredPasswordResetToken[] = [];

  constructor(private authService: AuthService) {
    ensureStorageDir();
    this.loadTokens();
  }

  async requestReset(email: string): Promise<PasswordResetRequestResult> {
    this.cleanupExpired();

    const message = '如果该邮箱已注册，系统会发送密码重置方式';
    const user = this.authService.findUserByEmail(email);
    if (!user) {
      return { message };
    }

    const now = Date.now();
    const ttlMinutes = getTokenTtlMinutes();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const resetLink = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;

    this.tokens = this.tokens.filter((entry) => entry.userId !== user.id);
    this.tokens.push({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMinutes * 60 * 1000).toISOString(),
    });
    this.persistTokens();

    try {
      const emailSent = await emailService.sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetLink,
        expiresMinutes: ttlMinutes,
      });

      if (emailSent) {
        return { message };
      }
    } catch (error) {
      console.error('Failed to send password reset email', error);
    }

    return shouldExposePreviewLink() ? { message, previewResetLink: resetLink } : { message };
  }

  resetPassword(token: string, password: string): void {
    this.cleanupExpired();

    const normalizedToken = token.trim();
    if (normalizedToken.length < 16) {
      throw new Error('RESET_TOKEN_INVALID');
    }

    const tokenHash = hashToken(normalizedToken);
    const entry = this.tokens.find((item) => item.tokenHash === tokenHash);
    if (!entry) {
      throw new Error('RESET_TOKEN_INVALID');
    }

    if (new Date(entry.expiresAt).getTime() <= Date.now()) {
      this.tokens = this.tokens.filter((item) => item.tokenHash !== tokenHash);
      this.persistTokens();
      throw new Error('RESET_TOKEN_EXPIRED');
    }

    this.authService.updatePassword(entry.userId, password);
    this.tokens = this.tokens.filter((item) => item.userId !== entry.userId);
    this.persistTokens();
  }

  private loadTokens(): void {
    if (!fs.existsSync(TOKENS_FILE_PATH)) {
      return;
    }

    const raw = fs.readFileSync(TOKENS_FILE_PATH, 'utf8').trim();
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as StoredPasswordResetToken[];
    this.tokens = parsed;
    this.cleanupExpired();
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const nextTokens = this.tokens.filter((item) => new Date(item.expiresAt).getTime() > now);
    if (nextTokens.length !== this.tokens.length) {
      this.tokens = nextTokens;
      this.persistTokens();
    }
  }

  private persistTokens(): void {
    fs.writeFileSync(TOKENS_FILE_PATH, JSON.stringify(this.tokens, null, 2), 'utf8');
  }
}