"""Human-readable access disclosures; detection never reads credentials."""
DISCLOSURES = {
    "claude": "Reads ~/.claude/.credentials.json, ~/.claude.json and local observations; connects to api.anthropic.com",
    "codex": "Runs codex app-server; the installed CLI manages credentials and OpenAI connections",
    "gemini": "Reads local gemini-kota.json; explicit refresh runs agy with its own credentials and Google connections",
    "copilot": "Runs gh auth token; connects to api.github.com",
    "openrouter": "Reads OPENROUTER_API_KEY or local secrets.json; connects to openrouter.ai",
    "deepseek": "Reads DEEPSEEK_API_KEY or local secrets.json; connects to api.deepseek.com",
    "jetbrains": "Reads JetBrains quota XML under the platform config directory; no network",
    "zai": "Reads ZAI_API_KEY or local secrets.json; connects to api.z.ai",
    "moonshot": "Reads MOONSHOT_API_KEY or local secrets.json; connects to api.moonshot.ai",
    "siliconflow": "Reads SILICONFLOW_API_KEY or local secrets.json; connects to api.siliconflow.cn",
    "openai_admin": "Reads OPENAI_ADMIN_KEY or local secrets.json; connects to api.openai.com",
    "anthropic_admin": "Reads ANTHROPIC_ADMIN_KEY or local secrets.json; connects to api.anthropic.com",
}
