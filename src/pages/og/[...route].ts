import { OGImageRoute } from 'astro-og-canvas';
import { getSortedLessons, lessonSlug } from '../../lib/lessons';

/** Data each generated card needs. Keyed by route slug. */
interface OgPage {
  title: string;
  description: string;
}

const lessons = await getSortedLessons();

const pages: Record<string, OgPage> = {
  // Site-wide fallback card (homepage, lessons index, anything non-lesson).
  site: {
    title: 'AI Literacy',
    description: 'Agentic engineering for developers',
  },
};

for (const lesson of lessons) {
  pages[lessonSlug(lesson)] = {
    title: lesson.data.title,
    description: `Lesson ${lesson.data.order} · ${lesson.data.track}`,
  };
}

// Brand palette mirrored from src/styles/global.css.
const BG: [number, number, number] = [10, 12, 16]; // --color-bg
const BG_2: [number, number, number] = [22, 27, 36]; // --color-surface-2
const FG: [number, number, number] = [230, 237, 243]; // --color-fg
const FG_MUTED: [number, number, number] = [154, 167, 182]; // --color-fg-muted
const ACCENT: [number, number, number] = [56, 225, 200]; // --color-accent

export const { getStaticPaths, GET } = await OGImageRoute({
  param: 'route',
  pages,
  getImageOptions: (_path, page: OgPage) => ({
    title: page.title,
    description: page.description,
    bgGradient: [BG, BG_2],
    border: { color: ACCENT, width: 16, side: 'inline-start' },
    padding: 80,
    font: {
      title: { color: FG, size: 72, lineHeight: 1.15, weight: 'Bold', families: ['Inter'] },
      description: { color: FG_MUTED, size: 36, families: ['Inter'] },
    },
    fonts: [
      'https://api.fontsource.org/v1/fonts/inter/latin-400-normal.ttf',
      'https://api.fontsource.org/v1/fonts/inter/latin-700-normal.ttf',
    ],
  }),
});
