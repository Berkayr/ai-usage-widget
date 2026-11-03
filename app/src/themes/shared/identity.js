// Known providers keep their identity when the selection/order changes.
export function providerIndex(provider, fallback=0) {
  const index=['claude','codex','gemini'].indexOf(String(provider?.id).toLowerCase());
  return index<0 ? fallback%3 : index;
}
export const identityPatterns=['','6 2','1 2'];
export const identityColor=index=>`var(--provider-${index})`;
