# Plan 15: UI kit (Agent O)

`@scholarcrew/ui` is the design system every screen is built from: the tokens in `design/mockups/source/styles.css`, the inline SVG icon set from `shell.js`, and React components ported from screens 01–08 (shell, cards, buttons, badges, chips, pills, toggles, progress, the gap bar, offer bars, kanban, tables, form fields, modal). Plans 16, 17, and 18 compose pages only from these parts. It implements **SE-05** for the UI surface (system font stack and inline SVG only: no font files, CDNs, remote images, or third-party scripts, enforced by a test) and supplies the building blocks for the screen features in WK, CR, SC, ES, CO, MO, AID, PR, IM, ME, FA, HL, PU, and AD.

Notes for the implementer:

- **Order.** This package imports `CrewRole`, `CREW_ROLES`, `CREW_NAMES`, and `JobStatus` from `@scholarcrew/domain`, so plan 02 must be committed before O2 starts. Section 7 runs 15 in phase 3, in parallel with 03, 04, and 05.
- **CSS Modules in tests.** `vitest.config.ts` leaves CSS unprocessed and sets `classNameStrategy: "non-scoped"`, so `styles.btn` is the string `"btn"` in tests. Tests assert class names, never computed styles.
- **Client boundaries.** Only `Toggle`, `OfferBars`, and `Modal` start with `"use client"` (they own handlers, state, or effects). Every other component is server-safe; pass `onClick`/`onChange` only from client components.
- **Accessibility rules carried from the mockups and the dataviz rules:** decorative icons are `aria-hidden`; status is always icon + text, never color alone; chart text stays in ink tokens; every chart has a text or table twin; bars are ≤24px with a 2px surface gap, a 4px rounded data end, and a square baseline.
- **Consumers** import `@scholarcrew/ui/tokens.css` once in `apps/web/src/app/layout.tsx` (plan 16) and components from `@scholarcrew/ui`.
- **Format step.** Step 4 of every task runs `pnpm exec biome check --write packages/ui` before `pnpm lint`, so import order and Biome's CSS/JSX formatting are applied to this package only.

## Files

Create:

- `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/vitest.config.ts`, `packages/ui/test/setup.ts`
- `packages/ui/src/css-modules.d.ts`
- `packages/ui/src/tokens.css`
- `packages/ui/src/crewColors.ts`
- `packages/ui/src/shared/cx.ts`, `packages/ui/src/shared/format.ts`, `packages/ui/src/shared/a11y.module.css`
- `packages/ui/src/index.ts`
- `packages/ui/src/components/<Name>/<Name>.tsx` and `<Name>.module.css` for each of: `Icon`, `CrewDot`, `Who`, `Button`, `Badge`, `StatusPill`, `Tag`, `Chip`, `Toggle`, `Card`, `Eyebrow`, `HeroNumber`, `Progress`, `EmptyState`, `GapBar`, `OfferBars`, `Table`, `Kanban`, `Field`, `TextInput`, `TextArea`, `Select`, `Modal`, `Topbar`, `AppShell`

Modify: none.

Test:

- `packages/ui/src/crewColors.test.ts`, `packages/ui/src/shared/format.test.ts`, `packages/ui/src/index.test.ts`, `packages/ui/src/assets.test.ts`
- `packages/ui/src/components/<Name>/<Name>.test.tsx` for each of the 25 components above

## Tasks

### O1: Package scaffold

- [ ] **Step 1: Create the package files**

`packages/ui/package.json`:

```json
{
  "name": "@scholarcrew/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": ["**/*.css"],
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./src/tokens.css"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scholarcrew/domain": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "jsdom": "^26.1.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/ui/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
```

`packages/ui/test/setup.ts`:

```ts
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

`packages/ui/src/css-modules.d.ts`:

```ts
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
```

- [ ] **Step 2: Install and see the package link**

Run: `pnpm install`
Expected: exit 0; `@scholarcrew/ui` is listed as a workspace project, `@scholarcrew/domain` is linked into `packages/ui/node_modules/@scholarcrew/domain`, and react 19.x, jsdom 26.x, @testing-library/react 16.x are installed.

- [ ] **Step 3: Typecheck the empty package**

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0, no output.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/package.json packages/ui/tsconfig.json packages/ui/vitest.config.ts packages/ui/test/setup.ts packages/ui/src/css-modules.d.ts
git commit -m "feat(ui): scaffold @scholarcrew/ui package"
```

### O2: Tokens, CREW_COLORS, shared helpers

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/crewColors.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CREW_ROLES } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { CREW_COLORS, CREW_DUTIES } from "./crewColors";

const tokens = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");

