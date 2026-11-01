import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const labels = {claude: 'Claude', codex: 'Codex', gemini: 'Gemini'};
const severity = value => value >= 80 ? 'error' : value >= 50 ? 'warning' : '';
const visibleWindows = provider => (provider.windows ?? []).filter(window =>
    !window.hidden && !window.hidden_by_default && Number.isFinite(window.used_percent));

// Shell's symbolic warning/error palette follows the active theme, including high contrast.
function toneLabel(label, value) {
    const role = severity(value);
    if (!role) return;
    label.add_style_class_name(role);
    label.connect('style-changed', () => {
        const color = label.get_theme_node().get_icon_colors()[role];
        const style = `color: rgba(${color.red},${color.green},${color.blue},${color.alpha / 255});`;
        if (label.get_style() !== style) label.set_style(style);
    });
}

function usageBar(value) {
    const area = new St.DrawingArea({style_class: `quota-bar ${severity(value)}`, x_expand: true});
    area.connect('repaint', widget => {
        const cr = widget.get_context();
        const [width, height] = widget.get_surface_size();
        const node = widget.get_theme_node();
        const foreground = node.get_foreground_color();
        const role = severity(value);
        const fill = role ? node.get_icon_colors()[role] : foreground;
        cr.setSourceRGBA(foreground.red / 255, foreground.green / 255, foreground.blue / 255, 0.12);
        cr.rectangle(0, 0, width, height);
        cr.fill();
        cr.setSourceRGBA(fill.red / 255, fill.green / 255, fill.blue / 255, fill.alpha / 255);
        cr.rectangle(0, 0, width * Math.max(0, Math.min(100, value)) / 100, height);
        cr.fill();
        cr.$dispose();
    });
    return area;
}

export default class AIQuota extends Extension {
    enable() {
        this._button = new PanelMenu.Button(0.0, 'AI Quota');
        this._box = new St.BoxLayout({style_class: 'quota-panel'});
        this._box.add_child(new St.Label({text: 'Quota —', y_align: Clutter.ActorAlign.CENTER}));
        this._button.add_child(this._box);
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
            // Package launcher works without a global pip installation; Python is the fallback.
            const launcher = GLib.find_program_in_path('quotacore');
            const argv = launcher ? [launcher] : ['python3', '-m', 'quotacore'];
            const process = Gio.Subprocess.new([...argv, 'bar', '--format', 'json', '--window', 'session'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            this._process = process;
            this._cancel = new Gio.Cancellable();
            process.communicate_utf8_async(null, this._cancel, (proc, result) => {
                if (this._process !== proc || !this._button) return;
                this._process = null;
                this._cancel = null;
                try {
                    const [, stdout] = proc.communicate_utf8_finish(result);
                    if (!proc.get_successful()) throw new Error('quotacore unavailable');
                    this._render(JSON.parse(stdout));
                } catch (_) { this._unavailable(); }
            });
        } catch (_) { this._unavailable(); }
    }

    _render(quota) {
        this._box.destroy_all_children();
        this._button.menu.removeAll();
        for (const provider of quota.providers) {
            const compact = new St.BoxLayout({style_class: 'quota-panel-provider'});
            compact.add_child(new St.Label({text: provider.short ?? provider.id.toUpperCase(), y_align: Clutter.ActorAlign.CENTER}));
            const pct = new St.Label({text: `${provider.percentage === null ? '?' : Math.round(provider.percentage) + '%'}${provider.stale ? '*' : ''}`, y_align: Clutter.ActorAlign.CENTER});
            toneLabel(pct, provider.percentage);
            compact.add_child(pct);
            this._box.add_child(compact);
            const name = labels[provider.id] ?? provider.label ?? provider.id;
            const state = provider.stale && provider.state === 'OK' ? 'STALE' : provider.state;
            this._button.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                `${name}${provider.plan ? ' · ' + provider.plan : ''} · ${state}`, {reactive: false}));
            const windows = visibleWindows(provider);
            for (const window of windows) {
                const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
                const column = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'quota-window'});
                const heading = new St.BoxLayout({x_expand: true});
                heading.add_child(new St.Label({text: window.label, x_expand: true}));
                const percent = new St.Label({text: `${Math.round(window.used_percent)}%`});
                toneLabel(percent, window.used_percent);
                heading.add_child(percent);
                column.add_child(heading);
                column.add_child(usageBar(window.used_percent));
                column.add_child(new St.Label({text: window.remaining === '?' ? 'Reset time unknown' : `Resets in ${window.remaining}`, style_class: 'quota-reset'}));
                item.add_child(column);
                this._button.menu.addMenuItem(item);
            }
            if (!windows.length)
                this._button.menu.addMenuItem(new PopupMenu.PopupMenuItem('No quota data available', {reactive: false}));
            this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        if (!quota.providers.length) {
            this._box.add_child(new St.Label({text: 'Quota —', y_align: Clutter.ActorAlign.CENTER}));
            this._button.menu.addMenuItem(new PopupMenu.PopupMenuItem('No active providers. Run quotacore write.', {reactive: false}));
        }
    }

    _unavailable() {
        if (!this._button) return;
        this._box.destroy_all_children();
        this._box.add_child(new St.Label({text: 'Quota unavailable — install quotacore', y_align: Clutter.ActorAlign.CENTER}));
        this._button.menu.removeAll();
        this._button.menu.addMenuItem(new PopupMenu.PopupMenuItem('Install the quotacore package or install quotacore for python3.', {reactive: false}));
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
        this._box = null;
    }
}
