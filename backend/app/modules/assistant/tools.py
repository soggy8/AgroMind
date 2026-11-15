"""The assistant's tools: what the model may call, and what each call does.

A tool returns UI actions (the browser applies them, so the farmer sees every change) and numbered facts (the
only material the answer may use). Nothing here writes to the database: farm changes are proposals that the
farmer confirms on screen, and the browser then saves them through CropTwin's own API.

Actions (the browser contract, see frontend/src/shared/assistant/types.ts):
  {"type": "navigate", "page": "overview" | "command-center" | "simulator" | "economics" | "farm-profile"}
  {"type": "set_date", "date": "YYYY-MM-DD"}                 Command Center
  {"type": "set_layer", "layer": "greenness" | "satellite"}  Command Center
  {"type": "select_field", "field_id": str, "field_name": str}   current page
  {"type": "set_simulation", "request": SimulationRequest}   Simulator inputs (the whole request)
  {"type": "run_simulation"}                                 Simulator
  {"type": "highlight_fields", "field_ids": [str]}           pulse these outlines on the map
  {"type": "open_report", "title": str}                      show the final answer as a printable report
  {"type": "propose_change", "id": str, "change": {...}, "summary": [str]}   confirm card (CropTwin)
"""
from __future__ import annotations

import copy
import json
import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Callable

from sqlalchemy.orm import Session

from . import ports
from .ports import ToolFailed
from .schemas import PageState

LAYERS = ["greenness", "satellite"]
PAGES = ["overview", "command-center", "simulator", "economics", "farm-profile"]
IRRIGATION = ["none", "limited", "full"]


@dataclass
class Context:
    """One turn's working state. Tools read and update `page` so later calls build on earlier ones."""
    session: Session
    farm_id: str
    page: PageState
    facts: list[str]
    farm: Any                                  # CropTwin FarmOut
    options: Any = None                        # Simulator options, loaded on first use
    textures: list[str] = field(default_factory=ports.soil_textures)

    @property
    def field_ids(self) -> list[str]:
        return [f.id for f in self.farm.fields]

    def field_name(self, field_id: str) -> str:
        return next((f.name for f in self.farm.fields if f.id == field_id), field_id)

    def sim_options(self):
        if self.options is None:
            self.options = ports.simulator_options(self.session, self.farm_id)
        return self.options


@dataclass
class Outcome:
    result: str                                # what the model reads back
    actions: list[dict] = field(default_factory=list)
    facts: list[str] = field(default_factory=list)


# ---------- schemas the model sees (built per request, so ids are real enums) ----------

def _fn(name: str, description: str, props: dict, required: list[str] | None = None) -> dict:
    return {"type": "function", "function": {"name": name, "description": description, "parameters": {
        "type": "object", "properties": props, "required": required or []}}}


def schemas(ctx: Context) -> list[dict]:
    """Kept short: on Groq's free tier every token here is paid on every call (no prompt caching)."""
    S, N, B = {"type": "string"}, {"type": "number"}, {"type": "boolean"}
    fields = {"type": "string", "enum": ctx.field_ids}
    o = ctx.sim_options()
    # Crop and texture ids are checked server-side (the error lists the valid ones), so no enums here.
    crops = {"type": "string", "description": "crop id: " + ", ".join(c.id for c in o.crops)}
    textures = S
    return [
        _fn("show_farm_health", "Open the Command Center at a date (any past date; for a month use its last day) "
            "and get crop health facts.", {"date": {"type": "string", "description": "YYYY-MM-DD"}, "field": fields,
                                           "layer": {"type": "string", "enum": LAYERS}}),
        _fn("run_simulation", "Change Simulator inputs, run it, get result facts. Unset inputs keep their value.",
            {"field": fields, "preset": {"type": "string", "enum": [p.id for p in o.scenario_presets]},
             "temperature_change_c": N, "rain_change_pct": N,
             "climate_projection": {"type": "string", "enum": ["none", *[p.id for p in o.projections]]},
             "irrigation": {"type": "string", "enum": IRRIGATION}, "irrigation_cap_mm": N,
             "years": {"type": "integer"},
             "rotations": {"type": "array", "items": {"type": "object", "properties": {
                 "crops": {"type": "array", "items": crops}, "cover_crop": B}}}}),
        _fn("show_farm_profile", "Open the farm profile and get its facts.", {"field": fields}),
        _fn("open_page", "Open a page.", {"page": {"type": "string", "enum": PAGES}}, ["page"]),
        _fn("open_report", "Show your answer as a printable report. Call first, then write the report.",
            {"title": S}, ["title"]),
        _fn("propose_field_update", "Propose changes to an existing field (farmer confirms).",
            {"field": fields, "name": S, "current_crop": crops, "irrigation_available": B, "soil_texture": textures,
             "area_ha": N}, ["field"]),
        _fn("propose_crop_history", "Propose adding a past season to a field's crop history (farmer confirms).",
            {"field": fields, "season_year": {"type": "integer"}, "crop": crops, "yield_value": N, "yield_unit": S,
             "notes": S}, ["field", "season_year", "crop"]),
        _fn("propose_farm_update", "Propose changes to the farm (farmer confirms).",
            {"name": S, "region": S, "constraints": S, "priorities": {"type": "object", "properties": {
                k: N for k in ("yield", "water", "risk", "soil", "margin")}}}),
        _fn("propose_new_field", "Open the field drawing tool with these details filled in; the farmer draws it.",
            {"name": S, "current_crop": crops, "irrigation_available": B, "soil_texture": textures}, ["name"]),
    ]


