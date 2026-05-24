# Airlock Config taxonomies (v0.5)

These are the closed vocabularies the schema enforces. Adding a value requires an ADR — drift across publishers breaks indexing. The vocabularies themselves carry over verbatim from v0.4; only the project name changed.

> The schema's `enum` definitions in `schema/airlock-config.schema.json` and the type aliases in `src/validate/types.ts` mirror this document. This page is the source of truth for what the values *mean*.

## `category.industry`

The publisher's primary industry vertical. One per contract.

| Value | Meaning |
|---|---|
| `logistics` | Freight, shipping, fulfillment, last-mile, cold-chain. |
| `procurement` | Purchase orders, supplier relationships, sourcing. |
| `fintech` | Payments, lending, wealth, accounting, treasury. |
| `healthcare` | Clinical, payer, pharma, devices, scheduling — anything PHI-adjacent. |
| `retail` | DTC, marketplaces, point-of-sale, returns, loyalty. |
| `manufacturing` | Plant operations, MES, quality, asset maintenance. |
| `legal` | Contract review, discovery, IP, compliance workflows. |
| `hr` | Hiring, onboarding, payroll, benefits, performance. |
| `customer_support` | Tier 1/2 triage, ticket routing, knowledge-base lookup. |
| `dev_tools` | Build, deploy, CI, observability, agent tooling. |
| `data_analytics` | BI, reporting, data quality, governance. |
| `marketing` | Campaign ops, content, attribution, lifecycle. |
| `real_estate` | Listings, transactions, property management. |
| `education` | LMS, assessment, registration, tutoring. |
| `energy` | Generation, grid, trading, sustainability reporting. |
| `government` | Public-sector services, regulatory workflows. |
| `media` | Publishing, broadcast, syndication, rights. |
| `other` | Escape hatch — open a PR/ADR to add a new value. |

## `category.capability`

The kind of work the agent does, irrespective of industry. One per contract.

| Value | Meaning |
|---|---|
| `transaction_processing` | Accepts/refuses/confirms business transactions (POs, payments, bookings). |
| `lookup` | Returns data on request; doesn't mutate state. |
| `scheduling` | Books, reschedules, or cancels time-bound resources. |
| `notification` | Sends or routes messages on behalf of a publisher. |
| `data_extraction` | Pulls structured data from unstructured inputs. |
| `data_enrichment` | Augments existing records with additional fields. |
| `decision_support` | Returns recommendations the caller acts on. |
| `negotiation` | Multi-turn back-and-forth toward a mutually-acceptable outcome. |
| `workflow_orchestration` | Drives multi-step processes that touch other systems. |
| `content_generation` | Produces text/images/code for downstream use. |
| `monitoring` | Observes a state and emits when something changes. |
| `translation` | Converts between languages or formats. |
| `summarization` | Condenses inputs into shorter representations. |
| `other` | Escape hatch. |

## `region` codes

Coarse geographic + regulatory regions. Used in `region.data_residency` and `region.serves_regions`.

| Value | Meaning |
|---|---|
| `us-east` | US East (Virginia, NY-region data centres). |
| `us-west` | US West (Oregon, California). |
| `us-central` | US Central (Chicago, Texas). |
| `ca` | Canada. |
| `eu-west` | Western EU (Ireland, France, Netherlands). |
| `eu-central` | Central EU (Germany, Switzerland). |
| `uk` | United Kingdom. |
| `apac-east` | East Asia (Japan, Korea). |
| `apac-southeast` | SE Asia (Singapore, Indonesia). |
| `apac-south` | South Asia (India). |
| `anz` | Australia + New Zealand. |
| `latam` | Latin America. |
| `mea` | Middle East + Africa. |
| `global` | No single primary region; spans multiple. |

Finer-grained sub-regions (e.g. "us-east-1a", "EU-WEST-3") go in `tags`.

## `compliance[].standard`

| Value | Meaning |
|---|---|
| `SOC2_TYPE_1` | Point-in-time SOC 2 attestation. |
| `SOC2_TYPE_2` | Period-of-time SOC 2 attestation (stronger). |
| `ISO_27001` | International information-security management standard. |
| `ISO_27701` | Privacy extension to 27001. |
| `HIPAA` | US health information privacy. |
| `HITRUST` | US healthcare composite framework. |
| `GDPR` | EU general data protection regulation. |
| `CCPA` | California consumer privacy act. |
| `PCI_DSS` | Payment card industry data security. |
| `FedRAMP_MODERATE` | US federal cloud authorisation (moderate baseline). |
| `FedRAMP_HIGH` | US federal cloud authorisation (high baseline). |
| `EU_AI_ACT` | EU AI Act conformity (general-purpose AI / high-risk system declarations). |

