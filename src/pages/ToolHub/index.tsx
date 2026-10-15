import { ToolHubPage } from "./ToolHubPage"
import { useToolHub } from "./useToolHub"

export default function ToolHubRoute() {
  const vm = useToolHub()
  return <ToolHubPage {...vm} />
}
