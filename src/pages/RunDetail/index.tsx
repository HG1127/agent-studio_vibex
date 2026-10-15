import { RunDetailPage } from "./RunDetailPage"
import { useRunDetail } from "./useRunDetail"

export default function RunDetailRoute() {
  const vm = useRunDetail()
  return <RunDetailPage {...vm} />
}
