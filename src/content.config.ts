import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const lessons = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Sort key — drives nav order, the index list, and prev/next.
    order: z.number().int().positive(),
    // URL override; falls back to the entry id (the filename without extension).
    slug: z.string().optional(),
    track: z.string().default('Agentic Engineering'),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
    tags: z.array(z.string()).default([]),
    // Optional manual override; otherwise computed from content.
    estimatedMinutes: z.number().int().positive().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { lessons };
