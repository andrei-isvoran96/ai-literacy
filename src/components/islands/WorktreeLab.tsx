import { useCallback, useEffect, useState } from 'react';

type Mode = 'one' | 'worktrees';
type Status = 'queued' | 'blocked' | 'working' | 'done';

export interface Feature {
  id: string;
  branch: string;
  dir: string;
  agent: string;
  /** Work units this feature takes to finish. */
  duration: number;
  /** A CSS color (hex or var()) for the fill. */
  color: string;
}

export interface WorktreeLabProps {
  features?: Feature[];
  intervalMs?: number;
  caption?: string;
}

const DEFAULT_FEATURES: Feature[] = [
  { id: 'auth', branch: 'feat/auth', dir: '../app-auth', agent: 'A', duration: 3, color: 'var(--color-accent)' },
  { id: 'search', branch: 'feat/search', dir: '../app-search', agent: 'B', duration: 2, color: 'var(--color-violet)' },
  { id: 'export', branch: 'feat/export', dir: '../app-export', agent: 'C', duration: 4, color: 'var(--color-info)' },
];

const STATUS_STYLE: Record<Status, { label: string; cls: string }> = {
  queued: { label: 'queued', cls: 'border-border text-fg-subtle' },
  blocked: { label: 'blocked', cls: 'border-danger/50 bg-danger/10 text-danger' },
  working: { label: 'working', cls: 'border-accent/50 bg-accent/10 text-accent' },
  done: { label: 'merged', cls: 'border-success/50 bg-success/10 text-success' },
};

/** Cumulative start offset of each feature when work is serialized into one tree. */
function serialOffsets(features: Feature[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const f of features) {
    offsets.push(acc);
    acc += f.duration;
  }
  return offsets;
}

export default function WorktreeLab({
  features = DEFAULT_FEATURES,
  intervalMs = 700,
  caption,
}: WorktreeLabProps) {
  const [mode, setMode] = useState<Mode>('one');
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);

  const offsets = serialOffsets(features);
  const parallelSpan = Math.max(...features.map((f) => f.duration));
  const serialSpan = offsets[offsets.length - 1] + features[features.length - 1].duration;
  const span = mode === 'one' ? serialSpan : parallelSpan;
  const atEnd = tick >= span;

  // Switching the mode restarts the run so the two timelines compare cleanly.
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

  // Per-feature progress + status for the current tick, given the mode.
  const lanes = features.map((f, i) => {
    const start = mode === 'one' ? offsets[i] : 0;
    const progress = Math.max(0, Math.min(1, (tick - start) / f.duration));
    let status: Status;
    if (progress >= 1) status = 'done';
    else if (tick > start) status = 'working';
    else if (mode === 'one' && tick > 0) status = 'blocked'; // tree busy with an earlier feature
    else status = 'queued';
    return { ...f, progress, status, start };
  });

  const activeBlocked = mode === 'one' && lanes.find((l) => l.status === 'blocked');
  const allDone = lanes.every((l) => l.status === 'done');

  return (
    <section
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="not-prose my-8 min-w-0 rounded-xl border border-border bg-surface p-5 shadow-card outline-none focus-visible:border-accent/50"
      aria-label="Interactive worktree lab. Toggle the mode, then play to compare serialized work against parallel worktrees."
    >
      {/* header + mode toggle */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-mono text-xs uppercase tracking-wider text-accent">
          Worktree lab
        </h4>
        <div
          role="radiogroup"
          aria-label="Workspace mode"
          className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
        >
          {(['one', 'worktrees'] as Mode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded-md px-3 py-1 font-mono text-xs transition ${
                mode === m ? 'bg-accent text-bg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {m === 'one' ? 'One checkout' : 'Worktrees'}
            </button>
          ))}
        </div>
      </div>

      {/* lanes */}
      <div className="space-y-2.5">
        {lanes.map((l) => {
          const s = STATUS_STYLE[l.status];
          return (
            <div
              key={l.id}
              className="rounded-lg border border-border bg-surface-2 p-3"
            >
              <div className="flex items-center gap-3">
                {/* agent badge */}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold"
                  style={{
                    borderColor: l.color,
                    color: l.color,
                    backgroundColor: l.status === 'queued' ? 'transparent' : `color-mix(in srgb, ${l.color} 12%, transparent)`,
                  }}
                  title={`Agent ${l.agent}`}
                >
                  {l.agent}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-sm text-fg">{l.branch}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.7rem] ${s.cls}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {/* progress track */}
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full transition-[width] duration-300 ease-out"
                      style={{
                        width: `${l.progress * 100}%`,
                        backgroundColor: l.status === 'done' ? 'var(--color-success)' : l.color,
                        opacity: l.status === 'blocked' ? 0.25 : 0.9,
                      }}
                    />
                  </div>
                  {/* context line: the isolated worktree, or the shared tree */}
                  <p className="mt-1.5 font-mono text-[0.7rem] text-fg-subtle">
                    {mode === 'worktrees' ? (
                      <span>git worktree add {l.dir} -b {l.branch}</span>
                    ) : l.status === 'blocked' ? (
                      <span className="text-danger/80">waiting — working tree busy with another agent</span>
                    ) : (
                      <span>shared working tree · ./</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* readout */}
      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-border bg-surface-2 p-3"
        aria-live="polite"
      >
        <p className="font-mono text-sm">
          <span className="text-fg-subtle">wall-clock&nbsp;»&nbsp;</span>
          <span className={mode === 'worktrees' ? 'text-success' : 'text-warn'}>
            {Math.min(tick, span)}
          </span>
          <span className="text-fg-subtle"> / {span} units</span>
        </p>
        <p className="text-sm text-fg-muted">
          {mode === 'one' ? (
            allDone ? (
              <span>
                <span className="text-warn">Serialized:</span> one tree, one agent at a time —{' '}
                {serialSpan} units of wall-clock.
              </span>
            ) : activeBlocked ? (
              <span>
                <span className="text-danger">Collision:</span> agents share a working tree, so the
                others wait their turn.
              </span>
            ) : (
              <span>One checkout means one agent can touch the tree. Press play.</span>
            )
          ) : allDone ? (
            <span>
              <span className="text-success">Parallel:</span> three isolated trees, three agents at
              once — {parallelSpan} units, the slowest single feature.
            </span>
          ) : (
            <span>Each agent gets its own worktree, so they run at the same time. Press play.</span>
          )}
        </p>
      </div>

      {/* controls */}
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
