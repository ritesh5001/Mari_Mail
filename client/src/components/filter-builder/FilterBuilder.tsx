"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { EntityType, FilterConfig } from "@marimail/types";
import { apiFetch } from "@/lib/browser-fetch";
import { CONTACT_SCHEMA_FIELDS } from "@/lib/contact-schema";
import { VESSEL_SCHEMA_FIELDS } from "@/lib/vessel-schema";

type FieldDef = {
  field: string;
  label: string;
  category: string;
  type: "text" | "enum" | "enumArray" | "number" | "boolean";
  options?: string[];
};

const contactFields: FieldDef[] = [
  ...CONTACT_SCHEMA_FIELDS.map((field) => ({
    field: String(field.key),
    label: field.label,
    category: field.group,
    type: field.key === "department" ? "enumArray" : "text",
  }) satisfies FieldDef),
  { field: "companyKind", label: "Company Type", category: "Company and Org", type: "enum", options: ["SHIP_OWNER", "ISM_MANAGER", "COMMERCIAL_MANAGER", "GENERIC"] },
  { field: "companyCountry", label: "Company Country", category: "Company", type: "text" },
  { field: "marineRole", label: "Marine Role", category: "Role and Department", type: "enum", options: ["FLEET_MANAGER", "SHIP_SUPERINTENDENT", "TECHNICAL_MANAGER", "CHARTERING_MANAGER", "PORT_AGENT", "CHANDLER", "BUNKER_TRADER", "OTHER"] },
  { field: "seniority", label: "Seniority", category: "Role and Department", type: "enum", options: ["ENTRY", "MID", "SENIOR", "MANAGER", "DIRECTOR", "VP", "C_LEVEL", "OWNER"] },
  { field: "hasMobilePhone", label: "Has Mobile Phone", category: "Phone and Communication", type: "boolean" },
  { field: "hasCorporatePhone", label: "Has Corporate Phone", category: "Phone and Communication", type: "boolean" },
  { field: "hasLinkedInProfile", label: "Has LinkedIn Profile", category: "Phone and Communication", type: "boolean" },
  { field: "emailStatus", label: "Email Status", category: "Email and Engagement", type: "enum", options: ["VALID", "RISKY", "INVALID", "UNKNOWN"] },
  { field: "engagementScore", label: "Engagement Score", category: "Email and Engagement", type: "number" },
  { field: "tags", label: "Tags", category: "Tags and Meta", type: "enumArray" },
  { field: "verified", label: "Verified", category: "Tags and Meta", type: "boolean" },
];

const numericVesselFilterFields = new Set([
  "speed",
  "course",
  "draught",
  "builtYear",
  "lengthOverall",
  "width",
  "capacityDwt",
  "draughtMax",
  "draughtMin",
  "capacityGt",
  "capacityTeu",
  "capacityLiquidGas",
  "capacityPassengers",
  "lengthBetweenPerpendiculars",
  "depth",
  "breadthExtreme",
  "capacityLiquidOil",
]);

const vesselFields: FieldDef[] = [
  { field: "vesselType", label: "Vessel Type", category: "Identity", type: "enum", options: ["BULK_CARRIER", "TANKER_CRUDE", "TANKER_PRODUCT", "TANKER_CHEMICAL", "TANKER_LPG", "TANKER_LNG", "CONTAINER", "GENERAL_CARGO", "RORO", "OFFSHORE_PSV", "OFFSHORE_AHTS", "OFFSHORE_DRILL", "FERRY", "CRUISE", "DREDGER", "HEAVY_LIFT", "BARGE", "SUPPLY_BOAT", "RESEARCH", "OTHER"] },
  ...VESSEL_SCHEMA_FIELDS.map((field) => ({
    field: String(field.key),
    label: field.label,
    category: field.group,
    type: numericVesselFilterFields.has(String(field.key)) ? "number" : "text",
  }) satisfies FieldDef),
  { field: "hasShipOwnerEmail", label: "Has Ship Owner Email", category: "Ownership and Management", type: "boolean" },
];

const operators = {
  text: ["contains", "equals", "not_equals", "starts_with", "ends_with", "ends_with_domain", "is_empty", "is_not_empty"],
  enum: ["equals", "not_equals", "is_any_of", "is_none_of"],
  enumArray: ["includes_any_of", "includes_all_of", "excludes", "is_empty", "is_not_empty"],
  number: ["equals", "greater_than", "less_than", "gte", "lte", "between"],
  boolean: ["equals"],
} as const;

const emptyConfig = (entityType: EntityType): FilterConfig => ({
  entityType,
  groupLogic: "AND",
  groups: [{ conditions: [{ field: entityType === "CONTACT" ? "marineRole" : "vesselType", operator: "equals", value: "" }] }],
});

