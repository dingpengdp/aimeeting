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

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TurnServer = require('node-turn');
import { RoomManager } from './rooms';
import { setupSocketHandlers } from './socketHandlers';
import { aiService } from './aiService';
import { aiConfigService } from './aiConfigService';
import { smtpConfigService } from './smtpConfigService';
import { AuthService, attachSocketUser, requireAuth, requireAdminAuth, type AuthenticatedRequest } from './auth';
import { getClientConfig } from './clientConfig';
import { createRateLimiter } from './rateLimit';
import { PasswordResetService } from './passwordResetService';
import { emailService } from './emailService';

const app = express();
const httpServer = createServer(app);

app.set('trust proxy', 1);
app.disable('x-powered-by');

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8,
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'video/webm', 'video/mp4', 'audio/mpeg'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only audio and video files are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

const authService = new AuthService();
const passwordResetService = new PasswordResetService(authService);
const roomManager = new RoomManager();
io.use(attachSocketUser(authService));
setupSocketHandlers(io, roomManager);

const requireUser = requireAuth(authService);
const requireAdmin = requireAdminAuth(authService);
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: '登录或注册尝试过于频繁，请 15 分钟后再试',
  keyPrefix: 'auth',
});
const roomAccessLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: '入会口令校验过于频繁，请稍后再试',
  keyPrefix: 'room-access',
  keyGenerator: (req) => `${req.ip || 'unknown'}:${req.params.roomId || 'unknown'}`,
});
const passwordResetRequestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: '密码重置请求过于频繁，请稍后再试',
  keyPrefix: 'password-reset-request',
});
const passwordResetConfirmLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: '密码重置尝试过于频繁，请稍后再试',
  keyPrefix: 'password-reset-confirm',
});
const roomInviteLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: '会议邀请发送过于频繁，请稍后再试',
  keyPrefix: 'room-invite',
});

function normalizeInviteEmails(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const emails = input
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean);

  const deduped = Array.from(new Set(emails));
  for (const email of deduped) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('INVALID_INVITE_EMAIL');
    }
  }

  if (deduped.length > 50) {
    throw new Error('TOO_MANY_INVITES');
  }

  return deduped;
}

