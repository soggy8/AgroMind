/**
 * CropTwin state for one open farm: the saved farm from the API, unsaved drafts (farm details and fields), boundary
 * drawing, saving, and the actions that save straight away (soil prefill, crop history, deleting a field).
 * "Save farm" sends farm changes first, then each changed field in order (see lib/draft.ts changesFor).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../../../shared/api/http";
import type { LatLng } from "../../../shared/map/BoundaryDraw";
import { croptwinApi } from "../api/croptwinApi";
import { changesFor, cropName, draftFromField, type FieldDraft, isDirty, newDraft } from "../lib/draft";
import type { CropHistoryIn, FarmOut, FarmPriorities, FarmUpdate, FieldOut, FieldUpdate } from "../types";
import { t } from "../../../shared/i18n";

interface FarmDraft {
  name: string;
  region: string;
  priorities: FarmPriorities;
  constraints: string;
}

/** Which field's boundary is on the map editor, and what to restore on cancel. */
interface Drawing {
  fieldId: string;
  backup: { ring: LatLng[]; closed: boolean } | null; // null: a new field, removed on cancel
  previous?: string; // the field selected before a new one was started, re-selected on cancel
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

function loadErrorText(e: unknown, farmId: string): string {
  if (e instanceof ApiError && e.status === 404) {
    return farmId === "demo"
      ? t("The demo farm isn't in the database yet. In backend/, run python -m app.modules.croptwin.seed, then reload this page.")
      : t("Farm '{farmId}' doesn't exist. Pick another farm from the list, or create a new one.", { farmId });
  }
  if (e instanceof ApiError && e.status === 0) return e.message;
  return t("{sentence} Reload the page to try again.", { sentence: sentence(message(e)) });
}

const farmDraftOf = (f: FarmOut): FarmDraft =>
  ({ name: f.name, region: f.region ?? "", priorities: { ...f.priorities }, constraints: f.constraints ?? "" });

/** "a", "a and b", "a, b and c". */
const listOf = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** What changed on the farm itself, as the words used in the save message. */
function farmChanges(d: FarmDraft, f: FarmOut): string[] {
  const out: string[] = [];
  if (d.name.trim() !== f.name || d.region.trim() !== (f.region ?? "")) out.push("farm details");
  if (JSON.stringify(d.priorities) !== JSON.stringify(f.priorities)) out.push("priorities");
  if (d.constraints.trim() !== (f.constraints ?? "")) out.push("constraints");
  return out;
}

/** Farm profile editor: the saved farm, unsaved drafts, and the actions the panels call. */
export function useFarmProfile(farmId: string | null) {
  const [farm, setFarm] = useState<FarmOut | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [farmDraft, setFarmDraft] = useState<FarmDraft | null>(null);
  const [drafts, setDrafts] = useState<FieldDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"soil" | "history" | "delete" | null>(null); // while a field action runs
  const [lastSaved, setLastSaved] = useState<string | null>(null); // what the last save stored, for the status line
  const [loadedAt, setLoadedAt] = useState<Date | null>(null); // "data as of": when this page read the farm
  const [fieldError, setFieldError] = useState<{ kind: "soil" | "history"; text: string } | null>(null);

  useEffect(() => {
    if (!farmId) return; // no farm yet: the page shows "New farm"
    const ctrl = new AbortController();
    croptwinApi.getFarm(farmId, ctrl.signal).then((f) => {
      setFarm(f);
      setLoadedAt(new Date());
      setFarmDraft(farmDraftOf(f));
      setDrafts(f.fields.map(draftFromField));
      setSelectedId(f.fields[0]?.id);
    }).catch((e) => {
      if ((e as Error).name !== "AbortError") setLoadError(loadErrorText(e, farmId));
    });
    return () => ctrl.abort();
  }, [farmId]);

  const savedField = useCallback((id: string) => farm?.fields.find((f) => f.id === id), [farm]);

  /**
   * Put a field the server returned into the saved farm. `draft` says how much of its draft to reset:
   * all of it (after a save), only the soil layers (after a prefill), or none (crop history isn't drafted).
   */
  const acceptField = useCallback((f: FieldOut, replaceId = f.id, draft: "all" | "soil" | "none" = "all") => {
    setFarm((prev) => prev && {
      ...prev,
      fields: prev.fields.some((x) => x.id === f.id) ? prev.fields.map((x) => (x.id === f.id ? f : x)) : [...prev.fields, f],
    });
    if (draft === "none") return;
    setDrafts((prev) => prev.map((d) => {
      if (d.id !== replaceId) return d;
      const fresh = draftFromField(f);
      return draft === "all" ? fresh : { ...d, soil: fresh.soil };
    }));
  }, []);

  const updateDraft = useCallback((id: string, patch: Partial<FieldDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setSaveError(null); // the last save's problem may be fixed by this edit; Save farm re-checks anyway
  }, []);

  const select = useCallback((id: string) => {
    if (drawing) return; // finish or cancel the boundary first
    setSelectedId(id);
    setFieldError(null);
  }, [drawing]);

  // ---------- boundary drawing ----------

  const startNewField = useCallback((prefill: Partial<FieldDraft> = {}) => {
    // The first "Field N" that no other field is called, so a new draft never repeats an existing name.
    const taken = new Set(drafts.map((x) => x.name.trim()));
    let n = drafts.length + 1;
    while (taken.has(t("Field {n}", { n }))) n++;
    const d = { ...newDraft(n), ...prefill };
    setDrafts((prev) => [...prev, d]);
    setSelectedId(d.id);
    setDrawing({ fieldId: d.id, backup: null, previous: selectedId });
  }, [drafts, selectedId]);

  const editBoundary = useCallback((id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    setDrawing({ fieldId: id, backup: { ring: d.ring, closed: d.closed } });
  }, [drafts]);

  const setBoundary = useCallback((ring: LatLng[], closed: boolean) => {
    if (drawing) updateDraft(drawing.fieldId, { ring, closed });
  }, [drawing, updateDraft]);

  const finishBoundary = useCallback(() => setDrawing(null), []);

  const cancelBoundary = useCallback(() => {
    if (!drawing) return;
    if (drawing.backup) {
      updateDraft(drawing.fieldId, drawing.backup);
    } else {
      setDrafts((prev) => prev.filter((d) => d.id !== drawing.fieldId));
      setSelectedId(drawing.previous ?? farm?.fields[0]?.id);
    }
    setDrawing(null);
  }, [drawing, farm, updateDraft]);

  const discardNewField = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setSelectedId(farm?.fields[0]?.id);
    if (drawing?.fieldId === id) setDrawing(null);
  }, [drawing, farm]);

  // ---------- save ----------

  const farmChanged = farm && farmDraft ? farmChanges(farmDraft, farm) : [];
  const farmDirty = farmChanged.length > 0;
  const dirtyFields = useMemo(() => drafts.filter((d) => isDirty(d, farm?.fields.find((f) => f.id === d.id))),
    [drafts, farm]);
  const dirty = farmDirty || dirtyFields.length > 0;

  const save = useCallback(async () => {
    if (!farm || !farmDraft || drawing) return;
    setSaving(true);
    setSaveError(null);
    const done: string[] = [];
    try {
      if (farmDirty) {
        if (!farmDraft.name.trim()) throw new Error(t("Give the farm a name, then press Save farm again."));
        let updated: FarmOut;
        try {
          updated = await croptwinApi.updateFarm(farm.id, {
            name: farmDraft.name.trim(), region: farmDraft.region.trim() || null,
            priorities: farmDraft.priorities, constraints: farmDraft.constraints.trim() || null,
          });
        } catch (e) {
          throw new Error(t("Couldn't save the farm: {sentence} Press Save farm to try again.", { sentence: sentence(message(e)) }));
        }
        setFarm((prev) => prev && { ...prev, name: updated.name, region: updated.region, priorities: updated.priorities,
          constraints: updated.constraints });
        setFarmDraft(farmDraftOf(updated));
        done.push(...farmChanged);
      }
      for (const d of dirtyFields) {
        const saved = farm.fields.find((f) => f.id === d.id);
        const c = changesFor(d, saved, drafts);
        if ("error" in c) throw new Error(c.error);
        try {
          let f = saved;
          if (c.create) f = await croptwinApi.createField(farm.id, c.create);
          else if (c.update) f = await croptwinApi.updateField(farm.id, d.id, c.update);
          if (c.soil) f = await croptwinApi.replaceSoil(farm.id, f!.id, c.soil);
          acceptField(f!, d.id);
          if (d.id === selectedId) setSelectedId(f!.id);
          done.unshift(f!.name);
        } catch (e) {
          throw new Error(t("Couldn't save {v}: {sentence} Fix it and press Save farm again.", { v: d.name.trim() || "the field", sentence: sentence(message(e)) }));
        }
      }
    } catch (e) {
      setSaveError(message(e));
    } finally {
      setSaving(false);
      setLastSaved(done.length ? t("Saved {listOf}.", { listOf: listOf(done) }) : null);
    }
  }, [farm, farmDraft, drawing, farmDirty, farmChanged, dirtyFields, acceptField, selectedId, drafts]);

  /** Delete a saved field with its soil layers and crop history, then select its neighbour. */
  const deleteField = useCallback(async (fieldId: string) => {
    if (!farm) return false;
    const name = farm.fields.find((f) => f.id === fieldId)?.name ?? "the field";
    setBusy("delete");
    setFieldError(null);
    try {
      await croptwinApi.deleteField(farm.id, fieldId);
    } catch (e) {
      setSaveError(t("Couldn't delete {name}: {sentence} Reload the page to see the current fields.", { name, sentence: sentence(message(e)) }));
      return false;
    } finally {
      setBusy(null);
    }
    const i = drafts.findIndex((d) => d.id === fieldId);
    const rest = drafts.filter((d) => d.id !== fieldId);
    setDrafts(rest);
    setFarm((prev) => prev && { ...prev, fields: prev.fields.filter((f) => f.id !== fieldId) });
    setSelectedId(rest[Math.min(i, rest.length - 1)]?.id);
    setLastSaved(t("Deleted {name}.", { name }));
    return true;
  }, [farm, drafts]);

  // ---------- actions that save straight away (need a saved field) ----------

  const run = useCallback(async (kind: "soil" | "history", fn: () => Promise<FieldOut | void>, fieldId: string,
    explain: (e: unknown) => string = (e) => sentence(message(e))) => {
    setBusy(kind);
    setFieldError(null);
    try {
      const f = await fn();
      if (f) acceptField(f, fieldId, kind === "soil" ? "soil" : "none");
      return true;
    } catch (e) {
      setFieldError({ kind, text: explain(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }, [acceptField]);

  const prefillSoil = useCallback((fieldId: string) =>
    run("soil", () => croptwinApi.prefillSoil(farmId!, fieldId), fieldId), [run, farmId]);

  const addCropHistory = useCallback((fieldId: string, entry: CropHistoryIn) =>
    run("history", () => croptwinApi.addCropHistory(farmId!, fieldId, entry), fieldId, (e) =>
      e instanceof ApiError && e.status === 409
        ? t("{cropName} is already recorded for {season_year} on this field. Remove that entry first to change it.", { cropName: cropName(entry.crop_id), season_year: entry.season_year })
        : sentence(message(e))), [run, farmId]);

  const deleteCropHistory = useCallback((fieldId: string, entryId: string) =>
    run("history", async () => {
      await croptwinApi.deleteCropHistory(farmId!, fieldId, entryId);
      setFarm((prev) => prev && { ...prev, fields: prev.fields.map((x) => (x.id === fieldId
        ? { ...x, crop_history: x.crop_history.filter((h) => h.id !== entryId) } : x)) });
    }, fieldId), [run, farmId]);

  // ---------- changes the farmer confirmed in the assistant (saved straight away) ----------

  /** Save confirmed field changes. Refuses while that field has unsaved edits, so nothing typed is lost. */
  const saveFieldChange = useCallback(async (fieldId: string, body: FieldUpdate) => {
    if (!farm) throw new Error(t("The farm isn't loaded yet."));
    const d = drafts.find((x) => x.id === fieldId);
    const saved = farm.fields.find((f) => f.id === fieldId);
    if (!saved) throw new Error(t("That field isn't saved yet."));
    if (d && isDirty(d, saved)) throw new Error(t("{name} has unsaved edits. Save or undo them first, then confirm again.", { name: saved.name }));
    const f = await croptwinApi.updateField(farm.id, fieldId, body);
    acceptField(f, fieldId, "all");
    setLastSaved(t("Saved {name}.", { name: f.name }));
    return f;
  }, [farm, drafts, acceptField]);

  /** Save a confirmed crop-history entry; throws with a readable message on failure. */
  const saveCropHistory = useCallback(async (fieldId: string, entry: CropHistoryIn) => {
    if (!farm) throw new Error(t("The farm isn't loaded yet."));
    try {
      const f = await croptwinApi.addCropHistory(farm.id, fieldId, entry);
      acceptField(f, fieldId, "none");
      setLastSaved(t("Saved {name}'s crop history.", { name: f.name }));
    } catch (e) {
      throw new Error(e instanceof ApiError && e.status === 409
        ? t("{cropName} is already recorded for {season_year} on this field.", { cropName: cropName(entry.crop_id), season_year: entry.season_year }) : sentence(message(e)));
    }
  }, [farm, acceptField]);

  /** Save confirmed farm changes. Refuses while the farm details have unsaved edits. */
  const saveFarmChange = useCallback(async (body: FarmUpdate) => {
    if (!farm) throw new Error(t("The farm isn't loaded yet."));
    if (farmDirty) throw new Error(t("The farm details have unsaved edits. Save or undo them first, then confirm again."));
    const updated = await croptwinApi.updateFarm(farm.id, body);
    setFarm((prev) => prev && { ...prev, name: updated.name, region: updated.region, priorities: updated.priorities,
      constraints: updated.constraints });
    setFarmDraft(farmDraftOf(updated));
    setLastSaved(t("Saved {name}.", { name: updated.name }));
    return updated;
  }, [farm, farmDirty]);

  return {
    farm, loadError, farmDraft, drafts, selectedId, drawing, saving, saveError, busy, fieldError, dirty, lastSaved,
    loading: !!farmId && !farm && !loadError,
    loadedAt,
    savedField,
    actions: {
      select, updateDraft, startNewField, editBoundary, setBoundary, finishBoundary, cancelBoundary, discardNewField,
      setFarmDraft: (patch: Partial<FarmDraft>) => {
        setFarmDraft((prev) => prev && { ...prev, ...patch });
        setSaveError(null);
      },
      save, deleteField, prefillSoil, addCropHistory, deleteCropHistory, saveFieldChange, saveFarmChange, saveCropHistory,
    },
  };
}

export type FarmProfile = ReturnType<typeof useFarmProfile>;
