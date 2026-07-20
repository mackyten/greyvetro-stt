/** Material Icons glyph. `name` is a ligature name from https://fonts.google.com/icons (e.g. "delete", "play_arrow"). */
export function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={className ? `material-icons ${className}` : 'material-icons'}>{name}</span>;
}
