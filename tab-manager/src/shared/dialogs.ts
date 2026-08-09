// In-page dialogs and toasts.
// Native alert/confirm/prompt are unreliable in an extension popup: the popup loses
// focus and can be torn down mid-dialog, dropping whatever await was pending.

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

type ToastKind = 'info' | 'success' | 'error';

function toastContainer(): HTMLElement {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

export function showToast(message: string, kind: ToastKind = 'info', duration = 3200): void {
  const toast = document.createElement('div');
  toast.className = `toast toast-${kind}`;
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  toast.textContent = message;

  toastContainer().appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));

  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

function buildDialog(titleText: string, messageText?: string) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';

  const box = document.createElement('div');
  box.className = 'dialog';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');

  const title = document.createElement('h2');
  title.className = 'dialog-title';
  title.textContent = titleText;
  box.appendChild(title);

  if (messageText) {
    const message = document.createElement('p');
    message.className = 'dialog-message';
    message.textContent = messageText;
    box.appendChild(message);
  }

  const actions = document.createElement('div');
  actions.className = 'dialog-actions';

  overlay.appendChild(box);
  return { overlay, box, actions };
}

function openDialog<T>(
  overlay: HTMLElement,
  resolve: (value: T) => void,
  cancelValue: T,
  focusTarget: HTMLElement
): (value: T) => void {
  const close = (value: T) => {
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    resolve(value);
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(cancelValue);
    }
  };

  overlay.addEventListener('click', e => {
    if (e.target === overlay) close(cancelValue);
  });
  document.addEventListener('keydown', onKeydown, true);

  document.body.appendChild(overlay);
  focusTarget.focus();

  return close;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    const { overlay, box, actions } = buildDialog(options.title, options.message);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'dialog-btn dialog-btn-secondary';
    cancelBtn.textContent = options.cancelLabel ?? 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `dialog-btn ${options.danger ? 'dialog-btn-danger' : 'dialog-btn-primary'}`;
    confirmBtn.textContent = options.confirmLabel ?? 'Confirm';

    actions.append(cancelBtn, confirmBtn);
    box.appendChild(actions);

    const close = openDialog<boolean>(overlay, resolve, false, confirmBtn);
    cancelBtn.onclick = () => close(false);
    confirmBtn.onclick = () => close(true);
  });
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise(resolve => {
    const { overlay, box, actions } = buildDialog(options.title, options.message);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dialog-input';
    input.value = options.defaultValue ?? '';
    input.placeholder = options.placeholder ?? '';
    box.appendChild(input);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'dialog-btn dialog-btn-secondary';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'dialog-btn dialog-btn-primary';
    confirmBtn.textContent = options.confirmLabel ?? 'OK';

    actions.append(cancelBtn, confirmBtn);
    box.appendChild(actions);

    const close = openDialog<string | null>(overlay, resolve, null, input);
    input.select();

    const submit = () => {
      const value = input.value.trim();
      close(value.length > 0 ? value : null);
    };

    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };
    cancelBtn.onclick = () => close(null);
    confirmBtn.onclick = submit;
  });
}
