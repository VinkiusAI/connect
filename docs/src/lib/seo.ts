export const SITE_URL = 'https://connect.vinkius.com';
export const SOCIAL_IMAGE_URL = `${SITE_URL}/og.png`;

const localized = {
  en: {
    docs: 'Vinkius Connect documentation',
    quickstart: 'Vinkius Connect Quick Start | TypeScript SDK Docs',
    adapter: (title: string) => `${title} Adapter for AI Agents | Vinkius Connect`,
    concept: (title: string) => `${title} Explained | Vinkius Connect SDK`,
    guide: (title: string) => `${title} Guide | Vinkius Connect SDK`,
    reference: (title: string) => `${title} API Reference | Vinkius Connect`,
    start: (title: string) => `${title} | Vinkius Connect TypeScript SDK`,
    fallback: (title: string) => `${title} | Vinkius Connect Docs`,
  },
  'pt-BR': {
    docs: 'Documentação do Vinkius Connect',
    quickstart: 'Início Rápido do Vinkius Connect | SDK TypeScript',
    adapter: (title: string) => `Adaptador ${title} para Agentes de IA | Vinkius Connect`,
    concept: (title: string) => `${title} Explicado | SDK Vinkius Connect`,
    guide: (title: string) => `Guia de ${title} | SDK Vinkius Connect`,
    reference: (title: string) => `${title} | Referência da API Vinkius Connect`,
    start: (title: string) => `${title} | SDK TypeScript Vinkius Connect`,
    fallback: (title: string) => `${title} | Documentação Vinkius Connect`,
  },
  es: {
    docs: 'Documentación de Vinkius Connect',
    quickstart: 'Inicio Rápido de Vinkius Connect | SDK TypeScript',
    adapter: (title: string) => `Adaptador ${title} para Agentes de IA | Vinkius Connect`,
    concept: (title: string) => `${title} Explicado | SDK Vinkius Connect`,
    guide: (title: string) => `Guía de ${title} | SDK Vinkius Connect`,
    reference: (title: string) => `${title} | Referencia API de Vinkius Connect`,
    start: (title: string) => `${title} | SDK TypeScript Vinkius Connect`,
    fallback: (title: string) => `${title} | Documentación Vinkius Connect`,
  },
  fr: {
    docs: 'Documentation Vinkius Connect',
    quickstart: 'Démarrage Rapide Vinkius Connect | SDK TypeScript',
    adapter: (title: string) => `Adaptateur ${title} pour Agents IA | Vinkius Connect`,
    concept: (title: string) => `${title} Expliqué | SDK Vinkius Connect`,
    guide: (title: string) => `Guide ${title} | SDK Vinkius Connect`,
    reference: (title: string) => `${title} | Référence API Vinkius Connect`,
    start: (title: string) => `${title} | SDK TypeScript Vinkius Connect`,
    fallback: (title: string) => `${title} | Documentation Vinkius Connect`,
  },
} as const;

export type SeoLocale = keyof typeof localized;

function localeFor(lang: string): SeoLocale {
  return lang in localized ? (lang as SeoLocale) : 'en';
}

function routeWithoutLocale(pathname: string) {
  return pathname.replace(/^\/(pt|es|fr)(?=\/|$)/, '') || '/';
}

export function buildSeoTitle(pageTitle: string, pathname: string, lang: string) {
  const labels = localized[localeFor(lang)];
  const route = routeWithoutLocale(pathname);
  if (route === '/') return labels.quickstart;
  if (route.startsWith('/adapters/')) return labels.adapter(pageTitle);
  if (route.startsWith('/concepts/')) return labels.concept(pageTitle);
  if (route.startsWith('/guides/')) return labels.guide(pageTitle);
  if (route.startsWith('/reference/')) return labels.reference(pageTitle);
  if (route.startsWith('/getting-started/')) return labels.start(pageTitle);
  return labels.fallback(pageTitle);
}

export function buildStructuredData(input: {
  canonical: string;
  description: string;
  lang: string;
  lastUpdated?: Date;
  pageTitle: string;
  pathname: string;
  seoTitle: string;
}) {
  const locale = localeFor(input.lang);
  const labels = localized[locale];
  const localePrefix = locale === 'pt-BR' ? '/pt' : locale === 'es' ? '/es' : locale === 'fr' ? '/fr' : '';
  const docsHome = `${SITE_URL}${localePrefix}`;
  const articleId = `${input.canonical}#tech-article`;
  const breadcrumbs: Array<{
    '@type': 'ListItem';
    position: number;
    name: string;
    item: string;
  }> = [
    {
      '@type': 'ListItem',
      position: 1,
      name: labels.docs,
      item: docsHome,
    },
  ];

  if (input.canonical !== docsHome && input.canonical !== `${docsHome}/`) {
    breadcrumbs.push({
      '@type': 'ListItem',
      position: 2,
      name: input.pageTitle,
      item: input.canonical,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://vinkius.com/#organization',
        name: 'Vinkius',
        url: 'https://vinkius.com',
        logo: {
          '@type': 'ImageObject',
          url: 'https://assets.vinkius.com/vk/logo-black-min.png',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'Vinkius Connect Docs',
        publisher: { '@id': 'https://vinkius.com/#organization' },
        inLanguage: ['en', 'pt-BR', 'es', 'fr'],
      },
      {
        '@type': 'TechArticle',
        '@id': articleId,
        headline: input.seoTitle,
        name: input.pageTitle,
        description: input.description,
        url: input.canonical,
        mainEntityOfPage: input.canonical,
        inLanguage: input.lang,
        image: SOCIAL_IMAGE_URL,
        author: { '@id': 'https://vinkius.com/#organization' },
        publisher: { '@id': 'https://vinkius.com/#organization' },
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: {
          '@type': 'SoftwareApplication',
          name: '@vinkius/connect',
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'Node.js',
          softwareRequirements: 'Node.js 18 or newer',
          url: SITE_URL,
        },
        audience: {
          '@type': 'Audience',
          audienceType: 'TypeScript and AI application developers',
        },
        proficiencyLevel: 'Beginner to advanced',
        ...(input.lastUpdated ? { dateModified: input.lastUpdated.toISOString() } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${input.canonical}#breadcrumbs`,
        itemListElement: breadcrumbs,
      },
    ],
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
