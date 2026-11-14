import { Glass } from "../shared/components";
import { type Route, ROUTES } from "./route";
import { TopBar } from "./TopBar";

const OWNER: Record<string, string> = {
  "command-center": "CropDoctor: field monitoring, indicators and stress findings",
  "farm-profile": "CropTwin: fields, soil, crop history and priorities",
};

/** Stand-in for pages other modules will provide. */
export function PlaceholderPage({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  const label = ROUTES.find((r) => r.id === route)?.label;
  return (
    <div className="flex min-h-full flex-col">
      <TopBar route={route} onNavigate={onNavigate} farmName="Demo Farm" region="Story County, Iowa" />
      <main className="grid flex-1 place-items-center p-6">
        <Glass className="max-w-md p-6 text-center">
          <h1 className="text-[21px] font-bold tracking-[-.01em]">{label}</h1>
          <p className="mt-2 text-sm leading-relaxed text-mut">
            This page belongs to the {OWNER[route]} module, which is still being built.
          </p>
          <button type="button" onClick={() => onNavigate("simulator")} className="btn-primary mt-5 px-4 py-2.5 text-sm">
            Open the Simulator
          </button>
        </Glass>
      </main>
    </div>
  );
}
