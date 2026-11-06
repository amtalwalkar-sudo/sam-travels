import type { RecordRepository } from "../../core/src/repositories";
import type { FeatureExtensionCompatibilitySnapshot } from "../../core/src/feature-compatibility";
import type { RecordEnvelope } from "../../core/src/types";
import { assertRecordEnvelope } from "../../core/src/persistence-contract";
import { browserDatabase } from "./database";
import { DexieRecordRepository } from "./index";

export type BrowserFeatureMigrationContext = Readonly<{ records: RecordRepository }>;

/**
 * Production IndexedDB transaction adapter for extension upgrades.
 * Migration writes and installed-version publication share one Dexie read-write
 * transaction, so a thrown migration or publication error aborts both.
 */
export class DexieFeatureExtensionUpgradeTransaction {
  async run<Result>(
    operation: (context: {
      migrationContext: BrowserFeatureMigrationContext;
      persistInstalledExtension(snapshot: FeatureExtensionCompatibilitySnapshot): Promise<void>;
    }) => Promise<Result>,
  ): Promise<Result> {
    return browserDatabase.transaction("rw", browserDatabase.records, async () => operation({
      migrationContext: { records: new DexieRecordRepository() },
      persistInstalledExtension: async snapshot => {
        const id = "installed-extension:" + snapshot.extension.id;
        const previous = await browserDatabase.records.get(id);
        const now = new Date().toISOString();
        const persisted = {
          id,
          schemaVersion: 1,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
          source: "web" as const,
          revision: (previous?.revision ?? 0) + 1,
          data: {
            extension: {
              id: snapshot.extension.id,
              version: snapshot.extension.version,
              featureId: snapshot.extension.featureId,
              publicEntryPoint: snapshot.extension.publicEntryPoint,
            },
            feature: snapshot.feature,
          },
        } satisfies RecordEnvelope<unknown>;
        assertRecordEnvelope(persisted);
        await browserDatabase.records.put(persisted);
      },
    }));
  }
}
