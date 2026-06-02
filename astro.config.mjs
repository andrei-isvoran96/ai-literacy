// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

import { remarkBaseLinks } from './plugins/remark-base-links.mjs';

// Served as a GitHub Pages project site at https://<user>.github.io/ai-literacy/
const BASE = '/ai-literacy';

// https://astro.build/config
export default defineConfig({
  site: 'https://andrei-isvoran96.github.io',
  base: BASE,
  output: 'static',
  integrations: [react(), mdx({ remarkPlugins: [[remarkBaseLinks, BASE]] })],

  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
