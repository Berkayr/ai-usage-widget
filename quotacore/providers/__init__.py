"""Provider registry. Each adapter exposes META, detect(), and read(prev)."""
from . import claude, codex, gemini, copilot, openrouter, deepseek, jetbrains

REGISTRY = (claude, codex, gemini, copilot, openrouter, deepseek, jetbrains)
PROVIDERS = {module.META["id"]: module for module in REGISTRY}

__all__ = ["claude", "codex", "gemini", "copilot", "openrouter", "deepseek", "jetbrains", "REGISTRY", "PROVIDERS"]
