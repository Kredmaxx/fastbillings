import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useSelector } from "react-redux";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import Constants from "@constants/api";
import type { RootState } from "@store/index";

type TabId = "docs" | "keys";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  hint: string;
  status: "active" | "revoked" | "expired";
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type JsonSchema = {
  type?: string;
  format?: string;
  example?: unknown;
  enum?: unknown[];
  nullable?: boolean;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  allOf?: JsonSchema[];
  $ref?: string;
};

type MediaContent = {
  schema?: JsonSchema;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
};

type OpenApiParam = {
  name: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
};

type OpenApiResponse = {
  description?: string;
  content?: Record<string, MediaContent>;
  $ref?: string;
};

type OpenApiOp = {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  parameters?: OpenApiParam[];
  security?: Array<Record<string, string[]>>;
  requestBody?: {
    description?: string;
    required?: boolean;
    content?: Record<string, MediaContent>;
  };
  responses?: Record<string, OpenApiResponse>;
};

type OpenApiSpec = {
  info?: { title?: string; version?: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<string, Partial<Record<HttpMethod, OpenApiOp>>>;
  tags?: Array<{ name: string; description?: string }>;
  components?: {
    schemas?: Record<string, JsonSchema>;
    responses?: Record<string, OpenApiResponse>;
  };
};

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

type DocResponse = {
  code: string;
  description: string;
  sample: unknown;
  hasSchema: boolean;
};

type DocEndpoint = {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  tag: string;
  authRequired: boolean;
  parameters: OpenApiParam[];
  requestBody: {
    required: boolean;
    schema?: JsonSchema;
    sample: unknown;
  } | null;
  responses: DocResponse[];
};

const METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete"];

const METHOD_STYLES: Record<HttpMethod, string> = {
  get: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  post: "bg-blue-50 text-blue-700 ring-blue-200",
  put: "bg-amber-50 text-amber-800 ring-amber-200",
  patch: "bg-violet-50 text-violet-700 ring-violet-200",
  delete: "bg-rose-50 text-rose-700 ring-rose-200",
};

/** Product-wise sidebar sections — OpenAPI tags map into these groups. */
const PRODUCT_SECTIONS: Array<{
  id: string;
  title: string;
  description: string;
  tags: string[];
}> = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Auth, API keys, workspace, and public endpoints.",
    tags: ["Auth", "API Keys", "Public", "Tenants", "Plans"],
  },
  {
    id: "sales",
    title: "Sales & CRM",
    description: "Customers, invoices, quotations, and reminders.",
    tags: ["Customers", "Invoices", "Quotations", "Reminders"],
  },
  {
    id: "inventory",
    title: "Inventory & Catalog",
    description: "Products, stock, and valuation.",
    tags: ["Products", "Inventory"],
  },
  {
    id: "purchases",
    title: "Purchases",
    description: "Suppliers, POs, purchases, and debit notes.",
    tags: ["Purchases"],
  },
  {
    id: "finance",
    title: "Finance",
    description: "Expenses, banking, and payments.",
    tags: ["Expenses", "Banking", "Payments"],
  },
  {
    id: "accounting",
    title: "Accounting & Tax",
    description: "Ledgers, GST, e-invoice, and reports.",
    tags: ["Accounting", "Tax & GST", "E-Invoice", "Reports", "Dashboard"],
  },
  {
    id: "workspace",
    title: "Workspace",
    description: "Settings, users, AI, and integrations.",
    tags: ["Settings", "Users & Roles", "Audit", "Integrations", "AI"],
  },
];

/** Hide FastBillings platform / super-admin APIs from tenant docs. */
const SUPER_ADMIN_TAGS = new Set(["Platform"]);

