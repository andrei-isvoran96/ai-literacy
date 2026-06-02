import { getCollection, type CollectionEntry } from 'astro:content';
import getReadingTime from 'reading-time';

export type Lesson = CollectionEntry<'lessons'>;

/** Prefix a root-absolute path with the configured base (e.g. /ai-literacy). */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return path.startsWith('/') ? base + path : `${base}/${path}`;
}

/**
 * The single source of truth for lesson ordering. The route, the index page,
 * the homepage cards, and prev/next all read from here, so dropping a new
 * `.mdx` file into src/content/lessons publishes it everywhere automatically.
 *
 * Drafts are shown in `astro dev` (for authoring) but excluded from builds.
 */
export async function getSortedLessons(): Promise<Lesson[]> {
  const lessons = await getCollection(
    'lessons',
    ({ data }) => import.meta.env.DEV || !data.draft,
  );
  return lessons.sort((a, b) => a.data.order - b.data.order);
}

export function lessonHref(lesson: Lesson): string {
  return withBase(`/lessons/${lesson.data.slug ?? lesson.id}`);
}

/** Two-digit lesson number derived from `order` (e.g. 1 → "01"). */
export function lessonNumber(lesson: Lesson): string {
  return String(lesson.data.order).padStart(2, '0');
}

/**
 * Estimated reading time in whole minutes. Honors an explicit
 * `estimatedMinutes` frontmatter override, otherwise computes from the raw
 * lesson body. One implementation so cards and the lesson page agree.
 */
export function readingMinutes(lesson: Lesson): number {
  if (lesson.data.estimatedMinutes) return lesson.data.estimatedMinutes;
  const body = lesson.body ?? '';
  return Math.max(1, Math.round(getReadingTime(body).minutes));
}
