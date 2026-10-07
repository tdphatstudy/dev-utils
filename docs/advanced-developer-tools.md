# Advanced developer workflows — 2026-10-06

DevFusion already has formatters, converters, HTTP/mock API, local HTTPS, SSH,
crypto and encrypted documents. The main gaps for larger systems were contract
review, structured payload validation, migration reconciliation and incident
analysis. This implementation adds four tools within the existing functional
groups; it does not add an Enterprise category or change existing tool IDs.

| Task | Tool / group | Workflow |
| --- | --- | --- |
| Check event/API/config payloads | JSON Schema Validator — JSON (`json.schema`) | Open/paste schema and payload, choose draft, Validate, fix field-level failure and rerun. |
| Review API release changes | API Contract Review — Network (`network.openapi`) | Review one OpenAPI contract or compare baseline → target, filter severity, inspect operation inventory, copy a metadata report. |
| Verify migrated/exported data | Data Reconciliation — JSON (`json.reconcile`) | Load two JSON arrays, choose a business-key JSON Pointer, optionally ignore volatile fields, reconcile and inspect changed/missing/extra/ambiguous rows. |
| Investigate an incident | Structured Log Explorer — Text / Dev (`text.logs`) | Open JSONL, map nested fields, filter service/trace/level/time, inspect error counts and latency percentiles. |

Home links these tools through API, release and incident workflows. Search,
command palette and Favorites use their normal registry entries. Each interface
includes safe sample data, explicit Clear, UTF-8 file input, inline failure states,
copy report and responsive results. Analysis is explicit and can be cancelled.

## Processing and privacy

- Interfaces load lazily; a bundled worker starts only when Analyze/Validate/
  Review/Reconcile is clicked. The worker is terminated on success, failure,
  Cancel, input/options change or unmount; a main UI timer terminates it after
  five seconds, including pathological regex evaluation.
- Processing uses browser APIs and shared domain modules. There are no new
  privileged bridge methods, shell commands, database connections or uploads.
  File inputs use the browser File API after selection; files are never modified.
- Each input is bounded to 2 Mi UTF-16 characters. Files are capped at 8 MiB and
  must decode as UTF-8. Structured values are capped at 100,000 nodes and 64
  levels. JSONL/record arrays are additionally capped at 20,000 lines/records;
  reference expansion has a separate 100,000-step budget. Smaller documents can
  still exceed the runtime budget; Cancel/timeout preserves the input view.
- JSON duplicates, circular YAML aliases, non-JSON values and unsafe numeric
  integers are refused, rather than silently normalizing them. YAML is bounded
  and refuses parse warnings/errors. Numbers use JavaScript floating-point
  semantics; quote IDs and decimal values when exact representation matters.
  Parsed object prototypes are removed so inherited names such as `constructor`
  cannot satisfy required JSON fields. Maps/dates/custom objects are refused.
- All four IDs are in `NO_HISTORY_TOOLS`, even if general session retention is
  enabled. Content lives only in the mounted tool/worker and is cleared on leaving.
  JavaScript strings cannot be reliably zeroed. Explicit report copying writes
  to the system clipboard, which is outside the tool's memory lifecycle.
- Schema errors contain constraint names and field/schema pointers, omitting
  payload and expected values. Reconciliation reports contain row numbers and
  changed field pointers, omitting record keys/values. API reports contain paths,
  operation IDs and parameter names, omitting examples/defaults/enum values.
  These names are metadata and can themselves be sensitive.
- Log tables show selected level/service/trace/timestamp/latency metadata, never
  message or body fields. Copied log reports contain counts, invalid line numbers
  and latency aggregates; they exclude service names, trace IDs and log rows.

## Scope and interpretation

