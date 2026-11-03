#!/usr/bin/env python3
"""Offline WebKitGTK/layer-shell reproduction in an isolated virtual KWin."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--inside', action='store_true')
parser.add_argument('--output', type=Path, default=ROOT / 'gorevler/ss-ayar/native')
args = parser.parse_args()
args.output = args.output.resolve()


def launch():
    """A separate bus, runtime and HOME cannot alter the user's desktop."""
    with tempfile.TemporaryDirectory(prefix='ai-usage-layer-') as temporary:
        root = Path(temporary)
        for directory in ('home', 'config', 'data', 'cache', 'state', 'runtime'):
            (root / directory).mkdir(mode=0o700)
        env = dict(os.environ)
        env.update(HOME=str(root / 'home'), XDG_CONFIG_HOME=str(root / 'config'),
                   XDG_DATA_HOME=str(root / 'data'), XDG_CACHE_HOME=str(root / 'cache'),
                   XDG_STATE_HOME=str(root / 'state'), XDG_RUNTIME_DIR=str(root / 'runtime'),
                   QT_QPA_PLATFORM='offscreen', GDK_BACKEND='wayland',
                   LIBGL_ALWAYS_SOFTWARE='1', KWIN_WAYLAND_NO_PERMISSION_CHECKS='1')
        for key in ('DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS'):
            env.pop(key, None)
        # KWin launches this bounded session once its virtual output is ready.
        import shlex
        session = root / 'session.sh'
        session.write_text('#!/bin/sh\nexec ' + shlex.join([
            '/usr/bin/python3', str(Path(__file__).resolve()), '--inside',
            '--output', str(args.output)]) + '\n')
        session.chmod(0o700)
        result = subprocess.run(['timeout', '--kill-after=3s', '45s', 'dbus-run-session',
            'kwin_wayland', '--virtual', '--width', '1536', '--height', '960',
            '--scale', '1', '--socket', 'quote-test', '--no-global-shortcuts',
            '--no-kactivities', '--exit-with-session', str(session)], env=env,
            capture_output=True, text=True)
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / 'compositor.log').write_text(result.stdout + result.stderr)
        if result.returncode or not (args.output / 'measurements.json').exists():
            raise RuntimeError(f'Native preview failed ({result.returncode}); see compositor.log')
        print((args.output / 'measurements.json').read_text())