function buildMeetingJoinLink(roomId: string): string {
  const appBaseUrl = (process.env.APP_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
  return `${appBaseUrl}/?roomId=${encodeURIComponent(roomId)}`;
}

async function sendMeetingInvites(options: {
  emails: string[];
  inviterName: string;
  roomTitle: string;
  roomId: string;
  hasPasscode: boolean;
  scheduledAt?: string;
}): Promise<{ deliveredEmails: string[]; previewLinks: string[] }> {
  const { emails, inviterName, roomTitle, roomId, hasPasscode, scheduledAt } = options;
  const deliveredEmails: string[] = [];
  const previewLinks: string[] = [];
  const joinLink = buildMeetingJoinLink(roomId);

  for (const email of emails) {
    try {
      const sent = await emailService.sendMeetingInviteEmail({
        email,
        inviterName,
        roomTitle,
        roomId,
        joinLink,
        hasPasscode,
        scheduledAt,
      });

      if (sent) {
        deliveredEmails.push(email);
      } else {
        previewLinks.push(joinLink);
      }
    } catch (error) {
      console.error(`Failed to send invite to ${email}`, error);
      previewLinks.push(joinLink);
    }
  }

  return {
    deliveredEmails,
    previewLinks: Array.from(new Set(previewLinks)),
  };
}

function mapAuthRouteError(message: string): { status: number; error: string } {
  if (message === 'EMAIL_EXISTS') {
    return { status: 409, error: '该邮箱已注册' };
  }

  if (message === 'INVALID_NAME') {
    return { status: 400, error: '姓名长度需在 2 到 50 个字符之间' };
  }

  if (message === 'INVALID_EMAIL') {
    return { status: 400, error: '请输入有效的邮箱地址' };
  }

  if (message === 'INVALID_PASSWORD') {
    return { status: 400, error: '密码长度需在 8 到 128 个字符之间' };
  }

  if (message === 'JWT_SECRET_INVALID') {
    return { status: 500, error: '服务端认证配置异常，请检查 JWT_SECRET 配置' };
  }

  return { status: 500, error: '注册失败' };
}

function mapPasswordResetError(message: string): { status: number; error: string } {
  if (message === 'INVALID_PASSWORD') {
    return { status: 400, error: '密码长度需在 8 到 128 个字符之间' };
  }

  if (message === 'RESET_TOKEN_INVALID') {
    return { status: 400, error: '重置链接无效，请重新发起忘记密码流程' };
  }

  if (message === 'RESET_TOKEN_EXPIRED') {
    return { status: 410, error: '重置链接已过期，请重新发起忘记密码流程' };
  }

  if (message === 'USER_NOT_FOUND') {
    return { status: 404, error: '对应用户不存在' };
  }

  return { status: 500, error: '密码重置失败，请稍后再试' };
}

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Client Config ──────────────────────────────────────────────────────────
app.get('/api/config/client', requireUser, (_req, res) => {
  res.json(getClientConfig());
});

// ── AI Config ──────────────────────────────────────────────────────────────
app.get('/api/config/ai', requireUser, (_req, res) => {
  res.json(aiConfigService.getPublicConfig());
});

app.put('/api/config/ai', requireAdmin, (req: Request, res: Response) => {
  try {
    aiConfigService.updateConfig(req.body);
    // Reset cached OpenAI clients so next request picks up new settings
    aiService.resetClients();
    res.json(aiConfigService.getPublicConfig());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '保存配置失败' });
  }
});

app.post('/api/config/ai/test', requireAdmin, async (req: Request, res: Response) => {
  const { type, provider, baseUrl, model, apiKey, token } = req.body as {
    type?: string; provider?: string; baseUrl?: string; model?: string; apiKey?: string; token?: string;
  };
  if (type === 'hf') {
    const result = await aiService.testHfToken(token ?? '');
    return res.json(result);
  }
  if (type !== 'asr' && type !== 'llm') {
    return res.status(400).json({ ok: false, message: '参数错误：type 须为 asr、llm 或 hf' });
  }
  const result = await aiService.testConnection(type, { provider: provider as never, baseUrl, model, apiKey });
  res.json(result);
});

// ── SMTP Config ───────────────────────────────────────────────────────────
app.get('/api/config/smtp', requireAdmin, (_req, res) => {
  res.json(smtpConfigService.getPublicConfig());
});

app.put('/api/config/smtp', requireAdmin, (req: Request, res: Response) => {
  try {
    smtpConfigService.updateConfig(req.body);
    emailService.resetTransporter();
    res.json(smtpConfigService.getPublicConfig());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '保存 SMTP 配置失败' });
  }
});

app.post('/api/config/smtp/test', requireAdmin, async (req: Request, res: Response) => {
  const result = await emailService.testConnection(req.body);
  res.json(result);
});

// ── ASR model cache check & download proxy ────────────────────────────────
const getLocalAsrBase = (requestedBaseUrl?: string) => {
  if (requestedBaseUrl?.trim()) {
    return requestedBaseUrl.trim().replace(/\/+$/, '');
  }

  const config = aiConfigService.getConfig();
  if (config.asrProvider !== 'local') {
    return null;
  }
  return (config.asrBaseUrl.trim() || 'http://localhost:8000').replace(/\/+$/, '');
};

