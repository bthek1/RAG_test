---
name: frontend
description: "Use for frontend-only React/TypeScript tasks: components, hooks, routes, stores, schemas, API calls, tests, and styling. Restricts tool use to frontend/ and docs/."
tools: read_file, replace_string_in_file, multi_replace_string_in_file, create_file, run_in_terminal, grep_search, file_search, semantic_search, get_errors
---

# Frontend Agent

Focused on `frontend/src/` only. See [`.github/copilot-instructions.md`](../copilot-instructions.md) for full conventions.

## Key Facts

- **Run dev server:** `just fe-dev` → `http://localhost:5174`
- **Run tests:** `just fe-test` | single: `cd frontend && npm test -- <file>`
- **Lint:** `just fe-lint`
- **Build:** `just fe-build`
- **Add shadcn/ui component:** `npx shadcn@latest add <component>` — never modify generated files

## Directory Map

```
src/
├── api/          # client.ts (Axios + JWT interceptor), queryKeys.ts, per-domain modules
├── components/
│   ├── ui/       # shadcn/ui (never modify directly)
│   └── charts/   # PlotlyChart.tsx wrapper (lazy-loaded)
├── hooks/        # Business logic extracted from components
├── routes/       # TanStack Router file-based routes
├── schemas/      # Zod validation schemas (one file per domain)
├── store/        # Zustand stores (one file per concern)
├── types/        # TypeScript types from API contracts
└── lib/          # cn(), date.ts wrappers
```

## Critical Patterns

```ts
// All API calls through src/api/client.ts — never fetch/axios directly
import { apiClient } from "@/api/client";

// Always @/ alias — never relative cross-directory imports
import { cn } from "@/lib/utils";

// Server state = TanStack Query; UI/global state = Zustand
// NEVER put API response data in Zustand stores

// Zustand always uses immer middleware
import { immer } from "zustand/middleware/immer";

// Tailwind v4 — no tailwind.config.js, config is CSS-first in src/index.css
```

## State Rules

| Data type             | Where                                      |
| --------------------- | ------------------------------------------ |
| API / server data     | TanStack Query (`useQuery`, `useMutation`) |
| Global UI state       | Zustand store in `src/store/`              |
| Local component state | `useState` / `useReducer`                  |

## Do Not

- Use class components
- Import `date-fns` directly in components — use `src/lib/date.ts` wrappers
- Use `plotly.js` directly — always `src/components/charts/PlotlyChart.tsx`
- Modify files in `src/components/ui/` (shadcn/ui generated)
- Use `any` in TypeScript
- Store server-fetched data in Zustand
- Use relative `../../` imports across feature boundaries — use `@/`