describe("CREW_COLORS", () => {
  it("has exactly the 8 crew roles in the fixed categorical order", () => {
    expect(Object.keys(CREW_COLORS)).toEqual([...CREW_ROLES]);
  });

  it("uses the validated palette from styles.css", () => {
    expect(CREW_COLORS).toEqual({
      compass: "#2a78d6",
      scout: "#eb6834",
      atlas: "#1baf7a",
      quill: "#eda100",
      aid: "#e87ba4",
      ledger: "#008300",
      prep: "#4a3aa7",
      impact: "#e34948",
    });
  });

  it("matches the --c-<role> tokens in tokens.css", () => {
    for (const role of CREW_ROLES) {
      expect(tokens).toMatch(new RegExp(`--c-${role}:\\s*${CREW_COLORS[role]};`, "i"));
    }
  });

  it("keeps the money series on palette slots 1 and 2", () => {
    expect(tokens).toMatch(/--free:\s*#2a78d6;/i);
    expect(tokens).toMatch(/--gap:\s*#eb6834;/i);
  });
});

describe("CREW_DUTIES", () => {
  it("has a short duty for every crew role", () => {
    expect(Object.keys(CREW_DUTIES)).toEqual([...CREW_ROLES]);
    expect(CREW_DUTIES.compass).toBe("coordinator");
    expect(CREW_DUTIES.ledger).toBe("money math");
  });
});
```

`packages/ui/src/shared/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pct, usd, usdCompact } from "./format";

describe("usd", () => {
  it("formats whole dollars with thousands commas", () => {
    expect(usd(18600)).toBe("$18,600");
    expect(usd(0)).toBe("$0");
    expect(usd(9200.4)).toBe("$9,200");
  });
});

describe("usdCompact", () => {
  it("formats axis ticks", () => {
    expect(usdCompact(0)).toBe("$0");
    expect(usdCompact(500)).toBe("$500");
    expect(usdCompact(20000)).toBe("$20k");
    expect(usdCompact(12500)).toBe("$12.5k");
  });
});

describe("pct", () => {
  it("rounds a share to one decimal", () => {
    expect(pct(18600, 27800)).toBe(66.9);
    expect(pct(9200, 27800)).toBe(33.1);
    expect(pct(18600, 80000)).toBe(23.3);
  });

  it("returns 0 for empty, zero, or negative inputs", () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(0, 100)).toBe(0);
    expect(pct(-5, 100)).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/ui test src/crewColors src/shared`
Expected: FAIL, 2 files, with `Failed to resolve import "./crewColors" from "src/crewColors.test.ts". Does the file exist?` and `Failed to resolve import "./format" from "src/shared/format.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/ui/src/tokens.css` (same values as the mockup `:root`; hex written lowercase, which is Biome's CSS format):

```css
/* ScholarCrew design tokens, ported from design/mockups/source/styles.css.
   Crew and money colors are the validated categorical palette, in fixed order.
   System fonts only: no font files and no remote assets (SE-05). */
:root {
  --page: #f4f2ec;
  --rail: #faf8f4;
  --card: #ffffff;
  --wash: #f7f6f2;
  --ink: #14202f;
  --ink-2: #3b4555;
  --muted: #636b78;
  --faint: #8c929c;
  --line: #e5e1d7;
  --line-2: #efece6;
  --navy: #1e3a5f;
  --navy-soft: #e9eef5;
  --navy-line: #cbd6e6;
  /* crew identity: categorical slots 1-8, in order */
  --c-compass: #2a78d6;
  --c-scout: #eb6834;
  --c-atlas: #1baf7a;
  --c-quill: #eda100;
  --c-aid: #e87ba4;
  --c-ledger: #008300;
  --c-prep: #4a3aa7;
  --c-impact: #e34948;
  /* money series */
  --free: #2a78d6;
  --gap: #eb6834;
  /* status: always paired with an icon and a label */
  --good: #0ca30c;
  --good-text: #006300;
  --good-soft: #eaf5ea;
  --warn-text: #7a5200;
  --warn-icon: #b07800;
  --warn-soft: #fdf4e1;
  --crit: #d03b3b;
  --crit-text: #9e2424;
  --crit-soft: #fceded;
  --r: 14px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  min-height: 100%;
  background: var(--page);
}

body {
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--navy);
  text-decoration: none;
  font-weight: 600;
}

b,
strong {
  font-weight: 650;
}

ul {
  list-style: none;
}

h1 {
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -0.015em;
  font-weight: 700;
}

h2 {
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: -0.01em;
  font-weight: 700;
}

h3 {
  font-size: 15px;
  font-weight: 650;
}

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}

:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

`packages/ui/src/crewColors.ts`:

```ts
import type { CrewRole } from "@scholarcrew/domain";

/** Validated categorical palette from design/mockups/source/styles.css, in the fixed crew order. */
export const CREW_COLORS: Record<CrewRole, string> = {
  compass: "#2a78d6",
  scout: "#eb6834",
  atlas: "#1baf7a",
  quill: "#eda100",
  aid: "#e87ba4",
  ledger: "#008300",
  prep: "#4a3aa7",
  impact: "#e34948",
};

/** Short duty shown beside each crew member in the sidebar roster. */
export const CREW_DUTIES: Record<CrewRole, string> = {
  compass: "coordinator",
  scout: "scholarships",
  atlas: "admissions",
  quill: "essays",
  aid: "financial aid",
  ledger: "money math",
  prep: "tests",
  impact: "service",
};
```

`packages/ui/src/shared/cx.ts`:

```ts
/** Joins truthy class names with a space. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

`packages/ui/src/shared/format.ts`:

```ts
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Whole US dollars: 18600 → "$18,600". Same output as apps/web usd(). */
export function usd(n: number): string {
  return USD.format(Math.round(n));
}

/** Axis tick labels: 0 → "$0", 500 → "$500", 20000 → "$20k", 12500 → "$12.5k". */
export function usdCompact(n: number): string {
  if (Math.abs(n) < 1000) return `$${Math.round(n)}`;
  return `$${Number((n / 1000).toFixed(1))}k`;
}

/** part / whole as a percentage rounded to one decimal; 0 when either side is not positive. */
export function pct(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  return Math.round((part * 1000) / whole) / 10;
}
```

`packages/ui/src/shared/a11y.module.css`:

```css
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/ui test src/crewColors src/shared`
Expected: PASS, `Test Files 2 passed (2)`, `Tests 9 passed (9)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/tokens.css packages/ui/src/crewColors.ts packages/ui/src/crewColors.test.ts packages/ui/src/shared
git commit -m "feat(ui): design tokens, CREW_COLORS, and format helpers"
```

### O3: Icon

- [ ] **Step 1: Write the failing test**

`packages/ui/src/components/Icon/Icon.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICON_NAMES, Icon } from "./Icon";

describe("Icon", () => {
  it("renders a decorative svg on the 24px grid", () => {
    const { container } = render(<Icon name="calendar" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("data-icon")).toBe("calendar");
    expect(svg?.children).toHaveLength(2);
  });

  it("has the full mockup icon set", () => {
    expect(ICON_NAMES).toEqual([
      "calendar",
      "chat",
      "award",
      "pen",
      "columns",
      "dollar",
      "users",
      "bookmark",
      "search",
      "bell",
      "check",
      "clock",
      "alert",
      "info",
      "arrow",
      "plus",
      "clip",
      "lock",
      "doc",
      "spin",
      "ext",
      "chev",
      "spark",
      "reuse",
    ]);
  });

  it("draws at least one shape for every name", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector("svg")?.childElementCount).toBeGreaterThan(0);
      unmount();
    }
  });

  it("keeps the spinner dash pattern", () => {
    const { container } = render(<Icon name="spin" />);
    expect(container.querySelector("circle")?.getAttribute("stroke-dasharray")).toBe("36 14");
  });

  it("merges a className", () => {
    const { container } = render(<Icon name="check" className="big" />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("icon")).toBe(true);
    expect(svg?.classList.contains("big")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/Icon`
Expected: FAIL with `Failed to resolve import "./Icon" from "src/components/Icon/Icon.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/Icon/Icon.tsx` (paths copied from `shell.js`):

```tsx
import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import styles from "./Icon.module.css";

export const ICON_NAMES = [
  "calendar",
  "chat",
  "award",
  "pen",
  "columns",
  "dollar",
  "users",
  "bookmark",
  "search",
  "bell",
  "check",
  "clock",
  "alert",
  "info",
  "arrow",
  "plus",
  "clip",
  "lock",
  "doc",
  "spin",
  "ext",
  "chev",
  "spark",
  "reuse",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const SHAPES: Record<IconName, ReactNode> = {
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M9 3.5v4M15 3.5v4" />
    </>
  ),
  chat: <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-8.5L6 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z" />,
  award: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M8.8 13.6 7.6 21l4.4-2.5 4.4 2.5-1.2-7.4" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l1.1-4.6L15.6 4.9a2.1 2.1 0 0 1 3 3L8.1 18.4z" />
      <path d="M13.6 6.9l3 3" />
    </>
  ),
  columns: (
    <>
      <path d="M3.5 9.5 12 4.5l8.5 5" />
      <path d="M5.5 10.5v7.5M10 10.5v7.5M14 10.5v7.5M18.5 10.5v7.5M3.5 20h17" />
    </>
  ),
  dollar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.7 9.3c-.5-.9-1.5-1.4-2.7-1.4-1.6 0-2.7.8-2.7 2s1 1.7 2.7 2.1 2.8.9 2.8 2.2-1.2 2.1-2.8 2.1c-1.3 0-2.3-.5-2.9-1.5M12 6.4v1.5M12 16.3v1.4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9.5" r="2.6" />
      <path d="M15.6 14.4A4.6 4.6 0 0 1 21 18.6" />
    </>
  ),
  bookmark: <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.2 21 19.5H3z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.1" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  clip: <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  doc: (
    <>
      <path d="M7 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 7 20z" />
      <path d="M14 3.5v5h5" />
    </>
  ),
  spin: <circle cx="12" cy="12" r="8" strokeDasharray="36 14" />,
  ext: (
    <>
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M18 14v5H5V6h5" />
    </>
  ),
  chev: <path d="m6 9 6 6 6-6" />,
  spark: <path d="M12 3.5 13.9 10l6.6 2-6.6 2L12 20.5 10.1 14l-6.6-2 6.6-2z" />,
  reuse: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  className?: string;
}

/** Decorative inline icon. Always aria-hidden: put meaning in the text beside it. */
export function Icon({ name, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      className={cx(styles.icon, className)}
    >
      {SHAPES[name]}
    </svg>
  );
}
```

`packages/ui/src/components/Icon/Icon.module.css`:

```css
.icon {
  width: 16px;
  height: 16px;
  flex: none;
}

.icon[data-icon="spin"] {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .icon[data-icon="spin"] {
    animation: none;
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/Icon`
Expected: PASS, `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Icon
git commit -m "feat(ui): inline SVG icon set from the mockups"
```

### O4: CrewDot and Who

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/components/CrewDot/CrewDot.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrewDot } from "./CrewDot";

describe("CrewDot", () => {
  it("is a decorative filled dot tagged with its role", () => {
    const { container } = render(<CrewDot role="scout" />);
    const dot = container.querySelector("span");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.getAttribute("data-role")).toBe("scout");
    expect(dot?.classList.contains("dot")).toBe(true);
    expect(dot?.style.backgroundColor).not.toBe("");
  });

  it("draws a hollow ring for switched-off members", () => {
    const { container } = render(<CrewDot role="prep" hollow />);
    const dot = container.querySelector("span");
    expect(dot?.classList.contains("hollow")).toBe(true);
    expect(dot?.style.backgroundColor).toBe("");
  });
});
```

`packages/ui/src/components/Who/Who.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Who } from "./Who";

describe("Who", () => {
  it("shows the crew name next to its dot", () => {
    const { container } = render(<Who role="quill" />);
    expect(screen.getByText("Quill")).toBeTruthy();
    expect(container.querySelector('[data-role="quill"]')).not.toBeNull();
  });

  it("supports the small size", () => {
    const { container } = render(<Who role="ledger" size="sm" />);
    expect(container.firstElementChild?.classList.contains("sm")).toBe(true);
    expect(container.firstElementChild?.textContent).toBe("Ledger");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/CrewDot src/components/Who`
Expected: FAIL, 2 files, with `Failed to resolve import "./CrewDot"` and `Failed to resolve import "./Who"`.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/CrewDot/CrewDot.tsx`:

```tsx
import type { CrewRole } from "@scholarcrew/domain";
import { CREW_COLORS } from "../../crewColors";
import { cx } from "../../shared/cx";
import styles from "./CrewDot.module.css";

export interface CrewDotProps {
  role: CrewRole;
  hollow?: boolean;
  className?: string;
}

/** 8px identity dot in the crew color. Decorative: the name always sits beside it. */
export function CrewDot({ role, hollow = false, className }: CrewDotProps) {
  const color = CREW_COLORS[role];
  return (
    <span
      aria-hidden="true"
      data-role={role}
      className={cx(styles.dot, hollow && styles.hollow, className)}
      style={hollow ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { backgroundColor: color }}
    />
  );
}
```

`packages/ui/src/components/CrewDot/CrewDot.module.css`:

```css
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.hollow {
  background: transparent;
}
```

`packages/ui/src/components/Who/Who.tsx`:

```tsx
import { CREW_NAMES, type CrewRole } from "@scholarcrew/domain";
import { cx } from "../../shared/cx";
import { CrewDot } from "../CrewDot/CrewDot";
import styles from "./Who.module.css";

export interface WhoProps {
  role: CrewRole;
  size?: "sm" | "md";
  className?: string;
}

/** Crew dot plus the member's name, e.g. "● Quill". */
export function Who({ role, size = "md", className }: WhoProps) {
  return (
    <span className={cx(styles.who, size === "sm" && styles.sm, className)}>
      <CrewDot role={role} />
      {CREW_NAMES[role]}
    </span>
  );
}
```

`packages/ui/src/components/Who/Who.module.css`:

```css
.who {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 650;
  color: var(--ink-2);
}

.sm {
  font-size: 12px;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/CrewDot src/components/Who`
Expected: PASS, `Test Files 2 passed (2)`, `Tests 4 passed (4)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/CrewDot packages/ui/src/components/Who
git commit -m "feat(ui): CrewDot and Who"
```

### O5: Button

- [ ] **Step 1: Write the failing test**

`packages/ui/src/components/Button/Button.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a link when href is set", () => {
    render(
      <Button variant="primary" href="/crew">
        Ask your crew
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Ask your crew" });
    expect(link.getAttribute("href")).toBe("/crew");
    expect(link.classList.contains("btn")).toBe(true);
    expect(link.classList.contains("primary")).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a type=button button by default", () => {
    render(<Button variant="line">New chat</Button>);
    expect(screen.getByRole("button", { name: "New chat" }).getAttribute("type")).toBe("button");
  });

  it("passes type through", () => {
    render(
      <Button variant="primary" type="submit">
        Save
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("submit");
  });

  it("calls onClick, but not when disabled", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button variant="soft" onClick={onClick}>
        Add
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button variant="soft" onClick={onClick} disabled>
        Add
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a disabled button instead of a link when disabled", () => {
    render(
      <Button variant="primary" href="/x" disabled>
        Go
      </Button>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect((screen.getByRole("button", { name: "Go" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders leading and trailing icons and the small size", () => {
    const { container } = render(
      <Button variant="white" size="sm" icon="plus" iconEnd="arrow">
        Open
      </Button>,
    );
    expect(container.querySelector('[data-icon="plus"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="arrow"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open" }).classList.contains("sm")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/Button`
Expected: FAIL with `Failed to resolve import "./Button" from "src/components/Button/Button.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/Button/Button.tsx`:

```tsx
import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "../../shared/cx";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./Button.module.css";

export interface ButtonProps {
  variant: "primary" | "soft" | "line" | "white" | "glass";
  size?: "sm" | "md";
  icon?: IconName;
  iconEnd?: IconName;
  href?: string;
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}

/** `href` renders a link styled as a button; otherwise a <button> (type defaults to "button"). */
export function Button({
  variant,
  size = "md",
  icon,
  iconEnd,
  href,
  type,
  onClick,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  children,
}: ButtonProps) {
  const classes = cx(styles.btn, styles[variant], size === "sm" && styles.sm, className);
  const content = (
    <>
      {icon ? <Icon name={icon} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} /> : null}
    </>
  );
  if (href !== undefined && !disabled) {
    return (
      <a href={href} className={classes} onClick={onClick} aria-label={ariaLabel}>
        {content}
      </a>
    );
  }
  return (
    <button type={type ?? "button"} className={classes} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {content}
    </button>
  );
}
```

`packages/ui/src/components/Button/Button.module.css`:

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
}

.btn svg {
  width: 15px;
  height: 15px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sm {
  height: 30px;
  padding: 0 11px;
}

.primary {
  background: var(--navy);
  color: #fff;
}

.soft {
  background: var(--navy-soft);
  color: var(--navy);
}

.line {
  background: var(--card);
  color: var(--ink);
  border: 1px solid var(--line);
}

.white {
  background: #fff;
  color: var(--navy);
}

.glass {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/Button`
Expected: PASS, `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Button
git commit -m "feat(ui): Button with link and button modes"
```

### O6: Badge, StatusPill, Tag

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/components/Badge/Badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("pairs status tones with a default icon", () => {
    const { container } = render(<Badge tone="good">Sources checked</Badge>);
    expect(screen.getByText("Sources checked").classList.contains("good")).toBe(true);
    expect(container.querySelector('[data-icon="check"]')).not.toBeNull();
  });

  it("uses the alert icon for warn and crit", () => {
    const { container } = render(
      <>
        <Badge tone="warn">Soon</Badge>
        <Badge tone="crit">Flagged</Badge>
      </>,
    );
    expect(container.querySelectorAll('[data-icon="alert"]')).toHaveLength(2);
  });

  it("lets the caller pick the icon", () => {
    const { container } = render(
      <Badge tone="warn" icon="clock">
        9 days
      </Badge>,
    );
    expect(container.querySelector('[data-icon="clock"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="alert"]')).toBeNull();
  });

  it("has no icon for neutral and navy by default", () => {
    const { container } = render(
      <>
        <Badge tone="neutral">Nov 20</Badge>
        <Badge tone="navy">Spring sample</Badge>
      </>,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Spring sample").classList.contains("navy")).toBe(true);
  });
});
```

`packages/ui/src/components/StatusPill/StatusPill.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "./StatusPill";

const CASES = [
  ["queued", "Queued", "clock", "neutral"],
  ["working", "Working", "spin", "navy"],
  ["ready", "Ready", "check", "good"],
  ["needs_input", "Needs you", "alert", "warn"],
  ["failed", "Failed", "alert", "crit"],
  ["on", "On", "check", "neutral"],
] as const;

describe("StatusPill", () => {
  for (const [status, label, icon, tone] of CASES) {
    it(`${status} shows text, an icon, and its tone`, () => {
      const { container } = render(<StatusPill status={status} />);
      const pill = screen.getByText(label);
      expect(pill.classList.contains("pill")).toBe(true);
      expect(pill.classList.contains(tone)).toBe(true);
      expect(container.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
    });
  }

  it("accepts a label override", () => {
    render(<StatusPill status="ready" label="Done" />);
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByText("Ready")).toBeNull();
  });
});
```

`packages/ui/src/components/Tag/Tag.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("renders a small rounded label", () => {
    render(<Tag>service</Tag>);
    expect(screen.getByText("service").classList.contains("tag")).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/Badge src/components/StatusPill src/components/Tag`
Expected: FAIL, 3 files, with `Failed to resolve import "./Badge"`, `Failed to resolve import "./StatusPill"`, and `Failed to resolve import "./Tag"`.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/Badge/Badge.tsx`:

```tsx
import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./Badge.module.css";

export type BadgeTone = "good" | "warn" | "crit" | "neutral" | "navy";

export interface BadgeProps {
  tone: BadgeTone;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}

// Status tones always carry an icon so state is never shown by color alone.
const DEFAULT_ICON: Partial<Record<BadgeTone, IconName>> = { good: "check", warn: "alert", crit: "alert" };

export function Badge({ tone, icon, className, children }: BadgeProps) {
  const name = icon ?? DEFAULT_ICON[tone];
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      {name ? <Icon name={name} /> : null}
      {children}
    </span>
  );
}
```

`packages/ui/src/components/Badge/Badge.module.css`:

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 650;
  white-space: nowrap;
}

.badge svg {
  width: 13px;
  height: 13px;
}

.good {
  background: var(--good-soft);
  color: var(--good-text);
}

.good svg {
  color: var(--good);
}

.warn {
  background: var(--warn-soft);
  color: var(--warn-text);
}

.warn svg {
  color: var(--warn-icon);
}

.crit {
  background: var(--crit-soft);
  color: var(--crit-text);
}

.crit svg {
  color: var(--crit);
}

.neutral {
  background: var(--wash);
  color: var(--ink-2);
  border: 1px solid var(--line);
}

.navy {
  background: var(--navy-soft);
  color: var(--navy);
}
```

`packages/ui/src/components/StatusPill/StatusPill.tsx`:

```tsx
import type { JobStatus } from "@scholarcrew/domain";
import { cx } from "../../shared/cx";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./StatusPill.module.css";

export type PillStatus = JobStatus | "on";

const PILL: Record<PillStatus, { label: string; icon: IconName; tone: "neutral" | "navy" | "good" | "warn" | "crit" }> = {
  queued: { label: "Queued", icon: "clock", tone: "neutral" },
  working: { label: "Working", icon: "spin", tone: "navy" },
  ready: { label: "Ready", icon: "check", tone: "good" },
  needs_input: { label: "Needs you", icon: "alert", tone: "warn" },
  failed: { label: "Failed", icon: "alert", tone: "crit" },
  on: { label: "On", icon: "check", tone: "neutral" },
};

export interface StatusPillProps {
  status: PillStatus;
  /** Replaces the default text, e.g. "Done" or "Not started" for family tasks. */
  label?: string;
  className?: string;
}

/** Job or task state as tone + icon + text. */
export function StatusPill({ status, label, className }: StatusPillProps) {
  const pill = PILL[status];
  return (
    <span className={cx(styles.pill, styles[pill.tone], className)}>
      <Icon name={pill.icon} />
      {label ?? pill.label}
    </span>
  );
}
```

`packages/ui/src/components/StatusPill/StatusPill.module.css`:

```css
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.pill svg {
  width: 12px;
  height: 12px;
}

.neutral {
  background: var(--wash);
  color: var(--ink-2);
  border: 1px solid var(--line);
}

.navy {
  background: var(--navy-soft);
  color: var(--navy);
}

.good {
  background: var(--good-soft);
  color: var(--good-text);
}

.good svg {
  color: var(--good);
}

.warn {
  background: var(--warn-soft);
  color: var(--warn-text);
}

.warn svg {
  color: var(--warn-icon);
}

.crit {
  background: var(--crit-soft);
  color: var(--crit-text);
}

.crit svg {
  color: var(--crit);
}
```

`packages/ui/src/components/Tag/Tag.tsx`:

```tsx
import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import styles from "./Tag.module.css";

export interface TagProps {
  className?: string;
  children: ReactNode;
}

/** Story theme or similar short label. */
export function Tag({ className, children }: TagProps) {
  return <span className={cx(styles.tag, className)}>{children}</span>;
}
```

`packages/ui/src/components/Tag/Tag.module.css`:

```css
.tag {
  display: inline-block;
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--wash);
  font-size: 11px;
  color: var(--ink-2);
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/Badge src/components/StatusPill src/components/Tag`
Expected: PASS, `Test Files 3 passed (3)`, `Tests 12 passed (12)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Badge packages/ui/src/components/StatusPill packages/ui/src/components/Tag
git commit -m "feat(ui): Badge, StatusPill, and Tag"
```

### O7: Chip and Toggle

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/components/Chip/Chip.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders static text when not clickable", () => {
    render(<Chip>Local</Chip>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Local").classList.contains("chip")).toBe(true);
  });

  it("is a toggle button with aria-pressed when clickable", () => {
    const onClick = vi.fn();
    render(
      <Chip active onClick={onClick}>
        Matched to you
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "Matched to you" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.classList.contains("on")).toBe(true);
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows a crew dot", () => {
    const { container } = render(<Chip dot="scout">@Scout new matches</Chip>);
    expect(container.querySelector('[data-role="scout"]')).not.toBeNull();
  });
});
```

`packages/ui/src/components/Toggle/Toggle.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("is a switch named by its label", () => {
    render(<Toggle checked={false} onChange={vi.fn()} label="Crew chats" />);
    const sw = screen.getByRole("switch", { name: "Crew chats" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.classList.contains("on")).toBe(false);
  });

  it("reflects checked", () => {
    render(<Toggle checked onChange={vi.fn()} label="College list" />);
    const sw = screen.getByRole("switch", { name: "College list" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.classList.contains("on")).toBe(true);
  });

  it("calls onChange with the next value on click", () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} label="Story Bank" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("toggles with Space and Enter, not other keys", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Religion" />);
    const sw = screen.getByRole("switch");
    fireEvent.keyDown(sw, { key: " " });
    fireEvent.keyDown(sw, { key: "Enter" });
    fireEvent.keyDown(sw, { key: "a" });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, true);
  });

  it("does nothing when disabled", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Disability" disabled />);
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    fireEvent.keyDown(sw, { key: " " });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("describes the switch with its detail text", () => {
    render(
      <Toggle checked onChange={vi.fn()} label="Household income range" detail="$60k–75k · shared by Dana" />,
    );
    const sw = screen.getByRole("switch", { name: "Household income range" });
    const detailId = sw.getAttribute("aria-describedby");
    expect(detailId).toBeTruthy();
    expect(document.getElementById(detailId ?? "")?.textContent).toBe("$60k–75k · shared by Dana");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/Chip src/components/Toggle`
Expected: FAIL, 2 files, with `Failed to resolve import "./Chip"` and `Failed to resolve import "./Toggle"`.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/Chip/Chip.tsx`:

```tsx
import type { CrewRole } from "@scholarcrew/domain";
import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import { CrewDot } from "../CrewDot/CrewDot";
import styles from "./Chip.module.css";

export interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  dot?: CrewRole;
  className?: string;
  children: ReactNode;
}

/** Filter or suggestion pill. Clickable chips are toggle buttons (aria-pressed). */
export function Chip({ active = false, onClick, dot, className, children }: ChipProps) {
  const classes = cx(styles.chip, active && styles.on, className);
  const content = (
    <>
      {dot ? <CrewDot role={dot} /> : null}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={classes} aria-pressed={active} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <span className={classes}>{content}</span>;
}
```

`packages/ui/src/components/Chip/Chip.module.css`:

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
}

button.chip {
  cursor: pointer;
}

.on {
  border-color: var(--navy);
  background: var(--navy);
  color: #fff;
}
```

`packages/ui/src/components/Toggle/Toggle.tsx`:

```tsx
"use client";

import { type KeyboardEvent, useId } from "react";
import { cx } from "../../shared/cx";
import styles from "./Toggle.module.css";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Muted text before the switch, e.g. "$60k–75k · shared by Dana". */
  detail?: string;
  disabled?: boolean;
  className?: string;
}

/** A settings row: label, optional detail, and a role="switch" button. */
export function Toggle({ checked, onChange, label, detail, disabled = false, className }: ToggleProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const detailId = `${id}-detail`;
  const flip = () => {
    if (!disabled) onChange(!checked);
  };
  // Handle Space/Enter ourselves and cancel the native activation so a key press flips once.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      flip();
    }
  };
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " ") event.preventDefault();
  };
  return (
    <div className={cx(styles.row, className)}>
      <label id={labelId} htmlFor={id} className={styles.label}>
        {label}
      </label>
      {detail ? (
        <span id={detailId} className={styles.detail}>
          {detail}
        </span>
      ) : null}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={detail ? detailId : undefined}
        disabled={disabled}
        className={cx(styles.tog, checked && styles.on)}
        onClick={flip}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      />
    </div>
  );
}
```

`packages/ui/src/components/Toggle/Toggle.module.css`:

```css
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.label {
  flex: 1;
  cursor: pointer;
}

