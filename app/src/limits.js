const MAX_VISIBILITY_KEYS = 256;
const MAX_KEY_LENGTH = 128;

export function poolOf(window, provider) {
  const rawId = window?.pool?.id;
  if (typeof rawId === 'string' && rawId.trim()) {
    const id = rawId.trim();
    const rawLabel = window.pool?.label;
    const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : id;
    return { id, label };
  }
  const fallback = typeof provider?.label === 'string' && provider.label.trim()
    ? provider.label.trim()
    : String(provider?.id || 'Main');
  return { id: 'main', label: fallback };
}

export function limitKey(providerId, window) {
  const poolId = typeof window?.pool?.id === 'string' && window.pool.id.trim()
    ? window.pool.id.trim()
    : 'main';
  return `${providerId}/${poolId}`;
}

export function normalizeLimitVisibility(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  let count = 0;
  for (const [key, flag] of Object.entries(value)) {
    if (count >= MAX_VISIBILITY_KEYS) break;
    if (typeof flag !== 'boolean') continue;
    if (typeof key !== 'string' || !key || key.length > MAX_KEY_LENGTH || /[\x00-\x1f\x7f]/.test(key)) continue;
    result[key] = flag;
    count++;
  }
  return result;
}

export function providerPools(provider) {
  const windows = Array.isArray(provider?.windows) ? provider.windows : [];
  const pools = new Map();
  for (const w of windows) {
    const pool = poolOf(w, provider);
    const key = `${provider?.id || ''}/${pool.id}`;
    if (!pools.has(pool.id)) pools.set(pool.id, { id: pool.id, label: pool.label, key, windows: [] });
    pools.get(pool.id).windows.push(w);
  }
  return [...pools.values()];
}

function cloneWindow(w) {
  const copy = { ...w };
  if (w?.pool && typeof w.pool === 'object') copy.pool = { ...w.pool };
  return copy;
}

function cloneProvider(provider, windows) {
  const copy = { ...provider, windows };
  if (Array.isArray(provider.meters)) copy.meters = provider.meters.map(m => ({ ...m }));
  return copy;
}

export function applyLimits(providers, settings = {}) {
  if (!Array.isArray(providers)) return [];
  const showExtra = settings?.showExtraWindows === true;
  const separate = settings?.separatePools === true;
  const visibility = normalizeLimitVisibility(settings?.limitVisibility);
  const out = [];

  for (const provider of providers) {
    if (!provider || typeof provider !== 'object') continue;
    const windows = Array.isArray(provider.windows) ? provider.windows : [];
    const pools = providerPools(provider);
    const mainKey = `${provider.id}/main`;
    const mainShown = Object.hasOwn(visibility, mainKey) ? visibility[mainKey] : true;

    const shownByPool = new Map();
    for (const pool of pools) {
      const shown = Object.hasOwn(visibility, pool.key)
        ? visibility[pool.key]
        : pool.id === 'main'
          ? true
          : showExtra || pool.windows.some(w => !w.hidden_by_default);
      if (!shown) continue;
      const kept = [];
      for (const w of pool.windows) {
        if (pool.id === 'main') {
          if (w.hidden_by_default && (!showExtra || w.used_percent === null)) continue;
          kept.push(cloneWindow(w));
        } else {
          if (w.used_percent === null) continue;
          const copy = cloneWindow(w);
          delete copy.hidden_by_default;
          kept.push(copy);
        }
      }
      shownByPool.set(pool.id, { pool, windows: kept });
    }

    if (!separate) {
      const combined = [];
      for (const w of windows) {
        const pool = poolOf(w, provider);
        if (!shownByPool.has(pool.id)) continue;
        if (pool.id === 'main') {
          if (w.hidden_by_default && (!showExtra || w.used_percent === null)) continue;
          combined.push(cloneWindow(w));
        } else {
          if (w.used_percent === null) continue;
          const copy = cloneWindow(w);
          delete copy.hidden_by_default;
          combined.push(copy);
        }
      }
      out.push(cloneProvider(provider, combined));
      continue;
    }

    const derivedCards = [];
    for (const [poolId, entry] of shownByPool) {
      if (poolId === 'main' || !entry.windows.length) continue;
      const prefix = `${entry.pool.label} · `;
      const derived = {
        ...provider,
        id: `${provider.id}~${poolId}`,
        baseId: provider.id,
        label: entry.pool.label,
        windows: entry.windows.map(w => {
          const copy = cloneWindow(w);
          if (typeof copy.label === 'string' && copy.label.startsWith(prefix)) {
            copy.label = copy.label.slice(prefix.length);
          }
          return copy;
        }),
        meters: []
      };
      delete derived.history;
      derivedCards.push(derived);
    }

    const mainWindows = shownByPool.get('main')?.windows ?? [];
    const omitBase = !mainShown && derivedCards.length > 0;
    if (!omitBase) out.push(cloneProvider(provider, mainWindows));
    out.push(...derivedCards);
  }

  return out;
}
