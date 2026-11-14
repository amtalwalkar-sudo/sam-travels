import { Component, type ReactNode } from "react";
import { assertFeaturePresentationContext, createFeaturePresentationContext, createSafeDiagnosticEvent, type FeaturePresentationContextContract, type RuntimeRegistry } from "../../../../packages/core/src";
import { recordBrowserDiagnosticEvent } from "../diagnostics";

type FeatureScreenHostProps = Readonly<{
  mountPoint: string;
  contextContract: FeaturePresentationContextContract;
  context: unknown;
  registry: RuntimeRegistry;
  onScreenFailure?: (screenId: string) => void;
}>;

export class ScreenFailureBoundary extends Component<
  Readonly<{ screenId: string; children: ReactNode; onFailure?: (screenId: string) => void }>,
  Readonly<{ failed: boolean }>
> {
  state = { failed: false };

  static getDerivedStateFromError(): Readonly<{ failed: boolean }> {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onFailure?.(this.props.screenId);
  }

  private retry = (): void => this.setState({ failed: false });

  render() {
    if (this.state.failed) {
      return <section className="feature-screen-failure" role="alert" aria-live="assertive">
        <strong>This section could not be displayed.</strong>
        <span>Other application sections remain available. You can retry this section.</span>
        <button type="button" onClick={this.retry}>Retry section</button>
      </section>;
    }
    return this.props.children;
  }
}

function FeatureScreenMount({ screen, contextContract, context }: {
  screen: RuntimeRegistry["presentationScreens"] extends ReadonlyMap<string, infer Screen> ? Screen : never;
  contextContract: FeaturePresentationContextContract;
  context: unknown;
}) {
  if (screen.context.id !== contextContract.id || screen.context.version !== contextContract.version) {
    throw new Error("Incompatible presentation context contract for screen: " + screen.id);
  }
  const value = createFeaturePresentationContext(contextContract, context);
  assertFeaturePresentationContext(screen, value);
  return screen.render(value) as ReactNode;
}

/** Mount opaque feature-owned renderers; one renderer failure cannot remove other screens. */
export function FeatureScreenHost({ mountPoint, contextContract, context, registry, onScreenFailure }: FeatureScreenHostProps) {
  const screens = [...registry.presentationScreens.values()]
    .filter(screen => screen.mountPoint === mountPoint)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  return <>
    {screens.map(screen => <ScreenFailureBoundary key={screen.id} screenId={screen.id} onFailure={onScreenFailure ?? (() => {
        void recordBrowserDiagnosticEvent(createSafeDiagnosticEvent({
          stage: "presentation", code: "presentation_unavailable", outcome: "failure",
          ownerFeatureId: screen.ownerFeatureId, contributionId: screen.id,
          contractVersion: screen.version, occurredAt: new Date().toISOString(),
        }));
      })}>
      <FeatureScreenMount screen={screen} contextContract={contextContract} context={context} />
    </ScreenFailureBoundary>)}
  </>;
}
