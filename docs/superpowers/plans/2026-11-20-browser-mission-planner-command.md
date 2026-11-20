# Browser Mission Planner command

**Goal:** Show the launcher's exact Mission Planner Extra command line beside terrain setup, ready to copy before SITL connects.

**Design:** A read-only text area and Copy button appear in Mission Planner mode above terrain controls. A shared formatter generates both terminal and browser text from the actual backend configuration and defaults paths, including extra parameter files. Browser clipboard failure selects the command for manual copying and explains the fallback. Other modes and headless video hide this section.

**Implementation:**
- [ ] Add a failing formatter regression for Windows paths with spaces and custom ports in `test/launcher.test.js`.
- [ ] Add a real Chrome launcher smoke for terminal/browser parity, actual clipboard copying, denied clipboard fallback, reconnect, and narrow layout.
- [ ] Export the shared formatter from `src/launcher.js`; pass combined defaults from `scripts/launch.mjs` to `src/server.js`; publish the formatted command in browser initialization.
- [ ] Add the labeled text area, Copy behavior, and responsive styling to `web/index.html`, `web/app.js`, and `web/style.css`. Update `docs/mission-planner-start.md`.
- [ ] Run the full unit suite and browser smoke, review, then commit and push under the user's standing authorization.
