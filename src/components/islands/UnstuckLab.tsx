import { useCallback, useEffect, useState } from 'react';

type Mode = 'serial' | 'fanout';
type Status = 'queued' | 'investigating' | 'ruled-out' | 'root-cause';

export interface Hypothesis {
  id: string;
  /** Short label for the lane. */
  label: string;
  /** The investigation the agent actually runs. */
  probe: string;
  /** Work units this hypothesis takes to confirm or rule out. */
  duration: number;
  /** Exactly one hypothesis is the real root cause. */
  correct?: boolean;
  /** A CSS color (hex or var()) for the lane accent. */
  color: string;
}

export interface UnstuckLabProps {
  hypotheses?: Hypothesis[];
  intervalMs?: number;
  caption?: string;
}

// One bug, four plausible explanations — only the pagination off-by-one is real.
// The order matters for serial mode: the true cause sits third, so retrying
// "in order" burns two wrong investigations before it lands.
const DEFAULT_HYPOTHESES: Hypothesis[] = [
  { id: 'cache', label: 'Stale cache', probe: 'bust the cache, re-run', duration: 2, color: 'var(--color-violet)' },
  { id: 'race', label: 'Race condition', probe: 'add a lock, re-run', duration: 3, color: 'var(--color-info)' },
  { id: 'paging', label: 'Off-by-one in paging', probe: 'log the offset, diff the rows', duration: 2, correct: true, color: 'var(--color-accent)' },
  { id: 'timeout', label: 'Network timeout', probe: 'bump the deadline, re-run', duration: 4, color: 'var(--color-warn)' },
];

const STATUS_STYLE: Record<Status, { label: string; cls: string }> = {
  queued: { label: 'queued', cls: 'border-border text-fg-subtle' },
  investigating: { label: 'investigating', cls: 'border-accent/50 bg-accent/10 text-accent' },
  'ruled-out': { label: 'ruled out', cls: 'border-border text-fg-subtle' },
  'root-cause': { label: 'root cause', cls: 'border-success/50 bg-success/10 text-success' },
};

/** Cumulative start offset of each hypothesis when they're tried one at a time. */
function serialOffsets(hyps: Hypothesis[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const h of hyps) {
    offsets.push(acc);
    acc += h.duration;
  }
  return offsets;
}