function isTenantFacingApi(path: string, tag: string): boolean {
  if (SUPER_ADMIN_TAGS.has(tag)) return false;
  if (path.includes("/platform/")) return false;
  if (path.startsWith("/admin/platform")) return false;
  return true;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function refName(ref: string): string {
  return ref.split("/").pop() || ref;
}

function resolveSchema(
  schema: JsonSchema | undefined,
  spec: OpenApiSpec,
  seen = new Set<string>()
): JsonSchema | undefined {
  if (!schema) return undefined;
  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (seen.has(name)) return {};
    seen.add(name);
    const target = spec.components?.schemas?.[name];
    return resolveSchema(target, spec, seen);
  }
  if (schema.allOf?.length) {
    const merged: JsonSchema = { type: "object", properties: {}, required: [] };
    for (const part of schema.allOf) {
      const r = resolveSchema(part, spec, new Set(seen));
      if (r?.properties) Object.assign(merged.properties!, r.properties);
      if (r?.required) merged.required!.push(...r.required);
    }
    return merged;
  }
  return schema;
}

function sampleFromSchema(
  schema: JsonSchema | undefined,
  spec: OpenApiSpec,
  depth = 0,
  seen = new Set<string>()
): unknown {
  if (!schema || depth > 6) return null;
  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (seen.has(name)) return {};
    const next = new Set(seen);
    next.add(name);
    return sampleFromSchema(
      spec.components?.schemas?.[name],
      spec,
      depth + 1,
      next
    );
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.allOf?.length) {
    const merged: Record<string, unknown> = {};
    for (const part of schema.allOf) {
      const val = sampleFromSchema(part, spec, depth, seen);
      if (val && typeof val === "object" && !Array.isArray(val)) {
        Object.assign(merged, val);
      }
    }
    return merged;
  }
  if (schema.enum?.length) return schema.enum[0];

  switch (schema.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        obj[key] = sampleFromSchema(prop, spec, depth + 1, seen);
      }
      return obj;
    }
    case "array":
      return [sampleFromSchema(schema.items, spec, depth + 1, seen)];
    case "integer":
    case "number":
      return schema.format === "float" ? 0.0 : 0;
    case "boolean":
      return true;
    case "string":
      if (schema.nullable) return null;
      if (schema.format === "date-time") return "2026-07-16T18:42:00.000Z";
      if (schema.format === "date") return "2026-07-16";
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uuid")
        return "00000000-0000-0000-0000-000000000000";
      return "string";
    default:
      return schema.nullable ? null : null;
  }
}

function contentSample(content: MediaContent | undefined, spec: OpenApiSpec) {
  if (!content) return undefined;
  if (content.example !== undefined) return content.example;
  const firstNamed = content.examples
    ? Object.values(content.examples)[0]?.value
    : undefined;
  if (firstNamed !== undefined) return firstNamed;
  return sampleFromSchema(content.schema, spec);
}

function jsonContent(
  content: Record<string, MediaContent> | undefined
): MediaContent | undefined {
  if (!content) return undefined;
  return content["application/json"] ?? Object.values(content)[0];
}

function parseEndpoints(spec: OpenApiSpec): DocEndpoint[] {
  const out: DocEndpoint[] = [];
  const paths = spec.paths ?? {};
  for (const [path, methods] of Object.entries(paths)) {
    if (!methods) continue;
    for (const method of METHODS) {
      const op = methods[method];
      if (!op) continue;
      const tag = op.tags?.[0] || "Other";
      if (!isTenantFacingApi(path, tag)) continue;
      const authRequired = Array.isArray(op.security)
        ? op.security.length > 0
        : true;

      let requestBody: DocEndpoint["requestBody"] = null;
      const reqJson = jsonContent(op.requestBody?.content);
      if (reqJson) {
        requestBody = {
          required: !!op.requestBody?.required,
          schema: resolveSchema(reqJson.schema, spec),
          sample: contentSample(reqJson, spec),
        };
      }

      const responses: DocResponse[] = Object.entries(op.responses ?? {}).map(
        ([code, raw]) => {
          const resolved = raw.$ref
            ? spec.components?.responses?.[refName(raw.$ref)] ?? raw
            : raw;
          const rJson = jsonContent(resolved.content);
          return {
            code,
            description: resolved.description || "",
            sample: rJson ? contentSample(rJson, spec) : undefined,
            hasSchema: !!rJson,
          };
        }
      );

      out.push({
        id: `${method}:${path}`,
        method,
        path,
        summary: op.summary || `${method.toUpperCase()} ${path}`,
        description: op.description || "",
        tag,
        authRequired,
        parameters: op.parameters ?? [],
        requestBody,
        responses,
      });
    }
  }
  return out.sort((a, b) => {
    if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });
}

