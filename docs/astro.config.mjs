import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://connect.vinkius.com',
  // Fully static output (SSG) for S3 + CloudFront.
  output: 'static',
  // Canonical extensionless URLs. CloudFront rewrites them to route/index.html.
  trailingSlash: 'never',
  build: { format: 'directory' },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: 'Vinkius Connect Docs',
      description: 'User-scoped connectors and executable capabilities for AI applications.',
      components: {
        Header: './src/components/Header.astro',
        Head: './src/components/Head.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        Footer: './src/components/Footer.astro',
        PageTitle: './src/components/PageTitle.astro',
        LanguageSelect: './src/components/LanguagePopover.astro',
        ThemeSelect: './src/components/ThemeToggle.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
      },
      pagefind: true,
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/VinkiusAI/connect' },
      ],
      customCss: ['./src/styles/tailwind.css', './src/styles/custom.css'],
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        pt: { label: 'Português', lang: 'pt-BR' },
        es: { label: 'Español', lang: 'es' },
        fr: { label: 'Français', lang: 'fr' },
      },
      sidebar: [
        {
          label: 'Build with Connect',
          translations: { 'pt-BR': 'Construa com Connect', es: 'Construye con Connect', fr: 'Construisez avec Connect' },
          items: [
            {
              label: 'Overview',
              translations: { 'pt-BR': 'Visão geral', es: 'Descripción general', fr: 'Vue d’ensemble' },
              slug: 'getting-started/introduction',
            },
            {
              label: 'Install the SDK',
              translations: { 'pt-BR': 'Instale o SDK', es: 'Instala el SDK', fr: 'Installez le SDK' },
              slug: 'getting-started/installation',
            },
            {
              label: 'Quickstart',
              translations: { 'pt-BR': 'Início rápido', es: 'Inicio rápido', fr: 'Démarrage rapide' },
              slug: '',
            },
          ],
        },
        {
          label: 'User connections',
          translations: { 'pt-BR': 'Conexões de usuários', es: 'Conexiones de usuario', fr: 'Connexions utilisateur' },
          items: [
            {
              label: 'Connectors',
              translations: { 'pt-BR': 'Conectores', es: 'Conectores', fr: 'Connecteurs' },
              slug: 'concepts/connectors',
            },
            {
              label: 'Capabilities',
              translations: { 'pt-BR': 'Capacidades', es: 'Capacidades', fr: 'Capacités' },
              slug: 'concepts/capabilities',
            },
            {
              label: 'Credentials',
              translations: { 'pt-BR': 'Credenciais', es: 'Credenciales', fr: 'Identifiants' },
              slug: 'concepts/authentication',
            },
          ],
        },
        {
          label: 'AI adapters',
          translations: { 'pt-BR': 'Adapters de IA', es: 'Adapters de IA', fr: 'Adaptateurs IA' },
          items: [
            {
              label: 'Adapter overview',
              translations: { 'pt-BR': 'Visão geral dos adapters', es: 'Descripción de los adapters', fr: 'Vue d’ensemble des adaptateurs' },
              slug: 'adapters/overview',
            },
            { label: 'OpenAI', slug: 'adapters/openai' },
            { label: 'OpenAI Agents', slug: 'adapters/openai-agents' },
            { label: 'Anthropic', slug: 'adapters/anthropic' },
            { label: 'Vercel AI SDK', slug: 'adapters/ai-sdk' },
            { label: 'Google Gemini', slug: 'adapters/gemini' },
            { label: 'LangChain', slug: 'adapters/langchain' },
            { label: 'LlamaIndex', slug: 'adapters/llamaindex' },
            { label: 'Workers AI', slug: 'adapters/workers-ai' },
            {
              label: 'JSON Schema and custom runtimes',
              translations: {
                'pt-BR': 'JSON Schema e runtimes customizados',
                es: 'JSON Schema y runtimes personalizados',
                fr: 'JSON Schema et runtimes personnalisés',
              },
              slug: 'adapters/json-schema',
            },
          ],
        },
        {
          label: 'Application patterns',
          translations: { 'pt-BR': 'Padrões de aplicação', es: 'Patrones de aplicación', fr: 'Modèles d’application' },
          items: [
            {
              label: 'Core recipes',
              translations: { 'pt-BR': 'Receitas essenciais', es: 'Recetas esenciales', fr: 'Recettes essentielles' },
              slug: 'guides/recipes',
            },
            {
              label: 'Multi-tenant isolation',
              translations: { 'pt-BR': 'Isolamento multi-tenant', es: 'Aislamiento multi-tenant', fr: 'Isolation multi-tenant' },
              slug: 'guides/multi-tenant',
            },
            {
              label: 'Error handling',
              translations: { 'pt-BR': 'Tratamento de erros', es: 'Gestión de errores', fr: 'Gestion des erreurs' },
              slug: 'guides/error-handling',
            },
            {
              label: 'Troubleshooting',
              translations: { 'pt-BR': 'Solução de problemas', es: 'Solución de problemas', fr: 'Résolution des problèmes' },
              slug: 'guides/troubleshooting',
            },
            {
              label: 'TypeScript patterns',
              translations: { 'pt-BR': 'Padrões TypeScript', es: 'Patrones TypeScript', fr: 'Modèles TypeScript' },
              slug: 'guides/typescript',
            },
          ],
        },
        {
          label: 'SDK reference',
          translations: { 'pt-BR': 'Referência do SDK', es: 'Referencia del SDK', fr: 'Référence du SDK' },
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
      head: [
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=JetBrains+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700;800&display=swap',
          },
        },
      ],
      lastUpdated: true,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
    }),
  ],
});
