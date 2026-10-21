# Meta Quest VR rider-camera fix

The camera is now parented to a moving `vrRig` in `src/js/05-world3d.js`. During immersive WebXR, the rig follows the first car every frame. WebXR's tracked headset/per-eye pose remains relative to that rig, instead of being reset to the world origin.

`src/js/12-main.js` requests `local-floor` tracking, initializes the camera for VR, and restores desktop camera coordinates after exit. The generated `index.html` already includes these changes.

## Upload
Upload the entire contents of this folder to your GitHub repository, replacing matching files. For a minimal update, replace `index.html`, `src/js/05-world3d.js`, and `src/js/12-main.js`. If you modify source later, run `node build.mjs` and commit the regenerated `index.html`.

## Test
Serve the site over HTTPS (GitHub Pages), open in Quest Browser, select Enter VR, then press a controller trigger to start/pause. Test seated on a gentle track first. Hardware validation on an actual Quest headset is still required.

## Known limitation
This is an upright, seated, forward-facing rig; it does not pitch/roll the user's horizon with track slopes. Quest floor calibration affects perceived eye height. If necessary, adjust the `+ 0.35` seat-floor offset in `updateCamera`.
