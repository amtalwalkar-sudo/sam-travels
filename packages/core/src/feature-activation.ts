import { createReadonlyRegistry } from "./readonly-registry";
import {
  registerFeatures,
  type FeatureDefinition,
  type FeatureDependency,
  type FeatureId,
} from "./features";

export type FeatureActivationState = "active" | "blocked" | "rejected";
export type FeatureActivationDiagnostic = Readonly<{
  code:
    | "duplicate_feature"
    | "invalid_feature_declaration"
    | "missing_required_dependency"
    | "incompatible_required_dependency"
    | "required_dependency_unavailable"
    | "optional_dependency_unavailable"
    | "optional_dependency_incompatible"
    | "dependency_cycle";
  featureId: FeatureId;
  dependencyId?: FeatureId;
  message: string;
}>;
export type FeatureActivationResult = Readonly<{
  featureId: FeatureId;
  state: FeatureActivationState;
  unavailableOptionalDependencies: readonly FeatureId[];
  diagnostics: readonly FeatureActivationDiagnostic[];
}>;
export type FeatureActivationPlan = Readonly<{
  /** All structurally valid declarations, including blocked features. */
  declarations: ReadonlyMap<FeatureId, FeatureDefinition>;
  /** Only features whose required dependency closure is healthy. */
  activeFeatures: ReadonlyMap<FeatureId, FeatureDefinition>;
  /** Stable dependency-first order of active features. */
  startupOrder: readonly FeatureDefinition[];
  results: ReadonlyMap<FeatureId, FeatureActivationResult>;
  diagnostics: readonly FeatureActivationDiagnostic[];
}>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function dependencyParts(dependency: FeatureDependency): {
  id: FeatureId;
  contractVersion?: number;
  optional: boolean;
} {
  if (typeof dependency === "string") return { id: dependency, optional: false };
  return {
    id: dependency.id,
    contractVersion: dependency.contractVersion,
    optional: dependency.optional === true,
  };
}

/**
 * Build a deterministic activation plan without changing the strict legacy
 * registerFeatures API. Built-ins remain authoritative; each add-on declaration
 * is validated independently before its dependency graph is evaluated.
 */
