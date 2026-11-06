export type FeatureScaffoldOptions = {
  root?: string;
  featureId: string;
  label: string;
};

export function createFeatureScaffold(options: FeatureScaffoldOptions): Promise<string[]>;
