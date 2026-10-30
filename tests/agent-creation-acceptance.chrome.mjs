// Browser entry point delegating to agent-review.chrome.mjs, whose PocketBase
// lifecycle uses the same guarded headless launcher as all other browser tests.
// One independently isolated run of the complete existing employee creation
// journey, including a model that proposes expressly forbidden resources.
process.env.AGENT_STUDIO_UX_FULL_CREATION_ONLY='1'
process.env.AGENT_STUDIO_UX_DENIAL_FIRST='1'
await import('./agent-review.chrome.mjs')
