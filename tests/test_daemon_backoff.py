import unittest
from unittest import mock
from quotacore import __main__ as cli


class DaemonBackoffTests(unittest.TestCase):
    def run_records(self, records, interval=300):
        sleeps = []
        def sleep(delay):
            sleeps.append(delay)
            if len(sleeps) >= len(records):
                raise KeyboardInterrupt
        with mock.patch.object(cli, "write_snapshot", side_effect=records), mock.patch.object(cli.time, "sleep", side_effect=sleep):
            cli.daemon(interval)
        return sleeps

    def snapshot(self, *states):
        keys = list(cli.PROVIDERS)
        return {"providers": [{"id": key, "state": state} for key, state in zip(keys, states)]}

    def test_disabled_records_do_not_create_backoff(self):
        keys = list(cli.PROVIDERS)
        records = [{"providers": [{"id": key, "state": "OK" if key == keys[0] else "DISABLED"} for key in keys]} for _ in range(3)]
        self.assertEqual(self.run_records(records), [300, 300, 300])

    def test_disabled_clears_existing_backoff(self):
        keys = list(cli.PROVIDERS)
        unavailable = {"providers": [{"id": key, "state": "SOURCE_UNAVAILABLE" if key == keys[0] else "OK"} for key in keys]}
        disabled = {"providers": [{"id": key, "state": "DISABLED" if key == keys[0] else "OK"} for key in keys]}
        with mock.patch.object(cli.PROVIDERS["claude"], "RETRY_AFTER", None):
            self.assertEqual(self.run_records([unavailable, unavailable, disabled], interval=30), [30, 60, 30])

    def test_source_unavailable_backoff_still_grows(self):
        keys = list(cli.PROVIDERS)
        with mock.patch.object(cli, "write_snapshot", side_effect=[{"providers": [{"id": k, "state": "SOURCE_UNAVAILABLE" if k == keys[0] else "OK"} for k in keys]}] * 3), mock.patch.object(cli.PROVIDERS["claude"], "RETRY_AFTER", None), mock.patch.object(cli.time, "sleep", side_effect=[mock.DEFAULT, mock.DEFAULT, KeyboardInterrupt()]) as sleeper:
            cli.daemon(30)
        self.assertEqual([call.args[0] for call in sleeper.call_args_list], [30, 60, 120])

    def test_claude_retry_after_is_preserved(self):
        records = []
        keys = list(cli.PROVIDERS)
        records.append({"providers": [{"id": k, "state": "RATE_LIMITED" if k == "claude" else "OK"} for k in keys]})
        records.append({"providers": [{"id": k, "state": "DISABLED" if k == "claude" else "OK"} for k in keys]})
        with mock.patch.object(cli, "write_snapshot", side_effect=records), mock.patch.object(cli.PROVIDERS["claude"], "RETRY_AFTER", 75), mock.patch.object(cli.time, "sleep", side_effect=[mock.DEFAULT, KeyboardInterrupt()]) as sleeper:
            cli.daemon(30)
        self.assertEqual([c.args[0] for c in sleeper.call_args_list], [75, 30])


if __name__ == "__main__":
    unittest.main()
