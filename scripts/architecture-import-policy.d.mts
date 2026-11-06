export type ArchitectureTsConfig = {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
};

export function createAliasResolver(tsconfig: ArchitectureTsConfig): (specifier: string) => string | null;
export function resolveImport(
  specifier: string,
  fromFile: string,
  resolveAlias: (specifier: string) => string | null,
): string | null;
export function targetLayer(resolved: string): string | null;
export function isForbiddenLayerDependency(from: string, target: string | null): boolean;
export function isPublicFeatureEntry(resolved: string): boolean;
export function isBrowserPersistenceModule(specifier: string): boolean;