.detail {
  font-size: 12px;
  color: var(--muted);
}

.tog {
  position: relative;
  flex: none;
  width: 34px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: #d3d6dc;
  cursor: pointer;
}

.tog::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: left 0.15s;
}

.on {
  background: var(--navy);
}

.on::after {
  left: 16px;
}

.tog:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/Chip src/components/Toggle`
Expected: PASS, `Test Files 2 passed (2)`, `Tests 9 passed (9)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors. If Biome reports `lint/a11y/useSemanticElements` on the switch button, put `{/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA switch pattern on a native button */}` on the line above `<button` and re-run.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Chip packages/ui/src/components/Toggle
git commit -m "feat(ui): Chip and keyboard-accessible Toggle"
```

### O8: Card, Eyebrow, HeroNumber, Progress, EmptyState

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/components/Card/Card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
  it("renders a string title as a heading with an aside", () => {
    render(
      <Card title="This week" aside={<span>1 done</span>}>
        Body
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "This week" })).toBeTruthy();
    expect(screen.getByText("1 done")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("uses md padding by default and lg on request", () => {
    const { container, rerender } = render(<Card>x</Card>);
    expect(container.firstElementChild?.classList.contains("md")).toBe(true);
    rerender(<Card padding="lg">x</Card>);
    expect(container.firstElementChild?.classList.contains("lg")).toBe(true);
  });

  it("renders a node title as given", () => {
    render(<Card title={<span>Year-1 gap</span>}>x</Card>);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Year-1 gap")).toBeTruthy();
  });
});
```

`packages/ui/src/components/Eyebrow/Eyebrow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Eyebrow } from "./Eyebrow";

describe("Eyebrow", () => {
  it("renders a small uppercase label", () => {
    render(<Eyebrow>Prompt</Eyebrow>);
    expect(screen.getByText("Prompt").classList.contains("eyebrow")).toBe(true);
  });
});
```

`packages/ui/src/components/HeroNumber/HeroNumber.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroNumber } from "./HeroNumber";

describe("HeroNumber", () => {
  it("shows the value and caption", () => {
    render(<HeroNumber value="$9,200" caption="left to pay, earn, or borrow · estimate" />);
    expect(screen.getByText("$9,200").classList.contains("num")).toBe(true);
    expect(screen.getByText("left to pay, earn, or borrow · estimate")).toBeTruthy();
  });
});
```

`packages/ui/src/components/Progress/Progress.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress } from "./Progress";

describe("Progress", () => {
  it("maps 0..1 to a labelled progressbar", () => {
    render(<Progress value={0.6} label="Checklist 3 of 5" />);
    const bar = screen.getByRole("progressbar", { name: "Checklist 3 of 5" });
    expect(bar.getAttribute("value")).toBe("60");
    expect(bar.getAttribute("max")).toBe("100");
  });

  it("clamps values outside 0..1", () => {
    const { rerender } = render(<Progress value={1.7} label="p" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("100");
    rerender(<Progress value={-0.2} label="p" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("0");
  });

  it("treats NaN as 0", () => {
    render(<Progress value={Number.NaN} label="p" />);
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("0");
  });
});
```

`packages/ui/src/components/EmptyState/EmptyState.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("shows a title, description, and action", () => {
    render(
      <EmptyState title="No matches yet" action={<a href="/crew">Ask Scout</a>}>
        Scout looks every Sunday.
      </EmptyState>,
    );
    expect(screen.getByText("No matches yet")).toBeTruthy();
    expect(screen.getByText("Scout looks every Sunday.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ask Scout" }).getAttribute("href")).toBe("/crew");
  });

  it("renders an optional icon", () => {
    const { container } = render(<EmptyState title="Nothing here" icon="bookmark" />);
    expect(container.querySelector('[data-icon="bookmark"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/Card src/components/Eyebrow src/components/HeroNumber src/components/Progress src/components/EmptyState`
Expected: FAIL, 5 files, each with `Failed to resolve import "./<Name>"`.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/Card/Card.tsx`:

```tsx
import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import styles from "./Card.module.css";

export interface CardProps {
  title?: ReactNode;
  aside?: ReactNode;
  padding?: "md" | "lg";
  className?: string;
  children?: ReactNode;
}