export default function UnstuckLab({
  hypotheses = DEFAULT_HYPOTHESES,
  intervalMs = 700,
  caption,
}: UnstuckLabProps) {
  const [mode, setMode] = useState<Mode>('serial');
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);

  const offsets = serialOffsets(hypotheses);
  const correctIndex = hypotheses.findIndex((h) => h.correct);

  // Serial stops the moment the real cause is confirmed — you don't keep going
  // once you've found it, but you've already paid for every wrong probe before it.
  const serialFound = offsets[correctIndex] + hypotheses[correctIndex].duration;
  // Fan-out confirms the real cause at its own cost, in parallel with the rest.
  const fanoutFound = hypotheses[correctIndex].duration;

  const span = mode === 'serial' ? serialFound : Math.max(...hypotheses.map((h) => h.duration));
  const foundAt = mode === 'serial' ? serialFound : fanoutFound;
  const atEnd = tick >= span;

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setTick(0);
    setPlaying(false);
  }, []);

  const reset = useCallback(() => {
    setTick(0);
    setPlaying(false);
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => setTick((t) => Math.min(span, Math.max(0, t + dir))),
    [span],
  );

  useEffect(() => {
    if (!playing) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setTick((v) => Math.min(span, v + 1)), intervalMs);
    return () => window.clearTimeout(t);
  }, [playing, tick, atEnd, span, intervalMs]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === ' ') { e.preventDefault(); if (!atEnd) setPlaying((p) => !p); }
  };

  const lanes = hypotheses.map((h, i) => {
    const start = mode === 'serial' ? offsets[i] : 0;
    // In serial mode, anything after the real cause is never reached.
    const reachable = mode === 'fanout' || start < serialFound;
    const progress = reachable ? Math.max(0, Math.min(1, (tick - start) / h.duration)) : 0;
    let status: Status;
    if (!reachable) status = 'queued';
    else if (progress >= 1) status = h.correct ? 'root-cause' : 'ruled-out';
    else if (tick > start) status = 'investigating';
    else status = 'queued';
    return { ...h, progress, status, start };
  });

  const solved = tick >= foundAt;

  return (
    <section
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="not-prose my-8 min-w-0 rounded-xl border border-border bg-surface p-5 shadow-card outline-none focus-visible:border-accent/50"
      aria-label="Interactive lab. Toggle between retrying one hypothesis at a time and fanning out across all of them, then play to compare time-to-root-cause."
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-mono text-xs uppercase tracking-wider text-accent">
          Stuck-loop lab
        </h4>
        <div
          role="radiogroup"
          aria-label="Recovery strategy"
          className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
        >
          {(['serial', 'fanout'] as Mode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded-md px-3 py-1 font-mono text-xs transition ${
                mode === m ? 'bg-accent text-bg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {m === 'serial' ? 'Retry serially' : 'Fan out'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {lanes.map((l) => {
          const s = STATUS_STYLE[l.status];
          return (
            <div
              key={l.id}
              className="rounded-lg border border-border bg-surface-2 p-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold"
                  style={{
                    borderColor: l.color,
                    color: l.color,
                    backgroundColor: l.status === 'queued' ? 'transparent' : `color-mix(in srgb, ${l.color} 12%, transparent)`,
                  }}
                  title={l.label}
                >
                  {l.status === 'root-cause' ? '✓' : '?'}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-sm text-fg">{l.label}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.7rem] ${s.cls}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full transition-[width] duration-300 ease-out"
                      style={{
                        width: `${l.progress * 100}%`,
                        backgroundColor: l.status === 'root-cause' ? 'var(--color-success)' : l.color,
                        opacity: l.status === 'ruled-out' ? 0.3 : 0.9,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 font-mono text-[0.7rem] text-fg-subtle">
                    {mode === 'serial' && l.status === 'queued' && l.start >= serialFound ? (
                      <span>never reached — the loop ended first</span>
                    ) : (
                      <span>{l.probe}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-border bg-surface-2 p-3"
        aria-live="polite"
      >
        <p className="font-mono text-sm">
          <span className="text-fg-subtle">time-to-fix&nbsp;»&nbsp;</span>
          <span className={mode === 'fanout' ? 'text-success' : 'text-warn'}>
            {Math.min(tick, foundAt)}
          </span>
          <span className="text-fg-subtle"> / {foundAt} units</span>
        </p>
        <p className="text-sm text-fg-muted">
          {mode === 'serial' ? (
            solved ? (
              <span>
                <span className="text-warn">Serial:</span> two wrong probes paid for in full
                before the real one — {serialFound} units of going in circles.
              </span>
            ) : (
              <span>One hypothesis at a time, against a hunch that might be wrong. Press play.</span>
            )
          ) : solved ? (
            <span>
              <span className="text-success">Fan-out:</span> every hypothesis probed at once —
              root cause confirmed in {fanoutFound} units, the cost of the right probe alone.
            </span>
          ) : (
            <span>One subagent per hypothesis, each in its own context. Press play.</span>
          )}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={tick === 0}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg disabled:opacity-40"
          aria-label="Step back"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={() => (atEnd ? reset() : setPlaying((p) => !p))}
          className="flex-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition hover:bg-accent-hi"
        >
          {atEnd ? 'Replay' : playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={atEnd}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg disabled:opacity-40"
          aria-label="Step forward"
        >
          ▶
        </button>
      </div>

      {caption && <p className="mt-4 text-xs text-fg-subtle">{caption}</p>}
    </section>
  );
}
