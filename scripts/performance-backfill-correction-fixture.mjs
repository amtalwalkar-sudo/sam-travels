export function buildPerformanceBackfillCorrectionFixtureV1(operationalDate, tripContext) {
  const createdAt = operationalDate + "T10:00:00.000Z";
  const targetId = "historical-trip-backfill:performance-screen-backfill";
  return [
    {
      id: "work:daily-business-km:" + encodeURIComponent(tripContext.vehicleId) + ":" + operationalDate,
      schemaVersion: 1, createdAt, updatedAt: createdAt, businessDate: operationalDate,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, kind: "daily_business_kilometres",
        vehicleId: tripContext.vehicleId, operationalDate,
        totalBusinessKm: 42, unallocatedBusinessKm: 0,
        entries: [{ shiftId: tripContext.shiftId, allocationStatus: "allocated",
          businessKm: 42, personalKm: 7 }],
      },
    },
    {
      id: "work:trip-financial-obligation:performance-screen-cancellation",
      schemaVersion: 1, createdAt, updatedAt: createdAt, businessDate: operationalDate,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, tripId: "performance-screen-cancellation",
        kind: "cancellation_fee", status: "submitted",
        cancellationEventId: "performance-screen-cancellation-event", createdAt,
        tripContext, feePaise: 5000,
      },
    },
    {
      id: targetId, schemaVersion: 1, createdAt, updatedAt: createdAt,
      businessDate: operationalDate, source: "web", revision: 1,
      createdBy: { personId: "performance-screen-acceptance-admin", role: "admin" },
      data: {
        schemaVersion: 1, kind: "historical_trip_backfill",
        backfillId: "performance-screen-backfill", status: "submitted",
        attribution: "admin_declared", driverId: tripContext.driverId,
        vehicleId: tripContext.vehicleId, operationalDate,
        startedAt: operationalDate + "T08:00:00.000+05:30",
        endedAt: operationalDate + "T08:30:00.000+05:30",
        farePaise: 10000, tollPaise: 32000, tollPayer: "driver",
        parkingPaise: 12000, parkingPayer: "customer",
        reason: "Rendered PWA correction parity fixture", recordedAt: createdAt,
        actor: { role: "admin", actorId: "performance-screen-acceptance-admin" },
      },
    },
    ...[
      { correctionId: "performance-backfill-fare-fix", fieldPath: "farePaise",
        beforeValue: 10000, afterValue: 15000 },
      { correctionId: "performance-backfill-toll-payer-fix", fieldPath: "tollPayer",
        beforeValue: "driver", afterValue: "customer" },
      { correctionId: "performance-backfill-parking-amount-fix", fieldPath: "parkingPaise",
        beforeValue: 12000, afterValue: 15000 },
      { correctionId: "performance-backfill-parking-payer-fix", fieldPath: "parkingPayer",
        beforeValue: "customer", afterValue: "driver" },
    ].map((correction, index, all) => ({
      id: "historical-correction:" + correction.correctionId,
      schemaVersion: 1, createdAt, updatedAt: createdAt, businessDate: operationalDate,
      source: "web", revision: 1,
      createdBy: { personId: "performance-screen-acceptance-admin", role: "admin" },
      data: {
        schemaVersion: 1, ...correction, targetRecordId: targetId,
        targetRecordRevision: 1, featureId: "historical-trip-backfill-finance",
        chainRevision: index + 1,
        ...(index > 0 ? { supersedesCorrectionId: all[index - 1].correctionId } : {}),
        reason: "Rendered PWA verified correction fixture",
        actor: { role: "admin", actorId: "performance-screen-acceptance-admin",
          adminPinVerifiedAt: createdAt },
        recordedAt: createdAt, businessEffectiveDate: operationalDate,
      },
    })),
    {
      id: "historical-correction-chain:" + encodeURIComponent(targetId),
      schemaVersion: 1, createdAt, updatedAt: createdAt, businessDate: operationalDate,
      source: "web", revision: 4,
      data: { schemaVersion: 1, targetRecordId: targetId, chainRevision: 4,
        headCorrectionId: "performance-backfill-parking-payer-fix" },
    },
  ];
}
