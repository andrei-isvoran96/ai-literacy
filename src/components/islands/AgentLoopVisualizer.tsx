import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './ui/useReducedMotion';

type NodeId = 'user' | 'model' | 'tool' | 'observation' | 'answer';

export interface LoopPhase {
  node: NodeId;
  iteration: number;
  role: string;
  text: string;
  /** true when control returns to the model for another pass. */
  loopBack?: boolean;
}

export interface AgentLoopVisualizerProps {
  phases?: LoopPhase[];
  autoPlay?: boolean;
  intervalMs?: number;
  caption?: string;
}

const DEFAULT_PHASES: LoopPhase[] = [
  { node: 'user', iteration: 0, role: 'User', text: "What's the weather in Tokyo — should I pack an umbrella?" },
  { node: 'model', iteration: 1, role: 'Model', text: "I don't have live weather. I'll call the get_weather tool for Tokyo." },
  { node: 'tool', iteration: 1, role: 'Tool call', text: 'get_weather({ city: "Tokyo", units: "metric" })' },
  { node: 'observation', iteration: 1, role: 'Observation', text: '{ tempC: 19, condition: "Rain", precipChance: 0.8 }' },
  { node: 'model', iteration: 2, role: 'Model', text: 'Rain at 80%. I have enough to answer — no more tools needed.', loopBack: true },
  { node: 'answer', iteration: 2, role: 'Answer', text: "It's 19°C and raining in Tokyo (80% chance). Yes — pack the umbrella." },
];

const NODES: { id: Exclude<NodeId, 'user' | 'answer'>; label: string; icon: React.ReactNode }[] = [
  {
    id: 'model',
    label: 'Model',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></svg>
    ),
  },
  {
    id: 'tool',
    label: 'Tool call',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z" /></svg>
    ),
  },
  {
    id: 'observation',
    label: 'Observation',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
    ),
  },
];

