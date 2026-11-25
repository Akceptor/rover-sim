# Vehicle profile layout

Approved in conversation: upper-left rotating interactive model preview with linked source path; Camera, Chassis and SITL groups; advanced chassis tuning collapsed; explanatory tooltips for every setting; collision boxes hidden and resized with chassis dimensions.

Reuse createVehicle for the preview and OrbitControls for orbit/zoom. Pause rotation during interaction and respect reduced motion. Rebuild preview on valid geometry edits, profile selection and revert; dispose replaced GPU resources. Keep save, duplicate, revert and live tuning behavior. Preserve built-in collision shapes by scaling sizes and offsets proportionally from the saved dimensions. Normalize existing-profile saves on the backend too. Retain compatibility with explicit inline collision geometry.

Use a responsive grid with preview left and Camera right on desktop, Chassis and SITL below. Use three primary settings groups, named advanced chassis disclosures, friendly labels, and focusable tooltip help. Show procedural source links and the actual per-profile SITL path. No external model import in this change.

Verify collision resize and save persistence with node tests. Verify layout, tooltips, profile switching, preview orbit/rotation, responsive layout, duplicate/save/revert and console errors through a browser smoke test using a temporary profile directory.
