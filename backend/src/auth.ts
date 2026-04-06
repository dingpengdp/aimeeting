import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'socket.io';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  isAdmin: boolean;
}

interface StoredUser extends Omit<PublicUser, 'isAdmin'> {
  passwordHash: string;
}

export interface AuthenticatedRequest extends Request {
  user: PublicUser;
}

const USERS_FILE_PATH = path.join(__dirname, '../data/users.json');
const JWT_TTL = '12h';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function ensureStorageDir(): void {
  const dirPath = path.dirname(USERS_FILE_PATH);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export class AuthService {
  private usersById = new Map<string, StoredUser>();
  private usersByEmail = new Map<string, StoredUser>();

  constructor() {
    ensureStorageDir();
    this.loadUsers();
    this.assertConfiguration();
  }

  register(name: string, email: string, password: string): PublicUser {
    const normalizedEmail = normalizeEmail(email);
    this.validateRegistration(name, normalizedEmail, password);

    if (this.usersByEmail.has(normalizedEmail)) {
      throw new Error('EMAIL_EXISTS');
    }

    const user: StoredUser = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      passwordHash: bcrypt.hashSync(password, 12),
    };

    this.usersById.set(user.id, user);
    this.usersByEmail.set(user.email, user);
    this.persistUsers();

    return this.toPublicUser(user);
  }

  authenticate(email: string, password: string): PublicUser | null {
    const normalizedEmail = normalizeEmail(email);
    const user = this.usersByEmail.get(normalizedEmail);
    if (!user) {
      return null;
    }

    if (!bcrypt.compareSync(password, user.passwordHash)) {
      return null;
    }

    return this.toPublicUser(user);
  }

  getUserById(userId: string): PublicUser | null {
    const user = this.usersById.get(userId);
    return user ? this.toPublicUser(user) : null;
  }

  findUserByEmail(email: string): PublicUser | null {
    const user = this.usersByEmail.get(normalizeEmail(email));
    return user ? this.toPublicUser(user) : null;
  }

  deleteUserById(userId: string): void {
    const user = this.usersById.get(userId);
    if (!user) {
      return;
    }

    this.usersById.delete(userId);
    this.usersByEmail.delete(user.email);
    this.persistUsers();
  }

  assertConfiguration(): void {
    this.getJwtSecret();
  }

  updatePassword(userId: string, password: string): PublicUser {
    this.validatePassword(password);

    const user = this.usersById.get(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    user.passwordHash = bcrypt.hashSync(password, 12);
    this.persistUsers();

    return this.toPublicUser(user);
  }

  issueToken(user: PublicUser): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      this.getJwtSecret(),
      { expiresIn: JWT_TTL }
    );
  }

  verifyToken(token: string): PublicUser | null {
    try {
      const payload = jwt.verify(token, this.getJwtSecret()) as JwtPayload;
      const userId = typeof payload.sub === 'string' ? payload.sub : null;
      if (!userId) {
        return null;
      }

      return this.getUserById(userId);
    } catch {
      return null;
    }
  }

  private validateRegistration(name: string, email: string, password: string): void {
    if (name.trim().length < 2 || name.trim().length > 50) {
      throw new Error('INVALID_NAME');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('INVALID_EMAIL');
    }

    this.validatePassword(password);
  }

  private validatePassword(password: string): void {
    if (password.length < 8 || password.length > 128) {
      throw new Error('INVALID_PASSWORD');
    }
  }

  private toPublicUser(user: StoredUser): PublicUser {
    const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      isAdmin: adminEmail.length > 0 && user.email === adminEmail,
    };
  }

  private loadUsers(): void {
    if (!fs.existsSync(USERS_FILE_PATH)) {
      return;
    }

    const raw = fs.readFileSync(USERS_FILE_PATH, 'utf8').trim();
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as StoredUser[];
    for (const user of parsed) {
      this.usersById.set(user.id, user);
      this.usersByEmail.set(user.email, user);
    }
  }

  private persistUsers(): void {
    const serialized = JSON.stringify(Array.from(this.usersById.values()), null, 2);
    fs.writeFileSync(USERS_FILE_PATH, serialized, 'utf8');
  }

  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error('JWT_SECRET_INVALID');
    }
    return secret;
  }
}

function extractBearerToken(headerValue?: string): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

export function requireAuth(authService: AuthService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: '请先登录后再继续操作' });
    }

    const user = authService.verifyToken(token);
    if (!user) {
      return res.status(401).json({ error: '登录状态已失效，请重新登录' });
    }

    (req as AuthenticatedRequest).user = user;
    next();
  };
}

export function requireAdminAuth(authService: AuthService) {
  const checkAuth = requireAuth(authService);
  return (req: Request, res: Response, next: NextFunction) => {
    checkAuth(req, res, () => {
      const user = (req as AuthenticatedRequest).user;
      if (!user.isAdmin) {
        return res.status(403).json({ error: '仅系统管理员可执行此操作' });
      }
      next();
    });
  };
}

export function attachSocketUser(authService: AuthService) {
  return (socket: Socket, next: (err?: Error) => void) => {
    const authPayload = socket.handshake.auth as { token?: string } | undefined;
    const token = authPayload?.token ?? extractBearerToken(socket.handshake.headers.authorization);

    if (!token) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    const user = authService.verifyToken(token);
    if (!user) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    socket.data.user = user;
    next();
  };
}