import ErrorBoundary from '@mobile/components/ErrorBoundary';
import { Screens } from './routes';
import { Sidebar } from './Sidebar';

export function Shell() {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <Sidebar />
      {/* Screens collapse to zero height without a flex column here. */}
      <main style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <ErrorBoundary>
          <Screens />
        </ErrorBoundary>
      </main>
    </div>
  );
}
