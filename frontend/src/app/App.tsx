import { CommandCenterPage } from "../modules/cropdoctor/pages/CommandCenterPage";
import { FarmProfilePage } from "../modules/croptwin/pages/FarmProfilePage";
import { SimulatorPage } from "../modules/simulator/pages/SimulatorPage";
import { AssistantPanel, AssistantProvider } from "../shared/assistant";
import { useLanguage } from "../shared/i18n";
import { UnitsProvider } from "../shared/units";
import { FarmProvider, useFarmChoice } from "./farm";
import { LandingPage } from "./landing/LandingPage";
import { OverviewPage } from "./overview/OverviewPage";
import { PlaceholderPage } from "./PlaceholderPage";
import { type Route, useRoute } from "./route";

/**
 * App shell. Each module owns its page; the top bar lives inside each page so it can hold page actions.
 * App subscribes to the language (shared/i18n), so a switch re-renders every page in the new language, keeping state.
 */
export function App() {
  useLanguage();
  return (
    <UnitsProvider>
      <FarmProvider>
        <Shell />
      </FarmProvider>
    </UnitsProvider>
  );
}

/** The assistant (docs/modules/assistant.md) sits above the pages so it can move between them. */
function Shell() {
  const [route, navigate] = useRoute();
  const { selectedId } = useFarmChoice();
  return (
    <AssistantProvider farmId={selectedId} route={route} navigate={navigate}>
      <Pages route={route} navigate={navigate} selectedId={selectedId} />
      <AssistantPanel />
    </AssistantProvider>
  );
}

/** Dashboards are keyed by the open farm, so switching farms starts each page fresh. */
function Pages({ route, navigate, selectedId }: { route: Route; navigate: (r: Route) => void; selectedId: string | null }) {
  if (route === "home") return <LandingPage onNavigate={navigate} />;
  if (route === "farm-profile") return <FarmProfilePage route={route} onNavigate={navigate} />;
  if (!selectedId) return <PlaceholderPage route={route} onNavigate={navigate} />;
  if (route === "overview") return <OverviewPage key={selectedId} farmId={selectedId} route={route} onNavigate={navigate} />;
  if (route === "command-center") return <CommandCenterPage key={selectedId} farmId={selectedId} route={route} onNavigate={navigate} />;
  if (route === "simulator") return <SimulatorPage key={selectedId} farmId={selectedId} route={route} onNavigate={navigate} />;
  return <PlaceholderPage route={route} onNavigate={navigate} />;
}
