interface IceServerConfig {
  urls: string[] | string;
  username?: string;
  credential?: string;
}

export interface ClientConfig {
  iceServers: IceServerConfig[];
}

function parseCsvEnv(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getClientConfig(): ClientConfig {
  const iceServers: IceServerConfig[] = [];

  // If a custom STUN_URLS env is set, use those; otherwise use Google STUN.
  // On a private LAN without internet, Google STUN will time out — set
  // STUN_URLS= (empty) to skip STUN entirely and rely on host candidates.
  const stunUrls = parseCsvEnv(process.env.STUN_URLS);
  if (process.env.STUN_URLS === undefined) {
    // Default: Google STUN
    iceServers.push(
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    );
  } else if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }
  // If STUN_URLS='', no STUN servers → browsers only gather host candidates
  // which is correct for same-LAN clients connecting directly.

  // External TURN from env vars (takes priority)
  const turnUrls = parseCsvEnv(process.env.TURN_URLS);
  const turnUsername = process.env.TURN_USERNAME?.trim();
  const turnCredential = process.env.TURN_CREDENTIAL?.trim();

  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  } else {
    // Auto-configure the built-in TURN server (node-turn, started in index.ts)
    // Derive the public hostname from APP_BASE_URL so remote clients can reach it
    const appBaseUrl = process.env.APP_BASE_URL ?? '';
    let turnHost = '127.0.0.1';
    try {
      const u = new URL(appBaseUrl);
      turnHost = u.hostname || turnHost;
    } catch { /* ignore */ }

    const internalTurnPort = process.env.INTERNAL_TURN_PORT || '3478';
    const internalTurnUser = process.env.INTERNAL_TURN_USER || 'aimeeting';
    const internalTurnPass = process.env.INTERNAL_TURN_PASS || 'aimeeting2024';

    iceServers.push({
      urls: `turn:${turnHost}:${internalTurnPort}`,
      username: internalTurnUser,
      credential: internalTurnPass,
    });
  }

  return { iceServers };
}