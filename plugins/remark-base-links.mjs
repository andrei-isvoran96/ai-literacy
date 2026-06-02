// Prefix root-absolute markdown links (e.g. /lessons/foo) with the site base so
// cross-lesson links keep working when the site is served under a sub-path
// (GitHub Pages project site: /ai-literacy/). Applied to MDX via astro.config.
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  if (Array.isArray(node.children)) for (const child of node.children) walk(child, fn);
}

export function remarkBaseLinks(base = '') {
  const prefix = base.replace(/\/$/, '');
  return (tree) => {
    if (!prefix) return;
    walk(tree, (node) => {
      if (
        node.type === 'link' &&
        typeof node.url === 'string' &&
        node.url.startsWith('/') &&
        !node.url.startsWith('//') &&
        !node.url.startsWith(`${prefix}/`)
      ) {
        node.url = prefix + node.url;
      }
    });
  };
}
