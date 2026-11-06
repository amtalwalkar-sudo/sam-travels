export interface ModuleReference {
  specifier: string;
  kind: "import" | "export" | "dynamic-import" | "require" | "import-equals";
  line: number;
}
export interface ParseDiagnostic {
  code: number;
  message: string;
  line: number | undefined;
}
export function analyzeModuleReferences(
  source: string,
  fileName?: string,
): { references: ModuleReference[]; diagnostics: ParseDiagnostic[] };

export function analyzeBrowserPersistenceReferences(
  source: string,
  fileName?: string,
): Array<{ symbol: string; line: number }>;
