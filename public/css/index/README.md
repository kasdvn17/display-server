# Main display CSS

The numbered files are loaded through `../index.css`. The number preserves the
original cascade order, while each filename identifies the feature it styles.

- Put shared tokens, resets and top-level layout in `01-foundation.css`.
- Put feature-specific rules in the matching file.
- Put deliberate cross-feature overrides in `09-final-polish.css`.
- Avoid adding new rules to the manifest itself.

