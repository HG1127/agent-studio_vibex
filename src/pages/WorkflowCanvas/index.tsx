import { WorkflowCanvasPage } from "./WorkflowCanvasPage"
import { useWorkflowCanvas } from "./useWorkflowCanvas"

export default function WorkflowCanvasRoute() {
  const vm = useWorkflowCanvas()
  return <WorkflowCanvasPage {...vm} />
}