export function planFeatureActivation(additional: readonly FeatureDefinition[] = []): FeatureActivationPlan {
  const declarations = new Map<FeatureId, FeatureDefinition>(registerFeatures());
  const states = new Map<FeatureId, FeatureActivationState>();
  const diagnostics: FeatureActivationDiagnostic[] = [];
  const optionalUnavailable = new Map<FeatureId, Set<FeatureId>>();

  for (const id of declarations.keys()) states.set(id, "active");

  const sorted = [...additional].sort((a, b) => compareText(String(a?.id ?? ""), String(b?.id ?? "")));
  const declarationCounts = new Map<FeatureId, number>();
  for (const source of sorted) {
    if (typeof source?.id === "string" && source.id.trim()) {
      declarationCounts.set(source.id, (declarationCounts.get(source.id) ?? 0) + 1);
    }
  }
  for (const source of sorted) {
    const id = source?.id;
    if (typeof id !== "string" || !id.trim()) {
      diagnostics.push({ code: "invalid_feature_declaration", featureId: String(id ?? "<unknown>"), message: "Feature declaration has no valid identifier." });
      continue;
    }
    if (declarations.has(id)) {
      diagnostics.push({ code: "duplicate_feature", featureId: id, message: "Feature identifier is already registered." });
      continue;
    }
    if ((declarationCounts.get(id) ?? 0) > 1) {
      states.set(id, "rejected");
      diagnostics.push({ code: "duplicate_feature", featureId: id, message: "Feature identifier is declared more than once; every duplicate declaration was rejected." });
      continue;
    }
    try {
      // Validate the feature's own contract separately from graph resolution.
      const validated = registerFeatures([{ ...source, dependencies: [] }]).get(id);
      if (!validated) throw new Error("Feature declaration was not registered.");
      declarations.set(id, Object.freeze({ ...validated, dependencies: Object.freeze([...(source.dependencies ?? [])]) as FeatureDependency[] }));
      states.set(id, "active");
    } catch (error) {
      states.set(id, "rejected");
      diagnostics.push({
        code: "invalid_feature_declaration",
        featureId: id,
        message: error instanceof Error ? error.message : "Feature declaration is invalid.",
      });
    }
  }

  // Detect cycles in the complete set of structurally valid declarations.
  const stack: FeatureId[] = [];
  const visiting = new Set<FeatureId>();
  const visited = new Set<FeatureId>();
  const cycleMembers = new Set<FeatureId>();
  const visitCycle = (id: FeatureId): void => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      for (const member of stack.slice(start)) cycleMembers.add(member);
      return;
    }
    if (visited.has(id)) return;
    const feature = declarations.get(id);
    if (!feature || states.get(id) === "rejected") return;
    visiting.add(id);
    stack.push(id);
    for (const raw of feature.dependencies) {
      const dependency = dependencyParts(raw);
      if (!dependency.optional && declarations.has(dependency.id)) visitCycle(dependency.id);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of [...declarations.keys()].sort(compareText)) visitCycle(id);
  for (const id of [...cycleMembers].sort()) {
    states.set(id, "rejected");
    diagnostics.push({ code: "dependency_cycle", featureId: id, message: "Feature participates in a dependency cycle." });
  }

  // Resolve required dependency closure. Optional failures are visible but non-blocking.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, feature] of [...declarations].sort(([a], [b]) => compareText(a, b))) {
      if (states.get(id) !== "active") continue;
      for (const raw of feature.dependencies) {
        const dependency = dependencyParts(raw);
        const target = declarations.get(dependency.id);
        if (!target) {
          if (dependency.optional) {
            const set = optionalUnavailable.get(id) ?? new Set<FeatureId>();
            set.add(dependency.id);
            optionalUnavailable.set(id, set);
            diagnostics.push({ code: "optional_dependency_unavailable", featureId: id, dependencyId: dependency.id, message: "Optional dependency is not installed; feature remains active." });
          } else {
            states.set(id, "blocked");
            diagnostics.push({ code: "missing_required_dependency", featureId: id, dependencyId: dependency.id, message: "Required dependency is not registered." });
            changed = true;
            break;
          }
          continue;
        }
        if (dependency.contractVersion !== undefined && target.contractVersion !== dependency.contractVersion) {
          if (dependency.optional) {
            const set = optionalUnavailable.get(id) ?? new Set<FeatureId>();
            set.add(dependency.id);
            optionalUnavailable.set(id, set);
            diagnostics.push({ code: "optional_dependency_incompatible", featureId: id, dependencyId: dependency.id, message: "Optional dependency contract is incompatible; feature remains active." });
          } else {
            states.set(id, "blocked");
            diagnostics.push({ code: "incompatible_required_dependency", featureId: id, dependencyId: dependency.id, message: "Required dependency contract version is incompatible." });
            changed = true;
            break;
          }
          continue;
        }
        if (dependency.optional && states.get(dependency.id) !== "active") {
          const set = optionalUnavailable.get(id) ?? new Set<FeatureId>();
          set.add(dependency.id);
          optionalUnavailable.set(id, set);
          diagnostics.push({ code: "optional_dependency_unavailable", featureId: id, dependencyId: dependency.id, message: "Optional dependency is not active; feature remains active." });
          continue;
        }
        if (!dependency.optional && states.get(dependency.id) !== "active") {
          states.set(id, "blocked");
          diagnostics.push({ code: "required_dependency_unavailable", featureId: id, dependencyId: dependency.id, message: "Required dependency is not active." });
          changed = true;
          break;
        }
      }
    }
  }

  const activeFeatures = new Map<FeatureId, FeatureDefinition>();
  for (const [id, feature] of declarations) if (states.get(id) === "active") activeFeatures.set(id, feature);

  const startupOrder: FeatureDefinition[] = [];
  const ordered = new Set<FeatureId>();
  const visitActive = (id: FeatureId): void => {
    if (ordered.has(id) || !activeFeatures.has(id)) return;
    const feature = activeFeatures.get(id)!;
    for (const raw of feature.dependencies) {
      const dependency = dependencyParts(raw);
      if (!dependency.optional) visitActive(dependency.id);
    }
    ordered.add(id);
    startupOrder.push(feature);
  };
  // Preserve the stable built-in declaration order; add-ons were already sorted above.
  for (const id of activeFeatures.keys()) visitActive(id);

  // Keep diagnostics stable and avoid repeated identical graph reports.
  const uniqueDiagnostics = new Map<string, FeatureActivationDiagnostic>();
  for (const diagnostic of diagnostics) {
    const key = [diagnostic.code, diagnostic.featureId, diagnostic.dependencyId ?? ""].join("|");
    if (!uniqueDiagnostics.has(key)) uniqueDiagnostics.set(key, Object.freeze(diagnostic));
  }
  const stableDiagnostics = [...uniqueDiagnostics.values()].sort((a, b) =>
    compareText(a.featureId, b.featureId) || compareText(a.code, b.code) || compareText(a.dependencyId ?? "", b.dependencyId ?? ""),
  );

  const results = new Map<FeatureId, FeatureActivationResult>();
  for (const id of [...states.keys()].sort(compareText)) {
    const featureDiagnostics = stableDiagnostics.filter(item => item.featureId === id);
    results.set(id, Object.freeze({
      featureId: id,
      state: states.get(id) ?? "rejected",
      unavailableOptionalDependencies: Object.freeze([...(optionalUnavailable.get(id) ?? [])].sort()),
      diagnostics: Object.freeze(featureDiagnostics),
    }));
  }

  return Object.freeze({
    declarations: createReadonlyRegistry(declarations),
    activeFeatures: createReadonlyRegistry(activeFeatures),
    startupOrder: Object.freeze(startupOrder),
    results: createReadonlyRegistry(results),
    diagnostics: Object.freeze(stableDiagnostics),
  });
}
