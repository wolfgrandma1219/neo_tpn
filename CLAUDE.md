# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Neonatal TPN (parenteral nutrition) prescription system (新生兒靜脈營養處方系統). React 19 + Vite SPA, UI text is Traditional Chinese. This is clinical dosing software: any change to calculation logic must be checked against the formulas below and verified with concrete numbers.

## Commands

Node is installed at `/usr/local/bin` (may need `export PATH="/usr/local/bin:$PATH"`).

- `npm run dev` — Vite dev server on http://localhost:5173
- `npm run build` — production build to `dist/` (`base: './'` for GitHub Pages)
- `npm run lint` — ESLint (baseline currently has 7 pre-existing errors: unused vars and `react-hooks/set-state-in-effect`)
- `npm run deploy` — builds and publishes `dist/` to the `gh-pages` branch (outward-facing; only run when asked)

There is no test suite.

## Architecture

Almost everything lives in **`src/App.jsx`** (~2100 lines): constants, pure helpers, the `App` shell, and all views as functions in the same file. `App.css`/`index.css` are Vite template leftovers. Tailwind is loaded at runtime from a CDN script in `index.html` (`@tailwindcss/browser@4`), not through PostCSS — the npm `tailwindcss` package is effectively unused. Icons come from `lucide-react`.

### Backend: Google Apps Script (`gas/Code.gs`)
- Data lives in a Google Sheet behind a GAS web app. `gas/Code.gs` is the versioned source; it is deployed by pasting into the Apps Script editor and creating a new deployment version (no clasp). Frontend and GAS changes to the API must be deployed together.
- Backend URL comes from `VITE_GAS_URL`: `.env.production` holds the production URL; for dev put a **test** GAS URL in `.env.development.local` (gitignored) — never point dev at production data.
- All frontend calls go through `callGas(action, payload, token)` in `src/api/gasClient.js` (POST JSON `{ action, token, ... }`; response `{ success, data | error }`; `AUTH_REQUIRED` → `AuthError`).
- Actions: `login` (only public one), `getAllData`, `saveRecord`/`deleteRecord` (admin-only for `users, limits, packages, medications, auditRules`; any logged-in user for `patients, admissions`; `orders` is rejected), `saveOrder`, `changePassword`, `exportLabel` (writes to a separate label spreadsheet). Write actions run under `LockService`.
- Auth: `login` verifies salted SHA-256 hashes (`passwordHash`/`salt` columns; legacy plaintext `password` is upgraded on first login or via `migratePasswords()`), returns a token stored in `CacheService` (6 h sliding) and in the browser's `sessionStorage`. `getAllData` returns users (without secrets) only to admins.
- `saveOrder(order, isNew)`: for new orders/revisions the server assigns the order ID (`TPN-<encounterId>-<yyyyMMdd Asia/Taipei>-<seq>`) and author; `Dispensed` requires pharmacist and sets dispenser from the session; submitting an order with `parentOrderId` voids the parent in the same lock. It returns `{ order, voidedParentId }`, which the frontend applies to local state. The client-side `generateOrderId` is only a preview.
- Orders store `elements`/`otherAdditions` as JSON in `elements_json`/`otherAdditions_json` columns. `upsertRow` only writes fields that already have a header column — a new order field needs a new sheet column.
- `App.fetchAllData` loads everything into one `db` state object and re-polls every 60 s; views render only after the first successful load (`dataLoaded`). It still normalizes spreadsheet quirks (PascalCase/camelCase keys, dates, string booleans).
- `apiRequest(action, payload, onSuccess)` / `apiSync(action, table, pk, data, onSuccess)` call `onSuccess(data)` only on success; on failure they alert and leave local state unchanged.

### Navigation & roles
No router: `App` switches on a `view` string (`settings`, `patients`, `orders`, `globalOrders`, `orderForm`; login shows when there is no session) and passes `db`, `setDb`, `apiSync`/`apiRequest`, `showAlert` as props. Roles: `admin` → settings, `doctor`/`np` → patients/orders, `pharmacist` → globalOrders/dispensing. UI role checks are inline via `user.role`; the GAS enforces the security-relevant ones.

### Order lifecycle (`OrderFormView`, `saveOrder`)
Statuses: `Draft` → `Submitted` (doctor) → `Dispensed` (pharmacist, records `dispenserId/Name`; can be cancelled back to `Submitted`). Editing a submitted order creates a new Draft with `parentOrderId`; submitting it marks the parent `Void`. `Deleted` is a soft delete. Only `Draft` is editable (`isReadOnly`). Order IDs are assigned by the GAS (see above).

### Dose calculations (in `OrderFormView`)
- Admin volume: `calcAdminVol = rate (mL/hr) × 24`; `prepVol` must exceed it.
- For each element in `ELEMENTS`, `conc` (per L) and `dose` (per kg/day) are kept in sync: `dose = conc × volL / weight`; for CHO (`isGIR`) `dose` is GIR mg/kg/min: `conc × volL / weight × 1000/1440`. Editing a dose back-computes `conc` (`handleDoseChange`).
- kcal is derived, not editable: `kcalConc = CHO×3.4 + AA×4`.
- Cl is derived, not editable (dedicated `useEffect`): Cl = K dose, plus extra Na (Na dose minus 2×P when `useGlycophos`, since Glycophos supplies 2 mEq Na per mmol P) as 3% NaCl unless `useSodiumAcetate`. With `useGlycophos`, raising P enforces Na ≥ 2×P.
- Lipid: displayed g/kg = `lipid mL × 0.2 / weight`.
- Several effects recompute derived values; they compare old/new values before `setFormData` to avoid render loops — keep that pattern.

### Admin-configurable rules (`SettingsView`)
- `limits`: per-element min/max; `validateOrder` blocks submission when a dose is outside range.
- `auditRules`: JS boolean expressions over element doses, e.g. `[na] <= 4`, evaluated by `evaluateCondition`.
- `medications`: formulas for the dispensing sheet evaluated by `evaluateFormula`, with `V` = prepVol, `W` = weight, `[key]` = element conc or other-addition amount.
Both evaluators substitute values into a string and run it with `new Function`.
