// Splits a leading emoji off the label so we can render it as an icon chip.
function splitIcon(s = '') {
  const m = s.match(/^\s*(\p{Extended_Pictographic}(?:️)?)\s*(.*)$/u);
  return m ? { icon: m[1], text: m[2] } : { icon: '', text: s };
}

export default function ComboCard({ heading, subtitle, actions, onSelect, compact = false }) {
  return (
    <div className={`acn-combo-card${compact ? ' compact' : ''}`}>
      {heading && <div className="acn-combo-text">{heading}</div>}
      {subtitle && <div className="acn-combo-subtitle">{subtitle}</div>}
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
