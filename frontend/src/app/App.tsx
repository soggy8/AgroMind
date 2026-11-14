import { SimulatorPage } from "../modules/simulator/pages/SimulatorPage";
import { UnitsProvider } from "../shared/units";
import { PlaceholderPage } from "./PlaceholderPage";
import { useRoute } from "./route";

/** App shell. Each module owns its page; the top bar lives inside each page so it can hold page actions. */
export function App() {
  const [route, navigate] = useRoute();
  return (
    <UnitsProvider>
      {route === "simulator"
        ? <SimulatorPage route={route} onNavigate={navigate} />
        : <PlaceholderPage route={route} onNavigate={navigate} />}
    </UnitsProvider>
  );
}
