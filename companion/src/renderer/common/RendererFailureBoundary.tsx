import {
  Component,
  type ErrorInfo,
  type ReactNode
} from 'react';

interface RendererFailureBoundaryProps {
  readonly children: ReactNode;
  readonly reload?: () => void;
}

interface RendererFailureBoundaryState {
  readonly error: Error | null;
}

function normalizeRendererError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown renderer failure');
}

export class RendererFailureBoundary extends Component<
  RendererFailureBoundaryProps,
  RendererFailureBoundaryState
> {
  state: RendererFailureBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): RendererFailureBoundaryState {
    return { error: normalizeRendererError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[renderer] Uncaught render failure.', error, info.componentStack);
  }

  private readonly reload = (): void => {
    if (this.props.reload) {
      this.props.reload();
      return;
    }
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <main className="shell renderer-failure" role="alert" aria-live="assertive">
        <section className="renderer-failure-card" aria-labelledby="renderer-failure-title">
          <span className="renderer-failure-eyebrow">Renderer stopped</span>
          <h1 id="renderer-failure-title">DS5 Bridge could not finish loading</h1>
          <p>
            Reload the app to try again. If this keeps happening, keep the terminal output so the
            renderer error can be diagnosed.
          </p>
          <code className="renderer-failure-detail">{`${error.name}: ${error.message}`}</code>
          <button type="button" className="primary-action" onClick={this.reload}>
            Reload app
          </button>
        </section>
      </main>
    );
  }
}