function Connector({ active }: { active: boolean }) {
  return (
    <svg
      className="h-6 w-8 shrink-0"
      viewBox="0 0 32 24"
      fill="none"
      aria-hidden="true"
    >
      <line
        x1="2"
        y1="12"
        x2="24"
        y2="12"
        stroke={active ? 'var(--color-accent)' : 'var(--color-border-strong)'}
        strokeWidth="2"
        strokeDasharray="4 4"
        className={active ? 'animate-[flow-dash_0.6s_linear_infinite]' : ''}
      />
      <path
        d="M22 7l6 5-6 5"
        stroke={active ? 'var(--color-accent)' : 'var(--color-border-strong)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AgentLoopVisualizer({
  phases = DEFAULT_PHASES,
  autoPlay = false,
  intervalMs = 1800,
  caption,
}: AgentLoopVisualizerProps) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay && !reduced);
  const rootRef = useRef<HTMLDivElement>(null);

  const last = phases.length - 1;
  const phase = phases[index];
  const atEnd = index >= last;

  const step = useCallback(
    (dir: 1 | -1) => setIndex((i) => Math.min(last, Math.max(0, i + dir))),
    [last],
  );
  const reset = useCallback(() => {
    setIndex(0);
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setIndex((i) => Math.min(last, i + 1)), intervalMs);
    return () => window.clearTimeout(t);
  }, [playing, index, atEnd, last, intervalMs]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === ' ') { e.preventDefault(); if (!atEnd) setPlaying((p) => !p); }
  };

  const isActive = (id: NodeId) => phase.node === id;
  const incomingActive = (id: Exclude<NodeId, 'user' | 'answer'>) => {
    if (id === 'tool') return phase.node === 'tool';
    if (id === 'observation') return phase.node === 'observation';
    if (id === 'model') return phase.node === 'model';
    return false;
  };

  return (
    <section
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="not-prose group/loop my-8 min-w-0 rounded-xl border border-border bg-surface p-5 shadow-card outline-none focus-visible:border-accent/50"
      aria-label="Interactive agent loop visualizer. Use arrow keys to step, space to play or pause."
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-mono text-xs uppercase tracking-wider text-accent">
          The agent loop
        </h4>
        <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 font-mono text-xs text-fg-muted">
          {phase.iteration === 0 ? 'start' : `iteration ${phase.iteration}`}
        </span>
      </div>

      {/* user input */}
      <div className="flex justify-center">
        <div
          className={`max-w-md rounded-lg border px-3 py-2 text-center text-xs transition ${
            isActive('user')
              ? 'border-accent/60 bg-accent/10 text-fg shadow-glow-cyan'
              : 'border-border bg-surface-2 text-fg-muted'
          }`}
        >
          <span className="font-mono text-fg-subtle">user&nbsp;»&nbsp;</span>
          {phases[0].text}
        </div>
      </div>

      <div className="my-2 flex justify-center text-fg-subtle" aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
      </div>

      {/* the cycle — scrolls horizontally on narrow screens */}
      <div className="relative overflow-x-auto pb-1">
        <div className="mx-auto w-max">
        <div className="flex items-stretch gap-1">
          {NODES.map((n, i) => (
            <div key={n.id} className="flex items-stretch">
              <div
                className={`flex min-w-[7.5rem] flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-center transition duration-300 ${
                  isActive(n.id)
                    ? 'scale-[1.04] border-accent/60 bg-accent/10 text-fg shadow-glow-cyan'
                    : 'border-border bg-surface-2 text-fg-muted'
                }`}
              >
                <span className={isActive(n.id) ? 'text-accent' : 'text-fg-subtle'}>
                  {n.icon}
                </span>
                <span className="font-mono text-xs font-medium uppercase tracking-wide">
                  {n.label}
                </span>
              </div>
              {i < NODES.length - 1 && (
                <div className="flex items-center">
                  <Connector active={incomingActive(NODES[i + 1].id)} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* loop-back rail */}
        <div className="mt-2 px-16">
          <div
            className={`relative h-7 rounded-b-lg border-x border-b transition ${
              phase.loopBack
                ? 'border-accent/70 shadow-[0_8px_20px_-12px_var(--color-accent)]'
                : 'border-border'
            }`}
          >
            {/* up-arrow into the model (left end) */}
            <svg
              className={`absolute -top-1.5 left-0 h-3 w-3 -translate-x-1/2 ${phase.loopBack ? 'text-accent' : 'text-border-strong'}`}
              viewBox="0 0 12 12"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6 0l4 5H2z" />
            </svg>
            <span
              className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap bg-surface px-2 font-mono text-[0.7rem] ${
                phase.loopBack ? 'text-accent' : 'text-fg-subtle'
              }`}
            >
              <svg
                className={`h-3 w-3 ${phase.loopBack ? 'animate-[soft-pulse_1.2s_ease-in-out_infinite]' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              repeat until done
            </span>
          </div>
        </div>
        </div>
      </div>

      <div className="my-2 flex justify-center text-fg-subtle" aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
      </div>

      {/* answer */}
      <div className="flex justify-center">
        <div
          className={`max-w-md rounded-lg border px-3 py-2 text-center text-xs transition ${
            isActive('answer')
              ? 'border-success/60 bg-success/10 text-fg shadow-[0_0_24px_-4px_var(--color-success)]'
              : 'border-border bg-surface-2 text-fg-subtle'
          }`}
        >
          <span className="font-mono text-fg-subtle">answer&nbsp;»&nbsp;</span>
          {isActive('answer') ? phases[last].text : 'pending…'}
        </div>
      </div>

      {/* detail panel */}
      <div
        className="mt-5 rounded-lg border border-border bg-surface-2 p-3"
        aria-live="polite"
      >
        <p className="font-mono text-xs">
          <span className="text-accent">{phase.role}</span>
          <span className="text-fg-subtle"> · step {index + 1}/{phases.length}</span>
        </p>
        <p className="mt-1 font-mono text-sm text-fg">{phase.text}</p>
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
          disabled={index === 0}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg disabled:opacity-40"
          aria-label="Previous step"
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
          aria-label="Next step"
        >
          ▶
        </button>
      </div>

      {/* progress dots */}
      <div className="mt-3 flex justify-center gap-1.5">
        {phases.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setIndex(i); setPlaying(false); }}
            aria-label={`Go to step ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-6 bg-accent' : 'w-1.5 bg-border-strong hover:bg-fg-subtle'
            }`}
          />
        ))}
      </div>

      {caption && <p className="mt-4 text-xs text-fg-subtle">{caption}</p>}
    </section>
  );
}
