import { useMemo, useRef, useState } from 'react';
import { useReducedMotion } from './ui/useReducedMotion';

export interface EvalCheck {
  id: string;
  label: string;
  kind: 'assert' | 'judge';
  /** Deterministic predicate over the candidate's raw output string. */
  test: (raw: string) => boolean;
}

export interface EvalCandidate {
  id: string;
  label: string;
  note: string;
  raw: string;
}

export interface EvalScorerProps {
  task?: string;
  candidates?: EvalCandidate[];
  checks?: EvalCheck[];
  caption?: string;
}

function parse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const DEFAULT_TASK =
  'Extract the order id and total from the email and return JSON with an explicit currency.';

const DEFAULT_CANDIDATES: EvalCandidate[] = [
  {
    id: 'a',
    label: 'Output A',
    note: 'Looks careful',
    raw: '{ "orderId": "A-1042", "total": 84.5, "currency": "USD" }',
  },
  {
    id: 'b',
    label: 'Output B',
    note: 'Looks plausible — but…',
    raw: '{ "orderId": "1042", "total": "84.50" }',
  },
];

const DEFAULT_CHECKS: EvalCheck[] = [
  { id: 'json', label: 'Output is valid JSON only (no prose)', kind: 'assert', test: (r) => r.trim().startsWith('{') && parse(r.trim()) !== null },
  { id: 'orderid', label: 'orderId matches /^A-\\d+$/', kind: 'assert', test: (r) => /^A-\d+$/.test(String((parse(r.trim()) ?? {}).orderId ?? '')) },
  { id: 'total-number', label: 'total is a number, not a string', kind: 'assert', test: (r) => typeof (parse(r.trim()) ?? {}).total === 'number' },
  { id: 'currency', label: 'includes a currency field', kind: 'assert', test: (r) => 'currency' in (parse(r.trim()) ?? {}) },
  { id: 'judge', label: 'a reviewer would call this production-ready', kind: 'judge', test: (r) => { const p = parse(r.trim()); return !!p && /^A-\d+$/.test(String(p.orderId ?? '')) && typeof p.total === 'number' && 'currency' in p; } },
];

export default function EvalScorer({
  task = DEFAULT_TASK,
  candidates = DEFAULT_CANDIDATES,
  checks = DEFAULT_CHECKS,
  caption,
}: EvalScorerProps) {
  const reduced = useReducedMotion();
  const [candidateId, setCandidateId] = useState(candidates[0].id);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(checks.map((c) => [c.id, true])),
  );
  const [revealed, setRevealed] = useState(checks.length);
  const timer = useRef<number | null>(null);

  const candidate = candidates.find((c) => c.id === candidateId) ?? candidates[0];

  const results = useMemo(
    () => checks.map((c) => ({ check: c, pass: c.test(candidate.raw) })),
    [checks, candidate],
  );

  const included = results.filter((r) => enabled[r.check.id]);
  const passed = included.filter((r) => r.pass).length;
  const total = included.length;
  const verdict = total > 0 && passed === total ? 'PASS' : 'FAIL';
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  const runReveal = () => {
    if (timer.current) window.clearInterval(timer.current);
    if (reduced) {
      setRevealed(checks.length);
      return;
    }
    setRevealed(0);
    let i = 0;
    timer.current = window.setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= checks.length && timer.current) window.clearInterval(timer.current);
    }, 280);
  };

  const switchCandidate = (id: string) => {
    setCandidateId(id);
    runReveal();
  };

  return (
    <section
      className="not-prose my-8 rounded-xl border border-border bg-surface p-5 shadow-card"
      aria-label="Interactive evaluation scorer"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-mono text-xs uppercase tracking-wider text-accent">
          Eval suite
        </h4>
        <div
          role="radiogroup"
          aria-label="Candidate output"
          className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
        >
          {candidates.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={c.id === candidateId}
              onClick={() => switchCandidate(c.id)}
              className={`rounded-md px-3 py-1 font-mono text-xs transition ${
                c.id === candidateId ? 'bg-accent text-bg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-fg-subtle">
        <span className="text-fg-muted">Task:</span> {task}
      </p>

      {/* candidate output */}
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <div className="mb-1 flex items-center justify-between font-mono text-[0.7rem] text-fg-subtle">
          <span>{candidate.label}</span>
          <span>{candidate.note}</span>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-fg">{candidate.raw}</pre>
      </div>

      {/* score */}
      <div className="mt-4 flex items-center gap-3">
        <span
          className={`rounded-md px-2.5 py-1 font-mono text-sm font-semibold ${
            verdict === 'PASS'
              ? 'bg-success/15 text-success'
              : 'bg-danger/15 text-danger'
          }`}
        >
          {verdict}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              verdict === 'PASS' ? 'bg-success' : 'bg-danger'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-sm text-fg-muted">
          {passed}/{total}
        </span>
      </div>

      {/* checks */}
      <ul className="mt-4 space-y-1.5" aria-live="polite">
        {results.map((r, i) => {
          const isEnabled = enabled[r.check.id];
          const show = i < revealed;
          return (
            <li
              key={r.check.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
                !isEnabled
                  ? 'border-border/60 opacity-45'
                  : r.pass
                    ? 'border-success/25 bg-success/5'
                    : 'border-danger/25 bg-danger/5'
              }`}
            >
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={() =>
                  setEnabled((prev) => ({ ...prev, [r.check.id]: !prev[r.check.id] }))
                }
                className="h-4 w-4 shrink-0 accent-accent"
                aria-label={`Include check: ${r.check.label}`}
              />
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {show ? (
                  r.pass ? (
                    <svg className="h-5 w-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                  ) : (
                    <svg className="h-5 w-5 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  )
                ) : (
                  <span className="h-2 w-2 animate-[soft-pulse_1s_ease-in-out_infinite] rounded-full bg-fg-subtle" />
                )}
              </span>
              <span className="flex-1 text-sm text-fg-muted">{r.check.label}</span>
              {r.check.kind === 'judge' && (
                <span className="rounded border border-violet/30 bg-violet/10 px-1.5 py-0.5 font-mono text-[0.65rem] text-violet">
                  llm-judge
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">
          {verdict === 'FAIL'
            ? 'Plausible output, failing checks. This is why "looks done" ≠ done.'
            : 'All included checks pass — now you can trust a green run.'}
        </p>
        <button
          type="button"
          onClick={runReveal}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg transition hover:bg-accent-hi"
        >
          Run checks
        </button>
      </div>

      {caption && <p className="mt-3 text-xs text-fg-subtle">{caption}</p>}
    </section>
  );
}
