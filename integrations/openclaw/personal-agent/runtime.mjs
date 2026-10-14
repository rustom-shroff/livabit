import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { ActivityStore } from './store.mjs';

export function validateSettings(value) {
  if (!value || value.format !== 'liveabit.personal-agent.settings.v1' || value.enabled !== true
    || typeof value.agentId !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value.agentId)
    || value.sessionKey !== `agent:${value.agentId}:${value.mainKey ?? 'main'}`
    || typeof value.databasePath !== 'string' || !isAbsolute(value.databasePath)
    || typeof value.timeZone !== 'string' || !value.timeZone.trim()
    || value.accountabilityEmailsEnabled !== false) throw new Error('invalid_personal_agent_settings');
  new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format();
  if (!Number.isInteger(value.historyDays) || value.historyDays < 1 || value.historyDays > 90
    || !Number.isInteger(value.episodeDays) || value.episodeDays < 1 || value.episodeDays > 365) throw new Error('invalid_personal_agent_settings');
  return value;
}
export function readSettings() {
  const state = process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw');
  const filename = join(state, 'liveabit-personal-agent', 'settings.json');
  const bytes = readFileSync(filename);
  if (bytes.length > 4096) throw new Error('invalid_personal_agent_settings');
  return validateSettings(JSON.parse(bytes));
}
export function withStore(settings, work) {
  const store = new ActivityStore(settings.databasePath, settings);
  try { return work(store); } finally { store.close(); }
}
