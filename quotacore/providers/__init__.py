"""Lazy adapter registry; metadata does not import provider implementations."""
from collections.abc import Mapping
from importlib import import_module

METADATA = {'claude': {'id': 'claude',
            'label': 'Claude Code',
            'category': 'subscription',
            'auth': 'local-file',
            'experimental': False,
            'docs_url': 'https://docs.anthropic.com/'},
 'codex': {'id': 'codex',
           'label': 'OpenAI Codex',
           'category': 'subscription',
           'auth': 'cli-login',
           'experimental': False,
           'docs_url': 'https://developers.openai.com/codex/'},
 'gemini': {'id': 'gemini',
            'label': 'Google Gemini',
            'category': 'subscription',
            'auth': 'cli-login',
            'experimental': False,
            'docs_url': 'https://github.com/google-gemini/gemini-cli'},
 'copilot': {'id': 'copilot',
             'label': 'GitHub Copilot',
             'category': 'credits',
             'auth': 'cli-login',
             'experimental': True,
             'docs_url': 'https://github.com/settings/copilot'},
 'openrouter': {'id': 'openrouter',
                'label': 'OpenRouter',
                'category': 'api-balance',
                'auth': 'api-key',
                'experimental': False,
                'docs_url': 'https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key'},
 'deepseek': {'id': 'deepseek',
              'label': 'DeepSeek API',
              'category': 'api-balance',
              'auth': 'api-key',
              'experimental': False,
              'docs_url': 'https://api-docs.deepseek.com/api/get-user-balance/'},
 'jetbrains': {'id': 'jetbrains',
               'label': 'JetBrains AI',
               'category': 'credits',
               'auth': 'local-file',
               'experimental': False,
               'docs_url': 'https://www.jetbrains.com/help/ai-assistant/licensing-and-subscriptions.html'}}

class ProviderRegistry(Mapping):
    def __iter__(self):
        return iter(METADATA)

    def __len__(self):
        return len(METADATA)

    def __getitem__(self, key):
        if key not in METADATA:
            raise KeyError(key)
        return import_module(f"{__name__}.{key}")

PROVIDERS = ProviderRegistry()

def __getattr__(name):
    if name in METADATA:
        return PROVIDERS[name]
    raise AttributeError(name)

__all__ = [*METADATA, "PROVIDERS", "METADATA"]
