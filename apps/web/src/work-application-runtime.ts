import type { AtomicRecordRepository } from "../../../packages/core/src";
import type { RuntimeRegistry } from "../../../packages/core/src";
import type { FeatureRecordSource } from "../../../packages/application/src";
import type { MaintenanceService } from "../../../packages/application/src";
import { WorkDriverSelectionService } from "../../../packages/application/src/work-driver-selection-service";
import {
  WorkApplicationCoordinatorV1,
  type DriverWorkflowService,
  type WorkApplicationCoordinatorDependenciesV1,
} from "../../../packages/features/work";
import { createDriverWorkflow } from "./driver-workflow";

type WorkWorkflowFactoryV1 = typeof createDriverWorkflow;
type WorkWorkflowResourcesV1 = Awaited<ReturnType<WorkWorkflowFactoryV1>>;

export type WorkApplicationRuntimeDependenciesV1 = Readonly<{
  runtime: RuntimeRegistry;
  records: AtomicRecordRepository;
  maintenance: Pick<MaintenanceService, "accrueDailyBusinessKilometres">;
  source: FeatureRecordSource;
  createWorkflowResources?: WorkWorkflowFactoryV1;
}>;

export type InitializedWorkApplicationV1 = Readonly<{
  repository: WorkWorkflowResourcesV1["repository"];
  service: DriverWorkflowService;
  selection: WorkDriverSelectionService;
  selectedDriver: Awaited<ReturnType<WorkDriverSelectionService["getSelectedDriver"]>>;
  restored: Awaited<ReturnType<WorkApplicationCoordinatorV1["initialize"]>>;
}>;

/**
 * Web composition boundary for Work's platform workflow and application service.
 * React owns subscriptions and presentation state; this runtime owns construction,
 * startup recovery, and lifecycle resumption of the durable workflow.
 */
export class WorkApplicationRuntimeV1 {
  private readonly coordinator: WorkApplicationCoordinatorV1;
  private readonly createWorkflowResources: WorkWorkflowFactoryV1;

  constructor(private readonly dependencies: WorkApplicationRuntimeDependenciesV1) {
    const coordinatorDependencies: WorkApplicationCoordinatorDependenciesV1 = {
      runtime: dependencies.runtime,
      records: dependencies.records,
      maintenance: dependencies.maintenance,
      source: dependencies.source,
    };
    this.coordinator = new WorkApplicationCoordinatorV1(coordinatorDependencies);
    this.createWorkflowResources = dependencies.createWorkflowResources ?? createDriverWorkflow;
  }

  usesRegistry(registry: RuntimeRegistry): boolean {
    return this.dependencies.runtime === registry;
  }

  async initialize(): Promise<InitializedWorkApplicationV1> {
    const resources = await this.createWorkflowResources();
    try {
      const selection = new WorkDriverSelectionService(this.dependencies.records, resources.repository);
      const selectedDriver = await selection.getSelectedDriver();
      const service = this.coordinator.createWorkflow(resources.repository, resources.location);
      const restored = await this.coordinator.initialize(service);
      return Object.freeze({
        repository: resources.repository,
        service,
        selection,
        selectedDriver,
        restored,
      });
    } catch (error) {
      (resources.repository as typeof resources.repository & { dispose?: () => void }).dispose?.();
      throw error;
    }
  }

  resume(service: DriverWorkflowService) {
    return this.coordinator.resume(service);
  }

  dispose(repository: WorkWorkflowResourcesV1["repository"]): void {
    (repository as typeof repository & { dispose?: () => void }).dispose?.();
  }
}
