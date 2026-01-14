import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const QUOTA_FILE = path.join(process.cwd(), 'data', 'quota.json');
const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Custom Error class to carry HTTP status codes
 */
export class SwitchBotError extends Error {
  constructor(public message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'SwitchBotError';
  }
}

// --- Types ---

export interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  hubDeviceId?: string;
  enableCloudService?: boolean;
  remoteType?: string;
}

export interface SwitchBotStatusResponse {
  statusCode: number;
  message: string;
  body: {
    deviceId: string;
    deviceType: string;
    hubDeviceId: string;
    power?: string;
    temperature?: number;
    humidity?: number;
    moveDetected?: boolean;
    brightness?: number;
    colorTemperature?: number;
    voltage?: number;
    weight?: number;
    electricityOfDay?: number;
    electricCurrent?: number;
    lockState?: string;
    doorState?: string;
    workingState?: string;
    onlineStatus?: string;
    [key: string]: string | number | boolean | undefined;
  };
}

export interface SwitchBotDeviceListResponse {
  statusCode: number;
  message: string;
  body: {
    deviceList: SwitchBotDevice[];
    remoteInfraredCommands: SwitchBotDevice[];
  };
}

export interface SwitchBotActionResponse {
  statusCode: number;
  message: string;
  body: Record<string, unknown>;
}

// --- Quota Management ---

function updateQuota(): number | null {
  try {
    if (!fs.existsSync(QUOTA_FILE)) {
      fs.mkdirSync(path.dirname(QUOTA_FILE), { recursive: true });
      fs.writeFileSync(QUOTA_FILE, JSON.stringify({ remaining: 10000, lastResetDate: '' }, null, 2));
    }
    const content = fs.readFileSync(QUOTA_FILE, 'utf-8');
    const data = JSON.parse(content);
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (data.lastResetDate !== today) {
      data.remaining = 10000;
      data.lastResetDate = today;
    }

    if (data.remaining > 0) {
      data.remaining -= 1;
    }

    fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2));
    return data.remaining;
  } catch (e) {
    console.error('Error updating quota:', e);
    return null;
  }
}

export function getLocalQuota(): number {
  try {
    if (!fs.existsSync(QUOTA_FILE)) return 10000;
    const data = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf-8'));
    return data.remaining;
  } catch {
    return 10000;
  }
}

// --- Internal Helpers ---

function generateHeader(token: string, secret: string) {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const data = token + t + nonce;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(data, 'utf-8'))
    .digest()
    .toString('base64')
    .toUpperCase();

  return {
    Authorization: token,
    sign: signature,
    nonce: nonce,
    t: t,
    'Content-Type': 'application/json',
  };
}

/**
 * Internal fetch wrapper with timeout and credential check
 */
async function sbFetch(url: string, options: RequestInit = {}) {
  const token = process.env.SWITCHBOT_TOKEN;
  const secret = process.env.SWITCHBOT_SECRET;

  if (!token || !secret) {
    throw new SwitchBotError('SwitchBot API credentials (TOKEN/SECRET) are missing in environment variables.', 401);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...generateHeader(token, secret),
        ...options.headers,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      // Map common status codes
      let message = `SwitchBot API Error: ${res.statusText}`;
      if (res.status === 401) message = 'Invalid SwitchBot API credentials.';
      if (res.status === 403) message = 'Access denied or rate limit exceeded.';
      if (res.status === 404) message = 'Resource not found.';
      if (res.status >= 500) message = 'SwitchBot internal server error.';

      throw new SwitchBotError(message, res.status);
    }

    const data = await res.json();

    // SwitchBot API often returns 200 OK but with an error code in the body
    if (data.statusCode && data.statusCode !== 100) {
      throw new SwitchBotError(`SwitchBot API returned code ${data.statusCode}: ${data.message || 'Unknown error'}`, 400);
    }

    const quota = updateQuota();
    return { ...data, rateLimitRemaining: quota };

  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SwitchBotError('SwitchBot API request timed out.', 504);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Public Methods ---

export async function getDevices(): Promise<SwitchBotDeviceListResponse & { rateLimitRemaining: number | null }> {
  return await sbFetch('https://api.switch-bot.com/v1.1/devices');
}

export async function getDeviceStatus(deviceId: string): Promise<SwitchBotStatusResponse & { rateLimitRemaining: number | null }> {
  return await sbFetch(`https://api.switch-bot.com/v1.1/devices/${deviceId}/status`);
}

export async function controlDevice(
  deviceId: string,
  command: string,
  parameter: string = 'default',
  commandType: string = 'command'
): Promise<boolean> {
  await sbFetch(`https://api.switch-bot.com/v1.1/devices/${deviceId}/commands`, {
    method: 'POST',
    body: JSON.stringify({
      command: command,
      parameter: parameter,
      commandType: commandType,
    }),
  });
  return true;
}

export async function executeScene(sceneId: string): Promise<SwitchBotActionResponse & { rateLimitRemaining: number | null }> {
  return await sbFetch(`https://api.switch-bot.com/v1.1/scenes/${sceneId}/execute`, {
    method: 'POST',
  });
}

