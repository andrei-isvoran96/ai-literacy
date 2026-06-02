import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useReducedMotion } from './ui/useReducedMotion';

export type PlaygroundStep =
  | { kind: 'user'; text: string }
  | { kind: 'think'; ms: number; note?: string }
  | { kind: 'tool_call'; tool: string; args: Record<string, unknown>; ms?: number }
  | { kind: 'tool_result'; result: unknown; ms?: number }
  | { kind: 'answer'; text: string };

export interface PlaygroundScenario {
  id: string;
  name: string;
  suggestedPrompt: string;
  steps: PlaygroundStep[];
}

export interface PromptPlaygroundProps {
  scenarios?: PlaygroundScenario[];
  typingSpeedMs?: number;
  caption?: string;
}

type RenderItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'tool_call'; tool: string; args: Record<string, unknown>; status: 'running' | 'done' }
  | { id: string; kind: 'tool_result'; result: unknown }
  | { id: string; kind: 'answer'; text: string };

const DEFAULT_SCENARIOS: PlaygroundScenario[] = [
  {
    id: 'weather',
    name: 'Weather lookup',
    suggestedPrompt: "What's the weather in Tokyo — should I pack an umbrella?",
    steps: [
      { kind: 'user', text: "What's the weather in Tokyo — should I pack an umbrella?" },
      { kind: 'think', ms: 750, note: 'No live data in context → reach for a tool.' },
      { kind: 'tool_call', tool: 'get_weather', args: { city: 'Tokyo', units: 'metric' }, ms: 700 },
      { kind: 'tool_result', result: { tempC: 19, condition: 'Rain', precipChance: 0.8 }, ms: 500 },
      { kind: 'think', ms: 600, note: 'Rain at 80% — recommend the umbrella.' },
      { kind: 'answer', text: "It's 19°C and raining in Tokyo with an 80% chance of precipitation. Yes — pack an umbrella." },
    ],
  },
  {
    id: 'math',
    name: 'Tool for math',
    suggestedPrompt: 'What is 18.5% of 2,640?',
    steps: [
      { kind: 'user', text: 'What is 18.5% of 2,640?' },
      { kind: 'think', ms: 700, note: "Don't guess arithmetic — call the calculator." },
      { kind: 'tool_call', tool: 'calculator', args: { expression: '2640 * 0.185' }, ms: 600 },
      { kind: 'tool_result', result: { value: 488.4 }, ms: 400 },
      { kind: 'answer', text: '18.5% of 2,640 is 488.4.' },
    ],
  },
];

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function PromptPlayground({
  scenarios = DEFAULT_SCENARIOS,
  typingSpeedMs = 16,
  caption,
}: PromptPlaygroundProps) {
  const reduced = useReducedMotion();
  const [scenario, setScenario] = useState(scenarios[0]);
  const [items, setItems] = useState<RenderItem[]>([]);
  const [thinking, setThinking] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [input, setInput] = useState(scenarios[0].suggestedPrompt);
  const runId = useRef(0);

  const wait = (ms: number) =>
    new Promise<void>((r) => window.setTimeout(r, reduced ? 0 : ms));

  const streamAnswer = async (id: string, text: string, alive: () => boolean) => {
    if (reduced) {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, text } : it)));
      return;
    }
    for (let i = 1; i <= text.length; i++) {
      if (!alive()) return;
      const slice = text.slice(0, i);
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, text: slice } : it)));
      await wait(typingSpeedMs);
    }
  };

  const run = async () => {
    const myRun = ++runId.current;
    const alive = () => runId.current === myRun;
    setItems([]);
    setThinking(null);
    setPhase('running');

    let n = 0;
    for (const step of scenario.steps) {
      if (!alive()) return;
      const id = `${myRun}-${n++}`;
      if (step.kind === 'user') {
        setItems((prev) => [...prev, { id, kind: 'user', text: step.text }]);
        await wait(350);
      } else if (step.kind === 'think') {
        setThinking(step.note ?? 'Thinking…');
        await wait(step.ms);
        if (!alive()) return;
        setThinking(null);
      } else if (step.kind === 'tool_call') {
        setItems((prev) => [
          ...prev,
          { id, kind: 'tool_call', tool: step.tool, args: step.args, status: 'running' },
        ]);
        await wait(step.ms ?? 700);
        if (!alive()) return;
        setItems((prev) =>
          prev.map((it) => (it.id === id && it.kind === 'tool_call' ? { ...it, status: 'done' } : it)),
        );
      } else if (step.kind === 'tool_result') {
        setItems((prev) => [...prev, { id, kind: 'tool_result', result: step.result }]);
        await wait(step.ms ?? 500);
      } else if (step.kind === 'answer') {
        setItems((prev) => [...prev, { id, kind: 'answer', text: '' }]);
        await streamAnswer(id, step.text, alive);
      }
    }
    if (alive()) setPhase('done');
  };

  const reset = () => {
    runId.current++;
    setItems([]);
    setThinking(null);
    setPhase('idle');
  };

  const pickScenario = (s: PlaygroundScenario) => {
    runId.current++;
    setScenario(s);
    setInput(s.suggestedPrompt);
    setItems([]);
    setThinking(null);
    setPhase('idle');
  };

  const enter = reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <section
      className="not-prose my-8 overflow-hidden rounded-xl border border-border bg-surface shadow-card"
      aria-label="Interactive prompt and tool-use playground (simulated)"
    >
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-accent">
            Tool-use playground
          </span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-mono text-[0.7rem] text-fg-subtle">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-warn" />
          simulated · offline
        </span>
      </div>

      {/* scenario chips */}
      {scenarios.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2.5">
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pickScenario(s)}
              aria-pressed={s.id === scenario.id}
              className={`rounded-full border px-2.5 py-1 font-mono text-xs transition ${
                s.id === scenario.id
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border text-fg-muted hover:border-border-strong hover:text-fg'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* transcript */}
      <div
        className="flex min-h-[14rem] flex-col gap-3 p-4"
        role="log"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.div key={it.id} layout {...enter} className="flex flex-col">
              {it.kind === 'user' && (
                <div className="self-end max-w-[85%] rounded-lg rounded-br-sm border border-border bg-surface-2 px-3 py-2 text-sm text-fg">
                  {it.text}
                </div>
              )}

              {it.kind === 'tool_call' && (
                <div className="self-start max-w-[90%] rounded-lg border border-info/40 bg-info-bg/60 px-3 py-2 font-mono text-xs">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-info">⚙ tool call</span>
                    <span className={it.status === 'running' ? 'text-warn' : 'text-success'}>
                      {it.status === 'running' ? '· running…' : '· done'}
                    </span>
                  </div>
                  <code className="text-fg">
                    {it.tool}(
                    {Object.entries(it.args)
                      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                      .join(', ')}
                    )
                  </code>
                </div>
              )}

              {it.kind === 'tool_result' && (
                <details className="self-start max-w-[90%] rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs" open>
                  <summary className="cursor-pointer text-fg-subtle">tool result</summary>
                  <pre className="mt-1 overflow-x-auto text-success">{json(it.result)}</pre>
                </details>
              )}

              {it.kind === 'answer' && (
                <div className="self-start max-w-[90%] rounded-lg rounded-bl-sm border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-fg">
                  {it.text}
                  {phase === 'running' && (
                    <span className="ml-0.5 inline-block w-1.5 animate-[blink_1s_step-end_infinite] text-accent">▋</span>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {thinking && (
          <div className="flex items-center gap-2 self-start font-mono text-xs text-fg-subtle">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-[soft-pulse_1s_ease-in-out_infinite] rounded-full bg-fg-subtle" />
              <span className="h-1.5 w-1.5 animate-[soft-pulse_1s_ease-in-out_0.2s_infinite] rounded-full bg-fg-subtle" />
              <span className="h-1.5 w-1.5 animate-[soft-pulse_1s_ease-in-out_0.4s_infinite] rounded-full bg-fg-subtle" />
            </span>
            {thinking}
          </div>
        )}

        {phase === 'idle' && items.length === 0 && (
          <p className="m-auto max-w-xs text-center text-sm text-fg-subtle">
            Press <span className="text-accent">Run</span> to watch a scripted agent
            decide to call a tool, read the result, then answer.
          </p>
        )}
      </div>

      {/* input row */}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          readOnly
          aria-label="Prompt (scripted)"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-fg-muted outline-none focus:border-accent/50"
        />
        <button
          type="button"
          onClick={phase === 'running' ? reset : run}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg transition hover:bg-accent-hi"
        >
          {phase === 'running' ? 'Stop' : phase === 'done' ? 'Run again' : 'Run'}
        </button>
        {phase !== 'idle' && phase !== 'running' && (
          <button
            type="button"
            onClick={reset}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg"
          >
            Reset
          </button>
        )}
      </div>

      {caption && <p className="px-4 pb-4 text-xs text-fg-subtle">{caption}</p>}
    </section>
  );
}
