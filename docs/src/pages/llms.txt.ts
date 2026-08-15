import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_URL } from '../lib/seo';

export const prerender = true;

function pathFromId(id: string) {
  const clean = id
    .replace(/\.mdx?$/, '')
    .replace(/(^|\/)index$/, '')
    .replace(/\/$/, '');
  return clean ? `/${clean}` : '/';
}

function localeForPath(path: string) {
  if (path === '/pt' || path.startsWith('/pt/')) return 'Português';
  if (path === '/es' || path.startsWith('/es/')) return 'Español';
  if (path === '/fr' || path.startsWith('/fr/')) return 'Français';
  return 'English';
}

export const GET: APIRoute = async () => {
  const entries = (await getCollection('docs'))
    .filter((entry) => !entry.data.draft && entry.id !== '404')
    .map((entry) => {
      const path = pathFromId(entry.id);
      return {
        description: entry.data.description,
        locale: localeForPath(path),
        path,
        title: entry.data.title,
      };
    })
    .sort((a, b) => a.locale.localeCompare(b.locale) || a.path.localeCompare(b.path));

  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const group = groups.get(entry.locale) ?? [];
    group.push(entry);
    groups.set(entry.locale, group);
  }

  const sections = [...groups.entries()].map(([locale, pages]) => [
    `## ${locale}`,
    ...pages.map((page) => `- [${page.title}](${SITE_URL}${page.path}): ${page.description}`),
  ].join('\n'));

  const body = [
    '# Vinkius Connect Documentation',
    '',
    '> Official documentation for @vinkius/connect, the TypeScript SDK for resolving user-scoped connectors and adapting executable AI capabilities to OpenAI, Anthropic, Gemini, and other AI runtimes.',
    '',
    'Use these canonical pages for installation, architecture, authentication, adapters, API reference, error handling, and production integration guidance.',
    '',
    ...sections,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
