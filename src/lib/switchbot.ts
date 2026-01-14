import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const QUOTA_FILE = path.join(process.cwd(), 'data', 'quota.json');

function updateQuota() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) {
      fs.mkdirSync(path.dirname(QUOTA_FILE), { recursive: true });
      fs.writeFileSync(QUOTA_FILE, JSON.stringify({ remaining: 10000, lastResetDate: '' }, null, 2));
    }
    const content = fs.readFileSync(QUOTA_FILE, 'utf-8');
    const data = JSON.parse(content);
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // UTC date

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

export function getLocalQuota() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) return 10000;
    const data = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf-8'));
    return data.remaining;
  } catch {
    return 10000;
  }
}


export interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType?: string;
  remoteType?: string;
  enableCloudService?: boolean;
  hubDeviceId?: string;
}

export interface SwitchBotDeviceListResponse {
  statusCode: number;
  body: {
    deviceList: SwitchBotDevice[];
    remoteInfraredCommands: unknown[];
  };
  message: string;
}

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

export async function getDevices() {
  const token = process.env.SWITCHBOT_TOKEN;
  const secret = process.env.SWITCHBOT_SECRET;

  if (!token || !secret) {
    throw new Error('Missing SwitchBot API credentials');
  }

  const res = await fetch('https://api.switch-bot.com/v1.1/devices', {
    headers: generateHeader(token, secret),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch devices: ${res.statusText}`);
  }

  const data = await res.json();
  const quota = updateQuota();

  return {
    ...data,
    rateLimitRemaining: quota
  };
}

export async function getDeviceStatus(deviceId: string) {
  const token = process.env.SWITCHBOT_TOKEN;
  const secret = process.env.SWITCHBOT_SECRET;

  if (!token || !secret) {
    throw new Error('Missing SwitchBot API credentials');
  }

  const res = await fetch(`https://api.switch-bot.com/v1.1/devices/${deviceId}/status`, {
    headers: generateHeader(token, secret),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch device status: ${res.statusText}`);
  }

  const data = await res.json();
  const quota = updateQuota();

  return {
    ...data,
    rateLimitRemaining: quota
  };
}

export async function controlDevice(deviceId: string, command: string, parameter: string = 'default', commandType: string = 'command') {
  const token = process.env.SWITCHBOT_TOKEN;
  const secret = process.env.SWITCHBOT_SECRET;

  if (!token || !secret) {
    throw new Error('Missing SwitchBot API credentials');
  }

  const res = await fetch(`https://api.switch-bot.com/v1.1/devices/${deviceId}/commands`, {
    method: 'POST',
    headers: generateHeader(token, secret),
    body: JSON.stringify({
      command: command,
      parameter: parameter,
      commandType: commandType,
    }),
  });

  if (res.ok) {
    updateQuota();
    return true;
  } else {
    throw new Error(`Failed to control device: ${res.statusText}`);
  }
}

export async function executeScene(sceneId: string) {
  const token = process.env.SWITCHBOT_TOKEN;
  const secret = process.env.SWITCHBOT_SECRET;

  if (!token || !secret) {
    throw new Error('Missing SwitchBot API credentials');
  }

  const res = await fetch(`https://api.switch-bot.com/v1.1/scenes/${sceneId}/execute`, {
    method: 'POST',
    headers: generateHeader(token, secret),
  });

  if (!res.ok) {
    throw new Error(`Failed to execute scene: ${res.statusText}`);
  }

  const data = await res.json();
  const quota = updateQuota();
  return {
    ...data,
    rateLimitRemaining: quota
  };
}
