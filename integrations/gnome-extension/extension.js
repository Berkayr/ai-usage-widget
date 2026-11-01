import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class AIQuota extends Extension {
    enable() {
        this._button = new PanelMenu.Button(0.0, 'AI Quota');
        this._label = new St.Label({text: 'Quota ?', y_align: 2});
        this._button.add_child(this._label);
        Main.panel.addToStatusArea(this.uuid, this._button);
        this._refresh();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _refresh() {
        if (this._process || !this._button) return;
        try {
            const process = Gio.Subprocess.new(['python3', '-m', 'quotacore', 'bar', '--format', 'json',
                '--providers', 'claude,codex,gemini', '--window', 'session'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            this._process = process;
            this._cancel = new Gio.Cancellable();
            process.communicate_utf8_async(null, this._cancel, (proc, result) => {
                if (this._process !== proc || !this._button) return;
                this._process = null;
                try {
                    const [, stdout] = proc.communicate_utf8_finish(result);
                    if (!proc.get_successful()) throw new Error('quotacore unavailable');
                    const quota = JSON.parse(stdout);
                    this._label.text = quota.text;
                    this._button.menu.removeAll();
                    for (const provider of quota.providers) {
                        const title = new PopupMenu.PopupMenuItem(`${provider.id} · ${provider.state}`, {reactive: false});
                        this._button.menu.addMenuItem(title);
                        for (const window of provider.windows) {
                            const item = new PopupMenu.PopupMenuItem(window.text, {reactive: false});
                            item.add_style_class_name(window.used_percent === null ? 'quota-unknown'
                                : window.used_percent >= 80 ? 'quota-crit' : window.used_percent >= 50 ? 'quota-warn' : 'quota-ok');
                            this._button.menu.addMenuItem(item);
                        }
                    }
                } catch (_) { this._unavailable(); }
            });
        } catch (_) { this._unavailable(); }
    }

    _unavailable() {
        if (!this._button) return;
        this._label.text = 'Quota unavailable';
        this._button.menu.removeAll();
        this._button.menu.addMenuItem(new PopupMenu.PopupMenuItem('Install quotacore for the desktop Python interpreter.', {reactive: false}));
    }

    disable() {
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = null;
        this._cancel?.cancel();
        this._process?.force_exit();
        this._process = null;
        this._cancel = null;
        this._button?.destroy();
        this._button = null;
        this._label = null;
    }
}