def inside():
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('GtkLayerShell', '0.1')
    gi.require_version('WebKit2', '4.1')
    from gi.repository import Gtk, GtkLayerShell, WebKit2, GLib

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *unused):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(
        QuietHandler, directory=str(ROOT / 'app/dist')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    args.output.mkdir(parents=True, exist_ok=True)
    panel = Gtk.Window()
    GtkLayerShell.init_for_window(panel)
    GtkLayerShell.set_layer(panel, GtkLayerShell.Layer.TOP)
    for edge in (GtkLayerShell.Edge.TOP, GtkLayerShell.Edge.LEFT, GtkLayerShell.Edge.RIGHT):
        GtkLayerShell.set_anchor(panel, edge, True)
    panel.set_size_request(-1, 34)
    GtkLayerShell.set_exclusive_zone(panel, 34)
    panel.show_all()
    window = Gtk.Window()
    GtkLayerShell.init_for_window(window)
    GtkLayerShell.set_layer(window, GtkLayerShell.Layer.TOP)
    GtkLayerShell.set_exclusive_zone(window, -1)
    GtkLayerShell.set_anchor(window, GtkLayerShell.Edge.TOP, True)
    GtkLayerShell.set_anchor(window, GtkLayerShell.Edge.LEFT, True)
    web = WebKit2.WebView()
    window.add(web)
    results, errors = [], []
    phases = [('Medium', 100), ('Large', 125), ('Medium', 100)]

    def fail(message):
        errors.append(str(message))
        Gtk.main_quit()

    def phase():
        try:
            index = len(results)
            preset, base = phases[index]
            factor = min(base * .82 / 100, 902 / 946)
            width, height = round(340 * factor), round(946 * factor)
            window.set_size_request(width, height)
            window.resize(1, 1)
            GtkLayerShell.set_margin(window, GtkLayerShell.Edge.TOP, 46)
            GtkLayerShell.set_margin(window, GtkLayerShell.Edge.LEFT, 1536 - width - 12)
            script = '''(async()=>{
              const api=window.__AI_USAGE_DEMO__;
              await api.setWorkArea([{name:'Synthetic laptop',width:1536,height:926,scale:1,primary:true}]);
              await api.setSettings(SETTINGS);
              await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,plan:'DEMO',state:'OK',windows:[{kind:'session',used_percent:84,resets_at:new Date(Date.now()+9600000).toISOString()},{kind:'weekly',used_percent:62,resets_at:new Date(Date.now()+144000000).toISOString()}]}))});
              await api.setQuote({status:'ok',cards:[{quote:'Fictional words about quiet thought and patient work. '.repeat(4),author:'Example Author',work:'An Invented Work (1933)',reason:'Died on this day, 1957'}]});
              await document.fonts.ready;
              await new Promise(r=>setTimeout(r,250));
              const list=document.querySelector('#providers');
              const cards=[...list.querySelectorAll('.provider-card')];
              const usageFits=[list,...cards].every(el=>el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth);
              const scrollbars=[list,...cards].map(el=>{const s=getComputedStyle(el);return el.offsetWidth-el.clientWidth-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth)});
              const lr=list.getBoundingClientRect();
              const edgesFit=cards.every(el=>{const r=el.getBoundingClientRect();return r.top>=lr.top-1&&r.bottom<=lr.bottom-parseFloat(getComputedStyle(list).paddingBottom)+1});
              const t=document.querySelector('.quote-text'),r=document.querySelector('#widget').getBoundingClientRect();
              document.title='MEASURE:'+JSON.stringify({preset:PRESET,fineTune:api.getSettings().fineTune,width:r.width,height:r.height,viewport:[innerWidth,innerHeight],usageFits,scrollbars,edgesFit,featured:document.querySelector('.featured-provider')?.dataset.provider,textFits:t.scrollHeight<=t.clientHeight&&t.scrollWidth<=t.clientWidth,font:getComputedStyle(t).fontSize});
            })().catch(e=>document.title='FAIL:'+e.message)'''
            settings = dict(theme='brutalist', shape='portrait', sizePreset=preset,
                            fineTune=82, quoteEnabled=True, quotePosition='bottom',
                            fitHeight=True, appearance='dark', featuredProvider='auto',
                            featuredPosition='top', linux={'margin': 12})
            script = script.replace('SETTINGS', json.dumps(settings)).replace('PRESET', json.dumps(preset))
            web.evaluate_javascript(script, -1, None, None, None, None, None)
        except Exception as error:
            fail(error)

    def title_changed(*unused):
        title = web.get_title() or ''
        if title.startswith('FAIL:'):
            fail(title)
        if not title.startswith('MEASURE:'):
            return
        try:
            metrics = json.loads(title.removeprefix('MEASURE:'))
            metrics['layerShell'] = GtkLayerShell.is_layer_window(window)
            metrics['allocation'] = [window.get_allocated_width(), window.get_allocated_height()]
            assert metrics['layerShell'] and metrics['fineTune'] == 82 and metrics['textFits'], metrics
            assert metrics['usageFits'] and metrics['edgesFit'] and max(metrics['scrollbars']) <= .5, metrics
            assert metrics['featured'] and metrics['height'] <= metrics['viewport'][1] + 1, metrics
            assert 46 + metrics['allocation'][1] <= 948, metrics
            results.append(metrics)
            def snapshot_done(view, task):
                try:
                    surface = view.get_snapshot_finish(task)
                    surface.write_to_png(str(args.output / f'{len(results)}-{metrics["preset"].lower()}.png'))
                    if len(results) == len(phases):
                        (args.output / 'measurements.json').write_text(json.dumps(results, indent=2) + '\n')
                        Gtk.main_quit()
                    else:
                        GLib.idle_add(phase)
                except Exception as error:
                    fail(error)
            web.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, snapshot_done)
        except Exception as error:
            fail(error)

    def loaded(view, event):
        if event == WebKit2.LoadEvent.FINISHED:
            GLib.timeout_add(500, phase)
    web.connect('notify::title', title_changed)
    web.connect('load-changed', loaded)
    window.set_size_request(279, 776)
    window.show_all()
    web.load_uri(f'http://127.0.0.1:{server.server_port}/?sample')
    GLib.timeout_add_seconds(30, lambda: fail('Native preview timed out'))
    Gtk.main()
    window.destroy()
    panel.destroy()
    server.shutdown()
    if errors:
        raise RuntimeError('; '.join(errors))


if __name__ == '__main__':
    inside() if args.inside else launch()
