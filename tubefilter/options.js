/* ===========================================================================
 * TubeFilter — options page
 *
 * Hosts the regex reference (moved out of the popup, which Chrome caps at
 * ~600px tall) plus a live tester. The tester compiles the pattern exactly
 * the way content.js does, so an invalid pattern is caught here rather than
 * silently disabling the keyword filter on YouTube.
 * ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const pattern = document.getElementById('testPattern');
  const title = document.getElementById('testTitle');
  const result = document.getElementById('testResult');

  const run = () => renderResult(result, pattern.value, title.value);
  pattern.addEventListener('input', run);
  title.addEventListener('input', run);
  run();
});

/**
 * Mirrors compileRegex() in content.js: `/pattern/flags` honours the given
 * flags, anything else is compiled case-insensitively.
 */
function compileRegex(source) {
  const m = String(source).match(/^\/(.+)\/([gimsuy]*)$/);
  return m ? new RegExp(m[1], m[2]) : new RegExp(String(source), 'i');
}

function renderResult(el, source, sample) {
  if (!source.trim()) {
    el.className = 'tester-result';
    el.textContent = 'Enter a pattern to test it.';
    return;
  }

  let re;
  try {
    re = compileRegex(source);
  } catch (e) {
    el.className = 'tester-result invalid';
    el.innerHTML =
      '✕ Invalid pattern' +
      `<span class="detail">${escapeHtml(e.message)}</span>` +
      '<span class="detail">TubeFilter ignores patterns it can\'t compile, ' +
      'so this filter would have no effect.</span>';
    return;
  }

  if (re.test(sample)) {
    const match = sample.match(re);
    el.className = 'tester-result match';
    el.innerHTML =
      '✓ Matches — this video would be shown in Include mode' +
      `<span class="detail">Matched: “${escapeHtml(match[0])}”</span>`;
  } else {
    el.className = 'tester-result no-match';
    el.innerHTML =
      '○ No match — this video would be hidden in Include mode' +
      '<span class="detail">…and shown in Exclude mode.</span>';
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