# ---------- helpers ----------

def _field(ctx: Context, args: dict, key: str = "field", required: bool = False) -> str | None:
    fid = args.get(key)
    if fid is None:
        if required:
            raise ToolFailed(f"Say which field: {', '.join(ctx.field_ids)}.")
        return None
    if fid not in ctx.field_ids:
        raise ToolFailed(f"There is no field '{fid}'. Fields: {', '.join(ctx.field_ids)}.")
    return fid


def _date(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError as e:
        raise ToolFailed(f"'{s}' isn't a date like 2016-03-31.") from e


def _with_facts(ctx: Context, context, note: str, actions: list[dict]) -> Outcome:
    """A module's AdvisorContext as new facts, numbered after the ones the conversation already has."""
    start = len(ctx.facts) + 1
    body = "\n".join(f"[{start + i}] {f}" for i, f in enumerate(context.facts))
    return Outcome(f"{note}\nFacts:\n{body}", actions, context.facts)


def _fmt_date(d: date) -> str:
    return f"{d.day} {d:%b %Y}"


# ---------- tools ----------

def show_farm_health(ctx: Context, args: dict) -> Outcome:
    fid = _field(ctx, args)
    layer = args.get("layer")
    if layer is not None and layer not in LAYERS:
        raise ToolFailed(f"Layer must be one of {', '.join(LAYERS)}.")
    as_of = _date(args["date"]) if args.get("date") else ctx.page.as_of
    health, context = ports.health_facts(ctx.session, ctx.farm_id, as_of)
    actions: list[dict] = [{"type": "navigate", "page": "command-center"}]
    if args.get("date"):
        actions.append({"type": "set_date", "date": health.as_of.isoformat()})
    if layer:
        actions.append({"type": "set_layer", "layer": layer})
    if fid:
        actions += [{"type": "select_field", "field_id": fid, "field_name": ctx.field_name(fid)}, {"type": "highlight_fields", "field_ids": [fid]}]
    ctx.page = ctx.page.model_copy(update={"page": "command-center", "as_of": health.as_of,
                                           "field_id": fid or ctx.page.field_id, "layer": layer or ctx.page.layer})
    return _with_facts(ctx, context, f"The Command Center now shows {_fmt_date(health.as_of)}.", actions)


def _default_request(ctx: Context) -> dict:
    o = ctx.sim_options()
    return {"field_id": o.fields[0].id if o.fields else "",
            "rotations": [r.model_dump() for r in o.suggested_rotations],
            "scenario": {**o.scenario_presets[0].scenario.model_dump(), "projection": None},
            "priorities": o.default_priorities.model_dump(by_alias=True), "include_economics": True}


def merged_request(ctx: Context, args: dict) -> dict:
    """The Simulator's current request with the requested changes applied."""
    req = copy.deepcopy(ctx.page.simulation) if ctx.page.simulation else _default_request(ctx)
    sc = req.setdefault("scenario", {})
    o = ctx.sim_options()
    if args.get("preset"):
        preset = next((p for p in o.scenario_presets if p.id == args["preset"]), None)
        if not preset:
            raise ToolFailed(f"No preset '{args['preset']}'.")
        sc.update({k: v for k, v in preset.scenario.model_dump().items() if k in ("temp_delta_c", "rain_change_pct", "irrigation", "irrigation_cap_mm")})
        sc["projection"] = None
    if (fid := _field(ctx, args)) is not None:
        req["field_id"] = fid
    if "temperature_change_c" in args:
        sc["temp_delta_c"], sc["projection"] = args["temperature_change_c"], None
    if "rain_change_pct" in args:
        sc["rain_change_pct"], sc["projection"] = args["rain_change_pct"], None
    if "climate_projection" in args:
        sc["projection"] = None if args["climate_projection"] == "none" else args["climate_projection"]
    for arg, key in (("irrigation", "irrigation"), ("irrigation_cap_mm", "irrigation_cap_mm"), ("years", "years"),
                     ("price_change_pct", "price_change_pct"), ("heat_response", "heat_response")):
        if arg in args:
            sc[key] = args[arg]
    if sc.get("irrigation") != "limited":
        sc["irrigation_cap_mm"] = None
    if "include_economics" in args:
        req["include_economics"] = bool(args["include_economics"])
    if args.get("rotations"):
        names = {c.id: c.name for c in o.crops}
        req["rotations"] = [{"id": "ABCD"[i], "name": " → ".join(names.get(c, c) for c in r["crops"]),
                             "crops": r["crops"], "cover_crop": bool(r.get("cover_crop", False))}
                            for i, r in enumerate(args["rotations"][:4])]
    return req


def run_simulation(ctx: Context, args: dict) -> Outcome:
    request, context = ports.simulate(ctx.session, ctx.farm_id, merged_request(ctx, args))
    ctx.page = ctx.page.model_copy(update={"page": "simulator", "simulation": request, "has_result": True,
                                           "field_id": request["field_id"]})
    actions = [{"type": "navigate", "page": "simulator"}, {"type": "set_simulation", "request": request},
               {"type": "run_simulation"}]
    return _with_facts(ctx, context, "The Simulator now shows these inputs and their results.", actions)


def show_farm_profile(ctx: Context, args: dict) -> Outcome:
    fid = _field(ctx, args)
    actions: list[dict] = [{"type": "navigate", "page": "farm-profile"}]
    if fid:
        actions += [{"type": "select_field", "field_id": fid, "field_name": ctx.field_name(fid)}, {"type": "highlight_fields", "field_ids": [fid]}]
    ctx.page = ctx.page.model_copy(update={"page": "farm-profile", "field_id": fid or ctx.page.field_id})
    return _with_facts(ctx, ports.farm_facts(ctx.session, ctx.farm_id), "The farm profile is open.", actions)


def fields_mentioned(ctx: Context, text: str) -> list[str]:
    """Fields named in an answer, so the map can point at them without a tool call (saves a model call)."""
    low = text.lower()
    return [f.id for f in ctx.farm.fields if f.name.lower() in low]


def open_page(ctx: Context, args: dict) -> Outcome:
    page = args.get("page")
    if page not in PAGES:
        raise ToolFailed(f"Page must be one of {', '.join(PAGES)}.")
    ctx.page = ctx.page.model_copy(update={"page": page})
    return Outcome(f"Opened {page}.", [{"type": "navigate", "page": page}])


def open_report(ctx: Context, args: dict) -> Outcome:
    title = (args.get("title") or "Farm report").strip()[:120]
    return Outcome("The report view is open with the title shown. Write the report now as your answer, up to about "
                   "300 words, in short paragraphs or a list (no tables). Cite a fact for every number and claim. "
                   "Call a scenario a what-if, never a projection or forecast. Give no advice the facts don't support; "
                   "end with what the farmer could check next. Add data needed for the report with other tools first.",
                   [{"type": "open_report", "title": title}])


def _crop_name(ctx: Context, crop_id: str | None) -> str:
    return next((c.name for c in ctx.sim_options().crops if c.id == crop_id), crop_id or "not set")


def propose_farm_change(ctx: Context, args: dict) -> Outcome:
    kind = args.get("kind")
    crops = {c.id for c in ctx.sim_options().crops}
    for key in ("current_crop", "crop"):
        if args.get(key) is not None and args[key] not in crops:
            raise ToolFailed(f"Crop must be one of {', '.join(sorted(crops))}.")
    if args.get("soil_texture") is not None and args["soil_texture"] not in ctx.textures:
        raise ToolFailed(f"Soil texture must be one of {', '.join(ctx.textures)}.")

    if kind == "update_field":
        fid = _field(ctx, args, required=True)
        f = next(x for x in ctx.farm.fields if x.id == fid)
        change, summary = {"kind": kind, "field_id": fid}, []
        if args.get("name") and args["name"] != f.name:
            change["name"] = args["name"]
            summary.append(f"Name: {f.name} → {args['name']}")
        if "current_crop" in args and args["current_crop"] != f.current_crop_id:
            change["current_crop_id"] = args["current_crop"]
            summary.append(f"Current crop: {_crop_name(ctx, f.current_crop_id)} → {_crop_name(ctx, args['current_crop'])}")
        if "irrigation_available" in args and bool(args["irrigation_available"]) != f.irrigation_available:
            change["irrigation_available"] = bool(args["irrigation_available"])
            summary.append(f"Irrigation: {'available' if f.irrigation_available else 'not available'} → "
                           f"{'available' if args['irrigation_available'] else 'not available'}")
        if "soil_texture" in args and args["soil_texture"] != f.soil_texture:
            change["soil_texture"] = args["soil_texture"]
            summary.append(f"Soil texture: {(f.soil_texture or 'not set').replace('_', ' ')} → {args['soil_texture'].replace('_', ' ')}")
        if args.get("area_ha"):
            change["area_ha"] = float(args["area_ha"])
            summary.append(f"Area: {f.area_ha:.1f} ha → {float(args['area_ha']):.1f} ha (farmer-stated)")
        if len(change) == 2:
            raise ToolFailed(f"That wouldn't change anything on {f.name}.")
        title = f"Change {f.name}"
    elif kind == "add_crop_history":
        fid = _field(ctx, args, required=True)
        if not args.get("season_year") or not args.get("crop"):
            raise ToolFailed("A crop-history entry needs season_year and crop.")
        if not 1900 <= int(args["season_year"]) <= date.today().year:
            raise ToolFailed("season_year must be a past or current year.")
        if args.get("yield_value") is not None and not args.get("yield_unit"):
            raise ToolFailed("Ask the farmer for the yield's unit (for example t/ha or bu/ac) before proposing it.")
        change = {"kind": kind, "field_id": fid, "season_year": int(args["season_year"]), "crop_id": args["crop"],
                  "yield_value": args.get("yield_value"), "yield_unit": args.get("yield_unit"),
                  "notes": args.get("notes"), "source": "Farmer-provided"}
        summary = [f"{args['season_year']}: {_crop_name(ctx, args['crop'])}"
                   + (f", yield {args['yield_value']:g} {args['yield_unit']} (farmer-reported)" if args.get("yield_value") is not None else "")
                   + (f", note: {args['notes']}" if args.get("notes") else "")]
        title = f"Add to {ctx.field_name(fid)}'s crop history"
    elif kind == "update_farm":
        change, summary, farm = {"kind": kind}, [], ctx.farm
        for key, label in (("name", "Name"), ("region", "Region"), ("constraints", "Constraints")):
            if args.get(key) and args[key] != getattr(farm, key):
                change[key] = args[key]
                summary.append(f"{label}: {getattr(farm, key) or 'not set'} → {args[key]}")
        if args.get("priorities"):
            current = farm.priorities.model_dump(by_alias=True)
            new = {**current, **{k: float(v) for k, v in args["priorities"].items() if k in current}}
            if new != current:
                change["priorities"] = new
                summary += [f"Priority {k}: {current[k]:g} → {new[k]:g}" for k in current if new[k] != current[k]]
        if len(change) == 1:
            raise ToolFailed("That wouldn't change anything on the farm.")
        title = f"Change {farm.name}"
    elif kind == "draw_new_field":
        if not args.get("name"):
            raise ToolFailed("A new field needs a name.")
        change = {"kind": kind, "name": args["name"], "current_crop_id": args.get("current_crop"),
                  "irrigation_available": bool(args.get("irrigation_available", False)),
                  "soil_texture": args.get("soil_texture")}
        summary = [f"Name: {args['name']}", f"Current crop: {_crop_name(ctx, args.get('current_crop'))}",
                   f"Irrigation: {'available' if change['irrigation_available'] else 'not available'}"]
        if args.get("soil_texture"):
            summary.append(f"Soil texture: {args['soil_texture'].replace('_', ' ')}")
        summary.append("You draw the outline on the map; its area is computed from it.")
        title = "Add a field"
    else:
        raise ToolFailed("kind must be update_field, add_crop_history, update_farm or draw_new_field.")

    pid = uuid.uuid4().hex[:8]
    action = {"type": "propose_change", "id": pid, "title": title, "change": change, "summary": summary}
    actions = [{"type": "navigate", "page": "farm-profile"}, action]
    if change.get("field_id"):
        actions.append({"type": "select_field", "field_id": change["field_id"], "field_name": ctx.field_name(change["field_id"])})
    return Outcome(f"Proposed, not saved: {title}: {'; '.join(summary)}. Ask the farmer to check and confirm it "
                   "on screen.", actions)


def _proposal(kind: str) -> Callable[[Context, dict], Outcome]:
    return lambda ctx, args: propose_farm_change(ctx, {**args, "kind": kind})


TOOLS: dict[str, Callable[[Context, dict], Outcome]] = {
    "show_farm_health": show_farm_health, "run_simulation": run_simulation, "show_farm_profile": show_farm_profile,
    "open_page": open_page, "open_report": open_report,
    "propose_field_update": _proposal("update_field"), "propose_crop_history": _proposal("add_crop_history"),
    "propose_farm_update": _proposal("update_farm"), "propose_new_field": _proposal("draw_new_field"),
}
DATA_TOOLS = {"show_farm_health", "run_simulation", "show_farm_profile"}   # these return facts


def execute(ctx: Context, name: str, raw_args: str | None) -> Outcome:
    """Run one tool call. Failures come back as a result the model can read and recover from."""
    tool = TOOLS.get(name)
    if tool is None:
        return Outcome(f"Error: there is no tool '{name}'.")
    try:
        args = json.loads(raw_args or "{}")
        if not isinstance(args, dict):
            raise ValueError
    except ValueError:
        return Outcome("Error: the arguments weren't a JSON object.")
    try:
        return tool(ctx, args)
    except ToolFailed as e:
        return Outcome(f"Error: {e}")


def describe(ctx: Context, name: str, raw_args: str | None, tr: Callable[[str], str] = lambda s: s) -> str:
    """A short line for the farmer while a tool runs, in their language (`tr` translates each piece)."""
    try:
        a = json.loads(raw_args or "{}")
    except ValueError:
        a = {}
    if name == "show_farm_health":
        when = ""
        if a.get("date"):
            try:
                when = f" at {_fmt_date(date.fromisoformat(a['date']))}"
            except ValueError:
                pass
        return tr(f"Opening the Command Center{when}")
    if name == "run_simulation":
        bits = [ctx.field_name(a["field"])] if a.get("field") else []
        if "temperature_change_c" in a:
            bits.append(f"{a['temperature_change_c']:+g} °C")
        if "rain_change_pct" in a:
            bits.append(tr(f"rain {a['rain_change_pct']:+g}%"))
        if a.get("climate_projection") and a["climate_projection"] != "none":
            bits.append(a["climate_projection"])
        if a.get("irrigation"):
            bits.append(tr(f"irrigation {tr(a['irrigation'])}"))
        return tr("Running the simulation") + (f": {', '.join(bits)}" if bits else "")
    if name.startswith("propose_"):
        return tr("Preparing a change for you to confirm")
    return tr({"show_farm_profile": "Opening the farm profile",
               "open_page": f"Opening {str(a.get('page', 'the page')).replace('-', ' ')}",
               "open_report": "Opening the report view"}.get(name, name))
