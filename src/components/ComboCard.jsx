import { useRef, useEffect } from 'react';

export default function ComboCard({ heading, actions, onSelect }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    // Scroll the entire combo card into view with a small delay
    // to allow the DOM to finish rendering all tiles first
    setTimeout(() => {
      if (ref.current) {
        ref.current.scrollIntoView({ behavior: 'instant', block: 'end' });
      }
    }, 80);
  }, []);

  return (
    <div className="acn-combo-card" ref={ref}>
      <div className="acn-combo-text">{heading}</div>
      <div className="acn-combo-tiles">
        {actions.map((action, i) => (
          <button
            key={i}
            className="acn-tile"
            onClick={() => onSelect(action)}
          >
            <span className="acn-tile-title">{action.content || ''}</span>
            {action.description && (
              <span className="acn-tile-desc">{action.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