app.get('/api/asr/check', requireAdmin, async (req: Request, res: Response) => {
  const { model, baseUrl } = req.query as { model?: string; baseUrl?: string };
  if (!model) return res.status(400).json({ error: 'model required' });
  const asrBase = getLocalAsrBase(baseUrl);
  if (!asrBase) return res.status(400).json({ error: 'local ASR provider is not enabled' });
  try {
    const r = await fetch(
      `${asrBase}/v1/check?repo_id=${encodeURIComponent(model)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    const data = await r.json();
    res.json(data);
  } catch {
    res.json({ cached: false });
  }
});

app.get('/api/asr/download', requireAdmin, async (req: Request, res: Response) => {
  const { model, baseUrl } = req.query as { model?: string; baseUrl?: string };
  if (!model) return res.status(400).json({ error: 'model required' });
  const asrBase = getLocalAsrBase(baseUrl);
  if (!asrBase) return res.status(400).json({ error: 'local ASR provider is not enabled' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const upstream = await fetch(
      `${asrBase}/v1/download?repo_id=${encodeURIComponent(model)}`,
      { signal: AbortSignal.timeout(600_000) },
    );
    if (!upstream.body) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'ASR 服务不可达' })}\n\n`);
      return res.end();
    }
    const reader = (upstream.body as unknown as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '下载失败';
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
  } finally {
    res.end();
  }
});

// ── Auth ───────────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, (req: Request, res: Response) => {
  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

  if (!name || !email || !password) {
    return res.status(400).json({ error: '姓名、邮箱和密码均为必填项' });
  }

  let createdUser: { id: string } | null = null;

  try {
    const user = authService.register(name, email, password);
    createdUser = user;
    const token = authService.issueToken(user);
    res.status(201).json({ user, token });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '注册失败';

    if (createdUser) {
      authService.deleteUserById(createdUser.id);
    }

    const mapped = mapAuthRouteError(message);
    res.status(mapped.status).json({ error: mapped.error });
  }
});

app.post('/api/auth/login', authLimiter, (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: '邮箱和密码均为必填项' });
  }

  const user = authService.authenticate(email, password);
  if (!user) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }

  try {
    const token = authService.issueToken(user);
    res.json({ user, token });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '登录失败';
    const mapped = mapAuthRouteError(message);
    res.status(mapped.status).json({ error: mapped.status === 500 ? mapped.error : '登录失败' });
  }
});

app.post('/api/auth/forgot-password', passwordResetRequestLimiter, async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
    return res.status(400).json({ error: '请输入有效的邮箱地址' });
  }

  try {
    const result = await passwordResetService.requestReset(email);
    res.json(result);
  } catch {
    res.status(500).json({ error: '密码重置请求失败，请稍后再试' });
  }
});

app.post('/api/auth/reset-password', passwordResetConfirmLimiter, (req: Request, res: Response) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) {
    return res.status(400).json({ error: '重置令牌和新密码均为必填项' });
  }

  try {
    passwordResetService.resetPassword(token, password);
    res.json({ message: '密码已重置，请使用新密码登录' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '密码重置失败';
    const mapped = mapPasswordResetError(message);
    res.status(mapped.status).json({ error: mapped.error });
  }
});

app.get('/api/auth/me', requireUser, (req: Request, res: Response) => {
  res.json({ user: (req as AuthenticatedRequest).user });
});

