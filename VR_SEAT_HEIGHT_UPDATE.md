# VR seat height update

Raised the VR rider rig by 0.45 world units relative to the previous version.

- `src/js/05-world3d.js`: car-following VR rig offset changed from `+ 0.35` to `+ 0.80`.
- `index.html`: matching bundled version updated.
- Fallback at track start changed from `+ 0.77` to `+ 1.22`.

To adjust further, edit the `+ 0.80` offset in the source file and regenerate the bundled `index.html` to match.

This raises the rig without disabling headset tracking or changing the track/physics.
