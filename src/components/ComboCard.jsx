// Strip trailing Material Icons ligature names (e.g. "Confirm transfer graph_markup" → "Confirm transfer").
// The GECX backend appends icon names expecting Material Icons font; our UI doesn't load it.
function stripMaterialIcon(s = '') {
  return s.replace(/\s+[a-z][a-z_]{1,30}[a-z]$/, '').trim();
}

// Splits a leading emoji off the label so we can render it as an icon chip.
function splitIcon(s = '') {
  const cleaned = stripMaterialIcon(s);
  const m = cleaned.match(/^\s*(\p{Extended_Pictographic}(?:️)?)\s*(.*)$/u);
  return m ? { icon: m[1], text: m[2] } : { icon: '', text: cleaned };
}

// GECX sometimes sends a markdown pipe-table as a single "Say:" line with the
// row breaks collapsed (e.g. "| Field | Detail | |---|---| | From | ... |"
// instead of one row per line). Reinsert the missing newlines wherever a
// row's closing "|" sits directly against the next row's opening "|".
function normalizeTableRows(s = '') {
  return s.replace(/\|\s*\|/g, '|\n|');
}

// Detects a markdown table and parses it into a prefix (any leading prose
// on the same line, e.g. "Here are your accounts: | Account | ... |"),
// a header row, and data rows. Returns null if `s` isn't a table (so
// callers can fall back to plain text).
function parseMarkdownTable(s = '') {
  const lines = normalizeTableRows(s.trim())
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;

  let prefix = '';
  const firstPipe = lines[0].indexOf('|');
  if (firstPipe > 0) {
    prefix = lines[0].slice(0, firstPipe).trim();
    lines[0] = lines[0].slice(firstPipe);
  }
  if (!lines.every((l) => l.startsWith('|') && l.endsWith('|'))) return null;

  const toCells = (l) => l.slice(1, -1).split('|').map((c) => c.trim());
  const sepCells = toCells(lines[1]);
  if (!sepCells.every((c) => /^:?-+:?$/.test(c))) return null; // row 2 must be the --- separator

  return { prefix, header: toCells(lines[0]), rows: lines.slice(2).map(toCells) };
}

export default function ComboCard({ heading, subtitle, actions, onSelect, compact = false }) {
  const table = subtitle ? parseMarkdownTable(subtitle) : null;
  // A 2-column table (e.g. "Field | Detail") reads better as a plain
  // key/value list; wider tables (accounts, transactions) keep their header.
  const asKeyValue = table && table.header.length <= 2;

  return (
    <div className={`acn-combo-card${compact ? ' compact' : ''}`}>
      {heading && <div className="acn-combo-text">{heading}</div>}
      {table ? (
        <div className="acn-combo-table">
          {table.prefix && <div className="acn-combo-table-prefix">{table.prefix}</div>}
          {asKeyValue ? (
            table.rows.map((cells, i) => (
              <div className="acn-combo-table-row" key={i}>
                <span className="acn-combo-table-key">{cells[0]}</span>
                <span className="acn-combo-table-val">{cells[1]}</span>
              </div>
            ))
          ) : (
            <div
              className="acn-combo-table-grid"
              style={{ gridTemplateColumns: `repeat(${table.header.length}, auto)` }}
            >
              {table.header.map((h, i) => (
                <span className="hdr" key={`h${i}`}>{h}</span>
              ))}
              {table.rows.map((cells, r) =>
                cells.map((c, i) => (
                  <span className="cell" key={`${r}-${i}`}>{c}</span>
                )),
              )}
            </div>
          )}
        </div>
      ) : (
        subtitle && <div className="acn-combo-subtitle">{subtitle}</div>
      )}
      <div className="acn-combo-tiles">
        {actions.map((action, i) => {
          const { icon, text } = splitIcon(action.content || '');
          const label = text || action.content || '';
          return (
            <button key={i} className="acn-tile" onClick={() => onSelect(action)}>
              {icon && <span className="acn-tile-icon">{icon}</span>}
              <span className="acn-tile-body">
                <span className="acn-tile-title">{label}</span>
                {action.description && !compact && (
                  <span className="acn-tile-desc">{action.description}</span>
                )}
              </span>
              <span className="acn-tile-chev" aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
