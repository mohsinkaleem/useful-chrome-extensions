// Portable export formats.
//
// `createBackup()` already materialises everything, but its JSON is only
// readable by this extension. These three serializers give the collection an
// exit story: Netscape HTML imports into any browser, CSV into any spreadsheet,
// Markdown into any notes app.

/**
 * Escape a value for CSV, including the leading-character guard that stops
 * spreadsheets from evaluating a bookmark title as a formula.
 */
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CSV_COLUMNS = [
  ['title', (b) => b.title],
  ['url', (b) => b.url],
  ['domain', (b) => b.domain],
  ['folder', (b) => b.folderPath],
  ['category', (b) => b.category],
  ['description', (b) => b.description],
  ['keywords', (b) => (Array.isArray(b.keywords) ? b.keywords.join('; ') : '')],
  ['topics', (b) => (Array.isArray(b.topics) ? b.topics.join('; ') : '')],
  ['dateAdded', (b) => (b.dateAdded ? new Date(b.dateAdded).toISOString() : '')],
  ['lastAccessed', (b) => (b.lastAccessed ? new Date(b.lastAccessed).toISOString() : '')],
  ['accessCount', (b) => b.accessCount ?? 0],
  ['readingTime', (b) => b.readingTime ?? ''],
  ['isAlive', (b) => (b.isAlive === null || b.isAlive === undefined ? '' : b.isAlive)],
];

export function toCsv(bookmarks) {
  const header = CSV_COLUMNS.map(([name]) => csvCell(name)).join(',');
  const rows = bookmarks.map((bookmark) =>
    CSV_COLUMNS.map(([, read]) => csvCell(read(bookmark))).join(','),
  );
  return [header, ...rows].join('\r\n');
}

export function toMarkdown(bookmarks) {
  const byFolder = new Map();
  for (const bookmark of bookmarks) {
    const folder = bookmark.folderPath || 'Unfiled';
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(bookmark);
  }

  const lines = ['# Bookmarks', '', `_Exported ${new Date().toISOString().slice(0, 10)}_`, ''];

  for (const folder of [...byFolder.keys()].sort()) {
    lines.push(`## ${folder}`, '');
    for (const bookmark of byFolder.get(folder)) {
      const title = (bookmark.title || bookmark.url).replace(/([[\]])/g, '\\$1');
      lines.push(`- [${title}](${bookmark.url})`);
      if (bookmark.description) lines.push(`  - ${bookmark.description.replace(/\s+/g, ' ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** The Netscape bookmark file format every browser can import. */
export function toNetscapeHtml(bookmarks) {
  const byFolder = new Map();
  for (const bookmark of bookmarks) {
    const folder = bookmark.folderPath || 'Unfiled';
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(bookmark);
  }

  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  for (const folder of [...byFolder.keys()].sort()) {
    lines.push(`    <DT><H3>${escapeHtml(folder)}</H3>`, '    <DL><p>');
    for (const bookmark of byFolder.get(folder)) {
      const addDate = Math.floor((bookmark.dateAdded || Date.now()) / 1000);
      lines.push(
        `        <DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${addDate}">${escapeHtml(
          bookmark.title || bookmark.url,
        )}</A>`,
      );
      if (bookmark.description) lines.push(`        <DD>${escapeHtml(bookmark.description)}`);
    }
    lines.push('    </DL><p>');
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}

const FORMATS = {
  json: {
    extension: 'json',
    mime: 'application/json',
    serialize: (bookmarks) =>
      JSON.stringify(
        {
          exportDate: new Date().toISOString(),
          version: '2.0',
          totalBookmarks: bookmarks.length,
          bookmarks,
        },
        null,
        2,
      ),
  },
  markdown: { extension: 'md', mime: 'text/markdown', serialize: toMarkdown },
  csv: { extension: 'csv', mime: 'text/csv', serialize: toCsv },
  html: { extension: 'html', mime: 'text/html', serialize: toNetscapeHtml },
};

export const EXPORT_FORMATS = [
  { key: 'json', label: 'JSON (full data)' },
  { key: 'markdown', label: 'Markdown' },
  { key: 'csv', label: 'CSV (spreadsheet)' },
  { key: 'html', label: 'HTML (browser import)' },
];

/**
 * Serialize and download the collection.
 * @param {string} format One of the EXPORT_FORMATS keys.
 * @param {Array} bookmarks
 * @returns {string} The filename written.
 */
export function downloadExport(format, bookmarks) {
  const spec = FORMATS[format];
  if (!spec) throw new Error(`Unknown export format: ${format}`);

  const filename = `bookmarks-export-${new Date().toISOString().slice(0, 10)}.${spec.extension}`;
  const blob = new Blob([spec.serialize(bookmarks)], { type: `${spec.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return filename;
}