// ── Rooms ───────────────────────────────────────────────────────────────────
app.post('/api/rooms', requireUser, (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const { roomId, title, passcode, invitedEmails, roomType, scheduledAt } = req.body as {
    roomId?: string;
    title?: string;
    passcode?: string;
    invitedEmails?: string[];
    roomType?: 'instant' | 'scheduled';
    scheduledAt?: string;
  };
  const id = roomId?.trim() || Math.random().toString(36).substring(2, 9);
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid room ID format' });
  }

  const nextTitle = title?.trim() || `${user.name} 的会议`;
  if (nextTitle.length < 2 || nextTitle.length > 80) {
    return res.status(400).json({ error: '会议标题长度需在 2 到 80 个字符之间' });
  }

  if (passcode && (passcode.trim().length < 4 || passcode.trim().length > 32)) {
    return res.status(400).json({ error: '会议口令长度需在 4 到 32 个字符之间' });
  }

  (async () => {
    try {
      const normalizedInvites = normalizeInviteEmails(invitedEmails);
      const normalizedRoomType: 'instant' | 'scheduled' = roomType === 'scheduled' ? 'scheduled' : 'instant';
      if (normalizedRoomType === 'scheduled') {
        if (!scheduledAt) {
          return res.status(400).json({ error: '预约会议必须提供会议时间' });
        }
        const ts = new Date(scheduledAt).getTime();
        if (isNaN(ts) || ts <= Date.now()) {
          return res.status(400).json({ error: '会议时间必须是将来的有效时间' });
        }
      }
      const room = roomManager.createRoom({
        id,
        title: nextTitle,
        ownerUserId: user.id,
        passcodeHash: passcode?.trim() ? bcrypt.hashSync(passcode.trim(), 10) : null,
        invitedEmails: normalizedInvites,
        roomType: normalizedRoomType,
        scheduledAt: normalizedRoomType === 'scheduled' ? scheduledAt : undefined,
      });

      const delivery = await sendMeetingInvites({
        emails: normalizedInvites,
        inviterName: user.name,
        roomTitle: room.title,
        roomId: room.id,
        hasPasscode: Boolean(room.passcodeHash),
        scheduledAt: room.scheduledAt,
      });

      res.status(201).json({
        room: roomManager.toRoomSummary(room),
        inviteLink: buildMeetingJoinLink(room.id),
        invitedEmails: normalizedInvites,
        deliveredEmails: delivery.deliveredEmails,
        previewLinks: delivery.previewLinks,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '创建会议室失败';
      if (message === 'ROOM_EXISTS') {
        return res.status(409).json({ error: '会议室 ID 已存在，请重试' });
      }
      if (message === 'INVALID_INVITE_EMAIL') {
        return res.status(400).json({ error: '受邀者邮箱格式不正确' });
      }
      if (message === 'TOO_MANY_INVITES') {
        return res.status(400).json({ error: '单个会议最多可添加 50 个受邀者' });
      }
      res.status(500).json({ error: '创建会议室失败' });
    }
  })().catch((error) => {
    console.error(error);
    res.status(500).json({ error: '创建会议室失败' });
  });
});

app.get('/api/rooms/:roomId', requireUser, (req: Request, res: Response) => {
  const room = roomManager.getRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: '会议室不存在' });
  }
  res.json({ room: roomManager.toRoomSummary(room) });
});

app.post('/api/rooms/:roomId/access', requireUser, roomAccessLimiter, (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const { passcode } = req.body as { passcode?: string };
  const access = roomManager.validateJoin(req.params.roomId, user.id, user.email, passcode?.trim());

  if (!access.allowed || !access.room) {
    return res.status(access.status).json({ error: access.error ?? '没有权限加入该会议' });
  }

  res.json({ room: roomManager.toRoomSummary(access.room) });
});

