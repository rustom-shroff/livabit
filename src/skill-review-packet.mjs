// Offline synthetic review inputs. This module never invokes an agent or transport.
import { canonical, digest, validateEvent } from './protocol.mjs';
import { CRITICAL_CHECKS, scoreReview } from '../skills/liveabit/scripts/score-review.mjs';

const REVIEW_BOUNDARY = '\nFor package review or a real-host pilot, read ';
const HOST_FIELDS = ['standing_instruction', 'intent', 'quiet_period_active', 'opted_out',
  'unsolicited_allowed', 'remaining_interruptions', 'approved_channel', 'context_available',
  'channel_available', 'maximum_relevant_age_ms'];
const SCENARIO_FIELDS = ['id', 'criteria', 'events', 'evaluation_time', 'host', 'invocation',
  'note', 'expected', 'user_request', 'prior_evaluation_recorded'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const requireInput = ok => { if (!ok) throw new TypeError('Invalid synthetic Skill review input.'); };
const boundedText = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
const timestamp = value => {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
};
const jsonFile = value => `${JSON.stringify(value, null, 2)}\n`;

export function extractSkillGuidance(skillMarkdown) {
  requireInput(typeof skillMarkdown === 'string' && Buffer.byteLength(skillMarkdown, 'utf8') <= 65536);
  const normalized = skillMarkdown.replace(/\r\n/g, '\n');
  const boundary = normalized.indexOf(REVIEW_BOUNDARY);
  // A missing boundary must not silently include the reviewer rubric or answer links.
  requireInput(boundary > 0 && normalized.indexOf(REVIEW_BOUNDARY, boundary + 1) === -1);
  const guidance = normalized.slice(0, boundary).trimEnd();
  requireInput(guidance.startsWith('---\nname: liveabit\n') && guidance.includes('\n# liveabit Skill\n')
    && !/references\/(?:evaluation\.md|scenarios\.json)|score-review\.mjs/u.test(guidance));
  return `${guidance}\n`;
}

export function blankReviewerObservation() {
  return {
    observed: false, outcome: null, unsolicited_messages: null, channel: null,
    uncertainty_stated: null,
    critical_checks: Object.fromEntries(CRITICAL_CHECKS.map(key => [key, null])),
    other_violations: []
  };
}

function validateHost(host) {
  requireInput(plain(host) && Object.keys(host).sort().join(',') === [...HOST_FIELDS].sort().join(','));
  requireInput(host.standing_instruction === null || boundedText(host.standing_instruction));
  requireInput(['focus', 'leisure', 'unknown'].includes(host.intent));
  for (const field of ['quiet_period_active', 'opted_out', 'unsolicited_allowed', 'context_available', 'channel_available']) {
    requireInput(typeof host[field] === 'boolean');
  }
  requireInput(host.remaining_interruptions === null
    || Number.isSafeInteger(host.remaining_interruptions) && host.remaining_interruptions >= 0);
  requireInput(host.approved_channel === null || boundedText(host.approved_channel));
  requireInput(Number.isSafeInteger(host.maximum_relevant_age_ms) && host.maximum_relevant_age_ms >= 0);
}

export function buildSkillReviewPackets({ suite, skillMarkdown }) {
  const guidance = extractSkillGuidance(skillMarkdown);
  requireInput(plain(suite) && Object.keys(suite).sort().join(',')
    === 'evaluation_version,events,evidence_kind,protocol_version,real_host_gate_satisfied,scenarios');
  requireInput(suite.evaluation_version === 1 && suite.evidence_kind === 'synthetic_reviewer_scenarios'
    && suite.protocol_version === '0.1.0' && suite.real_host_gate_satisfied === false
    && plain(suite.events) && Object.keys(suite.events).length > 0 && Object.keys(suite.events).length <= 128
    && Array.isArray(suite.scenarios) && suite.scenarios.length > 0 && suite.scenarios.length <= 128);
  for (const event of Object.values(suite.events)) {
    // Fixture validity is checked at emission, preserving deliberately expired evaluation cases.
    requireInput(timestamp(event?.emitted_at));
    validateEvent(event, { now: Date.parse(event.emitted_at) + 1 });
  }
  const files = [], cases = [], ids = new Set();
  for (const [index, scenario] of suite.scenarios.entries()) {
    requireInput(plain(scenario) && Object.keys(scenario).every(key => SCENARIO_FIELDS.includes(key))
      && typeof scenario.id === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(scenario.id) && !ids.has(scenario.id)
      && Array.isArray(scenario.criteria) && scenario.criteria.length > 0
      && scenario.criteria.every(boundedText) && boundedText(scenario.note)
      && timestamp(scenario.evaluation_time) && Array.isArray(scenario.events)
      && scenario.events.length > 0 && scenario.events.length <= 128
      && scenario.events.every(key => typeof key === 'string' && Object.hasOwn(suite.events, key)));
    ids.add(scenario.id);
    validateHost(scenario.host);
    requireInput(['unsolicited_receiver_evaluation', 'direct_user_request'].includes(scenario.invocation));
    requireInput(scenario.invocation === 'direct_user_request'
      ? boundedText(scenario.user_request) : !Object.hasOwn(scenario, 'user_request'));
    requireInput(!Object.hasOwn(scenario, 'prior_evaluation_recorded') || typeof scenario.prior_evaluation_recorded === 'boolean');
    const observation = blankReviewerObservation();
    requireInput(scoreReview(scenario, observation).result === 'unobserved');
    // Explicit construction excludes scenario names, expectations, criteria and review notes.
    const packet = {
      skill_guidance: guidance,
      events: scenario.events.map(key => structuredClone(suite.events[key])),
      host: structuredClone(scenario.host),
      evaluation_time: scenario.evaluation_time,
      invocation: scenario.invocation
    };
    if (scenario.invocation === 'direct_user_request') packet.user_request = scenario.user_request;
    if (Object.hasOwn(scenario, 'prior_evaluation_recorded')) {
      packet.prior_evaluation_recorded = scenario.prior_evaluation_recorded;
    }
    const caseId = `case-${String(index + 1).padStart(3, '0')}`;
    const agentPath = `agent/${caseId}.json`, reviewerPath = `reviewer/${caseId}.json`;
    files.push({ path: agentPath, role: 'agent_input', content: jsonFile(packet) },
      { path: reviewerPath, role: 'blank_reviewer_observation', content: jsonFile(observation) });
    cases.push({ case_id: caseId, scenario_id: scenario.id, criteria: [...scenario.criteria],
      agent_packet: agentPath, reviewer_observation: reviewerPath,
      evaluation_time: scenario.evaluation_time,
      event_occurrences: packet.events.map((event, occurrence) => ({
        occurrence, event_id: event.event_id, recipient_id: event.recipient_id, stream_id: event.stream_id,
        window_id: event.window.window_id, page_index: event.summary.page_index,
        page_count: event.summary.page_count, canonical_sha256: digest(canonical(event))
      })) });
  }
  requireInput(files.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'), 0) <= 8388608);
  return { files, cases };
}
