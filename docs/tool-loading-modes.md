# Tool loading modes

Settings > **Tool loading** offers:

| Mode | Behavior | Resource tradeoff |
| --- | --- | --- |
| **On demand** (default) | Import a tool when opened. | Keeps initial work and unused tool code lower; the first open may wait for loading and evaluation. |
| **Preload** | Prepare each registered interface serially while the window is visible and idle. | More module memory and background CPU in exchange for fewer first-open imports. |

The preference applies immediately and survives reopening. It contains only the
mode, not tool inputs. Switching back to On demand stops future preparation;
existing imported modules remain cached until the window closes or reloads.

Preload imports interfaces without mounting them. It does not create tool
workers, load OCR language models, open a vault, scan the screen, start a Mock API
server or initiate network probes. Nested editors and action-triggered engines
can still load when needed, so Preload does not guarantee zero wait.

Progress counts completed interface imports. Failed imports are reported as
partial preparation while the rest continue. A failed chunk may require closing
and reopening the window; toggling the preference is not a guaranteed recovery
because browser module and React caches may retain failures.

The queue uses [requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
with cancellation and a timer fallback. There is no timeout forcing a callback
during a busy period. Once a module starts evaluating, JavaScript evaluation
cannot be preempted by this queue. Visibility pauses cancel upcoming imports;
an import already in flight can finish.

[React lazy](https://react.dev/reference/react/lazy) and explicit preload share
the registry loader's promise and successful result. Tools remain lazy by
default. Command palette contents and action-triggered engines retain their
separate loading paths.

Verification covers preference validation/legacy hydration, shared imports,
serial idle scheduling, visibility pause/resume, cancellation during a pending
import, and continuing after failure. The production browser smoke also guards
against tool effects, worker/model initialization and extra bridge operations
during preparation. Browser fixture checks are not measurements of installed
Electron RSS or macOS/Linux smoke tests.
## Focused verification, 2026-10-06

- Preference and scheduler tests: 17 passed across app-preferences and
  tool-preloading tests, including older preference compatibility and cancellation.
- Production renderer smoke: default On demand leaves heavy interfaces unloaded;
  explicit Preload prepares all 39 registered interfaces without mounting tools,
  creating workers or adding bridge calls. Counts include Settings and About.
- Keyboard mode selection, an in-flight cancellation, simulated visibility
  pause/resume, persisted selection after reload, reuse on tool opening, and one
  failed chunk with remaining tools available all passed.
- Visual checks use isolated Edge at 1180 px in dark theme and 720 px in light
  theme. Visibility is simulated in the browser fixture, not a native tray test.
- pnpm build passed. The mode-specific smoke is
  tests/tool-loading-mode-ui.smoke.mjs; it expects production assets in out/renderer.

Final checks: pnpm typecheck and pnpm build passed; the full Vitest suite passed
767 tests in 85 files. The mode-specific production UI smoke passed. An additional
run of the existing navigation and loading-feedback smokes was not executed:
automatic approval review could not complete because the account usage limit
had been reached. This was a review availability failure, not a safety rejection.
