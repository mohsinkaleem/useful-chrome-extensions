import Dashboard from './Dashboard.svelte';
import { renderErrorBoundary } from './error-boundary.js';

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  renderErrorBoundary();
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

const app = new Dashboard({
  target: document.body
});

export default app;
