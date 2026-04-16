import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Surfaces React render errors (e.g. bad imports after refactors) instead of a blank screen.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[RouteErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">This page crashed</h1>
          <pre className="max-w-lg whitespace-pre-wrap break-words rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left text-sm text-destructive">
            {this.state.error.message}
          </pre>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
