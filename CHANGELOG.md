# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-08-12

First public release of `@vinkius/connect`.

### Added

- **Fluent API** — `Vinkius`, `UserContext`, `Connector`, `CredentialsHandle`,
  `Capability`, `CapabilitySet`. Three nouns: users → connectors → capabilities.
- **Low-level resource clients** — `CatalogClient`, `AppUsersClient`,
  `ConnectionsClient`, `CredentialsClient`, `ExecutionClient`.
- **9 framework adapters** (zero-dependency subpath exports):
  - `./openai` — OpenAI chat completions
  - `./openai-agents` — OpenAI Agents SDK (`@openai/agents`)
  - `./anthropic` — Anthropic Messages API
  - `./gemini` — Google Gemini (`@google/genai`)
  - `./ai-sdk` — Vercel AI SDK
  - `./langchain` — LangChain.js
  - `./llamaindex` — LlamaIndex.TS
  - `./workers-ai` — Cloudflare Workers AI
  - `./json-schema` — neutral JSON Schema (any provider / custom loops)
- **User-scoped by external_id** — no Vinkius user id to resolve, cache, or
  store. Every request carries the `vk_app_*` tenant binding.
- **Typed error hierarchy** — `AuthError`, `NotFoundError`, `ValidationError`,
  `RateLimitError`, `QuotaError`, `OverageError`, `ConnectorNotConnectedError`,
  `ConnectionError`, `ConfigError`.
- **Retry with full-jitter backoff** — idempotent requests retry on 429/5xx
  and network errors; honors `Retry-After`.
- **Secret redaction** — Authorization headers and credential-like fields are
  stripped before reaching observability hooks.
- **TTL resolver cache** — non-secret resolution data is cached in-process.
- **Dual ESM + CommonJS** build with bundled TypeScript declarations.
- **73 tests** across 14 test suites (core, fluent, resources, adapters).
- **GitHub Actions CI** — typecheck, build, and test on Node 18/20/22; Discord
  notifications on completion and changelog updates.

### Notes

- `user.capabilities()` and `capability.execute()` target the Vinkius Execution
  Plane. Ensure your Vinkius Cloud environment has it enabled. All other
  operations (users, connectors, credentials, catalog) work against the current
  API.

[0.1.0]: https://github.com/VinkiusAI/connect/releases/tag/v0.1.0