/** White rounded panel. A string title becomes an h2 styled as the mockup card heading. */
export function Card({ title, aside, padding = "md", className, children }: CardProps) {
  const hasHead = title !== undefined || aside !== undefined;
  return (
    <section className={cx(styles.card, styles[padding], className)}>
      {hasHead ? (
        <div className={styles.head}>
          {typeof title === "string" ? <h2 className={styles.title}>{title}</h2> : (title ?? <span />)}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}
```

`packages/ui/src/components/Card/Card.module.css`:

```css
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.md {
  padding: 18px 20px;
}

.lg {
  padding: 22px 26px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.head > svg {
  color: var(--muted);
}

.title {
  font-size: 15px;
  line-height: 1.45;
  letter-spacing: 0;
  font-weight: 650;
}
```

`packages/ui/src/components/Eyebrow/Eyebrow.tsx`:

```tsx
import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import styles from "./Eyebrow.module.css";

export interface EyebrowProps {
  className?: string;
  children: ReactNode;
}

/** Small uppercase kicker above a card's content, often with a Who inside. */
export function Eyebrow({ className, children }: EyebrowProps) {
  return <div className={cx(styles.eyebrow, className)}>{children}</div>;
}
```

`packages/ui/src/components/Eyebrow/Eyebrow.module.css`:

```css
.eyebrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
```

`packages/ui/src/components/HeroNumber/HeroNumber.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./HeroNumber.module.css";

export interface HeroNumberProps {
  value: string;
  caption?: ReactNode;
  className?: string;
}

/** The one large figure a card leads with. Proportional digits, 52px, same sans as the body. */
export function HeroNumber({ value, caption, className }: HeroNumberProps) {
  return (
    <div className={className}>
      <p className={styles.num}>{value}</p>
      {caption ? <p className={styles.cap}>{caption}</p> : null}
    </div>
  );
}
```

`packages/ui/src/components/HeroNumber/HeroNumber.module.css`:

```css
.num {
  margin-top: 2px;
  font-size: 52px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.cap {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
}
```

`packages/ui/src/components/Progress/Progress.tsx`:

```tsx
import { cx } from "../../shared/cx";
import styles from "./Progress.module.css";

export interface ProgressProps {
  /** 0..1; values outside are clamped, NaN is 0. */
  value: number;
  label?: string;
  className?: string;
}

/** Thin navy meter on a lighter navy track (native <progress>). */
export function Progress({ value, label, className }: ProgressProps) {
  const percent = Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value)) * 100) : 0;
  return (
    <progress className={cx(styles.progress, className)} value={percent} max={100} aria-label={label}>
      {percent}%
    </progress>
  );
}
```

`packages/ui/src/components/Progress/Progress.module.css`:

```css
.progress {
  display: block;
  width: 100%;
  height: 6px;
  border: 0;
  border-radius: 3px;
  background: var(--navy-soft);
  overflow: hidden;
  appearance: none;
}

.progress::-webkit-progress-bar {
  background: var(--navy-soft);
}

.progress::-webkit-progress-value {
  background: var(--navy);
  border-radius: 0 3px 3px 0;
}

.progress::-moz-progress-bar {
  background: var(--navy);
  border-radius: 0 3px 3px 0;
}
```

`packages/ui/src/components/EmptyState/EmptyState.tsx`:

```tsx
import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: string;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Dashed placeholder for empty lists and kanban columns. */
export function EmptyState({ title, icon, action, className, children }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, className)}>
      {icon ? <Icon name={icon} className={styles.icon} /> : null}
      <p className={styles.title}>{title}</p>
      {children ? <div>{children}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
```

`packages/ui/src/components/EmptyState/EmptyState.module.css`:

```css
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 18px 14px;
  border: 1.5px dashed #d6d1c5;
  border-radius: 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--muted);
}

.empty .icon {
  width: 20px;
  height: 20px;
  color: var(--faint);
}

.title {
  font-size: 13.5px;
  font-weight: 650;
  color: var(--ink-2);
}

.action {
  margin-top: 6px;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/Card src/components/Eyebrow src/components/HeroNumber src/components/Progress src/components/EmptyState`
Expected: PASS, `Test Files 5 passed (5)`, `Tests 10 passed (10)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Card packages/ui/src/components/Eyebrow packages/ui/src/components/HeroNumber packages/ui/src/components/Progress packages/ui/src/components/EmptyState
git commit -m "feat(ui): Card, Eyebrow, HeroNumber, Progress, EmptyState"
```

### O9: GapBar

The year-1 gap bar from screen 01: free money (blue) then the gap (orange), widths as shares of free + gap, a 2px surface gap between segments, a 4px rounded data end, square at the baseline, 16px tall. The legend carries swatches and values in ink. The bar and legend are `aria-hidden`; a visually hidden sentence carries the same numbers.

- [ ] **Step 1: Write the failing test**

`packages/ui/src/components/GapBar/GapBar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GapBar } from "./GapBar";

function seg(container: HTMLElement, series: "free" | "gap") {
  return container.querySelector<HTMLElement>(`[data-series="${series}"]`);
}

