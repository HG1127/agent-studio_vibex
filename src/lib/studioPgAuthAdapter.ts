import type { PgEmployeeProfile, PgSessionState } from "./pgNativeSession"
import type { StudioProfile, StudioSessionStatus } from "./studioAuth"

/** Selection proposal for the existing employee application. Default stays PB.
 * This pure policy grants no server capability and makes no network request. */
export function selectStudioAuthBackend(flag: unknown): "pocketbase" | "native_pg" {
  return flag === "true" ? "native_pg" : "pocketbase"
}

type NativeSessionPort = {
  session(): Promise<PgSessionState>
  signIn(email: string, password: string): Promise<PgEmployeeProfile>
  signOut(): Promise<void>
}

/** In-memory bridge to the existing studioAuth facade. The production caller
 * must supply createPgEmployeeSession with its fixed same-origin transport.
 * It never synthesizes server identity, bootstrap or permission capabilities. */
export function createStudioPgAuthAdapter(native: NativeSessionPort) {
  let epoch = 0
  let profile: StudioProfile | null = null
  let verifying: Promise<StudioSessionStatus> | null = null
  let mutationTail: Promise<void> = Promise.resolve()
  let mutations = 0
  let signingOut: { epoch: number; promise: Promise<void> } | null = null

  function mapped(user: PgEmployeeProfile): StudioProfile {
    const sharing = user as PgEmployeeProfile & { share_enabled?: unknown }
    return {
      id: user.id,
      email: user.email,
      display_name: user.display_name || user.email,
      role: user.is_admin === true ? "admin" : "employee",
      // The existing /me server only returns enabled, active employees.
      active: true,
      share_enabled: sharing.share_enabled === true,
    }
  }

  function account(): StudioProfile | null {
    return mutations === 0 && profile ? { ...profile } : null
  }

  function identity(): { sub: string; nickName: string } | null {
    const current = account()
    return current ? { sub: current.id, nickName: current.display_name } : null
  }

  function verify(): Promise<StudioSessionStatus> {
    if (mutations > 0) return Promise.resolve("unavailable")
    if (verifying) return verifying
    const localEpoch = epoch
    const pending: Promise<StudioSessionStatus> = (async () => {
      let result: PgSessionState
      try { result = await native.session() }
      catch { result = { status: "unavailable" } }
      // A stale read must not erase or replace a newer account.
      if (localEpoch !== epoch) return "unavailable"
      profile = result.status === "authenticated" ? mapped(result.profile) : null
      return result.status
    })()
    verifying = pending
    void pending.then(
      () => { if (verifying === pending) verifying = null },
      () => { if (verifying === pending) verifying = null },
    )
    return pending
  }

  function mutate<T>(operation: (stamp: number) => Promise<T>): Promise<T> {
    const stamp = ++epoch
    profile = null
    verifying = null
    mutations++
    // Cookie-changing requests run in invocation order, including after errors.
    const pending = mutationTail.then(() => operation(stamp))
    mutationTail = pending.then(() => undefined, () => undefined)
    void pending.then(() => { mutations-- }, () => { mutations-- })
    return pending
  }

  function signIn(email: string, password: string): Promise<StudioProfile> {
    return mutate(async stamp => {
      const user = await native.signIn(email, password)
      if (stamp !== epoch) throw new Error("studio_auth_operation_superseded")
      profile = mapped(user)
      return { ...profile }
    })
  }

  function signOut(): Promise<void> {
    // A new sign-in between two logout requests changes the Cookie again.
    // Only adjacent logout requests from the same epoch may share a revoke.
    if (signingOut?.epoch === epoch) return signingOut.promise
    const pending = mutate(async () => { await native.signOut() })
    const inFlight = { epoch, promise: pending }
    signingOut = inFlight
    void pending.then(
      () => { if (signingOut === inFlight) signingOut = null },
      () => { if (signingOut === inFlight) signingOut = null },
    )
    return pending
  }

  return { verify, account, identity, signIn, signOut }
}
