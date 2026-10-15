import { ScheduledTasksPage } from "./ScheduledTasksPage"
import { useScheduledTasks } from "./useScheduledTasks"

export default function ScheduledTasksRoute() {
  const vm = useScheduledTasks()
  return <ScheduledTasksPage {...vm} />
}
