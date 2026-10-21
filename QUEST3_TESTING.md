# Experimental Meta Quest 3 test build

This is a separate fork of Function Coaster. The original is unchanged.

## Deploy
1. Use `node build.mjs` to regenerate `index.html` from source if making changes.
2. Host `index.html` at an HTTPS address (for example, a *separate* GitHub Pages repository). Do not overwrite your friend’s public site.
3. Open the HTTPS site in the Meta Quest Browser on Quest 3. The **🥽 Enter VR** button appears only when the browser exposes `immersive-vr` support.
4. Select Enter VR, remain seated, and squeeze the controller trigger to start / pause. Exit using the system browser/headset menu, or the button when accessible.
5. To ride a student's coaster, open their shared `#FC1-...` link on the headset, then Enter VR.

## Prototype limitations / safety
- **Untested on physical Quest 3.** A first headset test is required before student use.
- The VR camera remains upright (does not tilt with slopes) and follows the cart's path, but is not a full simulated seat, lap bar, or physics-correct head pose.
- Fast simulated motion may cause VR sickness. Start with a short, slow track and seated supervision; stop immediately if uncomfortable.
- Controller trigger toggles start/pause. Browser exit uses Quest UI.
- Browser features vary by firmware, policies, and HTTPS availability.
- Source preserves existing mathematics and 2D graphing, but headset graphics and comfort have not been validated.
