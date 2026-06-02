# AI Literacy

A hands-on website for developers learning advanced AI concepts. The first track —
**Agentic Engineering** — teaches the three skills behind agents you can trust:

1. **Context Engineering** — managing the context window as the scarcest resource.
2. **Tool Use & the Agent Loop** — how agents act via the model→tool→observe loop.
3. **Evaluation & Verification** — how you know an agent actually works.

Every lesson ends with an interactive widget you can poke at (a context-window meter, a
steppable agent-loop visualizer, an offline tool-use playground, and an eval scorer).

## Stack

- **[Astro 6](https://astro.build)** (static output) with **MDX Content Collections**
- **Tailwind CSS v4** (via `@tailwindcss/vite`, configured CSS-first in `src/styles/global.css`)
- **React 19 islands** for the interactive widgets (`motion` only in the playground)
- **Shiki** for code highlighting (bundled with Astro)

## Develop

```bash
npm install
npm run dev        # dev server at http://localhost:4321/ai-literacy/ (drafts visible here)
npm run build      # astro check + static build to ./dist
npm run preview    # serve the production build
npm run check      # type + content-schema check
```

Requires Node ≥ 22.12. The site is served under the `/ai-literacy` base path (see
`astro.config.mjs`); internal links go through the `withBase()` helper in
`src/lib/lessons.ts`, and Markdown links are prefixed by `plugins/remark-base-links.mjs`.

## Add a lesson

Drop one `.mdx` file into `src/content/lessons/`. It is published automatically — URL,
index card, prev/next, table of contents, and reading time all derive from the content
collection. No other file needs to change.

```mdx
---
title: Memory & Retrieval
description: How agents store, recall, and ground on external knowledge.
order: 4                # controls sequence in nav, the index, and prev/next
slug: memory-and-retrieval   # optional; defaults to the filename
difficulty: advanced         # beginner | intermediate | advanced
tags: [memory, rag]
---

## Why memory matters

Prose, `inline code`, code fences, and `<Callout type="tip">…</Callout>` all work.

import ContextWindowMeter from '../../components/islands/ContextWindowMeter.tsx';

<ContextWindowMeter client:visible />
```

Set `draft: true` to keep a lesson visible in `npm run dev` but excluded from the build.

The lesson schema lives in `src/content.config.ts`; sorting/URL/reading-time helpers are in
`src/lib/lessons.ts`.

## Project structure

```
src/
  content/lessons/        # the lessons (.mdx) — add files here
  content.config.ts       # lesson collection schema (glob loader + Zod)
  lib/lessons.ts          # single source of truth for ordering / URLs / reading time
  layouts/                # BaseLayout, LessonLayout
  components/             # Header, Footer, LessonCard, TableOfContents, …
    mdx/                  # Callout, CodeBlock, Heading2 (MDX element overrides)
    islands/              # React widgets (ContextWindowMeter, AgentLoopVisualizer, …)
  pages/                  # index.astro, lessons/index.astro, lessons/[...slug].astro
  styles/global.css       # design tokens (@theme) + base + prose styles
```

## Interactive islands

Each widget renders a sensible static first paint, gates auto-animation on
`prefers-reduced-motion`, is keyboard-operable, and announces state via `aria-live`. Embed
one in any lesson with a `client:visible` directive.

## Verification tooling (optional)

`scripts/` contains Playwright helpers used during development:

- `node scripts/shoot.mjs <baseUrl> <path...>` — screenshot pages at desktop + mobile and
  report console/network errors.
- `node scripts/walkthrough.mjs` — drive every island on the production preview build and
  assert no console errors, no failed requests, working prev/next, and reduced-motion.

## Deploy

Hosted on **GitHub Pages** at <https://andrei-isvoran96.github.io/ai-literacy/>. Every push
to `main` triggers `.github/workflows/deploy.yml`, which builds with Astro and publishes
`./dist` via GitHub Pages (no adapter — it's a static site).

To deploy elsewhere (Cloudflare Pages, Vercel), change `site`/`base` in `astro.config.mjs`
and serve `./dist` (build `npm run build`).
