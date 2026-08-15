// Crash fallback UI shared by the dashboard and side panel entry points.
// Built with DOM APIs rather than inline handlers, which MV3's CSP blocks.

export function renderErrorBoundary() {
  if (document.querySelector('.error-boundary-fallback')) return;

  const fallback = document.createElement('div');
  fallback.className = 'error-boundary-fallback';
  fallback.style.cssText = 'padding: 2rem; text-align: center; font-family: system-ui;';

  const message = document.createElement('p');
  message.textContent = 'Something went wrong';
  message.style.cssText = 'color: #dc2626; font-size: 1.1rem; margin-bottom: 1rem;';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload';
  button.style.cssText = 'padding: 0.5rem 1rem; background: #2563eb; color: white; border: none; border-radius: 0.375rem; cursor: pointer;';
  button.addEventListener('click', () => location.reload());

  fallback.append(message, button);
  document.body.appendChild(fallback);
}
