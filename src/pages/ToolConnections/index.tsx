import { ToolConnectionsPage } from "./ToolConnectionsPage"
import { useToolConnections } from "./useToolConnections"

export default function ToolConnectionsRoute() {
  const vm = useToolConnections()
  return <ToolConnectionsPage {...vm} />
}
