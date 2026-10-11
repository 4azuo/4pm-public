---
name: it-scenario
description: Create or extend an integration-test scenario under tests/IT/senarios/ in the 4PM project layout — a scenario folder with senario.json, a testcases.json manifest and one TC-00x-*.md spec per test case (Preconditions · Steps · Expected result · Evidence). Use when the user asks to add integration tests, test cases, a test scenario, or an IT spec for a feature or flow.
---

# it-scenario — integration-test scenarios in the 4PM layout

4PM projects keep integration tests in `tests/IT/` (see `tests/IT/README.md`):

```
tests/IT/
├── senarios/<senario>/      # one folder per scenario
│   ├── senario.json         # { name, description }
│   ├── testcases.json       # manifest: [{ id, title, params }]
│   └── TC-001-<slug>.md     # one spec per test case
├── tools/                   # the project's runner/helpers
└── evidence/                # generated before/after captures (not hand-written)
```

The folder name `senarios` is the project convention — keep that spelling.

## Steps

1. **Understand the flow.** Read the feature's spec/docs and the code paths it touches. Ask the user
   if the expected behaviour is unclear — do not invent requirements.
2. **Pick the scenario.** Reuse an existing `tests/IT/senarios/<senario>/` when the flow belongs to it;
   otherwise create one with a short kebab-case name and a `senario.json` from
   [`templates/senario.json`](templates/senario.json).
3. **Choose test cases.** Cover the main success path, the important failure paths (validation,
   permission, not-found, conflict) and one boundary case. Prefer a few meaningful cases over many
   shallow ones.
4. **Number cases** after the highest existing id in that scenario: `TC-001`, `TC-002`, … Never
   renumber or reuse an id.
5. **Write each spec** `TC-00x-<slug>.md` from [`templates/testcase.md`](templates/testcase.md). Steps
   must be concrete and reproducible (exact inputs, URLs/endpoints, data); the expected result must be
   observable (response, UI state, DB row, file).
6. **Register each case** in `testcases.json` (from [`templates/testcases.json`](templates/testcases.json)):
   `id`, `title`, and the `params` the runner in `tests/IT/tools/` needs.
7. **Runner.** If `tests/IT/tools/` already has a runner, follow its conventions for `params`. If there
   is none, do not build one unasked — tell the user which tooling fits the stack (e.g. Playwright for
   web UIs, an HTTP test runner for APIs) and that the specs are ready for it.
8. **Report** the scenario, the case ids/titles you added, and anything left for the user to decide.

## Rules

- Do not write files under `tests/IT/evidence/` — the runner generates them.
- Keep secrets out of specs and params: reference them by name (e.g. `${TEST_USER_PASSWORD}`).
- One behaviour per test case; split cases that check unrelated outcomes.
