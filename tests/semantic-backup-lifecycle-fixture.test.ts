import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Fixture = {
  schemaVersion: number;
  fixtureId: string;
  lifecycle: string[];
  comparison: string[];
  domains: Record<string, { requiredKinds: string[]; lineage: string[] }>;
  status: string;
};

const fixture = JSON.parse(readFileSync(
  new URL("../fixtures/semantic-backup-lifecycle-v1.json", import.meta.url),
  "utf8",
)) as Fixture;

describe("shared cross-platform semantic backup fixture contract", () => {
  it("declares the complete restore lifecycle and normalized comparison dimensions", () => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.fixtureId).toBe("sam-travels-cross-platform-semantic-restore-v1");
    expect(fixture.lifecycle).toEqual([
      "export", "restore", "database_reopen", "startup_recovery", "re_export",
    ]);
    expect(fixture.comparison).toEqual([
      "record_ids", "revisions", "references", "event_ordering", "correction_chain_heads",
    ]);
  });

  it("covers every requested domain and its lineage requirements", () => {
    expect(Object.keys(fixture.domains).sort()).toEqual([
      "businessExpenses", "compliance", "finance", "logBook", "maintenance", "performance", "work",
    ]);
    for (const [domain, contract] of Object.entries(fixture.domains)) {
      expect(contract.requiredKinds.length, domain).toBeGreaterThan(0);
      expect(contract.lineage.length, domain).toBeGreaterThan(0);
    }
    expect(fixture.domains.finance.requiredKinds).toEqual(
      expect.arrayContaining(["loan_schedule", "payment_ledger", "prepayment", "settlement"]),
    );
    expect(fixture.domains.compliance.requiredKinds).toEqual(
      expect.arrayContaining(["renewal", "overlap_decision", "correction"]),
    );
    expect(fixture.domains.maintenance.requiredKinds).toEqual(
      expect.arrayContaining(["rate_history", "daily_accrual", "correction"]),
    );
    expect(fixture.domains.businessExpenses.requiredKinds).toEqual(
      expect.arrayContaining(["expense", "reversal", "correction"]),
    );
  });

  it("does not misrepresent the contract seed as completed parity evidence", () => {
    expect(fixture.status).toBe("contract_seed_only");
  });
});
