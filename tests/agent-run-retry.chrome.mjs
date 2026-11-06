// Focused real-Chrome acceptance for the Agent run retry/model quick-picker UX.
process.env.AGENT_STUDIO_UX_RETRY_ONLY = "1"
process.env.AGENT_STUDIO_CDP_COMMAND_TIMEOUT_MS =
  process.env.AGENT_STUDIO_CDP_COMMAND_TIMEOUT_MS || "8000"
await import("./agent-review.chrome.mjs")
