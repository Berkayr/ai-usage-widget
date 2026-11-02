if (new URLSearchParams(location.search).has('settings')) await import('./settings-window.js'); else await import('./main.js');
