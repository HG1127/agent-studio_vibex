import { VersionReleasePage } from "./VersionReleasePage"
import { useVersionRelease } from "./useVersionRelease"

export default function VersionReleaseRoute() {
  const vm = useVersionRelease()
  return <VersionReleasePage {...vm} />
}