**JSON Schema.** The pinned `@cfworker/json-schema` 4.1.1 interpreter runs without
`eval` or `new Function`; CSP stays unchanged. The tool exposes a strict draft 7
and 2020-12 profile, checking supported keyword shapes and JSON Pointer targets.
It refuses unknown constraints, external refs, nested IDs, dynamic/recursive
reference keywords, content keywords and custom vocabularies. Only the engine's
supported formats are accepted and checked. Validation stops on the first failure
and may include enclosing constraint diagnostics, capped at 200 rows. It does not
provide full meta-schema validation, schema inference or all-error enumeration.
See the [engine documentation](https://github.com/cfworker/cfworker/tree/main/packages/json-schema)
and [JSON Schema 2020-12](https://json-schema.org/draft/2020-12).

**OpenAPI.** Supports JSON/YAML OpenAPI 3.0.x and 3.1.x path operations, inherited
parameters/security and local references. Operation removal, newly required
parameters/body and removed responses are classified as breaking. Changed
schemas, media types, serialization, security/scopes and operation IDs require
review; added operations are informational. Empty/anonymous security requirements
are flagged for intentional-public-access review. A clean report is not proof of
semantic compatibility, full OAS validity, endpoint authorization or runtime safety.
Recursive/external refs and constraint-bearing ref siblings are refused; callbacks
and webhooks are outside path comparison and flagged. Dictionary names such as
`description`, `default` and `$ref` remain intact; documentation-only text is omitted.
The [OpenAPI specification](https://spec.openapis.org/oas/v3.1.0.html) defines the
reference, parameter and security semantics used here.

**Reconciliation.** String/number keys are distinct and input order is irrelevant
to matching. Duplicate groups are ambiguous on both sides; the tool never chooses
an arbitrary record. Object order is ignored; array order is significant. An
ignored pointer suppresses a complete subtree. Counts cover the full result, with
up to 1,000 displayed/exported rows and 100 changed fields per row; the total field
count is retained when truncated. This compares exports; it is not a transactional
database audit, migration executor or financial decimal engine.

**Logs.** Numeric Pino levels 10–60 and string aliases are normalized. Filters match
exact service/trace values. Inclusive time windows require valid ISO timestamps
with `Z` or an explicit offset; records with invalid/missing timestamps do not
match time-filtered queries. Invalid lines are excluded and counted, with their
first 100 line numbers shown. Latency requires non-negative numeric milliseconds.
Percentiles use nearest rank across matching samples. The table shows 500 rows;
counts/percentiles cover all matches, and level/service tables show the top 100.
This analyzes an export; it does not connect to Elasticsearch, Loki or cloud logs,
join distributed spans, interpret histograms or infer fleet-wide SLOs.

## Verification

Local Windows verification: 96 test files / 899 tests pass, including 42
analysis-domain tests and no-history cases for every new tool. Typecheck and
production build pass. The complete catalogue sweep passes 45 routes in both
themes and window sizes. Advanced UI smoke passes real workers, inherited-field
refusal, stale file-read cancellation, Cancel/timeout/retry, report privacy and
navigation clearing. Existing glass/retention/vault recovery smoke also passes.
Native file-URL and hardened ASAR fixture worker smoke pass on Windows. The
Windows application directory is unsigned; signing, installation and other-host
native QA remain separate checks. The existing lazy SQL chunk warning remains.

Run `pnpm test --maxWorkers=4`, `pnpm typecheck` and `pnpm build`, then:

```sh
node tests/advanced-tools-ui.smoke.mjs
pnpm test:electron:security
pnpm test:electron:packaged
```

`advanced-tools-ui` uses the production renderer and real workers in an isolated
browser: all four examples, two themes, 1180×760/720×500, file import, stale file
read cancellation, report privacy, invalidation, filters, Cancel, timeout and
navigation clearing. External requests are blocked and recorded. Native smoke
checks all four workers against the production file-URL CSP and preload in a
temporary Electron profile; packaged smoke uses a hardened ASAR fixture, not a
signed installation. macOS/Linux native checks and remote CI require those hosts.

## Remaining product gaps

Next tools should follow the team's actual workflow: SQL migration/DDL review,
certificate chain inspection, SBOM/dependency review and secret scanning have
separate dialect, trust and false-positive requirements. Connecting to production
databases, load testing live services, SSO/RBAC and cloud log ingestion would add
credentials, network and authorization boundaries; they are not implemented by
these local tools. Existing SSH is an inventory/config/TCP tool, not an SSH terminal.
