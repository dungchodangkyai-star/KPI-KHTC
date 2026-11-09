import fs from 'fs';
import path from 'path';

const ACK_FILE_PATH = path.join(process.cwd(), 'data', 'neon-billing-acks.json');

export interface NeonBillingReminderStatus {
  isBillingPeriod: boolean; // true if day >= 25
  dayOfMonth: number;
  daysRemainingInMonth: number;
  currentPeriod: string; // e.g. "10-2026"
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  billingUrl: string;
}

function ensureDataDir() {
  const dir = path.dirname(ACK_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readAcks(): Record<string, { acknowledged: boolean; acknowledgedAt: string; acknowledgedBy: string }> {
  try {
    ensureDataDir();
    if (fs.existsSync(ACK_FILE_PATH)) {
      return JSON.parse(fs.readFileSync(ACK_FILE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Neon Billing] Could not read acks file:', err);
  }
  return {};
}

function writeAcks(acks: Record<string, any>) {
  try {
    ensureDataDir();
    fs.writeFileSync(ACK_FILE_PATH, JSON.stringify(acks, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Neon Billing] Could not write acks file:', err);
  }
}

export function getCurrentBillingPeriod(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${m}-${y}`;
}

export function getNeonBillingReminderStatus(): NeonBillingReminderStatus {
  const now = new Date();
  const day = now.getDate();
  const currentPeriod = getCurrentBillingPeriod();
  
  // Calculate total days in current month
  const year = now.getFullYear();
  const month = now.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const daysRemainingInMonth = Math.max(0, totalDays - day);

  const isBillingPeriod = day >= 25;
  const acks = readAcks();
  const periodAck = acks[currentPeriod];

  return {
    isBillingPeriod,
    dayOfMonth: day,
    daysRemainingInMonth,
    currentPeriod,
    acknowledged: Boolean(periodAck?.acknowledged),
    acknowledgedAt: periodAck?.acknowledgedAt || null,
    acknowledgedBy: periodAck?.acknowledgedBy || null,
    billingUrl: 'https://console.neon.tech/app/billing'
  };
}

export function acknowledgeNeonBilling(period: string, adminUser: { id: number; name: string; email: string }): NeonBillingReminderStatus {
  const acks = readAcks();
  const currentPeriod = period || getCurrentBillingPeriod();
  acks[currentPeriod] = {
    acknowledged: true,
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: `${adminUser.name} (${adminUser.email})`
  };
  writeAcks(acks);
  return getNeonBillingReminderStatus();
}