app.post('/api/rooms/:roomId/invite', requireUser, roomInviteLimiter, (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const { invitedEmails } = req.body as { invitedEmails?: string[] };
  const room = roomManager.getRoom(req.params.roomId);

  if (!room) {
    return res.status(404).json({ error: '会议室不存在' });
  }

  const canInvite = room.ownerUserId === user.id || roomManager.isHostUser(room.id, user.id);
  if (!canInvite) {
    return res.status(403).json({ error: '只有会议创建者或当前主持人可以发送邀请' });
  }

  (async () => {
    try {
      const normalizedInvites = normalizeInviteEmails(invitedEmails);
      if (normalizedInvites.length === 0) {
        return res.status(400).json({ error: '请至少填写一个受邀者邮箱' });
      }

      const nextRoom = roomManager.addInvitedEmails(room.id, normalizedInvites);
      if (!nextRoom) {
        return res.status(404).json({ error: '会议室不存在' });
      }

      const delivery = await sendMeetingInvites({
        emails: normalizedInvites,
        inviterName: user.name,
        roomTitle: nextRoom.title,
        roomId: nextRoom.id,
        hasPasscode: Boolean(nextRoom.passcodeHash),
        scheduledAt: nextRoom.scheduledAt,
      });

      res.json({
        room: roomManager.toRoomSummary(nextRoom),
        inviteLink: buildMeetingJoinLink(nextRoom.id),
        invitedEmails: [...nextRoom.invitedEmails],
        deliveredEmails: delivery.deliveredEmails,
        previewLinks: delivery.previewLinks,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '邀请发送失败';
      if (message === 'INVALID_INVITE_EMAIL') {
        return res.status(400).json({ error: '受邀者邮箱格式不正确' });
      }
      if (message === 'TOO_MANY_INVITES') {
        return res.status(400).json({ error: '单次邀请最多可添加 50 个受邀者' });
      }
      res.status(500).json({ error: '邀请发送失败' });
    }
  })().catch((error) => {
    console.error(error);
    res.status(500).json({ error: '邀请发送失败' });
  });
});

// ── Recordings ──────────────────────────────────────────────────────────────
app.post('/api/recordings/upload', requireUser, upload.single('recording'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({
    fileId: req.file.filename,
    message: 'Recording uploaded successfully',
    size: req.file.size,
  });
});

app.get('/api/recordings/:fileId/download', requireUser, (req: Request, res: Response) => {
  const safeFileId = path.basename(req.params.fileId);
  const filePath = path.join(uploadsDir, safeFileId);

  if (!filePath.startsWith(uploadsDir)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${safeFileId}"`);
  res.setHeader('Content-Type', 'video/webm');
  res.sendFile(filePath);
});

app.post('/api/recordings/:fileId/transcribe', requireUser, async (req: Request, res: Response) => {
  const safeFileId = path.basename(req.params.fileId);
  const filePath = path.join(uploadsDir, safeFileId);

  if (!filePath.startsWith(uploadsDir)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  try {
    const transcription = await aiService.transcribe(filePath);
    res.json({ transcription });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Transcription failed';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/recordings/minutes', requireUser, async (req: Request, res: Response) => {
  const { transcription } = req.body as { transcription?: string };
  if (!transcription || typeof transcription !== 'string' || transcription.trim().length === 0) {
    return res.status(400).json({ error: 'Transcription text is required' });
  }
  if (transcription.length > 100000) {
    return res.status(400).json({ error: 'Transcription too long' });
  }

  try {
    const minutes = await aiService.generateMinutes(transcription);
    res.json({ minutes });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Minutes generation failed';
    res.status(500).json({ error: msg });
  }
});

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;

// ── Built-in TURN server ──────────────────────────────────────────────────────
// Runs on UDP/TCP 3478 to relay WebRTC media when direct P2P is blocked.
const TURN_HOST = process.env.TURN_HOST || '0.0.0.0';
const TURN_PORT = Number(process.env.INTERNAL_TURN_PORT || 3478);
const TURN_USER = process.env.INTERNAL_TURN_USER || 'aimeeting';
const TURN_PASS = process.env.INTERNAL_TURN_PASS || 'aimeeting2024';
const TURN_REALM = process.env.INTERNAL_TURN_REALM || 'aimeeting.local';

const turnServer = new TurnServer({
  listeningIps: [TURN_HOST],
  relayIps: [TURN_HOST],
  authMech: 'long-term',
  realm: TURN_REALM,
  listeningPort: TURN_PORT,
  debugLevel: 'ERROR',
  minPort: 49152,
  maxPort: 65535,
});
turnServer.addUser(TURN_USER, TURN_PASS);
turnServer.start();
console.log(`🔄 Built-in TURN server listening on ${TURN_HOST}:${TURN_PORT}`);

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 AiMeeting server running on http://0.0.0.0:${PORT}`);
});
