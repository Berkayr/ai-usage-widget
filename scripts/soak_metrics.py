"""Pure acceptance metrics for the native soak (also tested without a desktop)."""
MIB = 1048576


def memory_metrics(samples, cycles):
    # Warm-up opens at 15s and hides at 19s. The first stable sample is 30s.
    stable = [s['bytes'] for s in samples if s['seconds'] >= 30]
    result = {'growth_after_30_bytes': max(stable) - min(stable) if stable else None}
    if cycles:
        settled = []
        for second in [30] + [50 + 20 * cycle for cycle in range(cycles)]:
            sample = next((s for s in samples if second <= s['seconds'] < second + 5), None)
            if sample is None:
                raise ValueError(f'Missing settled memory sample near {second}s')
            settled.append(sample['bytes'])
        result.update(settings_settled_bytes=settled,
                      settings_retained_growth_bytes=[max(0, value - settled[0]) for value in settled[1:]],
                      settings_retained_limit_bytes=15 * MIB)
    return result


def check_memory(samples, metrics):
    stable = [s for s in samples if s['seconds'] >= 30]
    assert len(stable) >= 8 and metrics['growth_after_30_bytes'] < 20 * MIB, 'Memory growth >=20 MiB after warm-up / 30s'
    for cycle, growth in enumerate(metrics.get('settings_retained_growth_bytes', []), 1):
        assert growth <= 15 * MIB, f'Settings cycle {cycle}: retained growth >15 MiB from warmed baseline'
