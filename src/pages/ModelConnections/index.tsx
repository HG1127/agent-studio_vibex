import { ModelConnectionsPage } from "./ModelConnectionsPage"
import { useModelConnections } from "./useModelConnections"

export default function ModelConnectionsRoute() {
  const vm = useModelConnections()
  return <ModelConnectionsPage {...vm} />
}
