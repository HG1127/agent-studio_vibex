import { AgentRunPage } from "./AgentRunPage"
import { useAgentRun } from "./useAgentRun"

export default function AgentRunRoute() {
  const vm = useAgentRun()
  return <AgentRunPage {...vm} />
}
