export interface MenuItem {
  label: string;
  /** Secondary line shown under the label in muted grey. */
  sublabel?: string;
  /** Destructive item (red label). */
  danger?: boolean;
  /** Marks the currently-selected item (blue tint). */
  current?: boolean;
  onClick?: () => void;
}

export interface MenuProps {
  items: MenuItem[];
}

/**
 * A dropdown menu panel (`.preset-menu`) — a floating surface of stacked items,
 * each an optional two-line entry. Place inside a `position: relative` anchor;
 * `danger` colors an item red and `current` tints the active one.
 * @category Navigation
 */
export function Menu({ items }: MenuProps) {
  return (
    <div className="preset-menu">
      {items.length === 0 && <div className="preset-menu-empty">No items</div>}
      {items.map((item, i) => {
        const cls = ['preset-menu-item', item.danger && 'danger', item.current && 'current']
          .filter(Boolean)
          .join(' ');
        return (
          <button key={i} className={cls} onClick={item.onClick}>
            <span className="pname">{item.label}</span>
            {item.sublabel && <span className="pvoice">{item.sublabel}</span>}
          </button>
        );
      })}
    </div>
  );
}
