# VR camera matched to desktop Ride view

The VR rider viewpoint now uses the **same track-relative formula** as the desktop Ride/POV camera in `src/js/05-world3d.js`: 2.05 units along the track normal and 1.1 units ahead along the tangent. Unlike the prior VR versions, it does not use the car position plus an arbitrary vertical offset. The rig follows the track slope, while the headset remains free to look around.

WebXR local-floor tracking supplies a real headset eye height, so the rig subtracts a nominal 1.60-unit headset height before applying the tracked pose. This nominal value can be adjusted at `const xrEyeHeight = 1.60` if Quest floor calibration or seated/standing tracking changes the actual eye height. Physical headset testing is required.

Upload the contents of this folder to GitHub; `index.html` is rebuilt and ready for GitHub Pages.
