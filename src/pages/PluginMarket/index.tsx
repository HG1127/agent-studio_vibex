import { PluginMarketPage } from "./PluginMarketPage"
import { usePluginMarket } from "./usePluginMarket"

export default function PluginMarketRoute() {
  const vm = usePluginMarket()
  return <PluginMarketPage {...vm} />
}