## `compliance[].status`

| Value | Meaning |
|---|---|
| `certified` | Third-party-attested. Verifiable via `attestation_url`. |
| `self_attested` | Publisher claim only. No external audit. |
| `in_progress` | Actively pursuing certification. |

## `auth_model.methods`

| Value | Meaning |
|---|---|
| `none` | Public endpoint. |
| `api_key` | Static API key in a header. |
| `oauth2_client_credentials` | OAuth 2 machine-to-machine. |
| `oauth2_auth_code` | OAuth 2 authorisation-code flow (delegated). |
| `mtls` | Mutual TLS, client cert pinned. |
| `signed_jwt` | Self-issued JWT with consumer's keypair. |
| `webauthn` | WebAuthn / passkey. |

## `auth_model.enrollment`

| Value | Meaning |
|---|---|
| `open` | Anyone may register a key without human review. |
| `approval_required` | Publisher manually approves each consumer. |
| `invite_only` | Onboarded directly by the publisher; no public registration. |
| `enterprise_only` | Signed contract precedes API access. |

## `pricing.model`

| Value | Meaning |
|---|---|
| `free` | No charge under any documented condition. |
| `metered` | Charged per documented unit; usually combined with `unit`. |
| `subscription` | Flat recurring fee. |
| `enterprise` | Custom commercial terms; price negotiated. |
| `usage_tiered` | Tiered pricing that varies by volume. |

## `pricing.unit`

| Value | Meaning |
|---|---|
| `per_call` | Each request to any skill. |
| `per_skill_invocation` | Per accepted skill call (refusals may be free). |
| `per_token` | Per LLM token, when applicable. |
| `per_month` | Monthly flat fee. |
| `per_seat_per_month` | Per named user per month. |
| `per_year` | Annual flat fee. |

## `permissions.data_classes`

| Value | Meaning |
|---|---|
| `pii` | Personal identifying information. |
| `phi` | Protected health information. |
| `payment_card` | Card numbers, CVV, expiry. |
| `financial` | Bank accounts, transactions, statements. |
| `health` | Non-PHI health data (e.g. consumer wellness). |
| `government_id` | Passports, drivers' licences, national IDs. |
| `biometric` | Faceprints, voiceprints, fingerprints. |
| `location` | Geolocation, IP-inferred location. |
| `behavioral` | Browsing, clicks, app activity. |
| `credentials` | Passwords, tokens, keys. |
| `business_confidential` | Customer/employer trade secrets. |
| `public` | Already publicly available; no sensitivity. |

## `permissions.pii`

| Value | Meaning |
|---|---|
| `none` | No personal information processed. |
| `minimal` | Only contact-routing metadata (email, name). |
| `moderate` | Common business fields (address, phone, employer). |
| `extensive` | Government IDs, sensitive personal categories. |

## `permissions.third_party_sharing`

| Value | Meaning |
|---|---|
| `none` | Data stays inside the publisher's perimeter. |
| `subprocessors_only` | Shared with disclosed subprocessors only (DPA terms). |
| `broad` | Shared more widely; consumer should read the privacy policy. |

## `guardrails.refused_topics` (recommended vocabulary)

Free-form strings. The lint warns when a publisher uses values outside this list; consumers benefit from shared terms.

`financial_advice`, `medical_diagnosis`, `legal_counsel`, `investment_recommendation`, `political_endorsement`, `self_harm`, `violent_content`, `regulated_substances`.

## `guardrails.refused_actions` (recommended vocabulary)

Free-form strings.

`transfer_funds_to_new_payee`, `share_credentials`, `share_pii_outside_jurisdiction`, `delete_production_data`, `execute_unauthorized_code`, `auto_publish_to_external_channel`, `auto_sign_legal_document`.

## Adding new values

1. Open an ADR with the new value, the reason, and at least one existing or planned publisher who needs it.
2. Update the JSON Schema enum, the type alias in `src/validate/types.ts`, the markdown table above, and the relevant section of `docs/contract-schema.md`.
3. Bump the *minor* version of `airlock` (e.g. `0.4` → `0.4.1`) only if the addition is non-breaking. Breaking changes (renaming or removing a value) bump the major and require a migration note.
