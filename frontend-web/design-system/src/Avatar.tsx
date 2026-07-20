export interface AvatarProps {
  /** Name used to derive the initial when `initial` is not supplied. */
  name?: string;
  /** Explicit single character/glyph to show; overrides `name`. */
  initial?: string;
}

/**
 * A round gradient avatar showing a single initial — used for voices. Falls back
 * to the first letter of `name`.
 * @category Display
 */
export function Avatar({ name, initial }: AvatarProps) {
  const glyph = initial ?? (name ? name.charAt(0).toUpperCase() : '?');
  return <div className="voice-avatar">{glyph}</div>;
}
