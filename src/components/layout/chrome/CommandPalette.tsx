import { useChrome } from './ChromeContext';

/**
 * STUB (replaced by the command-palette specialist). Renders nothing until built;
 * Cmd-K toggles paletteOpen in ChromeContext, which the real palette consumes.
 */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useChrome();
  if (!paletteOpen) return null;
  return (
    <div
      role="presentation"
      onClick={() => setPaletteOpen(false)}
      className="fixed inset-0 z-modal bg-cc-scrim"
    />
  );
}
