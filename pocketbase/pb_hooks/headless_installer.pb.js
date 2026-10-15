// Historical hook intentionally retired. On PocketBase 0.40.x, `onServe`
// is not exported to JSVM. The test launcher pre-creates a disposable
// superuser via CLI, so an installer browser is not opened. Production
// operators must create their PocketBase superuser via CLI before serving.
// No hook is registered here. Keep this as a compatibility placeholder.