describe("GapBar", () => {
  it("sizes segments as shares of free + gap", () => {
    const { container } = render(<GapBar freeUsd={18600} gapUsd={9200} />);
    expect(seg(container, "free")?.style.width).toBe("66.9%");
    expect(seg(container, "gap")?.style.width).toBe("33.1%");
    expect(seg(container, "gap")?.classList.contains("cap")).toBe(true);
    expect(seg(container, "free")?.classList.contains("cap")).toBe(false);
  });

  it("hides the bar from assistive tech and gives a text summary", () => {
    const { container } = render(<GapBar freeUsd={18600} gapUsd={9200} />);
    expect(container.querySelector(".bar")?.getAttribute("aria-hidden")).toBe("true");
    const summary = screen.getByText("Free money $18,600 (66.9%), Gap $9,200 (33.1%), of $27,800 to attend.");
    expect(summary.classList.contains("srOnly")).toBe(true);
  });

  it("shows legend values in ink with custom labels", () => {
    render(<GapBar freeUsd={24400} gapUsd={6800} freeLabel="Grants" gapLabel="You pay" totalLabel="this year" />);
    expect(screen.getByText("$24,400").tagName).toBe("B");
    expect(screen.getByText("$6,800").tagName).toBe("B");
    expect(screen.getByText("of $31,200 this year")).toBeTruthy();
  });

  it("rounds the free segment when there is no gap", () => {
    const { container } = render(<GapBar freeUsd={5000} gapUsd={0} />);
    expect(seg(container, "free")?.style.width).toBe("100%");
    expect(seg(container, "free")?.classList.contains("cap")).toBe(true);
    expect(seg(container, "gap")).toBeNull();
  });

  it("draws nothing for zero or negative amounts but still summarizes", () => {
    const { container } = render(<GapBar freeUsd={-50} gapUsd={0} />);
    expect(container.querySelectorAll("[data-series]")).toHaveLength(0);
    expect(screen.getByText("Free money $0 (0%), Gap $0 (0%), of $0 to attend.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/GapBar`
Expected: FAIL with `Failed to resolve import "./GapBar" from "src/components/GapBar/GapBar.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/GapBar/GapBar.tsx`:

```tsx
import a11y from "../../shared/a11y.module.css";
import { cx } from "../../shared/cx";
import { pct, usd } from "../../shared/format";
import styles from "./GapBar.module.css";

export interface GapBarProps {
  freeUsd: number;
  gapUsd: number;
  freeLabel?: string;
  gapLabel?: string;
  /** Words after the total in the legend: "of $27,800 to attend". */
  totalLabel?: string;
  className?: string;
}

/** Two-segment bar (free money, then the gap) with a legend and a text twin. */
export function GapBar({
  freeUsd,
  gapUsd,
  freeLabel = "Free money",
  gapLabel = "Gap",
  totalLabel = "to attend",
  className,
}: GapBarProps) {
  const free = Math.max(0, freeUsd);
  const gap = Math.max(0, gapUsd);
  const total = free + gap;
  const freePct = pct(free, total);
  const gapPct = pct(gap, total);
  const summary = `${freeLabel} ${usd(free)} (${freePct}%), ${gapLabel} ${usd(gap)} (${gapPct}%), of ${usd(total)} ${totalLabel}.`;
  return (
    <div className={className}>
      <div className={styles.bar} aria-hidden="true">
        {free > 0 ? (
          <span
            data-series="free"
            className={cx(styles.seg, styles.free, gap === 0 && styles.cap)}
            style={{ width: `${freePct}%` }}
          />
        ) : null}
        {gap > 0 ? (
          <span data-series="gap" className={cx(styles.seg, styles.gap, styles.cap)} style={{ width: `${gapPct}%` }} />
        ) : null}
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <span className={cx(styles.sw, styles.free)} />
          {freeLabel} <b>{usd(free)}</b>
        </span>
        <span>
          <span className={cx(styles.sw, styles.gap)} />
          {gapLabel} <b>{usd(gap)}</b>
        </span>
        <span className={styles.total}>
          of {usd(total)} {totalLabel}
        </span>
      </div>
      <p className={a11y.srOnly}>{summary}</p>
    </div>
  );
}
```

`packages/ui/src/components/GapBar/GapBar.module.css`:

```css
.bar {
  display: flex;
  gap: 2px;
  height: 16px;
  margin: 16px 0 10px;
}

.seg {
  display: block;
  flex: 0 1 auto;
  min-width: 0;
  height: 100%;
}

.free {
  background: var(--free);
}

.gap {
  background: var(--gap);
}

/* 4px rounded data end; the baseline end stays square */
.cap {
  border-radius: 0 4px 4px 0;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  font-size: 12.5px;
  color: var(--ink-2);
}

.legend b {
  color: var(--ink);
}

.sw {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 3px;
  vertical-align: -1px;
}

.total {
  color: var(--muted);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/GapBar`
Expected: PASS, `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/GapBar
git commit -m "feat(ui): GapBar with legend and text twin"
```

### O10: OfferBars

Screen 06's year-1 chart: one row per school with a label and sub-line, a horizontal bar of free money (blue) then real cost (orange) on a shared axis `0..axisMaxUsd`, gridlines and ticks every quarter, and an end label in ink. Segments are 20px tall, separated by the 2px surface gap, rounded only at the data end. Hovering a row's bar shows a tooltip with both values (values first, labels second, line keys). The plot is `aria-hidden`; a visually hidden table holds every value.

- [ ] **Step 1: Write the failing test**

`packages/ui/src/components/OfferBars/OfferBars.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type OfferBarRow, OfferBars } from "./OfferBars";

const ROWS: OfferBarRow[] = [
  {
    label: "State U",
    sub: "$27,800 to attend",
    freeUsd: 18600,
    costUsd: 9200,
    endLabel: (
      <>
        <b>$9,200</b> really costs you
      </>
    ),
  },
  {
    label: "Riverside College",
    sub: "$31,200 to attend",
    freeUsd: 24400,
    costUsd: 6800,
    endLabel: (
      <>
        <b>$6,800</b> this year
      </>
    ),
  },
  { label: "Northgate University", sub: "$68,400 to attend", freeUsd: 55600, costUsd: 12800, endLabel: <b>$12,800</b> },
];

function seg(container: HTMLElement, row: string, series: "free" | "cost") {
  return container.querySelector<HTMLElement>(`[data-row="${row}"] [data-series="${series}"]`);
}

describe("OfferBars", () => {
  it("sizes segments against the shared axis max", () => {
    const { container } = render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    expect(seg(container, "State U", "free")?.style.width).toBe("23.3%");
    expect(seg(container, "State U", "cost")?.style.width).toBe("11.5%");
    expect(seg(container, "Riverside College", "free")?.style.width).toBe("30.5%");
    expect(seg(container, "Riverside College", "cost")?.style.width).toBe("8.5%");
    expect(seg(container, "Northgate University", "free")?.style.width).toBe("69.5%");
    expect(seg(container, "Northgate University", "cost")?.style.width).toBe("16%");
    expect(seg(container, "State U", "cost")?.classList.contains("cap")).toBe(true);
    expect(seg(container, "State U", "free")?.classList.contains("cap")).toBe(false);
  });

  it("draws ticks every quarter of the axis", () => {
    const { container } = render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    const ticks = Array.from(container.querySelectorAll(".axis span")).map((t) => t.textContent);
    expect(ticks).toEqual(["$0", "$20k", "$40k", "$60k", "$80k"]);
  });

  it("shows row labels, end labels, and a two-entry legend", () => {
    const { container } = render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    expect(screen.getByText("$27,800 to attend")).toBeTruthy();
    expect(screen.getByText("really costs you")).toBeTruthy();
    const legend = container.querySelector(".legend");
    expect(legend?.textContent).toBe("Free money (grants + scholarships)Really costs you (pay, earn, or borrow)");
    expect(legend?.querySelectorAll(".sw")).toHaveLength(2);
  });

  it("has a table twin with every value", () => {
    render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    const table = screen.getByRole("table", { name: "Year 1 free money and cost by school" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["School", "Free money (grants + scholarships)", "Really costs you (pay, earn, or borrow)"]);
    const row = within(table).getByRole("row", { name: /State U/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["$18,600", "$9,200"]);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });

  it("caps a bar that runs past the axis", () => {
    const rows: OfferBarRow[] = [{ label: "Big", sub: "", freeUsd: 70000, costUsd: 20000, endLabel: "$20,000" }];
    const { container } = render(<OfferBars rows={rows} axisMaxUsd={80000} />);
    expect(seg(container, "Big", "free")?.style.width).toBe("87.5%");
    expect(seg(container, "Big", "cost")?.style.width).toBe("12.5%");
  });

  it("shows a value tooltip on hover and hides it on leave", () => {
    const { container } = render(<OfferBars rows={ROWS} axisMaxUsd={80000} />);
    const track = container.querySelector<HTMLElement>('[data-row="State U"]');
    if (!track) throw new Error("missing State U track");
    fireEvent.pointerEnter(track);
    const tip = container.querySelector(".tip");
    expect(tip?.textContent).toContain("$18,600");
    expect(tip?.textContent).toContain("$9,200");
    fireEvent.pointerLeave(track);
    expect(container.querySelector(".tip")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/OfferBars`
Expected: FAIL with `Failed to resolve import "./OfferBars" from "src/components/OfferBars/OfferBars.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/OfferBars/OfferBars.tsx`:

```tsx
"use client";

import { Fragment, type ReactNode, useState } from "react";
import a11y from "../../shared/a11y.module.css";
import { cx } from "../../shared/cx";
import { pct, usd, usdCompact } from "../../shared/format";
import styles from "./OfferBars.module.css";

export interface OfferBarRow {
  label: string;
  sub: string;
  freeUsd: number;
  costUsd: number;
  endLabel: ReactNode;
}

export interface OfferBarsProps {
  rows: OfferBarRow[];
  axisMaxUsd: number;
  freeLabel?: string;
  costLabel?: string;
  caption?: string;
  categoryLabel?: string;
  className?: string;
}

const QUARTERS = [0, 1, 2, 3, 4];

/** Horizontal free-vs-cost bars on one shared axis, with a legend, hover tooltips, and a table twin. */
export function OfferBars({
  rows,
  axisMaxUsd,
  freeLabel = "Free money (grants + scholarships)",
  costLabel = "Really costs you (pay, earn, or borrow)",
  caption = "Year 1 free money and cost by school",
  categoryLabel = "School",
  className,
}: OfferBarsProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const axisMax =
    axisMaxUsd > 0
      ? axisMaxUsd
      : Math.max(1, ...rows.map((r) => Math.max(0, r.freeUsd) + Math.max(0, r.costUsd)));
  const ticks = QUARTERS.map((q) => ({ value: (axisMax * q) / 4, left: `${q * 25}%` }));
  const bars = rows.map((row) => {
    const free = Math.max(0, row.freeUsd);
    const cost = Math.max(0, row.costUsd);
    const freePct = Math.min(100, pct(free, axisMax));
    const costPct = Math.min(100 - freePct, pct(cost, axisMax));
    return { row, free, cost, freePct, costPct };
  });
  return (
    <figure className={cx(styles.offerBars, className)}>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <span className={cx(styles.sw, styles.free)} />
          {freeLabel}
        </span>
        <span>
          <span className={cx(styles.sw, styles.cost)} />
          {costLabel}
        </span>
      </div>
      <div
        className={styles.plot}
        style={{ gridTemplateRows: `repeat(${rows.length}, 46px) 22px` }}
        aria-hidden="true"
      >
        <div className={styles.grid} style={{ gridRow: `1 / ${rows.length + 1}` }}>
          {ticks.map((tick) => (
            <span key={tick.left} className={cx(styles.gl, tick.value === 0 && styles.base)} style={{ left: tick.left }} />
          ))}
        </div>
        {bars.map(({ row, free, cost, freePct, costPct }, index) => (
          <Fragment key={row.label}>
            <div className={styles.lab} style={{ gridRow: index + 1 }}>
              {row.label}
              <span>{row.sub}</span>
            </div>
            <div
              data-row={row.label}
              className={cx(styles.track, hovered === row.label && styles.active)}
              style={{ gridRow: index + 1 }}
              onPointerEnter={() => setHovered(row.label)}
              onPointerLeave={() => setHovered(null)}
            >
              {free > 0 ? (
                <span
                  data-series="free"
                  className={cx(styles.s, styles.free, cost === 0 && styles.cap)}
                  style={{ width: `${freePct}%` }}
                />
              ) : null}
              {cost > 0 ? (
                <span data-series="cost" className={cx(styles.s, styles.cost, styles.cap)} style={{ width: `${costPct}%` }} />
              ) : null}
              <span className={styles.endLabel}>{row.endLabel}</span>
              {hovered === row.label ? (
                <span className={styles.tip}>
                  <span>
                    <span className={cx(styles.key, styles.free)} />
                    <b>{usd(free)}</b> {freeLabel}
                  </span>
                  <span>
                    <span className={cx(styles.key, styles.cost)} />
                    <b>{usd(cost)}</b> {costLabel}
                  </span>
                </span>
              ) : null}
            </div>
          </Fragment>
        ))}
        <div className={styles.axis} style={{ gridRow: rows.length + 1 }}>
          {ticks.map((tick) => (
            <span key={tick.left} style={{ left: tick.left }}>
              {usdCompact(tick.value)}
            </span>
          ))}
        </div>
      </div>
      <table className={a11y.srOnly}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{categoryLabel}</th>
            <th scope="col">{freeLabel}</th>
            <th scope="col">{costLabel}</th>
          </tr>
        </thead>
        <tbody>
          {bars.map(({ row, free, cost }) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{usd(free)}</td>
              <td>{usd(cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
```

`packages/ui/src/components/OfferBars/OfferBars.module.css`:

```css
.offerBars {
  margin: 0;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-bottom: 10px;
  font-size: 12.5px;
  color: var(--ink-2);
}

.sw {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 3px;
  vertical-align: -1px;
}

.free {
  background: var(--free);
}

.cost {
  background: var(--gap);
}

/* columns: row label, axis span, room for end labels past the longest bar */
.plot {
  position: relative;
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) 240px;
  column-gap: 14px;
}

.lab {
  grid-column: 1;
  align-self: center;
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.25;
}

.lab span {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
}

.grid {
  grid-column: 2;
  position: relative;
  pointer-events: none;
}

.gl {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #ece9e2;
}

.base {
  background: #c9c7be;
}

.track {
  grid-column: 2;
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
}

.s {
  flex: none;
  height: 20px;
}

/* 4px rounded data end; the baseline end stays square */
.cap {
  border-radius: 0 4px 4px 0;
}

.active .s {
  filter: brightness(1.08);
}

.endLabel {
  flex: none;
  margin-left: 8px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--ink-2);
}

.endLabel b {
  color: var(--ink);
}

.tip {
  position: absolute;
  left: 0;
  bottom: calc(100% - 6px);
  z-index: 2;
  display: grid;
  gap: 2px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  box-shadow: 0 4px 12px rgba(20, 32, 47, 0.12);
  font-size: 12px;
  color: var(--ink-2);
  white-space: nowrap;
}

.tip b {
  color: var(--ink);
}

.key {
  display: inline-block;
  width: 10px;
  height: 2px;
  margin-right: 6px;
  vertical-align: middle;
}

.axis {
  grid-column: 2;
  position: relative;
  border-top: 1px solid #c9c7be;
}

.axis span {
  position: absolute;
  top: 5px;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 700px) {
  .plot {
    grid-template-columns: 110px minmax(0, 1fr) 120px;
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/OfferBars`
Expected: PASS, `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/OfferBars
git commit -m "feat(ui): OfferBars chart with tooltip and table twin"
```

### O11: Table and Kanban

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/components/Table/Table.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table } from "./Table";

interface School {
  id: string;
  name: string;
  deadline: string;
  gapUsd: number;
}

const ROWS: School[] = [
  { id: "1", name: "State U", deadline: "Nov 1", gapUsd: 9200 },
  { id: "2", name: "Bay Tech", deadline: "Nov 15", gapUsd: 11900 },
];

describe("Table", () => {
  it("renders headers and plain cell values by key", () => {
    render(
      <Table
        columns={[
          { key: "name", header: "School" },
          { key: "deadline", header: "Deadline" },
        ]}
        rows={ROWS}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["School", "Deadline"]);
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["State U", "Nov 1", "Bay Tech", "Nov 15"]);
  });

  it("uses render functions and right alignment", () => {
    render(
      <Table
        columns={[
          { key: "name", header: "School" },
          { key: "gap", header: "Gap / yr", align: "right", render: (r) => `$${r.gapUsd.toLocaleString("en-US")}` },
        ]}
        rows={ROWS}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Gap / yr" }).classList.contains("r")).toBe(true);
    expect(screen.getByRole("cell", { name: "$9,200" }).classList.contains("r")).toBe(true);
  });

  it("names the table with a caption and marks the selected row", () => {
    render(
      <Table
        caption="Your colleges"
        columns={[{ key: "name", header: "School" }]}
        rows={ROWS}
        rowKey={(r) => r.id}
        selectedKey="1"
      />,
    );
    const rows = within(screen.getByRole("table", { name: "Your colleges" })).getAllByRole("row");
    expect(rows[1]?.classList.contains("sel")).toBe(true);
    expect(rows[2]?.classList.contains("sel")).toBe(false);
  });

  it("works without rowKey and leaves non-text values empty", () => {
    render(
      <Table
        columns={[
          { key: "name", header: "School" },
          { key: "missing", header: "X" },
        ]}
        rows={ROWS}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getAllByRole("cell")[1]?.textContent).toBe("");
  });
});
```

`packages/ui/src/components/Kanban/Kanban.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kanban } from "./Kanban";

describe("Kanban", () => {
  it("renders a named region per column with its count and cards", () => {
    render(
      <Kanban
        columns={[
          { key: "matched", title: "Matched", count: 4, children: <p>Lone Star Credit Union Award</p> },
          { key: "won", title: "Won", count: 1, children: <p>Maple Library Essay Prize</p> },
        ]}
      />,
    );
    const matched = screen.getByRole("region", { name: "Matched 4" });
    expect(within(matched).getByText("Lone Star Credit Union Award")).toBeTruthy();
    expect(within(matched).queryByText("Maple Library Essay Prize")).toBeNull();
    expect(screen.getByRole("region", { name: "Won 1" })).toBeTruthy();
  });

  it("shows column titles as level-2 headings", () => {
    render(<Kanban columns={[{ key: "submitted", title: "Submitted", count: 2, children: null }]} />);
    expect(screen.getByRole("heading", { level: 2, name: "Submitted 2" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/Table src/components/Kanban`
Expected: FAIL, 2 files, with `Failed to resolve import "./Table"` and `Failed to resolve import "./Kanban"`.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/Table/Table.tsx`:

```tsx
import type { ReactNode } from "react";
import a11y from "../../shared/a11y.module.css";
import { cx } from "../../shared/cx";
import styles from "./Table.module.css";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** Cell content; without it the cell shows row[key] when that is a string or number. */
  render?: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey?: (row: T) => string;
  selectedKey?: string;
  caption?: string;
  className?: string;
}

function cellValue<T>(row: T, key: string): ReactNode {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? value : null;
}

/** Data table in the mockup style: uppercase muted headers, hairline rows, tabular right-aligned numbers. */
export function Table<T extends object>({ columns, rows, rowKey, selectedKey, caption, className }: TableProps<T>) {
  const keyed = rows.map((row, position) => ({ row, rowId: rowKey ? rowKey(row) : `row-${position}` }));
  return (
    <table className={cx(styles.table, className)}>
      {caption ? <caption className={a11y.srOnly}>{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className={column.align === "right" ? styles.r : undefined}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {keyed.map(({ row, rowId }) => (
          <tr key={rowId} className={rowId === selectedKey ? styles.sel : undefined}>
            {columns.map((column) => (
              <td key={column.key} className={column.align === "right" ? styles.r : undefined}>
                {column.render ? column.render(row) : cellValue(row, column.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`packages/ui/src/components/Table/Table.module.css`:

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.table th {
  padding: 0 12px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted);
}

.table td {
  padding: 10px 12px;
  border-top: 1px solid var(--line-2);
  vertical-align: middle;
}

.table .r {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.sel td {
  background: var(--navy-soft);
}

.sel td:first-child {
  box-shadow: inset 3px 0 0 var(--navy);
}
```

`packages/ui/src/components/Kanban/Kanban.tsx`:

```tsx
import { type ReactNode, useId } from "react";
import { cx } from "../../shared/cx";
import styles from "./Kanban.module.css";

export interface KanbanColumn {
  key: string;
  title: string;
  count: number;
  children: ReactNode;
}

export interface KanbanProps {
  columns: KanbanColumn[];
  className?: string;
}

/** Board of columns; each column is a region named "<title> <count>". */
export function Kanban({ columns, className }: KanbanProps) {
  const baseId = useId();
  return (
    <div className={cx(styles.kanban, className)}>
      {columns.map((column) => {
        const headingId = `${baseId}-${column.key}`;
        return (
          <section key={column.key} className={styles.col} aria-labelledby={headingId}>
            <h2 id={headingId} className={styles.head}>
              {column.title} <span className={styles.count}>{column.count}</span>
            </h2>
            {column.children}
          </section>
        );
      })}
    </div>
  );
}
```

`packages/ui/src/components/Kanban/Kanban.module.css`:

```css
.kanban {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(220px, 1fr);
  gap: 16px;
  align-items: start;
  overflow-x: auto;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  background: #eeebe3;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
  font-size: 13px;
  line-height: 1.45;
  letter-spacing: 0;
  font-weight: 700;
}

.count {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/Table src/components/Kanban`
Expected: PASS, `Test Files 2 passed (2)`, `Tests 6 passed (6)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Table packages/ui/src/components/Kanban
git commit -m "feat(ui): Table and Kanban"
```

### O12: Field, TextInput, TextArea, Select

`Field` owns the label, hint, and error and links them to the control with `useId` (`htmlFor`, `aria-describedby`, `aria-invalid`). Errors show an icon and text. `TextInput`, `TextArea`, and `Select` wrap `Field`; use `Field` directly only for custom controls inside client components (its child is a render function).

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/components/Field/Field.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";

describe("Field", () => {
  it("associates the label with the control it renders", () => {
    render(<Field label="Nickname">{(control) => <input {...control} />}</Field>);
    expect(screen.getByLabelText("Nickname").tagName).toBe("INPUT");
  });

  it("links hint and error and marks the control invalid", () => {
    render(
      <Field label="Email" hint="We send a sign-in link." error="Enter a valid email.">
        {(control) => <input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "We send a sign-in link.",
      "Enter a valid email.",
    ]);
  });

  it("leaves a valid control without describedby or invalid", () => {
    render(<Field label="City">{(control) => <input {...control} />}</Field>);
    const input = screen.getByLabelText("City");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});
```

`packages/ui/src/components/TextInput/TextInput.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("renders a labelled text input", () => {
    render(<TextInput label="Email" name="email" placeholder="you@example.com" />);
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.name).toBe("email");
    expect(input.placeholder).toBe("you@example.com");
  });

  it("passes type and change events through", () => {
    const onChange = vi.fn();
    render(<TextInput label="Email" type="email" onChange={onChange} />);
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.type).toBe("email");
    fireEvent.change(input, { target: { value: "a@b.co" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("shows an error", () => {
    render(<TextInput label="ZIP" error="Use 5 digits." />);
    const input = screen.getByLabelText("ZIP");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.classList.contains("invalid")).toBe(true);
    expect(screen.getByText("Use 5 digits.")).toBeTruthy();
  });
});
```

`packages/ui/src/components/TextArea/TextArea.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextArea } from "./TextArea";

describe("TextArea", () => {
  it("renders a labelled textarea with 4 rows by default", () => {
    render(<TextArea label="Story" />);
    const area = screen.getByLabelText("Story") as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.rows).toBe(4);
  });

  it("links the hint and respects rows", () => {
    render(<TextArea label="Story" hint="A few sentences is enough." rows={6} />);
    const area = screen.getByLabelText("Story") as HTMLTextAreaElement;
    expect(area.rows).toBe(6);
    expect(document.getElementById(area.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "A few sentences is enough.",
    );
  });
});
```

`packages/ui/src/components/Select/Select.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

const OPTIONS = [
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

describe("Select", () => {
  it("renders a labelled select with options", () => {
    render(<Select label="Control" options={OPTIONS} />);
    const select = screen.getByLabelText("Control") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Public", "Private"]);
  });

  it("adds a placeholder option and reports changes", () => {
    const onChange = vi.fn();
    render(<Select label="Control" options={OPTIONS} placeholder="Any" defaultValue="" onChange={onChange} />);
    const select = screen.getByLabelText("Control") as HTMLSelectElement;
    expect(select.options[0]?.textContent).toBe("Any");
    fireEvent.change(select, { target: { value: "private" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(select.value).toBe("private");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/Field src/components/TextInput src/components/TextArea src/components/Select`
Expected: FAIL, 4 files, each with `Failed to resolve import "./<Name>"`.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/Field/Field.tsx`:

```tsx
import { type ReactNode, useId } from "react";
import { cx } from "../../shared/cx";
import { Icon } from "../Icon/Icon";
import styles from "./Field.module.css";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  /** Spread the props onto the control so the label, hint, and error are linked to it. */
  children: (control: FieldControlProps) => ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ");
  const control: FieldControlProps = {
    id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : undefined,
  };
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children(control)}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          <Icon name="alert" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`packages/ui/src/components/Field/Field.module.css`:

```css
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
}

.hint {
  font-size: 12px;
  color: var(--muted);
}

.error {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--crit-text);
}

.error svg {
  width: 13px;
  height: 13px;
  color: var(--crit);
}
```

`packages/ui/src/components/TextInput/TextInput.tsx`:

```tsx
import type { InputHTMLAttributes } from "react";
import { cx } from "../../shared/cx";
import { Field } from "../Field/Field";
import styles from "./TextInput.module.css";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
}

export function TextInput({ label, hint, error, className, type = "text", ...rest }: TextInputProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(control) => <input {...rest} {...control} type={type} className={cx(styles.input, error && styles.invalid)} />}
    </Field>
  );
}
```

`packages/ui/src/components/TextInput/TextInput.module.css`:

```css
.input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card);
  font: inherit;
  font-size: 13.5px;
  color: var(--ink);
}

.input::placeholder {
  color: var(--faint);
}

.input:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 1px;
}

.invalid {
  border-color: var(--crit);
}
```

`packages/ui/src/components/TextArea/TextArea.tsx`:

```tsx
import type { TextareaHTMLAttributes } from "react";
import { cx } from "../../shared/cx";
import { Field } from "../Field/Field";
import styles from "./TextArea.module.css";

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className"> {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
}

export function TextArea({ label, hint, error, className, rows = 4, ...rest }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <textarea {...rest} {...control} rows={rows} className={cx(styles.textarea, error && styles.invalid)} />
      )}
    </Field>
  );
}
```

`packages/ui/src/components/TextArea/TextArea.module.css`:

```css
.textarea {
  width: 100%;
  min-height: 96px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card);
  font: inherit;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--ink);
  resize: vertical;
}

.textarea::placeholder {
  color: var(--faint);
}

.textarea:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 1px;
}

.invalid {
  border-color: var(--crit);
}
```

`packages/ui/src/components/Select/Select.tsx`:

```tsx
import type { SelectHTMLAttributes } from "react";
import { cx } from "../../shared/cx";
import { Field } from "../Field/Field";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className" | "children"> {
  label: string;
  options: SelectOption[];
  /** Adds a first option with value "". */
  placeholder?: string;
  hint?: string;
  error?: string;
  className?: string;
}

export function Select({ label, options, placeholder, hint, error, className, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <select {...rest} {...control} className={cx(styles.select, error && styles.invalid)}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
```

`packages/ui/src/components/Select/Select.module.css`:

```css
.select {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card);
  font: inherit;
  font-size: 13.5px;
  color: var(--ink);
}

.select:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 1px;
}

.invalid {
  border-color: var(--crit);
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/Field src/components/TextInput src/components/TextArea src/components/Select`
Expected: PASS, `Test Files 4 passed (4)`, `Tests 10 passed (10)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Field packages/ui/src/components/TextInput packages/ui/src/components/TextArea packages/ui/src/components/Select
git commit -m "feat(ui): labelled form fields"
```

### O13: Modal

- [ ] **Step 1: Write the failing test**

`packages/ui/src/components/Modal/Modal.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextInput } from "../TextInput/TextInput";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} title="Add a story" onClose={vi.fn()}>
        Body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a labelled modal dialog element", () => {
    render(
      <Modal open title="Add a story" onClose={vi.fn()}>
        Body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Add a story" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("closes on Escape only", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Add a story" onClose={onClose}>
        Body
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the first focusable element in its content", () => {
    render(
      <Modal open title="Add a story" onClose={vi.fn()}>
        <TextInput label="Title" />
        <TextInput label="Themes" />
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Title"));
  });

  it("falls back to the close button, which closes", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Heads up" onClose={onClose}>
        <p>Nothing to fill in.</p>
      </Modal>,
    );
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to where it was when closed", () => {
    const ui = (open: boolean) => (
      <>
        <button type="button">Open</button>
        <Modal open={open} title="T" onClose={vi.fn()}>
          <TextInput label="Name" />
        </Modal>
      </>
    );
    const { rerender } = render(ui(false));
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    rerender(ui(true));
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
    rerender(ui(false));
    expect(document.activeElement).toBe(opener);
  });

  it("Tab from the last control wraps to the close button", () => {
    render(
      <Modal open title="Add a story" onClose={vi.fn()} footer={<button type="button">Save</button>}>
        <TextInput label="Title" />
      </Modal>,
    );
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("Shift+Tab from the close button wraps to the last control", () => {
    const onClose = vi.fn();
    render(
      <>
        <Modal open title="Other" onClose={onClose}>
          <p>Behind.</p>
        </Modal>
        <Modal open title="Add a story" onClose={vi.fn()} footer={<button type="button">Save</button>}>
          <TextInput label="Title" />
        </Modal>
      </>,
    );
    const story = screen.getByRole("dialog", { name: "Add a story" });
    const close = within(story).getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(within(story).getByRole("button", { name: "Save" }));
    // Escape only closes the dialog that holds focus
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/Modal`
Expected: FAIL with `Failed to resolve import "./Modal" from "src/components/Modal/Modal.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/Modal/Modal.tsx`:

```tsx
"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { Icon } from "../Icon/Icon";
import styles from "./Modal.module.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * <dialog open aria-modal="true"> over a backdrop. On open, focus moves to the first focusable element
 * in the content (else the close button) and returns to the opener on close. Tab and Shift+Tab wrap
 * inside the dialog, and Escape closes it only while focus is inside, so stacked modals close one at a time.
 */
export function Modal({ open, title, onClose, footer, children }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? closeRef.current;
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const inside = dialog.contains(document.activeElement);
      if (event.key === "Escape") {
        if (!inside) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !inside) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const head = items[0];
      const tail = items[items.length - 1];
      if (!head || !tail) return;
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={styles.backdrop}>
      <dialog ref={dialogRef} open aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button ref={closeRef} type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <Icon name="plus" className={styles.x} />
          </button>
        </div>
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
        {footer ? <div className={styles.foot}>{footer}</div> : null}
      </dialog>
    </div>
  );
}
```

`packages/ui/src/components/Modal/Modal.module.css`:

```css
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 32, 47, 0.4);
}

.dialog {
  position: static;
  width: min(520px, 100%);
  max-height: calc(100vh - 48px);
  margin: 0;
  padding: 0;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--card);
  color: var(--ink);
  box-shadow: 0 12px 32px rgba(20, 32, 47, 0.18);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 0;
}

.title {
  font-size: 17px;
  line-height: 1.3;
  font-weight: 700;
}

.close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--card);
  color: var(--ink-2);
  cursor: pointer;
}

/* the icon set has no "x"; a plus turned 45 degrees */
.close .x {
  transform: rotate(45deg);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 20px 18px;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--line-2);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/Modal`
Expected: PASS, `Test Files 1 passed (1)`, `Tests 8 passed (8)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Modal
git commit -m "feat(ui): Modal dialog with focus trap, Escape, and focus return"
```

### O14: Topbar and AppShell

`AppShell` is the mockup frame: a 240px rail (brand, main nav with counts, "Your crew" roster, user card) and a main column holding the `topbar` slot and the page in `<main id="main">`. Nav items are plain links (`href`) with `aria-current="page"` on the active one. Switched-off crew members show a hollow dot and "add" (a link when `addHref` is set). Below 900px the rail stacks above the content and hides the roster and user card. With a `mobileNav` slot (16's phone tab bar), the rail hides entirely below 640px; `className` lands on the outer frame so consumers never select AppShell's inner DOM. `Topbar` renders the search form (GET, no script), the notifications link with an unread pip, and action children.

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/components/Topbar/Topbar.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Topbar } from "./Topbar";

describe("Topbar", () => {
  it("renders a GET search form", () => {
    const { container } = render(
      <Topbar search={{ action: "/scholarships", placeholder: "Search scholarships, schools, essays…" }} />,
    );
    const box = screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement;
    expect(box.name).toBe("q");
    expect(box.placeholder).toBe("Search scholarships, schools, essays…");
    const form = container.querySelector("form");
    expect(form?.getAttribute("action")).toBe("/scholarships");
    expect(form?.getAttribute("method")).toBe("get");
  });

  it("links to notifications with the unread count in its name", () => {
    const { container } = render(<Topbar notifications={{ href: "/settings#notifications", unread: 3 }} />);
    const link = screen.getByRole("link", { name: "Notifications, 3 unread" });
    expect(link.getAttribute("href")).toBe("/settings#notifications");
    expect(container.querySelector(".pip")).not.toBeNull();
  });

  it("drops the pip when nothing is unread", () => {
    const { container } = render(<Topbar notifications={{ href: "/n", unread: 0 }} />);
    expect(screen.getByRole("link", { name: "Notifications" })).toBeTruthy();
    expect(container.querySelector(".pip")).toBeNull();
  });

  it("renders actions inside the banner", () => {
    render(
      <Topbar>
        <a href="/crew">Ask your crew</a>
      </Topbar>,
    );
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Ask your crew" })).toBeTruthy();
  });
});
```

`packages/ui/src/components/AppShell/AppShell.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Topbar } from "../Topbar/Topbar";
import { AppShell, type CrewRosterItem, type NavItem } from "./AppShell";

const NAV: NavItem[] = [
  { key: "week", label: "This week", href: "/week", icon: "calendar" },
  { key: "scholarships", label: "Scholarships", href: "/scholarships", icon: "award", count: 9 },
  { key: "memory", label: "Memory", href: "/memory", icon: "bookmark", count: 0 },
];

const CREW: CrewRosterItem[] = [
  { role: "compass", enabled: true },
  { role: "scout", enabled: true, duty: "local scholarships" },
  { role: "prep", enabled: false, addHref: "/crew?add=prep" },
  { role: "impact", enabled: false },
];

function renderShell(activeKey = "scholarships") {
  return render(
    <AppShell
      nav={NAV}
      activeKey={activeKey}
      crew={CREW}
      user={{ name: "Jordan R.", subtitle: "Class of 2027 · Private" }}
      topbar={
        <Topbar>
          <a href="/crew">Ask your crew</a>
        </Topbar>
      }
    >
      <h1>Scholarships</h1>
    </AppShell>,
  );
}

describe("AppShell", () => {
  it("renders nav links with the active one marked", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/week", "/scholarships", "/memory"]);
    const active = within(nav).getByRole("link", { name: "Scholarships 9" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.classList.contains("on")).toBe(true);
    expect(within(nav).getByRole("link", { name: "This week" }).hasAttribute("aria-current")).toBe(false);
  });

  it("shows counts only when above zero", () => {
    renderShell();
    expect(screen.getByText("9").classList.contains("count")).toBe(true);
    expect(screen.getByRole("link", { name: "Memory" })).toBeTruthy();
  });

  it("moves aria-current with activeKey", () => {
    renderShell("week");
    expect(screen.getByRole("link", { name: "This week" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Scholarships 9" }).hasAttribute("aria-current")).toBe(false);
  });

  it("lists the crew with duties, and add for switched-off members", () => {
    const { container } = renderShell();
    expect(screen.getByText("coordinator")).toBeTruthy();
    expect(screen.getByText("local scholarships")).toBeTruthy();
    expect(screen.getByRole("link", { name: "add Prep" }).getAttribute("href")).toBe("/crew?add=prep");
    expect(screen.getByText("Impact").closest("li")?.classList.contains("off")).toBe(true);
    expect(container.querySelector('[data-role="prep"]')?.classList.contains("hollow")).toBe(true);
    expect(container.querySelector('[data-role="compass"]')?.classList.contains("hollow")).toBe(false);
  });

  it("renders the user card, skip link, topbar, and main content", () => {
    renderShell();
    expect(screen.getByText("Jordan R.")).toBeTruthy();
    expect(screen.getByText("Class of 2027 · Private")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main");
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Scholarships" })).toBeTruthy();
  });

  it("applies className to the frame and renders the phone nav slot", () => {
    const { container } = render(
      <AppShell
        nav={NAV}
        activeKey="week"
        crew={CREW}
        user={{ name: "Jordan R.", subtitle: "Student" }}
        topbar={<Topbar />}
        className="sc-shell"
        mobileNav={<nav aria-label="Main on phones">tabs</nav>}
      >
        <p>body</p>
      </AppShell>,
    );
    const frame = container.firstElementChild;
    expect(frame?.classList.contains("frame")).toBe(true);
    expect(frame?.classList.contains("sc-shell")).toBe(true);
    expect(frame?.classList.contains("withMobileNav")).toBe(true);
    expect(screen.getByRole("navigation", { name: "Main on phones" }).parentElement).toBe(frame);
  });

  it("leaves the frame plain without a phone nav", () => {
    const { container } = renderShell();
    expect(container.firstElementChild?.className).toBe("frame");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/ui test src/components/Topbar src/components/AppShell`
Expected: FAIL, 2 files, with `Failed to resolve import "./Topbar"` and `Failed to resolve import "../Topbar/Topbar"` (AppShell test).

- [ ] **Step 3: Write the implementation**

`packages/ui/src/components/Topbar/Topbar.tsx`:

```tsx
import type { ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import styles from "./Topbar.module.css";

export interface TopbarSearch {
  /** Page the GET form submits to, e.g. "/scholarships". */
  action: string;
  placeholder: string;
  name?: string;
  defaultValue?: string;
}

export interface TopbarProps {
  search?: TopbarSearch;
  notifications?: { href: string; unread: number };
  /** Right-side actions, e.g. <Button variant="primary" icon="chat" href="/crew">Ask your crew</Button>. */
  children?: ReactNode;
}

export function Topbar({ search, notifications, children }: TopbarProps) {
  const unread = notifications?.unread ?? 0;
  return (
    <header className={styles.topbar}>
      {search ? (
        <form action={search.action} method="get" className={styles.search}>
          <Icon name="search" />
          <input
            type="search"
            name={search.name ?? "q"}
            placeholder={search.placeholder}
            defaultValue={search.defaultValue}
            aria-label="Search"
            className={styles.searchInput}
          />
        </form>
      ) : null}
      <div className={styles.spacer} />
      {notifications ? (
        <a
          href={notifications.href}
          className={styles.iconBtn}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Icon name="bell" />
          {unread > 0 ? <span className={styles.pip} /> : null}
        </a>
      ) : null}
      {children}
    </header>
  );
}
```

`packages/ui/src/components/Topbar/Topbar.module.css`:

```css
.topbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  height: 60px;
  padding: 0 32px;
  border-bottom: 1px solid var(--line);
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 380px;
  max-width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card);
  color: var(--faint);
}

.search:focus-within {
  border-color: var(--navy);
}

.searchInput {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font-size: 13px;
  color: var(--ink);
  outline: none;
}

.searchInput::placeholder {
  color: var(--faint);
}

.spacer {
  flex: 1;
}

.iconBtn {
  position: relative;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card);
  color: var(--ink-2);
}

.iconBtn svg {
  width: 18px;
  height: 18px;
}

.pip {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 0 0 2px var(--card);
}

@media (max-width: 900px) {
  .topbar {
    padding: 0 16px;
  }

  .search {
    flex: 1;
    width: auto;
  }
}
```

`packages/ui/src/components/AppShell/AppShell.tsx`:

```tsx
import { CREW_NAMES, type CrewRole } from "@scholarcrew/domain";
import type { ReactNode } from "react";
import { CREW_DUTIES } from "../../crewColors";
import a11y from "../../shared/a11y.module.css";
import { cx } from "../../shared/cx";
import { CrewDot } from "../CrewDot/CrewDot";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./AppShell.module.css";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: IconName;
  /** Shown at the right when above zero. */
  count?: number;
}

export interface CrewRosterItem {
  role: CrewRole;
  enabled: boolean;
  /** Defaults to CREW_DUTIES[role]. */
  duty?: string;
  /** Where "add" links for a switched-off member. */
  addHref?: string;
}

export interface AppShellProps {
  nav: NavItem[];
  activeKey: string;
  crew: CrewRosterItem[];
  user: { name: string; subtitle: string };
  topbar: ReactNode;
  children: ReactNode;
  /** Extra class on the outer frame, e.g. "sc-shell". */
  className?: string;
  /**
   * Phone navigation (mockup 19), rendered after the main column. When set, the sidebar hides below
   * 640px and the content leaves 96px at the bottom for a fixed tab bar.
   */
  mobileNav?: ReactNode;
}

function RosterEnd({ member }: { member: CrewRosterItem }) {
  if (member.enabled) return <span className={styles.role}>{member.duty ?? CREW_DUTIES[member.role]}</span>;
  if (member.addHref) {
    return (
      <a href={member.addHref} className={styles.role}>
        add<span className={a11y.srOnly}> {CREW_NAMES[member.role]}</span>
      </a>
    );
  }
  return <span className={styles.role}>add</span>;
}

export function AppShell({ nav, activeKey, crew, user, topbar, children, className, mobileNav }: AppShellProps) {
  const initial = user.name.trim().charAt(0).toUpperCase();
  return (
    <div className={cx(styles.frame, mobileNav ? styles.withMobileNav : null, className)}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <Icon name="spark" />
          </span>
          <span className={styles.word}>scholarcrew</span>
        </div>
        <nav aria-label="Main" className={styles.nav}>
          {nav.map((item) => {
            const active = item.key === activeKey;
            return (
              <a
                key={item.key}
                href={item.href}
                className={cx(styles.navItem, active && styles.on)}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.count ? (
                  <>
                    {" "}
                    <span className={styles.count}>{item.count}</span>
                  </>
                ) : null}
              </a>
            );
          })}
        </nav>
        <div className={styles.railSec}>
          <h2 className={styles.railTitle}>Your crew</h2>
          <ul className={styles.roster}>
            {crew.map((member) => (
              <li key={member.role} className={member.enabled ? undefined : styles.off}>
                <CrewDot role={member.role} hollow={!member.enabled} />
                {CREW_NAMES[member.role]}
                <RosterEnd member={member} />
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.me}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <div>
            <div className={styles.name}>{user.name}</div>
            <div className={styles.subtitle}>{user.subtitle}</div>
          </div>
        </div>
      </aside>
      <div className={styles.main}>
        {topbar}
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
      {mobileNav}
    </div>
  );
}
```

`packages/ui/src/components/AppShell/AppShell.module.css`:

```css
.frame {
  position: relative;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 100vh;
}

.skip {
  position: absolute;
  top: -48px;
  left: 12px;
  z-index: 10;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--navy);
  color: #fff;
}

.skip:focus {
  top: 12px;
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: auto;
  padding: 22px 14px 18px;
  border-right: 1px solid var(--line);
  background: var(--rail);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px 20px;
}

.mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--navy);
}

.mark svg {
  fill: #fff;
  stroke: none;
}

.word {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--navy);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.navItem {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 38px;
  padding: 0 10px;
  border-radius: 9px;
  font-weight: 500;
  color: var(--ink-2);
}

.navItem svg {
  width: 18px;
  height: 18px;
  color: var(--muted);
}

.navItem:hover {
  background: var(--wash);
}

.on,
.on:hover {
  background: var(--navy-soft);
  font-weight: 650;
  color: var(--navy);
}

.on svg {
  color: var(--navy);
}

.count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.railSec {
  margin-top: 24px;
  padding: 0 10px;
}

.railTitle {
  margin-bottom: 10px;
  font-size: 11px;
  line-height: 1.45;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.roster {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}

.roster li {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 550;
  color: var(--ink-2);
}

.role {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--faint);
}

.roster .off {
  color: var(--faint);
}

.off .role {
  font-weight: 650;
  color: var(--navy);
}

.me {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding: 14px 10px 0;
  border-top: 1px solid var(--line);
}

.avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--navy);
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.name {
  font-size: 13px;
  font-weight: 650;
}

.subtitle {
  font-size: 12px;
  color: var(--muted);
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.content {
  flex: 1;
  padding: 20px 32px 32px;
}

@media (max-width: 900px) {
  .frame {
    grid-template-columns: minmax(0, 1fr);
  }

  .sidebar {
    position: static;
    height: auto;
    padding: 14px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .nav {
    flex-flow: row wrap;
  }

  .railSec,
  .me {
    display: none;
  }

  .content {
    padding: 16px;
  }
}

/* With a phone nav slot, the sidebar gives way to the fixed tab bar (mockup 19). */
@media (max-width: 640px) {
  .withMobileNav .sidebar {
    display: none;
  }

  .withMobileNav .content {
    padding-bottom: 96px;
  }
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/ui test src/components/Topbar src/components/AppShell`
Expected: PASS, `Test Files 2 passed (2)`, `Tests 11 passed (11)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Topbar packages/ui/src/components/AppShell
git commit -m "feat(ui): AppShell sidebar frame and Topbar"
```

### O15: Public exports and the SE-05 asset check

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/index.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as ui from "./index";

const EXPECTED = [
  "AppShell",
  "Badge",
  "Button",
  "CREW_COLORS",
  "CREW_DUTIES",
  "Card",
  "Chip",
  "CrewDot",
  "EmptyState",
  "Eyebrow",
  "Field",
  "GapBar",
  "HeroNumber",
  "ICON_NAMES",
  "Icon",
  "Kanban",
  "Modal",
  "OfferBars",
  "Progress",
  "Select",
  "StatusPill",
  "Table",
  "Tag",
  "TextArea",
  "TextInput",
  "Toggle",
  "Topbar",
  "Who",
];

describe("@scholarcrew/ui", () => {
  it("exports exactly the contract components and constants", () => {
    expect(Object.keys(ui).sort()).toEqual([...EXPECTED].sort());
  });

  it("exposes the package and tokens entry points", () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as {
      exports: Record<string, string>;
      peerDependencies: Record<string, string>;
    };
    expect(pkg.exports).toEqual({ ".": "./src/index.ts", "./tokens.css": "./src/tokens.css" });
    expect(pkg.peerDependencies).toEqual({ react: "^19.1.0", "react-dom": "^19.1.0" });
  });
});
```

`packages/ui/src/assets.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.test\.tsx?$/.test(entry.name) ? [] : [path];
  });
}

describe("SE-05: no third-party assets in the UI kit", () => {
  const files = sourceFiles(SRC);

  it("scans every source file", () => {
    expect(files.some((file) => file.endsWith("tokens.css"))).toBe(true);
    expect(files.length).toBeGreaterThan(50);
  });

  it("never references remote URLs, font files, CSS imports, scripts, or images", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/https?:\/\//);
      expect(text, file).not.toMatch(/@import|@font-face|url\(/);
      expect(text, file).not.toMatch(/<script|<img|<link/i);
    }
  });

  it("uses the system font stack", () => {
    const tokens = readFileSync(join(SRC, "tokens.css"), "utf8");
    expect(tokens).toMatch(/font: 14px\/1\.45 system-ui, -apple-system, "Segoe UI", sans-serif;/);
  });
});
```

- [ ] **Step 2: Run them and see the export test fail**

Run: `pnpm --filter @scholarcrew/ui test src/index src/assets`
Expected: FAIL in `src/index.test.ts` with `Failed to resolve import "./index" from "src/index.test.ts". Does the file exist?`; `src/assets.test.ts` passes its 3 tests (it guards files that already exist).

- [ ] **Step 3: Write the implementation**

`packages/ui/src/index.ts`:

```ts
export { CREW_COLORS, CREW_DUTIES } from "./crewColors";
export { AppShell } from "./components/AppShell/AppShell";
export type { AppShellProps, CrewRosterItem, NavItem } from "./components/AppShell/AppShell";
export { Badge } from "./components/Badge/Badge";
export type { BadgeProps, BadgeTone } from "./components/Badge/Badge";
export { Button } from "./components/Button/Button";
export type { ButtonProps } from "./components/Button/Button";
export { Card } from "./components/Card/Card";
export type { CardProps } from "./components/Card/Card";
export { Chip } from "./components/Chip/Chip";
export type { ChipProps } from "./components/Chip/Chip";
export { CrewDot } from "./components/CrewDot/CrewDot";
export type { CrewDotProps } from "./components/CrewDot/CrewDot";
export { EmptyState } from "./components/EmptyState/EmptyState";
export type { EmptyStateProps } from "./components/EmptyState/EmptyState";
export { Eyebrow } from "./components/Eyebrow/Eyebrow";
export type { EyebrowProps } from "./components/Eyebrow/Eyebrow";
export { Field } from "./components/Field/Field";
export type { FieldControlProps, FieldProps } from "./components/Field/Field";
export { GapBar } from "./components/GapBar/GapBar";
export type { GapBarProps } from "./components/GapBar/GapBar";
export { HeroNumber } from "./components/HeroNumber/HeroNumber";
export type { HeroNumberProps } from "./components/HeroNumber/HeroNumber";
export { ICON_NAMES, Icon } from "./components/Icon/Icon";
export type { IconName, IconProps } from "./components/Icon/Icon";
export { Kanban } from "./components/Kanban/Kanban";
export type { KanbanColumn, KanbanProps } from "./components/Kanban/Kanban";
export { Modal } from "./components/Modal/Modal";
export type { ModalProps } from "./components/Modal/Modal";
export { OfferBars } from "./components/OfferBars/OfferBars";
export type { OfferBarRow, OfferBarsProps } from "./components/OfferBars/OfferBars";
export { Progress } from "./components/Progress/Progress";
export type { ProgressProps } from "./components/Progress/Progress";
export { Select } from "./components/Select/Select";
export type { SelectOption, SelectProps } from "./components/Select/Select";
export { StatusPill } from "./components/StatusPill/StatusPill";
export type { PillStatus, StatusPillProps } from "./components/StatusPill/StatusPill";
export { Table } from "./components/Table/Table";
export type { TableColumn, TableProps } from "./components/Table/Table";
export { Tag } from "./components/Tag/Tag";
export type { TagProps } from "./components/Tag/Tag";
export { TextArea } from "./components/TextArea/TextArea";
export type { TextAreaProps } from "./components/TextArea/TextArea";
export { TextInput } from "./components/TextInput/TextInput";
export type { TextInputProps } from "./components/TextInput/TextInput";
export { Toggle } from "./components/Toggle/Toggle";
export type { ToggleProps } from "./components/Toggle/Toggle";
export { Topbar } from "./components/Topbar/Topbar";
export type { TopbarProps, TopbarSearch } from "./components/Topbar/Topbar";
export { Who } from "./components/Who/Who";
export type { WhoProps } from "./components/Who/Who";
```

- [ ] **Step 4: Run the whole package and see it pass**

Run: `pnpm --filter @scholarcrew/ui test`
Expected: PASS, `Test Files 29 passed (29)`, `Tests 106 passed (106)`.

Run: `pnpm --filter @scholarcrew/ui typecheck`
Expected: exit 0.

Run: `pnpm exec biome check --write packages/ui && pnpm lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/index.ts packages/ui/src/index.test.ts packages/ui/src/assets.test.ts
git commit -m "feat(ui): public exports and SE-05 asset guard"
```

## Success Criteria

All exit 0:

```bash
pnpm --filter @scholarcrew/ui typecheck   # tsc --noEmit, no output
pnpm --filter @scholarcrew/ui test        # Test Files 29 passed (29), Tests 106 passed (106)
pnpm lint                                 # biome check . with no errors
```

- [ ] `@scholarcrew/ui` exports exactly the section 9.9 components, `CREW_COLORS`, and the `./tokens.css` subpath (plus the extras `CREW_DUTIES`, `ICON_NAMES`, and prop types).
- [ ] No file under `packages/ui/src` references a remote URL, font file, CSS `@import`, script, or image (SE-05).

## Testing Requirements

`pnpm --filter @scholarcrew/ui test` runs 29 files, 106 tests, in jsdom with Testing Library and no network. They prove:

- **Palette and tokens:** `CREW_COLORS` has exactly the 8 roles in `CREW_ROLES` order with the styles.css hexes, and matches `--c-<role>` in `tokens.css`; money series use slots 1 and 2.
- **Formatting edge cases:** `usd`, `usdCompact`, and `pct` on zero, negative, fractional, and divide-by-zero inputs.
- **Roles and names:** links vs buttons (`Button` with and without `href`, disabled link falls back to a disabled button, default `type="button"`), `Chip` as `aria-pressed` button only when clickable, `Toggle` as a named `switch` with `aria-checked`, field labels associated through `useId`, `Modal` as a labelled `dialog` with `aria-modal`, `Kanban` columns as named regions, `Table` caption naming.
- **Behavior:** `Toggle` flips on click, Space, and Enter (not other keys, not when disabled); `Modal` closes on Escape only while focus is inside it (stacked modals close one at a time), focuses the first focusable element (or the close button), wraps Tab and Shift+Tab inside the dialog, and returns focus to the opener; `OfferBars` tooltip appears on pointer enter and leaves on pointer leave.
- **Status never by color alone:** every `StatusPill` state and every status `Badge` tone renders an icon and text.
- **Charts:** `GapBar` 18,600 / 9,200 gives 66.9% / 33.1%, rounds only the data end, handles zero and negative input, and exposes the exact hidden summary; `OfferBars` widths are relative to `axisMaxUsd` (23.3% / 11.5% for State U on an $80k axis), clamp at the axis, show quarter ticks `$0`…`$80k`, and the hidden table twin lists every row's values.
- **Shell:** nav links carry `href`, the active one has `aria-current="page"` and moves with `activeKey`, counts show only above zero, off members show a hollow dot and "add" (linked when `addHref` is set), skip link, banner, and main landmark; `className` lands on the outer frame and `mobileNav` renders inside it with the `withMobileNav` class.
- **SE-05:** no remote references in any source file; system font stack in tokens.

## Review Checklist

- [ ] Every component lives at `src/components/<Name>/<Name>.tsx` with a CSS module and a test, and `src/index.ts` exports exactly what section 9.9 lists (props match: `AppShell` nav/activeKey/crew/user/topbar/children plus the additive className/mobileNav, `Card` title/aside/padding, `Button` variant/size/icon/href/type/onClick/disabled, `Badge` tone/icon, `StatusPill` status, `Chip` active/onClick/dot, `CrewDot` role, `Who` role/size, `Toggle` checked/onChange/label, `Progress` value, `GapBar` freeUsd/gapUsd/labels, `OfferBars` rows/axisMaxUsd, `Table` columns/rows, `Kanban` columns, `Icon` name).
- [ ] Token values in `tokens.css` and module literals match `design/mockups/source/styles.css` (hex case aside); crew hexes appear only in `tokens.css` and `crewColors.ts`.
- [ ] Domain names (`CrewRole`, `CREW_ROLES`, `CREW_NAMES`, `JobStatus`) are imported from `@scholarcrew/domain`, never redefined.
- [ ] Only `Toggle`, `OfferBars`, and `Modal` carry `"use client"`; nothing else uses state, effects, or internal handlers.
- [ ] Chart marks follow the dataviz rules: ≤24px bars, 2px surface gap, 4px rounded data end, square baseline, recessive hairline grid, legend for two series, text in ink tokens (never series colors), table or text twin present.
- [ ] Every icon is `aria-hidden`; every status shows icon + text; focus is visible (`:focus-visible` in tokens).
- [ ] `Modal` keeps Tab inside the dialog, closes on Escape only when focus is inside it, and restores focus to the opener (E-15-1).
- [ ] No `dangerouslySetInnerHTML`, no remote URLs, no font files, no images (SE-05).
- [ ] Plan 16 imports `@scholarcrew/ui/tokens.css` once in its root layout and uses `AppShell` for the `(app)` layout.
