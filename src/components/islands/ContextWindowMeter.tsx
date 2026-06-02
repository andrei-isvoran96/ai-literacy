import { useMemo, useState } from 'react';

type SegmentKind = 'static' | 'history' | 'retrieved' | 'output';
type Policy = 'truncate' | 'compact' | 'off';

export interface ContextSegment {
  id: string;
  label: string;
  tokens: number;
  min: number;
  max: number;
  /** A CSS color (hex or var()). */
  color: string;
  kind: SegmentKind;
  hint?: string;
}

export interface ContextWindowMeterProps {
  budget?: number;
  segments?: ContextSegment[];
  defaultPolicy?: Policy;
  caption?: string;
}

const DEFAULT_SEGMENTS: ContextSegment[] = [
  { id: 'system', label: 'System prompt', tokens: 4_000, min: 0, max: 20_000, color: 'var(--color-violet)', kind: 'static', hint: 'Instructions & persona — fixed overhead every call.' },
  { id: 'tools', label: 'Tool definitions', tokens: 9_000, min: 0, max: 40_000, color: 'var(--color-info)', kind: 'static', hint: 'JSON schemas for every tool the agent can call.' },
  { id: 'history', label: 'Conversation history', tokens: 52_000, min: 0, max: 180_000, color: 'var(--color-accent)', kind: 'history', hint: 'Grows every turn — the first thing to overflow.' },
  { id: 'retrieved', label: 'Retrieved docs (RAG)', tokens: 22_000, min: 0, max: 120_000, color: 'var(--color-success)', kind: 'retrieved', hint: 'Chunks injected from search / memory.' },
  { id: 'output', label: 'Reserved for output', tokens: 16_000, min: 4_000, max: 64_000, color: 'var(--color-warn)', kind: 'output', hint: 'The model needs room to answer — reserved, not input.' },
];

const POLICY_LABEL: Record<Policy, string> = {
  compact: 'Compact',
  truncate: 'Truncate',
  off: 'Off',
};

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

