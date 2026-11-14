import { SimulatorPage } from "../modules/simulator/pages/SimulatorPage";
import { PlaceholderPage } from "./PlaceholderPage";
import { useRoute } from "./route";

/** App shell. Each module owns its page; the top bar lives inside each page so it can hold page actions. */
export function App() {
  const [route, navigate] = useRoute();
  if (route === "simulator") return <SimulatorPage route={route} onNavigate={navigate} />;
  return <PlaceholderPage route={route} onNavigate={navigate} />;
}
