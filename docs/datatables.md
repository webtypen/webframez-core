# Datatable column preferences

`DatatableController@restApi` automatically restores the authenticated user's
column order, visibility and widths. `getColumns(req)` still returns all columns
allowed by the table definition. A column with `hidden: true` starts hidden and
can be added in the column editor. Hiding a column is presentation state, never
an authorization mechanism; omit unauthorized columns from `columns(req)`.

Native Design's Datatable and DataTableScreen show **Filter zurücksetzen** and
**Spalten bearbeiten** in their ellipsis menu when the backend supports this
protocol. The editor supports drag and drop (including keyboard/native actions),
hiding/adding columns, backend default widths, auto grow, pixels and percentages.
Saving refreshes rows without resetting filters. Cancel leaves the layout intact.
At least one column must remain visible. `features.columnPreferences = false`
disables the editor; explicit client `columns` overrides also disable it.

## Storage and scope

The default document collection is `users_datatables`. The owner comes from
`req.auth.user` or `req.user`, respecting its `__primaryKey` (default `_id`). No
owner means no persistence and no edit action. Records contain `_user`, `table`,
`columns` and `updated_at`. A deterministic `_id` provides atomic upserts without
creating indexes or running schema changes during requests.

Configure all tables via `Datatable.columnPreferences`, or assign a per-table
`columnPreferences` configuration in a controller's `configureTable` hook. Use
only authenticated server context for owner fields. The client cannot select a
collection or another owner. Connections can be selected with `connection`.

```ts
class EnvironmentDatatableController extends DatatableController {
    protected configureTable(table: Datatable, req: Request) {
        table.columnPreferences = {
            collection: "environments_users_datatables",
            owner: request => request.envUser?._id && request.env?._id
                ? { _environment_user: request.envUser._id, _env: request.env._id }
                : null,
        };
    }
}
```

Set `columnPreferences = false` to opt out. Existing definitions keep their
widths until explicitly overridden. Old saved keys no longer present in the
request's allowed definitions are removed; if none remain, defaults are used.
New columns become available in the editor without altering a saved layout.

## Request protocol

All operations use the same authorized POST route and `_table` plus the host's
normal request context:

- `init_request: true` or `mode: "columns-get"`: returns effective `columns`,
  `availableColumns`, `columnSelection` and the boolean `columnPreferences`.
- `mode: "columns-save", columns: [...]`: validates and saves the ordered visible
  columns, then returns current initialization metadata.
- `mode: "columns-reset"`: removes the preference and returns backend defaults.

```json
{
    "_table": "customers",
    "mode": "columns-save",
    "columns": [
        { "key": "email", "width": { "mode": "percent", "value": 40 } },
        { "key": "name", "width": { "mode": "auto" } },
        { "key": "created_at", "width": { "mode": "px", "value": 140 } }
    ]
}
```

Omitting `width` follows the current backend default. Percentages are greater
than zero and at most 100; pixels are greater than zero and at most 10,000.
Unknown/duplicate columns or invalid widths return HTTP 400; a missing owner or
disabled persistence returns HTTP 403. Normal table/middleware authorization
must run for every operation. Exports use the visible columns in their saved order.

## Conditional lookups and custom data methods

Use `await this.getVisibleColumns(req)`, `getVisibleColumnKeys(req)` or
`isColumnVisible(req, "email")` anywhere in a custom data method. Reads are cached
per table instance and request, never across users or environments.

`aggregation(req, context)` and `subAggregation(req, context)` receive a
`DatatableColumnContext`. The controller also passes it as the second argument
to `getData(req, context)`, including overrides. `onData(req, result, context)`,
`onRow(row, req, context)` and `onAttributes(row, req, context)` receive it during
normal paginated loading. The context exposes `columns`, `columnKeys`,
`isColumnVisible(key)` and `isColumnRequired(key)`.

```ts
aggregation = async (req: Request, columns: DatatableColumnContext) => [
    { $match: { environment: req.env._id } },
    ...(columns.isColumnRequired("customer") ? [
        { $lookup: { from: "customers", localField: "customer_id", foreignField: "_id", as: "customer" } },
    ] : []),
];
```

Prefer `isColumnRequired` for query optimization: it also considers declared
mappings, active filter/search/sort fields and sums, as well as model-selector
preview fields. This avoids breaking a sort/filter on a hidden column. Dependencies
inside custom expressions, custom filters, exports or other calculated columns
remain the table author's responsibility.

## Relation display fields and custom titles

A column can declare `displayOptions: [{ value: "name", label: "Name", type: "string" }]`
or an async `displayOptions(req, columnKey)` callback. The callback receives the
normal authenticated request. Initialization advertises lazy options with `true`;
`mode: "columns-options", column: "key"` resolves them when the editor needs them.
Only visible columns resolve options during normal loading. `displayField` selects
the backend default; otherwise the first option is used.

Saved preferences accept `title` (up to 160 characters) and `displayField` in
addition to width. Empty values restore the backend defaults. An unknown display
field is rejected on save; if a previously saved field disappears, loading falls
back to the default while preserving the other layout settings.

Core validates the selection and exposes it through `context.columns[key].displayField`;
the host performs the relation lookup and writes the value to the column's stable
`mapping`. Options can supply `type`, `plain` and `options` for typed rendering.
Never interpret an unchecked client field as a database projection.

`DatatableSchemaColumns.fromSchema(schema, { prefix, labelPrefix, prepare })`
creates an optional column catalog from nested DataBuilder/DataSchema fields.
The `prepare(column, field, path)` callback can attach inline or lazy display
options, change the mapping, or return null to omit a field. Plugin installation,
tenant checks and relation hydration belong in the host adapter.
