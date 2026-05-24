/**
 * Derive an A2A v1.0 Agent Card from a validated Airlock contract.
 *
 * Per ADR 0007 + ADR 0008-as-paragraph: the Airlock contract is the source of
 * truth; the Agent Card is derived. Publishers never hand-author both files —
 * `airlock build-site` writes both, and the per-contract `a2a` block in the
 * schema covers the few fields the Agent Card needs that aren't already
 * derivable from existing Airlock fields.
 *
 * Reference: A2A v1.0 specification at https://a2a-protocol.org/latest/specification/
 */

import type {
  AirlockContract,
  AuthMethod,
  Skill,
} from "../validate/types.js";

export type BuildAgentCardOptions = {
  /** URL where the airlock.yaml is hosted; used to derive endpoint defaults + the back-pointer extension. */
  contractUrl: string;
  /** Override the A2A endpoint URL; defaults to <contract.a2a.endpoint_url> ?? <contractUrl>/../a2a. */
  endpointUrl?: string;
};

export type AgentCard = {
  id: string;
  name: string;
  description: string;
  url: string;
  provider: AgentCardProvider;
  capabilities: AgentCardCapabilities;
  skills: AgentCardSkill[];
  securitySchemes: Record<string, AgentCardSecurityScheme>;
  security: Array<Record<string, string[]>>;
  extensions?: AgentCardExtension[];
  /** v0.5 will populate this. v0.4.1 leaves it undefined. */
  signature?: AgentCardSignature;
};

export type AgentCardProvider = {
  name: string;
  url?: string;
  email?: string;
};

export type AgentCardCapabilities = {
  streaming: boolean;
  push_notifications: boolean;
  state_transition_history: boolean;
};

export type AgentCardSkill = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  mediaTypes: { input: string[]; output: string[] };
};

export type AgentCardSecurityScheme =
  | { type: "apiKey"; in: "header" | "query" | "cookie"; name: string }
  | { type: "http"; scheme: "bearer" | "basic" }
  | {
      type: "oauth2";
      flows: { clientCredentials?: { tokenUrl: string; scopes: Record<string, string> } } & Record<string, unknown>;
    }
  | { type: "openIdConnect"; openIdConnectUrl: string }
  | { type: "mutualTLS" };

export type AgentCardExtension = {
  uri: string;
  value: string;
};

export type AgentCardSignature = {
  algorithm: string;
  signature: string;
  publicKeyUrl: string;
  keyId?: string;
};

export function buildAgentCard(
  contract: AirlockContract,
  opts: BuildAgentCardOptions,
): AgentCard {
  const a2a = contract.a2a ?? {};
  const capabilities: AgentCardCapabilities = {
    streaming: a2a.capabilities?.streaming ?? false,
    push_notifications: a2a.capabilities?.push_notifications ?? false,
    state_transition_history: a2a.capabilities?.state_transition_history ?? false,
  };

  const provider: AgentCardProvider = {
    name: contract.agent.contact?.name ?? contract.agent.name,
    ...(contract.agent.contact?.url ? { url: contract.agent.contact.url } : {}),
    ...(contract.agent.contact?.email ? { email: contract.agent.contact.email } : {}),
  };

  const defaultInputModes = a2a.default_input_modes ?? ["application/json"];
  const defaultOutputModes = a2a.default_output_modes ?? ["application/json"];

  const skills: AgentCardSkill[] = contract.skills.map((s) =>
    toAgentCardSkill(s, defaultInputModes, defaultOutputModes),
  );

  const { securitySchemes, security } = deriveSecurity(contract);

  const url = opts.endpointUrl ?? a2a.endpoint_url ?? deriveEndpointUrl(opts.contractUrl);

  const extensions: AgentCardExtension[] = [
    { uri: "airlock-contract", value: opts.contractUrl },
  ];

  return {
    id: `${contract.agent.name}@${contract.agent.version}`,
    name: contract.agent.name,
    description: contract.agent.description ?? contract.agent.name,
    url,
    provider,
    capabilities,
    skills,
    securitySchemes,
    security,
    extensions,
  };
}

function toAgentCardSkill(
  skill: Skill,
  defaultInput: string[],
  defaultOutput: string[],
): AgentCardSkill {
  const out: AgentCardSkill = {
    name: skill.id,
    inputSchema: skill.input as Record<string, unknown>,
    outputSchema: skill.output as Record<string, unknown>,
    mediaTypes: { input: defaultInput, output: defaultOutput },
  };
  if (skill.description) out.description = skill.description;
  return out;
}

/**
 * Map Airlock's auth_model.methods onto A2A's SecuritySchemes. Per the spec each
 * named scheme appears in `securitySchemes` and the consumer picks any one of
 * them via the `security` requirements list.
 */
function deriveSecurity(contract: AirlockContract): {
  securitySchemes: Record<string, AgentCardSecurityScheme>;
  security: Array<Record<string, string[]>>;
} {
  const methods = contract.auth_model?.methods ?? [];
  const securitySchemes: Record<string, AgentCardSecurityScheme> = {};

  for (const method of methods) {
    const [key, scheme] = mapAuthMethod(method);
    securitySchemes[key] = scheme;
  }

  // If no auth model declared, leave securitySchemes empty and security as a
  // single empty-requirements set so consumers know auth is optional.
  if (Object.keys(securitySchemes).length === 0) {
    return { securitySchemes: {}, security: [{}] };
  }

  // Each declared scheme is acceptable on its own.
  const security = Object.keys(securitySchemes).map((name) => ({ [name]: [] }));
  return { securitySchemes, security };
}

function mapAuthMethod(method: AuthMethod): [string, AgentCardSecurityScheme] {
  switch (method) {
    case "none":
      return ["none", { type: "http", scheme: "bearer" }]; // placeholder; consumers ignore when no security required
    case "api_key":
      return ["api_key", { type: "apiKey", in: "header", name: "X-API-Key" }];
    case "oauth2_client_credentials":
      return [
        "oauth2_client_credentials",
        {
          type: "oauth2",
          flows: {
            clientCredentials: {
              tokenUrl: "https://example.invalid/oauth/token", // publisher overrides via documentation_url
              scopes: {},
            },
          },
        },
      ];
    case "oauth2_auth_code":
      return [
        "oauth2_auth_code",
        {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: "https://example.invalid/oauth/authorize",
              tokenUrl: "https://example.invalid/oauth/token",
              scopes: {},
            },
          },
        },
      ];
    case "mtls":
      return ["mtls", { type: "mutualTLS" }];
    case "signed_jwt":
      return ["signed_jwt", { type: "http", scheme: "bearer" }];
    case "webauthn":
      return ["webauthn", { type: "http", scheme: "bearer" }];
  }
}

/**
 * Given a contract URL like https://bank.example.com/.well-known/airlock.yaml,
 * derive a sensible A2A endpoint at https://bank.example.com/a2a. Falls back to
 * the contract URL itself if parsing fails.
 */
function deriveEndpointUrl(contractUrl: string): string {
  try {
    const u = new URL(contractUrl);
    u.pathname = "/a2a";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return contractUrl;
  }
}
