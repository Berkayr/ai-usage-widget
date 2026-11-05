"""Memory acceptance must reject both sustained leaks and transient growth."""
import unittest
from scripts.soak_metrics import MIB, check_memory, memory_metrics


class SoakMetricsTests(unittest.TestCase):
    def samples(self):
        return [{'seconds': second + .1, 'bytes': (50 if second < 20 else 160) * MIB}
                for second in range(0, 120, 10)]

    def test_one_time_webview_warmup_passes(self):
        samples = self.samples()
        samples[-1]['bytes'] += 15 * MIB
        metrics = memory_metrics(samples, 4)
        check_memory(samples, metrics)
        self.assertEqual(metrics['settings_retained_growth_bytes'], [0, 0, 0, 15 * MIB])

    def test_small_cycle_leaks_cannot_accumulate(self):
        samples = self.samples()
        for sample in samples:
            sample['bytes'] += max(0, int((sample['seconds'] - 30) // 20)) * 4 * MIB
        with self.assertRaisesRegex(AssertionError, 'cycle 4'):
            check_memory(samples, memory_metrics(samples, 4))

    def test_early_spike_then_flat_passes(self):
        samples = self.samples()
        samples[4]['bytes'] += 25 * MIB
        check_memory(samples, memory_metrics(samples, 0))

    def test_steady_climb_fails(self):
        samples = [{'seconds': second + .1, 'bytes': (100 + second // 10 * 3) * MIB}
                   for second in range(0, 120, 10)]
        with self.assertRaisesRegex(AssertionError, 'trend >=20 MiB'):
            check_memory(samples, memory_metrics(samples, 0))

    def test_permanent_step_fails(self):
        samples = [{'seconds': second + .1, 'bytes': (100 + (30 if second >= 70 else 0)) * MIB}
                   for second in range(0, 120, 10)]
        with self.assertRaisesRegex(AssertionError, 'trend >=20 MiB'):
            check_memory(samples, memory_metrics(samples, 0))

    def test_missing_settled_sample_fails(self):
        samples = self.samples()[:-1]
        with self.assertRaisesRegex(ValueError, '110s'):
            memory_metrics(samples, 4)

    def test_widget_only_uses_original_limit(self):
        samples = self.samples()
        metrics = memory_metrics(samples, 0)
        self.assertNotIn('settings_settled_bytes', metrics)
        check_memory(samples, metrics)
