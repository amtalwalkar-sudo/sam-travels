import { Component, type ReactNode } from "react";
import type { RuntimeRegistry } from "../../../../packages/core/src";

type FeatureScreenHostProps = Readonly<{
  mountPoint: string;
  context: unknown;
  registry: RuntimeRegistry;
}>;

class ScreenFailureBoundary extends Component<
  Readonly<{ screenId: string; children: ReactNode }>,
  Readonly<{ failed: boolean }>
> {
  state = { failed: false };

  static getDerivedStateFromError(): Readonly<{ failed: boolean }> {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <section className="feature-screen-failure" role="alert">
        <strong>This section could not be displayed.</strong>
        <span>Other application sections remain available. Try opening this section again later.</span>
      </section>;
    }
    return this.props.children;
  }
}

function FeatureScreenMount({ screen, context }: {
  screen: { id: string; render: (context: unknown) => unknown };
  context: unknown;
}) {
  return screen.render(context) as ReactNode;
}

/**
 * Mounts opaque feature-owned renderers without inspecting their internal UI.
 * The application runtime registry remains the only contribution inventory.
 */
export function FeatureScreenHost({ mountPoint, context, registry }: FeatureScreenHostProps) {
  const screens = [...registry.presentationScreens.values()]
    .filter(screen => screen.mountPoint === mountPoint)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  return <>
    {screens.map(screen => <ScreenFailureBoundary key={screen.id} screenId={screen.id}>
      <FeatureScreenMount screen={screen} context={context} />
    </ScreenFailureBoundary>)}
  </>;
}
