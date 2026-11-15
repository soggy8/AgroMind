import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { streamChat } from "./stream";
import type { AppPage, AssistantAction, AssistantEvent, AssistantPage, PageState, ProposedChange, Turn } from "./types";
import { t as tr } from "../i18n";

/**
 * The assistant (docs/modules/assistant.md): the conversation, and the bridge that lets it operate the pages.
 *
 * Each dashboard registers a PageTarget with useAssistantTarget(). The provider applies streamed actions in order:
 * it navigates, waits for the page to register, hands the page its action, and records what changed (shown as
 * steps, and the changed control flashes). One Undo per turn restores the page the farmer was on.
 */

/** A change a page made, for the trace. `assist` names the control (data-assist="...") to flash. */
export interface Change {
  label: string;
  before?: string;
  after?: string;
  assist?: string;
}

export interface PageTarget {
  page: AppPage;
  /** What the page shows now (field, date, layer, simulation). */
  state: () => Omit<PageState, "page">;
  /** Apply a page action; return what changed. */
  apply: (a: AssistantAction) => Change[] | void | Promise<Change[] | void>;
  snapshot: () => unknown;
  restore: (snapshot: unknown) => void;
  /** Save a confirmed farm change (farm profile only). Returns a note for the farmer, if any. */
  confirm?: (c: ProposedChange) => Promise<string | void>;
}

export type ProposalStatus = "pending" | "saving" | "saved" | "dismissed" | "failed";

export type Step =
  | { kind: "status"; text: string }
  | { kind: "change"; label: string; before?: string; after?: string }
  | { kind: "waiting"; seconds: number }
  | { kind: "proposal"; id: string; title: string; summary: string[]; change: ProposedChange; status: ProposalStatus; note?: string };

export interface ChatTurn {
  id: number;
  question: string;
  steps: Step[];
  answer?: { text: string; cited: number[]; grounded: boolean };
  error?: string;
  busy: boolean;
  report?: string;
  undo?: { route: AssistantPage; page?: AppPage; snapshot?: unknown };
  undone?: boolean;
}

interface Assistant {
  /** The page on screen (the Overview shows the full-page chat instead of the docked console). */
  route: AssistantPage;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Open the assistant and put the cursor in its question box (top bar button, Ctrl/Cmd+K). */
  summon: () => void;
  turns: ChatTurn[];
  facts: string[];
  busy: boolean;
  /** A conversation is under way (the assistant may be moving between pages). */
  active: boolean;
  ask: (question: string) => void;
  stop: () => void;
  undo: (turnId: number) => void;
  decide: (turnId: number, proposalId: string, confirm: boolean) => void;
  reset: () => void;
  /** The report on screen (a turn id), if any. */
  report: number | null;
  setReport: (turnId: number | null) => void;
  /** Fields to pulse on the map; `key` changes on every request so the same ids pulse again. */
  highlight: { ids: string[]; key: number };
  /** Bumped by Ctrl/Cmd+K, so the panel can focus its input. */
  focusKey: number;
  register: (t: PageTarget) => () => void;
}

const Ctx = createContext<Assistant | null>(null);
const PAGE_LABEL: Record<Exclude<AssistantPage, "home">, string> = {
  overview: tr("Overview"), "command-center": tr("Command Center"), simulator: tr("Simulator"), economics: tr("Farm money"), "farm-profile": tr("Farm profile"),
};
/** Pages that register a PageTarget; others (overview, economics) are only opened. */
const OPERATED: ReadonlySet<AssistantPage> = new Set<AssistantPage>(["command-center", "simulator", "farm-profile"]);
const STATE_ACTIONS = new Set(["navigate", "set_date", "set_layer", "select_field", "set_simulation", "run_simulation"]);

