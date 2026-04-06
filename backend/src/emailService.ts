import nodemailer, { type Transporter } from 'nodemailer';

interface PasswordResetEmailInput {
  email: string;
  name: string;
  resetLink: string;
  expiresMinutes: number;
}

interface MeetingInviteEmailInput {
  email: string;
  inviterName: string;
  roomTitle: string;
  roomId: string;
  joinLink: string;
  hasPasscode: boolean;
  scheduledAt?: string;
}

function parsePort(value?: string): number {
  const parsed = Number(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

function parseBoolean(value?: string): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function fmtIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function generateIcs(options: {
  uid: string;
  title: string;
  description: string;
  url: string;
  startAt: string;
  durationMinutes?: number;
}): string {
  const start = new Date(options.startAt);
  const end = new Date(start.getTime() + (options.durationMinutes ?? 60) * 60_000);
  const now = new Date();

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AiMeeting//AiMeeting//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:meeting-${options.uid}@aimeetingapp`,
    `DTSTAMP:${fmtIcsDate(now)}`,
    `DTSTART:${fmtIcsDate(start)}`,
    `DTEND:${fmtIcsDate(end)}`,
    `SUMMARY:${options.title}`,
    `DESCRIPTION:${options.description.replace(/[\r\n]+/g, '\\n')}`,
    `URL:${options.url}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function formatChineseDateTime(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export class EmailService {
  private transporter: Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
  }

  async sendPasswordResetEmail({ email, name, resetLink, expiresMinutes }: PasswordResetEmailInput): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const transporter = this.getTransporter();
    const from = process.env.SMTP_FROM?.trim();

    await transporter.sendMail({
      from,
      to: email,
      subject: 'AiMeeting 密码重置',
      text: [
        `你好，${name}：`,
        '',
        '我们收到了你的密码重置请求。',
        `请在 ${expiresMinutes} 分钟内打开下面的链接设置新密码：`,
        resetLink,
        '',
        '如果这不是你的操作，请忽略本邮件。',
      ].join('\n'),
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; line-height: 1.6;">
          <p>你好，${name}：</p>
          <p>我们收到了你的密码重置请求。</p>
          <p>请在 <strong>${expiresMinutes} 分钟</strong> 内点击下面的按钮设置新密码：</p>
          <p>
            <a href="${resetLink}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 10px;">重置密码</a>
          </p>
          <p>如果按钮无法打开，请复制下面的链接到浏览器中：</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>如果这不是你的操作，请忽略本邮件。</p>
        </div>
      `,
    });

    return true;
  }

  async sendMeetingInviteEmail({
    email,
    inviterName,
    roomTitle,
    roomId,
    joinLink,
    hasPasscode,
    scheduledAt,
  }: MeetingInviteEmailInput): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const transporter = this.getTransporter();
    const from = process.env.SMTP_FROM?.trim();
    const isScheduled = Boolean(scheduledAt);
    const timeLabel = scheduledAt ? formatChineseDateTime(scheduledAt) : '';

    const textLines = [
      '你好，',
      '',
      `${inviterName} 邀请你加入 AiMeeting ${isScheduled ? '预约' : ''}会议。`,
      `会议主题：${roomTitle}`,
      `会议号：${roomId}`,
      ...(isScheduled ? [`会议时间：${timeLabel}`] : []),
      hasPasscode ? '该会议设置了口令，请向主持人获取。' : '该会议未设置口令，可直接加入。',
      `加入链接：${joinLink}`,
    ];

    const timeHtml = isScheduled
      ? `<p><strong>会议时间：</strong>${timeLabel}</p>`
      : '';

    const attachments = [];
    if (isScheduled && scheduledAt) {
      const icsContent = generateIcs({
        uid: roomId,
        title: roomTitle,
        description: `邀请人：${inviterName}\n会议号：${roomId}\n加入链接：${joinLink}`,
        url: joinLink,
        startAt: scheduledAt,
        durationMinutes: 60,
      });
      attachments.push({
        filename: 'meeting.ics',
        content: icsContent,
        contentType: 'text/calendar; method=REQUEST; charset=UTF-8',
      });
    }

    await transporter.sendMail({
      from,
      to: email,
      subject: `${inviterName} 邀请你加入${isScheduled ? '预约' : ''}会议：${roomTitle}`,
      text: textLines.join('\n'),
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; line-height: 1.6;">
          <p>你好，</p>
          <p><strong>${inviterName}</strong> 邀请你加入 AiMeeting ${isScheduled ? '预约' : ''}会议。</p>
          <p><strong>会议主题：</strong>${roomTitle}</p>
          <p><strong>会议号：</strong>${roomId}</p>
          ${timeHtml}
          <p>${hasPasscode ? '该会议设置了口令，请向主持人获取。' : '该会议未设置口令，可直接加入。'}</p>
          <p>
            <a href="${joinLink}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 10px; font-weight: 600;">加入会议</a>
          </p>
          <p style="color: #64748b; font-size: 13px;">如果按钮无法打开，请复制下面的链接：</p>
          <p><a href="${joinLink}" style="color: #2563eb;">${joinLink}</a></p>
          ${isScheduled ? '<p style="color: #64748b; font-size: 13px;">📅 日历邀请已附在本邮件中，双击 .ics 附件即可添加到日历。</p>' : ''}
        </div>
      `,
      attachments,
    });

    return true;
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      throw new Error('SMTP_NOT_CONFIGURED');
    }

    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    this.transporter = nodemailer.createTransport({
      host,
      port: parsePort(process.env.SMTP_PORT),
      secure: parseBoolean(process.env.SMTP_SECURE),
      auth: user ? { user, pass: pass ?? '' } : undefined,
    });

    return this.transporter;
  }
}

export const emailService = new EmailService();