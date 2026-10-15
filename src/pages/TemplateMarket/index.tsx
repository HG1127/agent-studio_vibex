import { TemplateMarketPage } from "./TemplateMarketPage"
import { useTemplateMarket } from "./useTemplateMarket"

export default function TemplateMarketRoute() {
  const vm = useTemplateMarket()
  return <TemplateMarketPage {...vm} />
}
