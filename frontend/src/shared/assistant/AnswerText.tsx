import { Fragment, type ReactNode } from "react";
import { t } from "../i18n";

/**
 * The light Markdown the assistant writes (paragraphs, bullet and numbered lists, **bold**, simple tables), rendered
 * as React elements: no HTML from the model ever reaches the page. Citations like [3] become buttons.
 */
export function AnswerText({ text, onCite, print = false }: { text: string; onCite?: (n: number) => void; print?: boolean }) {
  const blocks = parse(text);
  return (
    <div className={print ? "space-y-2" : "space-y-2 text-sm leading-normal"}>
      {blocks.map((b, i) => {
        if ("items" in b) {
          const List = b.kind;
          return (
            <List key={i} className={`${b.kind === "ul" ? "list-disc" : "list-decimal"} space-y-1 pl-5`}>
              {b.items.map((it, j) => <li key={j}>{inline(it, onCite, print)}</li>)}
            </List>
          );
        }
        if (b.kind === "table") {
          return (
            <div key={i} className="overflow-x-auto">
              <table className={`w-full border-collapse text-left ${print ? "text-[10pt]" : "text-[12.5px]"}`}>
                <thead>
                  <tr>{b.head.map((c, j) => <th key={j} className={`border-b px-2 py-1 font-bold ${print ? "border-black/30" : "border-line"}`}>{inline(c, onCite, print)}</th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>{r.map((c, k) => <td key={k} className={`border-b px-2 py-1 ${print ? "border-black/15" : "border-line"}`}>{inline(c, onCite, print)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={i}>{inline(b.text, onCite, print)}</p>;
      })}
    </div>
  );
}

type Block = { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[] } | { kind: "table"; head: string[]; rows: string[][] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.trim().startsWith("|") && lines[i + 1]?.match(/^\s*\|?\s*:?-{2,}/)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    const b = line.match(BULLET), n = line.match(NUMBER);
    if (b || n) {
      const kind = b ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      const item = (b ?? n)![1];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
      continue;
    }
    // A heading becomes its own short paragraph; consecutive plain lines join into one paragraph.
    const isHeading = /^#{1,6}\s+/.test(line);
    const text = line.replace(/^#{1,6}\s+/, "").trim();
    const last = blocks[blocks.length - 1];
    if (!isHeading && last?.kind === "p" && lines[i - 1]?.trim()) last.text += " " + text;
    else blocks.push({ kind: "p", text });
  }
  return blocks;
}

/** **bold** and [n] citations inside a line. */
function inline(text: string, onCite?: (n: number) => void, print = false): ReactNode {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[(\d{1,3})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={m.index} className="font-bold">{m[1]}</strong>);
    else {
      const n = Number(m[2]);
      out.push(onCite && !print ? (
        <button key={m.index} type="button" onClick={() => onCite(n)} aria-label={t("Fact {n}", { n })}
          className="mx-px rounded-[5px] bg-glass-hi px-1 align-[1px] text-[11.5px] font-bold text-mut hover:bg-glass-sel hover:text-tx">
          {n}
        </button>
      ) : <sup key={m.index}>[{n}]</sup>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
