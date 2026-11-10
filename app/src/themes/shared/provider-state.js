// Setup instructions mirror docs/providers.md; never infer a missing balance as zero.
const setup = {
  claude: 'Sign in through Claude Code.', codex: 'Install and sign in through the Codex CLI.',
  gemini: 'Sign in through Antigravity (agy), then refresh Gemini quota.',
  copilot: 'Sign in with GitHub CLI: gh auth login; ensure the account has Copilot access.',
  openrouter: 'Configure OPENROUTER_API_KEY or openrouter in local secrets.json.',
  deepseek: 'Configure DEEPSEEK_API_KEY or deepseek in local secrets.json.',
  jetbrains: 'Open JetBrains AI in your IDE to update its local quota cache.',
  zai: 'Configure ZAI_API_KEY or zai in local secrets.json.',
  moonshot: 'Configure MOONSHOT_API_KEY or moonshot in local secrets.json.',
  siliconflow: 'Configure SILICONFLOW_API_KEY or siliconflow in local secrets.json.',
  openai_admin: 'Configure an OpenAI organization administrator key (OPENAI_ADMIN_KEY).',
  anthropic_admin: 'Configure an Anthropic administrator key (ANTHROPIC_ADMIN_KEY).',
};
export const hasMeterData = meter => ['remaining', 'used', 'limit'].some(key => Number.isFinite(meter?.[key]));
export function providerEmptyState(provider, hasData) {
  const state = String(provider.state).toUpperCase();
  const hint = setup[provider.id] || 'Check provider setup in Settings.';
  const reason = [provider.message, provider.detail, provider.error].find(value => typeof value === 'string' && value.trim());
  if (state === 'NO_SUBSCRIPTION') return {title: 'No subscription found', detail: hint};
  if (state === 'AUTH_REQUIRED') return {title: 'Sign-in required', detail: hint};
  if (hasData) return null;
  return {title: provider.id === 'openrouter' && state === 'OK' ? 'No balance data' : 'Quota unavailable', detail: reason || (provider.id === 'openrouter' && state === 'OK' ? 'No balance values were returned by the provider.' : hint)};
}