export function FilterBuilder({
  entityType,
  initialConfig,
  onChange,
  onPreview,
}: {
  entityType: EntityType;
  initialConfig?: FilterConfig;
  onChange?: (config: FilterConfig) => void;
  onPreview?: () => void;
}) {
  const [config, setConfig] = useState<FilterConfig>(initialConfig ?? emptyConfig(entityType));
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [filterName, setFilterName] = useState("");
  const fields = entityType === "CONTACT" ? contactFields : vesselFields;

  const fieldByName = useMemo(() => new Map(fields.map((field) => [field.field, field])), [fields]);
  const fieldsByCategory = useMemo(() => {
    const grouped = new Map<string, FieldDef[]>();
    for (const field of fields) {
      grouped.set(field.category, [...(grouped.get(field.category) ?? []), field]);
    }
    return Array.from(grouped.entries());
  }, [fields]);

  useEffect(() => {
    onChange?.(config);
    const timer = window.setTimeout(() => {
      apiFetch(`/api/filter/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { data?: { count?: number } } | null) => {
          setPreviewCount(payload?.data?.count ?? null);
          onPreview?.();
        })
        .catch(() => undefined);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [config, onChange, onPreview]);

  function update(next: FilterConfig) {
    setConfig(next);
  }

  function updateCondition(groupIndex: number, conditionIndex: number, patch: Partial<FilterConfig["groups"][number]["conditions"][number]>) {
    update({
      ...config,
      groups: config.groups.map((group, currentGroupIndex) =>
        currentGroupIndex === groupIndex
          ? {
              ...group,
              conditions: group.conditions.map((condition, currentConditionIndex) =>
                currentConditionIndex === conditionIndex ? { ...condition, ...patch } : condition,
              ),
            }
          : group,
      ),
    });
  }

  async function saveFilter() {
    if (!filterName.trim()) return;
    await apiFetch(`/api/saved-filters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: filterName, entityType, filterConfig: config }),
    });
    setFilterName("");
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Filter Builder</p>
          <p className="text-xs text-slate-500">{previewCount === null ? "Preview pending" : `${previewCount.toLocaleString("en")} records match`}</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
          onClick={() => update({ ...config, groupLogic: config.groupLogic === "AND" ? "OR" : "AND" })}
        >
          {config.groupLogic}
        </button>
      </div>
      {config.groups.map((group, groupIndex) => (
        <div key={groupIndex} className="space-y-2 rounded-md bg-slate-50 p-3">
          {group.conditions.map((condition, conditionIndex) => {
            const selectedField = fieldByName.get(condition.field) ?? fields[0];
            const selectedOperators = operators[selectedField.type];
            return (
              <div key={conditionIndex} className="grid gap-2 md:grid-cols-[1fr_160px_1fr_36px]">
                <select
                  value={condition.field}
                  onChange={(event) => {
                    const field = fieldByName.get(event.target.value) ?? fields[0];
                    updateCondition(groupIndex, conditionIndex, {
                      field: field.field,
                      operator: operators[field.type][0],
                      value: field.type === "boolean" ? true : "",
                    });
                  }}
                  className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm"
                >
                  {fieldsByCategory.map(([category, categoryFields]) => (
                    <optgroup key={category} label={category}>
                      {categoryFields.map((field) => (
                        <option key={field.field} value={field.field}>
                          {field.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  value={condition.operator}
                  onChange={(event) => updateCondition(groupIndex, conditionIndex, { operator: event.target.value })}
                  className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm"
                >
                  {selectedOperators.map((operator) => (
                    <option key={operator} value={operator}>
                      {operator.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                {selectedField.type === "boolean" ? (
                  <select
                    value={condition.value === false ? "false" : "true"}
                    onChange={(event) => updateCondition(groupIndex, conditionIndex, { value: event.target.value === "true" })}
                    className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : selectedField.options ? (
                  <select
                    value={Array.isArray(condition.value) ? String(condition.value[0] ?? "") : String(condition.value ?? "")}
                    onChange={(event) =>
                      updateCondition(groupIndex, conditionIndex, {
                        value: selectedField.type === "enumArray" || condition.operator.includes("any") ? [event.target.value] : event.target.value,
                      })
                    }
                    className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm"
                  >
                    <option value="">Select value</option>
                    {selectedField.options.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={Array.isArray(condition.value) ? condition.value.join(",") : String(condition.value ?? "")}
                    onChange={(event) => updateCondition(groupIndex, conditionIndex, { value: event.target.value })}
                    className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm"
                    placeholder="Value"
                  />
                )}
                <button
                  type="button"
                  className="rounded-md border border-slate-300 p-2 text-slate-600"
                  onClick={() =>
                    update({
                      ...config,
                      groups: config.groups.map((current, currentIndex) =>
                        currentIndex === groupIndex
                          ? { ...current, conditions: current.conditions.filter((_, index) => index !== conditionIndex) }
                          : current,
                      ),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
            onClick={() =>
              update({
                ...config,
                groups: config.groups.map((current, index) =>
                  index === groupIndex
                    ? { ...current, conditions: [...current.conditions, { field: fields[0].field, operator: operators[fields[0].type][0], value: "" }] }
                    : current,
                ),
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add Condition
          </button>
        </div>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          onClick={() =>
            update({
              ...config,
              groups: [...config.groups, { conditions: [{ field: fields[0].field, operator: operators[fields[0].type][0], value: "" }] }],
            })
          }
        >
          Add Group
        </button>
        <input
          value={filterName}
          onChange={(event) => setFilterName(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Saved filter name"
        />
        <button type="button" className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white" onClick={saveFilter}>
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>
    </div>
  );
}
