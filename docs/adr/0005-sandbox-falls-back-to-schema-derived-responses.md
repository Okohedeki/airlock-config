# Sandbox falls back to schema-derived responses when no example matches

**Status:** accepted

The sandbox synthesises response bodies in two layers. First, it tries the existing example-replay path: pick the authored example whose `expected_verdict.code` matches the computed verdict and return its `out` payload verbatim. If no example matches, it falls back to a **deterministic, schema-derived faker** that walks the skill's `output` JSON Schema and produces a valid response, echoing same-named input fields where the types are compatible. The faker takes no dependencies, calls no LLM, and produces identical output for identical input on every run. Authored examples always win over the faker.

## Why

Today the sandbox returns `undefined` for the detail payload whenever the publisher has not authored an example for a specific verdict code. That gap turns the sandbox from a believable simulator into a half-finished demo: a consumer pre-flights against a skill that has only happy-path examples and gets an empty body for a refusal verdict they need to handle. The contract claims the agent does X; the sandbox proves the contract is internally consistent for the cases the publisher wrote down; everything else falls off the edge of the world.

Schema-derived synthesis is the standard answer in the OpenAPI ecosystem (Prism, Mockoon) and matches Stripe-tier sandbox economics — free at any volume, deterministic, no LLM bill. Determinism matters for two distinct consumers: a CI run asserting "this input always produces this response" needs reproducibility, and a developer debugging an integration needs to be able to replay the same call and see the same body. Hashing the request to seed the faker delivers both for $0 of inference.

Input echoing is what separates "looks fake" from "feels real." When a `read_file` request carries `{path: "src/foo.ts"}` and the response schema includes a `path` field, copying the input value across is the difference between a synthetic response a consumer can reason about and a generic placeholder that breaks every assertion downstream.

## Considered options

- **Continue returning `undefined` (rejected).** The status quo. Consumers learn the sandbox is brittle for under-documented skills and stop trusting it.
- **Optional LLM-backed synthesis (deferred).** Real-feeling text in narrative fields. Adds a paid dependency, breaks determinism, fights conformance. Defer to a future opt-in BYOK flag; never on by default. Not v0.3.
- **Schema-derived faker with input echo (accepted).** Free, deterministic, dependency-free. Matches consumer expectations from the rest of the API-mock ecosystem. Layered behind the existing example-replay so publishers who invest in examples still get fidelity.

## Consequences

- A new pure module `src/pipeline/faker.ts` holds the schema-walking logic. It must respect `$ref` into `#/schemas`, `required`, `enum`, `format`, and bounded numeric ranges. It must not import anything from the network or filesystem at evaluation time.
- The response label distinguishes the two paths so consumers know which they are looking at. `synthesize.ts` returns `{value, source: "example" | "synthesized", exampleName?}`; the sandbox surfaces that source in a response header (e.g., `X-Airlock-Detail-Source`) and the playground UI badges it visually.
- The faker is not for production. Publishers who care about response fidelity author examples; the faker exists so that the *absence* of an example doesn't break integration.
- Conformance is unaffected. The conformance runner asserts the `code` field on PROMISE verdicts only; it does not introspect the detail body. Adding the faker does not loosen any binding promise.
- Future v0.4 work may layer an opt-in LLM mode behind a `--llm` flag with a consumer-supplied API key. That mode would be additive to this fallback chain, not a replacement for it.
