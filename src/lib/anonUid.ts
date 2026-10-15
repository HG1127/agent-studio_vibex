// Multi-tenant safety: unauthenticated visitors must not share a single user identity.
// Local API-only smoke tests can opt in to AGENT_STUDIO_ALLOW_ANON=true on the server.
// The browser requires a real RunningHub identity for normal studio usage.
export const LOCAL_ANON_UID = ""
