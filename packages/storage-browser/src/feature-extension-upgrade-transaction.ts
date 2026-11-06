import type { Table } from "dexie";
import type { FeatureExtensionCompatibilitySnapshot } from "../../core/src/feature-compatibility";
import type { FeatureExtensionUpgradeTransaction } from "../../application/src/feature-extension-upgrade-coordinator";
import type { RecordEnvelope } from "../../core/src/types";
import { assertRecordEnvelope } from "../../core/src/persistence-contract";
import { browserDatabase } from "./database";

export type BrowserFeatureMigrationContext = Readonly<{
  records: Table<RecordEnvelope<unknown>, string>;
}>;

/**
 * Production IndexedDB transaction adapter for extension upgrades.
 * Migration writes and installed-version publication share one Dexie read-write
 * transaction, so a thrown migration or publication error aborts both.
 */
export class DexieFeatureExtensionUpgradeTransaction
implements FeatureExtensionUpgradeTransaction<BrowserFeatureMigrationContext> {
  async run<Result>(
    operation: (context: {
      migrationContext: BrowserFeatureMigrationContext;
      persistInstalledExtension(snapshot: FeatureExtensionCompatibilitySnapshot): Promise<void>;
    }) => Promise<Result>,
  ): Promise<Result> {
    return browserDatabase.transaction("rw", browserDatabase.records, async () => operation({
      migrationContext: { records: browserDatabase.records },
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
