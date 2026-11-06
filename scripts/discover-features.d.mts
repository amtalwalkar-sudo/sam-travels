export type FeatureCatalogOptions = {
  root?: string;
  check?: boolean;
};

export function generateFeatureCatalog(options?: FeatureCatalogOptions): Promise<string>;
