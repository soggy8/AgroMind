// App shell, owned by the app shell owner. CropTwin added one import and one route line ("farm-profile" renders
// FarmProfilePage). When merging, keep that line; nothing else in this file is CropTwin's.
import { FarmProfilePage } from "../modules/croptwin/pages/FarmProfilePage";
import { SimulatorPage } from "../modules/simulator/pages/SimulatorPage";
import { PlaceholderPage } from "./PlaceholderPage";
import { useRoute } from "./route";

/** App shell. Each module owns its page; the top bar lives inside each page so it can hold page actions. */
export function App() {
  const [route, navigate] = useRoute();
  if (route === "simulator") return <SimulatorPage route={route} onNavigate={navigate} />;
  if (route === "farm-profile") return <FarmProfilePage route={route} onNavigate={navigate} />;
  return <PlaceholderPage route={route} onNavigate={navigate} />;
}
