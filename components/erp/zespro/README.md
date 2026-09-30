# Zespro UI components

Imported from `/Users/janguk/Documents/project/zespro/zespro` on 2026-09-30.
The source is the design system used by `apps/web/app/(dev)/dev/ui`.

Import additional components from `@/components/erp/zespro`:

- `ActionMenu`, `Tabs`, `ClassificationTree`
- `DataGrid` and its table, toolbar, virtual rows and footer helpers
- `ExecutiveDashboard` and its KPI, notice, progress and section helpers
- `FieldGrid`, `FormModal`, `ChoiceGrid`, `ChoiceCard`, `CheckTileGroup`, `CheckTile`
- `SplitModal` and its layout, row and section helpers
- `SplitLoginLayout`, `AppSidebar`, `DualSidebar`, `TopLoadingBar`

Project-local additions are available in `components/erp`: `Checkbox`,
`ConfirmDialogProvider` / `useConfirm`, `ListToolbar`, `SegmentedFilter`,
`SegmentedFilterDivider`, `StageNumber`, `StatusBadge`, and `ViewModeToggle`.
Wrap consumers of `useConfirm` in `ConfirmDialogProvider`.

Existing ERP buttons, badges, forms, dropdowns, date pickers, basic tables and
modals remain the default components. The imported button, modal and filter
implementations in this directory are internal dependencies of the added
components; `support.ts` is not the public component catalogue.

Styles are loaded by `app/globals.css`, use `pds-` classes, and map to shared
`--bi-*` tokens. Portal dialogs receive the same theme mapping. No dependency,
preference storage, authentication, database or navigation change is required.
Sidebar expansion in the examples is transient React state.

See the added Zespro section in the UI reference for interactive examples.
Zespro-specific sales workflows (`QuoteBoard`, order confirmation and its draft
hook) are not imported into this project's common UI library.
