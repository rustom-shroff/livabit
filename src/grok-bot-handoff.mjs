// Fixed offline handoff materials; no Grok Bot adapter or account operation.
import { buildSkillReviewPackets, extractSkillGuidance } from './skill-review-packet.mjs';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const requireInput = ok => { if (!ok) throw new TypeError('Invalid offline Grok Bot handoff input.'); };

const SETUP = `# Grok Bot: offline liveabit Skill handoff

This folder was prepared locally. It contains synthetic interpretation exercises and portable operational guidance. Nothing has been sent to Grok Bot, installed in an account or evaluated by a model. No real activity is present.

Grok Bot is the selected first integration target. The [webhook priority decision](../../../docs/decisions/0012-grok-bot-direct-webhook-priority.md) selects its direct routine webhook; native MCP Events remains unverified research. Protected pairing and access on the user's base-plan account remain unverified. This bundle supplies no adapter, listener, authentication or delivery endpoint. No production Grok delivery profile is enabled. Keep the [integration draft](../../../docs/integration-drafts/grok-bot-profile.md) and [research](../../../docs/research/grok-bot-webhook-feasibility-2026-10-08.md) separate from agent input.

## Before sharing anything

The [official Skills documentation](https://docs.x.ai/grok-bot/skills-routines-and-automations) describes saving written instructions as a private Skill. Private Skills are shared across the account's Bots. The [cloud computer documentation](https://docs.x.ai/grok-bot/computer-and-apps) says its files, browser sessions and command-line credentials are also shared across Bots. A private Skill is not isolation from other Bots on that account. Use only the synthetic materials here; do not add phone records, credentials, private goals or memories.

This preparation performs no account submission. The following are optional human handoff instructions for a separately authorized review in the user's existing Bot. There is no required batch of eighteen user trials.

## Save the operational Skill, when an actual host review is authorized

Share only \`agent/liveabit-skill.md\` in the chosen existing Bot's private conversation. Ask it to save that guidance as a private Skill named \`liveabit\`. A suggested request is:

> Save the attached operational guidance as a private Skill called liveabit. Preserve its requirements for validated Open Activity Protocol evidence, privacy, user intent and interruption policy. Saving the Skill establishes no receiving endpoint or monitoring consent. Create no routine, listener, tunnel, forwarding service or credential store. Do not purchase, upgrade or change account settings. Show the saved guidance for review and stop.

The file is portable written guidance. No Grok Bot installation path, upload format or package compatibility is assumed. If the feature is unavailable on the current plan, record that limit and stop. A Bot's statement that it supports MCP Events or saved a Skill does not establish authenticated delivery or observed execution.

## Review one synthetic case, when authorized

Choose one opaque \`agent/case-NNN.json\` file. Share that file alone with this exercise framing:

> This is an explicit synthetic interpretation exercise using the attached case. Its events, host facts, invocation and evaluation time are hypothetical exercise inputs, not real activity or authenticated receiver delivery. Use the supplied evaluation time without rewriting event timestamps or expiry. Apply the liveabit guidance to the hypothetical invocation. Do not change real preferences or monitoring consent, invoke tools, send messages to others or create background work. Keep this exercise in this conversation.

Agent case files already include the operational guidance. Keep this setup note, \`manifest.json\`, all \`reviewer/\` files, the scenario source and the evaluation rubric with the human reviewer. The manifest contains scenario identities and criteria; do not give it to the Bot or upload this entire folder.

## Record the actual stage

The matching reviewer file starts unobserved with unanswered checks. Record an observation only after an actual host response; absence of output alone does not prove evaluated silence. The [existing review method](../../../docs/review/liveabit-skill-review-packets.md) explains scoring. An interpretation exercise cannot prove native MCP Events support, authenticated receipt, validated durable consumption, monitoring consent, plan eligibility or M2. Transport receipt, Skill evaluation and user-visible output remain separate observations.

Preserve the ChatGPT dots research and the [target decision](../../../docs/decisions/0011-grok-bot-first-integration.md). Continue direct Android-to-existing-agent feasibility without adding intermediary infrastructure.
`;

export function buildGrokBotHandoff(input) {
  // Configuration and activation flags have no place in this offline builder.
  requireInput(plain(input) && Object.keys(input).sort().join(',') === 'skillMarkdown,suite');
  const guidance = extractSkillGuidance(input.skillMarkdown);
  const packets = buildSkillReviewPackets(input);
  const files = [
    { path: 'agent/liveabit-skill.md', role: 'operational_skill_guidance', content: guidance },
    { path: 'SETUP.md', role: 'human_setup_instructions', content: SETUP },
    ...packets.files
  ];
  requireInput(files.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'), 0) <= 8388608);
  return {
    target: 'grok-bot', transport_status: 'unverified', synthetic: true,
    actual_host_accessed: false, network_accessed: false, device_accessed: false,
    account_actions_performed: false, model_invoked: false, activity_delivered: false,
    agent_evaluation_observed: false, authentication_verified: false,
    plan_eligibility_verified: false, skill_installed: false, routine_created: false,
    listener_created: false, real_host_gate_satisfied: false, m2_gate_satisfied: false,
    native_profile_enabled: false, files, cases: packets.cases
  };
}