export function AssistantProvider({ farmId, route, navigate, children }: {
  farmId: string | null;
  route: AssistantPage;
  navigate: (page: AssistantPage) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [facts, setFacts] = useState<string[]>([]);
  const [report, setReport] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<{ ids: string[]; key: number }>({ ids: [], key: 0 });
  const [focusKey, setFocusKey] = useState(0);

  const targets = useRef(new Map<AssistantPage, PageTarget>());
  const waiters = useRef(new Map<AssistantPage, (() => void)[]>());
  const routeRef = useRef(route);
  routeRef.current = route;
  const factsRef = useRef(facts);
  factsRef.current = facts;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  const register = useCallback((t: PageTarget) => {
    targets.current.set(t.page, t);
    for (const resolve of waiters.current.get(t.page) ?? []) resolve();
    waiters.current.delete(t.page);
    return () => {
      if (targets.current.get(t.page) === t) targets.current.delete(t.page);
    };
  }, []);

  /** Resolves when `page` is on screen and registered (or after a timeout: the page may be loading). */
  const pageReady = useCallback((page: AssistantPage) => new Promise<boolean>((resolve) => {
    if (!OPERATED.has(page)) return resolve(true);
    if (routeRef.current === page && targets.current.has(page)) return resolve(true);
    const done = () => resolve(true);
    waiters.current.set(page, [...(waiters.current.get(page) ?? []), done]);
    setTimeout(() => resolve(targets.current.has(page)), 6000);
  }), []);

  const update = useCallback((id: number, f: (t: ChatTurn) => ChatTurn) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? f(t) : t))), []);
  const addSteps = useCallback((id: number, steps: Step[]) =>
    update(id, (t) => ({ ...t, steps: [...t.steps.filter((s) => s.kind !== "waiting"), ...steps] })), [update]);

  const pageState = useCallback((): PageState => {
    const page = routeRef.current;
    const t = targets.current.get(page);
    return { page, ...(t?.state() ?? {}) };
  }, []);

  const flash = useCallback((changes: Change[]) => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    changes.forEach((c, i) => {
      if (!c.assist) return;
      // Wait a frame so the page has rendered the new value.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-assist="${CSS.escape(c.assist!)}"]`);
        if (!el) return;
        if (i === 0) el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
        el.dataset.assistFlash = "on";
        setTimeout(() => { delete el.dataset.assistFlash; }, 1800);
      });
    });
  }, []);

  /** Apply one action for turn `id`. Called in order through `queue`. */
  const apply = useCallback(async (id: number, a: AssistantAction) => {
    // Remember how things looked before the first change, for Undo.
    if (STATE_ACTIONS.has(a.type) && !turnsRef.current.find((t) => t.id === id)?.undo) {
      const page = routeRef.current;
      const t = targets.current.get(page);
      const undo = { route: page, page: t?.page, snapshot: t?.snapshot() };
      turnsRef.current = turnsRef.current.map((x) => (x.id === id ? { ...x, undo } : x));
      update(id, (x) => ({ ...x, undo: x.undo ?? undo }));
    }
    switch (a.type) {
      case "navigate":
        if (routeRef.current !== a.page) {
          navigate(a.page);
          addSteps(id, [{ kind: "change", label: tr("Opened {v}", { v: PAGE_LABEL[a.page] }) }]);
        }
        await pageReady(a.page);
        return;
      case "highlight_fields":
        setHighlight((h) => ({ ids: a.field_ids, key: h.key + 1 }));
        return;
      case "open_report":
        update(id, (t) => ({ ...t, report: a.title }));
        return;
      case "propose_change":
        addSteps(id, [{ kind: "proposal", id: a.id, title: a.title, summary: a.summary, change: a.change, status: "pending" }]);
        return;
      default: {
        const page = routeRef.current;
        const t = targets.current.get(page);
        if (!t) return;
        const changes = (await t.apply(a)) ?? [];
        if (changes.length) {
          addSteps(id, changes.map((c) => ({ kind: "change" as const, label: c.label, before: c.before, after: c.after })));
          flash(changes);
        }
      }
    }
  }, [addSteps, flash, navigate, pageReady, update]);

  const ask = useCallback((question: string) => {
    const q = question.trim();
    if (!q || turnsRef.current.some((t) => t.busy)) return;
    const id = nextId.current++;
    const history: Turn[] = turnsRef.current.flatMap((t) => (t.answer
      ? [{ role: "user" as const, content: t.question }, { role: "assistant" as const, content: t.answer.text }] : []));
    setTurns((ts) => [...ts, { id, question: q, steps: [], busy: true }]);
    setOpen(true);

    let queue = Promise.resolve();
    const later = (f: () => void | Promise<void>) => { queue = queue.then(f).catch((e) => console.error(e)); };
    const controller = new AbortController();
    abort.current = controller;
    let report = false;

    const onEvent = (e: AssistantEvent) => {
      switch (e.type) {
        case "status": later(() => addSteps(id, [{ kind: "status", text: e.text }])); break;
        case "waiting": update(id, (t) => ({ ...t, steps: [...t.steps.filter((s) => s.kind !== "waiting"), { kind: "waiting", seconds: e.seconds }] })); break;
        case "facts": setFacts((f) => [...f, ...e.facts]); factsRef.current = [...factsRef.current, ...e.facts]; break;
        case "action":
          if (e.action.type === "open_report") report = true;
          later(() => apply(id, e.action));
          break;
        case "answer": later(() => update(id, (t) => ({ ...t, answer: { text: e.text, cited: e.cited_facts, grounded: e.grounded } }))); break;
        case "error": later(() => update(id, (t) => ({ ...t, error: e.message }))); break;
      }
    };
    void streamChat(farmId ?? "demo", { question: q, history, facts: factsRef.current, page: pageState() }, onEvent, controller.signal)
      .then(() => queue)
      .finally(() => {
        update(id, (t) => ({ ...t, busy: false, steps: t.steps.filter((s) => s.kind !== "waiting") }));
        if (report) setReport(id);
      });
  }, [addSteps, apply, farmId, pageState, update]);

  const stop = useCallback(() => abort.current?.abort(), []);
  const summon = useCallback(() => {
    setOpen(true);
    setFocusKey((k) => k + 1);
  }, []);

  const undo = useCallback(async (turnId: number) => {
    const t = turnsRef.current.find((x) => x.id === turnId);
    if (!t?.undo || t.undone) return;
    const { route: was, page, snapshot } = t.undo;
    if (routeRef.current !== was) navigate(was);
    if (page) {
      await pageReady(page);
      targets.current.get(page)?.restore(snapshot);
    }
    update(turnId, (x) => ({ ...x, undone: true }));
  }, [navigate, pageReady, update]);

  const decide = useCallback(async (turnId: number, proposalId: string, confirm: boolean) => {
    const setStatus = (status: ProposalStatus, note?: string) => update(turnId, (t) => ({
      ...t, steps: t.steps.map((s) => (s.kind === "proposal" && s.id === proposalId ? { ...s, status, note } : s)),
    }));
    const p = turnsRef.current.find((t) => t.id === turnId)?.steps.find((s) => s.kind === "proposal" && s.id === proposalId);
    if (!p || p.kind !== "proposal" || p.status !== "pending") return;
    if (!confirm) return setStatus("dismissed");
    setStatus("saving");
    if (routeRef.current !== "farm-profile") navigate("farm-profile");
    await pageReady("farm-profile");
    const target = targets.current.get("farm-profile");
    if (!target?.confirm) return setStatus("failed", tr("Open the farm profile to save this change."));
    try {
      setStatus("saved", (await target.confirm(p.change)) ?? undefined);
    } catch (e) {
      setStatus("failed", (e as Error).message);
    }
  }, [navigate, pageReady, update]);

  const reset = useCallback(() => {
    abort.current?.abort();
    setTurns([]);
    setFacts([]);
    factsRef.current = [];
    setReport(null);
  }, []);

  // Ctrl/Cmd+K opens the assistant from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        summon();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [summon]);

  // A farm switch starts a new conversation: the facts belong to the old farm.
  useEffect(() => { reset(); }, [farmId, reset]);

  // Pulses fade on their own.
  useEffect(() => {
    if (!highlight.ids.length) return;
    const t = setTimeout(() => setHighlight((h) => ({ ...h, ids: [] })), 4000);
    return () => clearTimeout(t);
  }, [highlight]);

  const busy = turns.some((t) => t.busy);
  const active = turns.length > 0;
  const value = useMemo<Assistant>(() => ({
    route, open, setOpen, summon, turns, facts, busy, active, ask, stop, undo, decide, reset, report, setReport, highlight,
    focusKey, register,
  }), [route, open, summon, turns, facts, busy, active, ask, stop, undo, decide, reset, report, highlight, focusKey, register]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistant(): Assistant {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAssistant needs <AssistantProvider>");
  return a;
}

/** The assistant, or null outside the provider (shared components that work without it). */
export function useOptionalAssistant(): Assistant | null {
  return useContext(Ctx);
}

/** The fields the assistant is pointing at (for FarmMap). Empty outside the provider. */
export function useAssistantHighlight(): { ids: string[]; key: number } {
  return useContext(Ctx)?.highlight ?? { ids: [], key: 0 };
}

/**
 * Lets the assistant operate this page. `target` may change every render; the latest one is used.
 * Register only once the page can act (`ready`): the assistant waits for it after opening the page.
 * Pages outside the provider (tests, storybook) are left alone.
 */
export function useAssistantTarget(target: PageTarget, ready = true) {
  const ctx = useContext(Ctx);
  const latest = useRef(target);
  latest.current = target;
  const register = ctx?.register;
  const page = target.page;
  useEffect(() => {
    if (!register || !ready) return;
    return register({
      page,
      state: () => latest.current.state(),
      apply: (a) => latest.current.apply(a),
      snapshot: () => latest.current.snapshot(),
      restore: (s) => latest.current.restore(s),
      confirm: (c) => latest.current.confirm?.(c) ?? Promise.reject(new Error(tr("This page can't save farm changes."))),
    });
  }, [register, page, ready]);
}
