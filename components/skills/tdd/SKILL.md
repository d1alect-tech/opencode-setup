---
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
metadata:
    github-path: skills/engineering/tdd
    github-ref: refs/tags/v1.2.3
    github-repo: https://github.com/mattpocock/skills
    github-tree-sha: 423f3cc2bccf3b0ed426fb35eeb4b38d9188a343
name: tdd
---
# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Consult every section before and during each cycle, not after.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification. "User can checkout with valid cart" tells you exactly what capability exists and survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything. Agreeing the seams up front directs testing effort to critical paths and complex logic instead of every edge case.

Ask: "What's the public interface, and which seams should we test?"

When the interface itself is unclear, agree its boundary, vocabulary, and observable behavior directly with the user before writing the test. Keep the seam as small as the behavior allows.

## Anti-patterns

- **Implementation-coupled.** The test mocks internal collaborators, tests private methods, or verifies through a side channel, such as querying the database instead of using the interface. The test breaks during a refactor even though behavior hasn't changed.
- **Tautological.** The assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, or a constant asserted equal to itself). It passes by construction and can never disagree with the code. Expected values must come from an independent source of truth, such as a known-good literal, a worked example, or the spec.
- **Horizontal slicing.** Writing all tests first and then all implementation verifies imagined behavior. You test the shape of things rather than user-facing behavior and commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat. Each test is a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactor only after green.** Once the test passes, improve the code without changing behavior, then rerun the tests before starting the next red cycle.
