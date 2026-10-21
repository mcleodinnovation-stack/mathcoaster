# VR track-angle camera update

The VR rider rig now uses the same look-ahead calculation as the desktop Ride/POV camera: 45% current track tangent plus 55% direction toward a track point 9 units ahead, normalized. The rig's up direction is perpendicular to that forward direction in the track plane. This pitches the rider's default forward direction into hills and drops while retaining independent Quest head tracking.

The existing seat position and approximate XR local-floor eye-height compensation are unchanged. The rider rig world transform is updated immediately after positioning.

Upload the repository contents, including the rebuilt `index.html`, to GitHub Pages. Test on a physical Quest 3; automated tests cannot verify headset-specific WebXR orientation or floor calibration.
