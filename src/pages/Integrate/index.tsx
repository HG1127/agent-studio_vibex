import { IntegratePage } from "./IntegratePage"
import { useIntegrate } from "./useIntegrate"

export default function IntegrateRoute() {
  const vm = useIntegrate()
  return <IntegratePage {...vm} />
}
