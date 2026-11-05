// Canonical JSON ignores absent optional values and empty option objects.
export function canonical(value, path = '') {
  if (value == null)
    return undefined;
  if (Array.isArray(value))
    return value.map(item => canonical(item) ?? null);
  if (typeof value !== 'object')
    return value;
  const entries =
      Object.entries(value)
          .flatMap(([ key, child ]) => {
            if (!path && key === 'providerPreview')
              return [];
            if (path === 'placement')
              key = ({x_ratio : 'xRatio', y_ratio : 'yRatio'})[key] || key;
            const normalized = canonical(child, path ? `${path}.${key}` : key);
            return normalized === undefined ? [] : [ [ key, normalized ] ];
          })
          .sort(([ a ], [ b ]) => a.localeCompare(b));
  return entries.length ? Object.fromEntries(entries) : undefined;
}
export function equalSettings(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export function differingKeys(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b) ]) ].filter(
      key => !equalSettings({[key] : a[key]}, {[key] : b[key]}));
}