export default function ContextWindowMeter({
  budget = 200_000,
  segments = DEFAULT_SEGMENTS,
  defaultPolicy = 'compact',
  caption,
}: ContextWindowMeterProps) {
  const [tokens, setTokens] = useState<Record<string, number>>(() =>
    Object.fromEntries(segments.map((s) => [s.id, s.tokens])),
  );
  const [policy, setPolicy] = useState<Policy>(defaultPolicy);

  const model = useMemo(() => {
    const output = segments.find((s) => s.kind === 'output');
    const outputTokens = output ? tokens[output.id] : 0;
    const inputSegments = segments.filter((s) => s.kind !== 'output');
    const rawInput = inputSegments.reduce((sum, s) => sum + tokens[s.id], 0);
    const need = rawInput + outputTokens - budget; // > 0 means over budget

    const historyId = segments.find((s) => s.kind === 'history')?.id;
    const historyRaw = historyId ? tokens[historyId] : 0;

    let historyEffective = historyRaw;
    let evicted = 0;
    let compacted = 0;
    let overflow = 0;

    if (need > 0) {
      if (policy === 'truncate') {
        evicted = Math.min(historyRaw, need);
        historyEffective = historyRaw - evicted;
        overflow = Math.max(0, need - evicted);
      } else if (policy === 'compact') {
        const compactedTo = Math.round(historyRaw * 0.25);
        const saved = historyRaw - compactedTo;
        if (saved >= need) {
          historyEffective = historyRaw - need; // compact just enough
          compacted = need;
        } else {
          historyEffective = compactedTo;
          compacted = saved;
          overflow = need - saved;
        }
      } else {
        overflow = need;
      }
    }

    const usedInput = inputSegments.reduce(
      (sum, s) => sum + (s.kind === 'history' ? historyEffective : tokens[s.id]),
      0,
    );

    return {
      outputTokens,
      usedInput,
      total: usedInput + outputTokens,
      overflow,
      evicted,
      compacted,
      historyRaw,
      historyEffective,
    };
  }, [tokens, policy, segments, budget]);

  const pct = (n: number) => `${Math.min(100, (n / budget) * 100)}%`;
  const overPct = Math.min(40, (model.overflow / budget) * 100);

  // Build the ordered fill blocks for the bar (input segments, then reserved output).
  const fills = segments
    .filter((s) => s.kind !== 'output')
    .map((s) => ({
      ...s,
      value: s.kind === 'history' ? model.historyEffective : tokens[s.id],
    }));
  const outputSeg = segments.find((s) => s.kind === 'output');

  return (
    <section
      className="not-prose my-8 rounded-xl border border-border bg-surface p-5 shadow-card"
      aria-label="Interactive context window meter"
    >
      {/* status line */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-mono text-xs uppercase tracking-wider text-accent">
          Context window
        </h4>
        <p className="font-mono text-sm text-fg-muted">
          <span className={model.overflow > 0 ? 'text-danger' : 'text-fg'}>
            {fmt(model.total)}
          </span>{' '}
          / {fmt(budget)} tokens
          {model.overflow > 0 && (
            <span className="text-danger"> · over by {fmt(model.overflow)}</span>
          )}
        </p>
      </div>

      {/* the bar */}
      <div className="relative">
        <div
          className="flex h-11 w-full overflow-hidden rounded-lg border border-border bg-surface-2"
          role="img"
          aria-label={`Context usage: ${fmt(model.total)} of ${fmt(budget)} tokens`}
        >
          {fills.map((s) => (
            <div
              key={s.id}
              className="h-full transition-[width] duration-300 ease-out"
              style={{ width: pct(s.value), backgroundColor: s.color, opacity: 0.85 }}
              title={`${s.label}: ${fmt(s.value)}`}
            />
          ))}
          {outputSeg && (
            <div
              className="h-full transition-[width] duration-300 ease-out"
              style={{
                width: pct(model.outputTokens),
                backgroundImage:
                  'repeating-linear-gradient(45deg, var(--color-warn) 0 6px, transparent 6px 12px)',
                opacity: 0.5,
              }}
              title={`Reserved output: ${fmt(model.outputTokens)}`}
            />
          )}
        </div>

        {/* overflow indicator beyond the budget line */}
        {model.overflow > 0 && (
          <div
            className="absolute top-0 h-11 animate-[soft-pulse_1.4s_ease-in-out_infinite] rounded-r-lg border border-danger/60"
            style={{
              left: '100%',
              width: `${Math.max(4, overPct)}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--color-danger) 0 6px, transparent 6px 12px)',
            }}
            title={`Overflow: ${fmt(model.overflow)}`}
          />
        )}
      </div>

      {/* legend */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
        {segments.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: s.color, opacity: s.kind === 'output' ? 0.6 : 0.85 }}
            />
            {s.label}
          </li>
        ))}
      </ul>

      {/* sliders */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {segments.map((s) => (
          <label key={s.id} className="block">
            <span className="flex items-center justify-between text-xs text-fg-muted">
              <span>{s.label}</span>
              <span className="font-mono text-fg">{fmt(tokens[s.id])}</span>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={1000}
              value={tokens[s.id]}
              onChange={(e) =>
                setTokens((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))
              }
              className="mt-1 w-full accent-accent"
              aria-label={`${s.label}: ${fmt(tokens[s.id])} of ${fmt(s.max)} tokens`}
            />
          </label>
        ))}
      </div>

      {/* policy toggle */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-xs text-fg-muted">When it overflows:</span>
        <div
          role="radiogroup"
          aria-label="Overflow policy"
          className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
        >
          {(['compact', 'truncate', 'off'] as Policy[]).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={policy === p}
              onClick={() => setPolicy(p)}
              className={`rounded-md px-3 py-1 font-mono text-xs transition ${
                policy === p
                  ? 'bg-accent text-bg'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {POLICY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* explanation */}
      <p className="mt-3 min-h-[2.5rem] text-sm text-fg-muted" aria-live="polite">
        {model.overflow > 0 && policy === 'off' && (
          <span className="text-danger">
            Over budget by {fmt(model.overflow)} tokens — the request would fail or
            silently drop context. Pick a policy.
          </span>
        )}
        {model.evicted > 0 && (
          <>
            <span className="text-warn">Truncated:</span> evicted {fmt(model.evicted)}{' '}
            tokens of the oldest history. Cheap, but that context is gone for good.
            {model.overflow > 0 && (
              <span className="text-danger"> Still over by {fmt(model.overflow)}.</span>
            )}
          </>
        )}
        {model.compacted > 0 && (
          <>
            <span className="text-accent">Compacted:</span> summarized{' '}
            {fmt(model.compacted)} tokens of history into a smaller recap. Lossy, but
            it keeps the gist.
            {model.overflow > 0 && (
              <span className="text-danger"> Still over by {fmt(model.overflow)}.</span>
            )}
          </>
        )}
        {model.overflow === 0 && model.evicted === 0 && model.compacted === 0 && (
          <>Within budget. Drag <span className="text-fg">Conversation history</span> up
          until it overflows the budget line to see policies kick in.</>
        )}
      </p>

      {caption && <p className="mt-3 text-xs text-fg-subtle">{caption}</p>}
    </section>
  );
}
