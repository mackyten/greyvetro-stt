import { Avatar } from './Avatar';
import { Badge } from './Badge';

export interface VoiceRowProps {
  name: string;
  /** Descriptive tagline — accent, gender, use-case. */
  tagline?: string;
  /** Highlights the row as the chosen voice. */
  selected?: boolean;
  /** Optional badge text shown at the right, e.g. "My voice". */
  badge?: string;
  onClick?: () => void;
}

/**
 * A selectable voice row for the picker list: gradient avatar, name + tagline,
 * and an optional badge. `selected` tints the row blue.
 * @category Media
 */
export function VoiceRow({ name, tagline, selected, badge, onClick }: VoiceRowProps) {
  return (
    <button className={`voice-row${selected ? ' selected' : ''}`} onClick={onClick}>
      <Avatar name={name} />
      <div className="grow">
        <div className="vname">{name}</div>
        {tagline && <div className="vtag">{tagline}</div>}
      </div>
      {badge && <Badge>{badge}</Badge>}
    </button>
  );
}
