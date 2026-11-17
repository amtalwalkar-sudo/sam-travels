import type { AtomicRecordRepository } from "../../../core/src/repositories";
import type { RuntimeRegistry } from "../../../core/src/runtime-registry";
import type { FeatureRecordSource } from "../../../application/src/feature-record-service";
import type { MaintenanceService } from "../../../application/src/maintenance-service";
import type { DriverEvent } from "../../../domain/src/driver-workflow";
import {
  DriverWorkflowService,
  type DriverWorkflowRepository,
  type EventLocationProvider,
} from "../../../application/src/driver-workflow-service";
import { accrueMaintenanceForCompletedWorkDay, dispatchCommittedFeatureEvent } from "../../../application/src";
import { LOGBOOK_WORK_EVENT_INTEGRATION, rebuildTripHistoryProjection } from "../../logbook";

/** Dependencies for Work's durable cross-feature event and recovery orchestration. */
export type WorkApplicationCoordinatorDependenciesV1 = Readonly<{
  runtime: RuntimeRegistry;
  records: Pick<AtomicRecordRepository, "list">;
  maintenance: Pick<MaintenanceService, "accrueDailyBusinessKilometres">;
  source: FeatureRecordSource;
}>;

/**
 * Work application boundary: owns committed-event delivery, Maintenance
 * accrual, Log Book projection refresh, and startup outbox recovery. UI hooks
 * subscribe to the workflow but do not coordinate feature side effects.
 */
export class WorkApplicationCoordinatorV1 {
  constructor(private readonly dependencies: WorkApplicationCoordinatorDependenciesV1) {}

  createWorkflow(repository: DriverWorkflowRepository, location: EventLocationProvider): DriverWorkflowService {
    return new DriverWorkflowService(repository, location, (event: DriverEvent) =>
      this.publishCommittedEvent(event, repository));
  }

  async initialize(service: DriverWorkflowService): Promise<Readonly<{
    snapshot: Awaited<ReturnType<DriverWorkflowService["snapshot"]>>;
    pending: Awaited<ReturnType<DriverWorkflowService["resumePendingBackground"]>>;
  }>> {
    rebuildTripHistoryProjection(await service.events());
    await service.replayCommittedEvents();
    await service.reconcilePending();
    const pending = await service.resumePendingBackground();
    return Object.freeze({ snapshot: await service.snapshot(), pending });
  }

  async resume(service: DriverWorkflowService): Promise<Readonly<{
    snapshot: Awaited<ReturnType<DriverWorkflowService["snapshot"]>>;
    pending: Awaited<ReturnType<DriverWorkflowService["reconcilePending"]>>;
  }>> {
    await service.replayCommittedEvents();
    const snapshot = await service.snapshot();
    const pending = await service.reconcilePending();
    return Object.freeze({ snapshot, pending });
  }

  private async publishCommittedEvent(event: DriverEvent, repository: DriverWorkflowRepository): Promise<void> {
    await accrueMaintenanceForCompletedWorkDay({
      event,
      records: this.dependencies.records,
      maintenance: this.dependencies.maintenance,
      source: this.dependencies.source,
    });
    await dispatchCommittedFeatureEvent(
      this.dependencies.runtime,
      LOGBOOK_WORK_EVENT_INTEGRATION,
      event,
      async () => {
        rebuildTripHistoryProjection(await repository.listEvents());
      },
    );
  }
}