function typeLabel(schema?: JsonSchema): string {
  if (!schema) return "—";
  if (schema.$ref) return refName(schema.$ref);
  if (schema.type === "array") {
    const item = schema.items;
    const inner = item?.$ref ? refName(item.$ref) : item?.type || "object";
    return `${inner}[]`;
  }
  return schema.format ? `${schema.type} (${schema.format})` : schema.type || "object";
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function CodeBlock({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#5B7A9D]">
          {label}
        </p>
        <button
          type="button"
          onClick={() => {
            void copyText(value).then(() => toast.success("Copied"));
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#0066FF] hover:text-[#0052CC]"
        >
          <Copy size={12} />
          Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-[#000B1E] p-3 text-[11px] leading-relaxed text-[#A8BDD9]">
        {value}
      </pre>
    </div>
  );
}

function SchemaTable({
  schema,
  spec,
}: {
  schema?: JsonSchema;
  spec: OpenApiSpec;
}) {
  const resolved = resolveSchema(schema, spec);
  const props = resolved?.type === "array"
    ? resolveSchema(resolved.items, spec)?.properties
    : resolved?.properties;
  const required = new Set(
    (resolved?.type === "array"
      ? resolveSchema(resolved.items, spec)?.required
      : resolved?.required) ?? []
  );
  if (!props || Object.keys(props).length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-[#D6E4FF] bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#F4F8FF] text-[#5B7A9D]">
          <tr>
            <th className="px-3 py-2 font-semibold">Field</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Required</th>
            <th className="px-3 py-2 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(props).map(([key, prop]) => (
            <tr key={key} className="border-t border-[#E8EEF8]">
              <td className="px-3 py-2 font-mono text-[#0B1533]">{key}</td>
              <td className="px-3 py-2 text-[#0052CC]">{typeLabel(prop)}</td>
              <td className="px-3 py-2 text-[#5B7A9D]">
                {required.has(key) ? "yes" : "no"}
              </td>
              <td className="px-3 py-2 text-[#5B7A9D]">
                {prop.description || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointCard({
  endpoint,
  baseUrl,
  spec,
}: {
  endpoint: DocEndpoint;
  baseUrl: string;
  spec: OpenApiSpec;
}) {
  const [open, setOpen] = useState(false);

  const bodyFlag =
    endpoint.requestBody?.sample !== undefined
      ? ` \\\n  -d '${JSON.stringify(endpoint.requestBody.sample)}'`
      : "";
  const curl = `curl -X ${endpoint.method.toUpperCase()} "${baseUrl}${endpoint.path}" \\\n  -H "Authorization: Bearer fb_live_YOUR_KEY" \\\n  -H "Content-Type: application/json"${bodyFlag}`;

  return (
    <div className="border-b border-[#E8EEF8] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[#F4F8FF]/80"
      >
        <span
          className={`mt-0.5 inline-flex min-w-[3.5rem] justify-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${METHOD_STYLES[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px] font-medium text-[#0B1533]">
            {endpoint.path}
          </p>
          <p className="mt-0.5 truncate text-sm text-[#5B7A9D]">
            {endpoint.summary}
          </p>
        </div>
        {open ? (
          <ChevronDown size={16} className="mt-1 shrink-0 text-[#5B7A9D]" />
        ) : (
          <ChevronRight size={16} className="mt-1 shrink-0 text-[#5B7A9D]" />
        )}
      </button>

      {open && (
        <div className="space-y-4 bg-[#F8FBFF] px-4 pb-5 pt-2">
          {endpoint.description && (
            <p className="text-sm leading-relaxed text-[#5B7A9D]">
              {endpoint.description}
            </p>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white px-2.5 py-1 font-medium text-[#0B1533] ring-1 ring-[#D6E4FF]">
              {endpoint.authRequired ? "Auth required" : "Public"}
            </span>
            {endpoint.responses.map((r) => (
              <span
                key={r.code}
                className="rounded-full bg-white px-2.5 py-1 font-mono text-[#5B7A9D] ring-1 ring-[#D6E4FF]"
              >
                {r.code}
              </span>
            ))}
          </div>

          {endpoint.parameters.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#5B7A9D]">
                Parameters
              </p>
              <div className="overflow-hidden rounded-lg border border-[#D6E4FF] bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F4F8FF] text-[#5B7A9D]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">In</th>
                      <th className="px-3 py-2 font-semibold">Required</th>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoint.parameters.map((p) => (
                      <tr
                        key={`${p.in}-${p.name}`}
                        className="border-t border-[#E8EEF8]"
                      >
                        <td className="px-3 py-2 font-mono text-[#0B1533]">
                          {p.name}
                        </td>
                        <td className="px-3 py-2 text-[#5B7A9D]">
                          {p.in || "—"}
                        </td>
                        <td className="px-3 py-2 text-[#5B7A9D]">
                          {p.required ? "yes" : "no"}
                        </td>
                        <td className="px-3 py-2 text-[#0052CC]">
                          {typeLabel(p.schema)}
                        </td>
                        <td className="px-3 py-2 text-[#5B7A9D]">
                          {p.description || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {endpoint.requestBody && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5B7A9D]">
                Request body{" "}
                {endpoint.requestBody.required && (
                  <span className="text-rose-500">*required</span>
                )}
              </p>
              <SchemaTable schema={endpoint.requestBody.schema} spec={spec} />
              {endpoint.requestBody.sample !== undefined && (
                <CodeBlock
                  label="Sample request"
                  value={JSON.stringify(endpoint.requestBody.sample, null, 2)}
                />
              )}
            </div>
          )}

          <CodeBlock label="cURL" value={curl} />

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5B7A9D]">
              Responses
            </p>
            {endpoint.responses.map((r) => (
              <div
                key={r.code}
                className="rounded-lg border border-[#D6E4FF] bg-white p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      r.code.startsWith("2")
                        ? "bg-emerald-50 text-emerald-700"
                        : r.code.startsWith("4")
                          ? "bg-amber-50 text-amber-700"
                          : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {r.code}
                  </span>
                  <span className="text-xs text-[#5B7A9D]">
                    {r.description || "—"}
                  </span>
                </div>
                {r.sample !== undefined && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-[#000B1E] p-3 text-[11px] leading-relaxed text-[#A8BDD9]">
                    {JSON.stringify(r.sample, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentationTab() {
  const [spec, setSpec] = useState<OpenApiSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState("getting-started");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(["getting-started"])
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get<OpenApiSpec>(Constants.API_DOCS_JSON_URL);
        if (!cancelled) setSpec(res.data);
      } catch {
        if (!cancelled) setError("Could not load API documentation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const endpoints = useMemo(
    () => (spec ? parseEndpoints(spec) : []),
    [spec]
  );

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of endpoints) {
      map.set(e.tag, (map.get(e.tag) ?? 0) + 1);
    }
    return map;
  }, [endpoints]);

  const knownTags = useMemo(
    () => new Set(PRODUCT_SECTIONS.flatMap((s) => s.tags)),
    []
  );

  const otherTags = useMemo(() => {
    const tags = [...tagCounts.keys()].filter((t) => !knownTags.has(t));
    return tags.sort((a, b) => a.localeCompare(b));
  }, [tagCounts, knownTags]);

  const sections = useMemo(() => {
    const list = PRODUCT_SECTIONS.map((s) => ({
      ...s,
      tags: s.tags.filter((t) => (tagCounts.get(t) ?? 0) > 0),
      count: s.tags.reduce((n, t) => n + (tagCounts.get(t) ?? 0), 0),
    })).filter((s) => s.count > 0);

    if (otherTags.length > 0) {
      list.push({
        id: "other",
        title: "Other",
        description: "Additional API groups.",
        tags: otherTags,
        count: otherTags.reduce((n, t) => n + (tagCounts.get(t) ?? 0), 0),
      });
    }
    return list;
  }, [tagCounts, otherTags]);

  useEffect(() => {
    if (sections.length === 0) return;
    if (!sections.some((s) => s.id === activeSection)) {
      setActiveSection(sections[0].id);
      setActiveTag(null);
      setExpandedSections(new Set([sections[0].id]));
    }
  }, [sections, activeSection]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const section = sections.find((s) => s.id === activeSection);
    const sectionTags = new Set(section?.tags ?? []);

    return endpoints.filter((e) => {
      const inSection = sectionTags.has(e.tag);
      const tagMatch = activeTag ? e.tag === activeTag : inSection;
      if (!tagMatch) return false;
      if (!q) return true;
      return (
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.method.includes(q) ||
        e.tag.toLowerCase().includes(q)
      );
    });
  }, [endpoints, activeSection, activeTag, query, sections]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocEndpoint[]>();
    for (const e of filtered) {
      const list = map.get(e.tag) ?? [];
      list.push(e);
      map.set(e.tag, list);
    }
    const section = sections.find((s) => s.id === activeSection);
    const order = section?.tags ?? [];
    return order
      .filter((t) => map.has(t))
      .map((t) => [t, map.get(t)!] as const);
  }, [filtered, sections, activeSection]);

  const currentSection = sections.find((s) => s.id === activeSection);
  const baseUrl = Constants.API_BASE_URL;

  function selectSection(id: string) {
    setActiveSection(id);
    setActiveTag(null);
    setExpandedSections((prev) => new Set(prev).add(id));
  }

  function selectTag(sectionId: string, tag: string) {
    setActiveSection(sectionId);
    setActiveTag(tag);
    setExpandedSections((prev) => new Set(prev).add(sectionId));
  }

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#5B7A9D]">
        <Loader2 size={16} className="animate-spin" />
        Loading documentation…
      </div>
    );
  }

  if (error || !spec) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700">
        {error || "Documentation unavailable."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Product sidebar */}
      <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-64 lg:self-start">
        <div className="overflow-hidden rounded-xl border border-[#D6E4FF] bg-white">
          <div className="border-b border-[#E8EEF8] bg-[#F4F8FF] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5B7A9D]">
              Products
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[#0B1533]">
              API reference
            </p>
          </div>

          <nav className="max-h-[70vh] overflow-y-auto p-2">
            {sections.map((section) => {
              const expanded = expandedSections.has(section.id);
              const sectionActive =
                activeSection === section.id && activeTag === null;
              return (
                <div key={section.id} className="mb-1">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => selectSection(section.id)}
                      className={`flex min-w-0 flex-1 items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition ${
                        sectionActive
                          ? "bg-[#0066FF] text-white"
                          : activeSection === section.id
                            ? "bg-[#E8F1FF] text-[#0052CC]"
                            : "text-[#0B1533] hover:bg-[#F4F8FF]"
                      }`}
                    >
                      <span className="truncate">{section.title}</span>
                      <span
                        className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          sectionActive
                            ? "bg-white/20 text-white"
                            : "bg-[#E8EEF8] text-[#5B7A9D]"
                        }`}
                      >
                        {section.count}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={expanded ? "Collapse" : "Expand"}
                      onClick={() => toggleSection(section.id)}
                      className="rounded-md p-1.5 text-[#5B7A9D] hover:bg-[#F4F8FF] hover:text-[#0B1533]"
                    >
                      {expanded ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                  </div>

                  {expanded && (
                    <ul className="mt-0.5 space-y-0.5 border-l border-[#D6E4FF] ml-3 pl-2">
                      {section.tags.map((tag) => {
                        const count = tagCounts.get(tag) ?? 0;
                        const active =
                          activeSection === section.id && activeTag === tag;
                        return (
                          <li key={tag}>
                            <button
                              type="button"
                              onClick={() => selectTag(section.id, tag)}
                              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                                active
                                  ? "bg-[#0066FF]/10 font-semibold text-[#0066FF]"
                                  : "text-[#5B7A9D] hover:bg-[#F4F8FF] hover:text-[#0B1533]"
                              }`}
                            >
                              <span className="truncate">{tag}</span>
                              <span className="ml-2 text-[10px] tabular-nums opacity-70">
                                {count}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5B7A9D]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search endpoints in this product…"
              className="w-full rounded-xl border border-[#D6E4FF] bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#0066FF] focus:ring-2 focus:ring-[#0066FF]/20"
            />
          </div>
          <span className="shrink-0 rounded-lg bg-[#F4F8FF] px-3 py-2 text-sm font-medium text-[#0B1533] ring-1 ring-[#D6E4FF]">
            {filtered.length} endpoints
            {spec.info?.version ? ` · v${spec.info.version}` : ""}
          </span>
        </div>

        {activeSection === "getting-started" && !activeTag && !query && (
          <div className="rounded-xl border border-[#D6E4FF] bg-gradient-to-br from-[#F4F8FF] to-white p-5">
            <h3 className="text-base font-semibold text-[#0B1533]">
              {currentSection?.title}
            </h3>
            <p className="mt-1 text-sm text-[#5B7A9D]">
              {currentSection?.description}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-white p-3 ring-1 ring-[#D6E4FF]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5B7A9D]">
                  Base URL
                </p>
                <code className="mt-1 block break-all text-sm text-[#0052CC]">
                  {baseUrl}
                </code>
              </div>
              <div className="rounded-lg bg-white p-3 ring-1 ring-[#D6E4FF]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5B7A9D]">
                  Authentication
                </p>
                <p className="mt-1 text-sm text-[#0B1533]">
                  JWT via <code className="text-xs">POST /auth/login</code>, or
                  API key <code className="text-xs">fb_live_…</code> as Bearer /{" "}
                  <code className="text-xs">X-API-Key</code>.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentSection && (activeTag || activeSection !== "getting-started") && (
          <div className="rounded-xl border border-[#D6E4FF] bg-[#F4F8FF]/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5B7A9D]">
              {currentSection.title}
              {activeTag ? ` / ${activeTag}` : ""}
            </p>
            <p className="mt-0.5 text-sm text-[#0B1533]">
              {activeTag
                ? `Endpoints for ${activeTag}`
                : currentSection.description}
            </p>
          </div>
        )}

        {grouped.length === 0 ? (
          <div className="rounded-xl border border-[#D6E4FF] bg-white py-12 text-center text-sm text-[#5B7A9D]">
            No endpoints match your search in this product.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([tag, items]) => (
              <section
                key={tag}
                id={`api-tag-${tag.replace(/\s+/g, "-").toLowerCase()}`}
                className="overflow-hidden rounded-xl border border-[#D6E4FF] bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-[#E8EEF8] bg-[#F4F8FF] px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0B1533]">
                      {tag}
                    </h3>
                    <p className="text-xs text-[#5B7A9D]">
                      {items.length} endpoint{items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div>
                  {items.map((endpoint) => (
                    <EndpointCard
                      key={endpoint.id}
                      endpoint={endpoint}
                      baseUrl={baseUrl}
                      spec={spec}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApiKeysTab() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const authHeader = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadKeys = useCallback(async () => {
    try {
      const res = await axios.get(Constants.API_KEYS_URL, {
        headers: authHeader(),
      });
      setKeys(res.data?.data ?? []);
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : "Failed to load API keys";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Enter a name for this key (min 2 characters).");
      return;
    }
    setCreating(true);
    try {
      const body: { name: string; expiresInDays?: number } = { name: trimmed };
      const days = Number(expiresInDays);
      if (expiresInDays && !Number.isNaN(days) && days > 0) {
        body.expiresInDays = days;
      }
      const res = await axios.post(Constants.API_KEYS_URL, body, {
        headers: authHeader(),
      });
      const key = res.data?.data?.key as string | undefined;
      if (key) setFreshKey(key);
      setName("");
      setExpiresInDays("");
      toast.success("API key created — copy it now.");
      await loadKeys();
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : "Could not create API key";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (
      !window.confirm(
        "Revoke this API key? Integrations using it will stop working."
      )
    ) {
      return;
    }
    setRevokingId(id);
    try {
      await axios.delete(`${Constants.API_KEYS_URL}/${id}`, {
        headers: authHeader(),
      });
      toast.success("API key revoked.");
      await loadKeys();
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : "Could not revoke key";
      toast.error(msg);
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[#0B1533]">
          <KeyRound size={18} className="text-[#0066FF]" />
          API keys
        </h2>
        <p className="mt-0.5 text-sm text-[#5B7A9D]">
          Secrets are shown once. Revoke unused keys promptly.
        </p>
      </div>

      {freshKey && (
        <div className="rounded-xl border border-[#00D2FF]/40 bg-[#E8F9FF] p-4">
          <p className="text-sm font-semibold text-[#0B1533]">
            Copy your new key now — it won’t be shown again.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-xs text-[#000B1E] ring-1 ring-[#D6E4FF]">
              {freshKey}
            </code>
            <button
              type="button"
              onClick={() => {
                void copyText(freshKey).then(() => {
                  setCopied(true);
                  toast.success("Copied to clipboard");
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0066FF] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0052CC]"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-[#5B7A9D] underline-offset-2 hover:underline"
            onClick={() => setFreshKey(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="flex flex-col gap-3 rounded-xl border border-[#D6E4FF] bg-white p-4 sm:flex-row sm:items-end"
      >
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-[#0B1533]">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production integrations"
            className="w-full rounded-lg border border-[#D6E4FF] px-3 py-2 text-sm outline-none focus:border-[#0066FF] focus:ring-2 focus:ring-[#0066FF]/20"
          />
        </label>
        <label className="w-full text-sm sm:w-36">
          <span className="mb-1 block font-medium text-[#0B1533]">
            Expires (days)
          </span>
          <input
            type="number"
            min={1}
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-[#D6E4FF] px-3 py-2 text-sm outline-none focus:border-[#0066FF] focus:ring-2 focus:ring-[#0066FF]/20"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0066FF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0052CC] disabled:opacity-60"
        >
          {creating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          Generate key
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-[#D6E4FF] bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#5B7A9D]">
            <Loader2 size={16} className="animate-spin" />
            Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#5B7A9D]">
            No API keys yet. Generate one to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E8EEF8] bg-[#F4F8FF] text-xs uppercase tracking-wide text-[#5B7A9D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Key</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Last used</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr
                    key={k.id}
                    className="border-b border-[#E8EEF8] last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-[#0B1533]">
                      {k.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#5B7A9D]">
                      {k.hint}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          k.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : k.status === "expired"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {k.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#5B7A9D]">
                      {formatDate(k.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-[#5B7A9D]">
                      {formatDate(k.lastUsedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.status === "active" && (
                        <button
                          type="button"
                          disabled={revokingId === k.id}
                          onClick={() => void handleRevoke(k.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          {revokingId === k.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApiDocs() {
  const [tab, setTab] = useState<TabId>("docs");

  const tabs: Array<{ id: TabId; label: string; icon: typeof BookOpen }> = [
    { id: "docs", label: "API Documentation", icon: BookOpen },
    { id: "keys", label: "API Keys", icon: KeyRound },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#000B1E] via-[#0B1533] to-[#0052CC] px-6 py-8 text-white shadow-lg sm:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse at 80% 20%, #00D2FF44 0%, transparent 55%)",
          }}
        />
        <div className="relative">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#00D2FF]">
            Developers
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            API documentation
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#A8BDD9]">
            Browse every FastBillings endpoint in-app, then generate workspace
            API keys to call them from your integrations.
          </p>
        </div>
      </header>

      <div className="flex gap-1 rounded-xl border border-[#D6E4FF] bg-[#F4F8FF] p-1">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-white text-[#0B1533] shadow-sm"
                  : "text-[#5B7A9D] hover:text-[#0B1533]"
              }`}
            >
              <Icon size={16} className={active ? "text-[#0066FF]" : ""} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "docs" ? <DocumentationTab /> : <ApiKeysTab />}
    </div>
  );
}
