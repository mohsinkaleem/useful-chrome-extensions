import Dashboard from './Dashboard.svelte';

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  if (!document.querySelector('.error-boundary-fallback')) {
    const fallback = document.createElement('div');
    fallback.className = 'error-boundary-fallback';
    fallback.innerHTML = `
      <div style="padding: 2rem; text-align: center; font-family: system-ui;">
        <p style="color: #dc2626; font-size: 1.1rem; margin-bottom: 1rem;">Something went wrong</p>
        <button onclick="location.reload()" style="padding: 0.5rem 1rem; background: #2563eb; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">Reload</button>
      </div>`;
    document.body.appendChild(fallback);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

const app = new Dashboard({
  target: document.body
});

export default app;
