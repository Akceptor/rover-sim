# OSM connection settings

The existing browser Settings dialog exposes camera and video controls, but OSM connection settings currently require editing backend JSON. Repeated retries contact the same endpoint, leaving users unable to recover from an unavailable endpoint through the browser.

## Proposed scope

Extend the existing dialog with an OpenStreetMap section containing a server preset selector (Automatic by region, global, seven Dresel regions, or custom), an editable HTTP/HTTPS endpoint, and a timeout in seconds. Automatic selection uses bundled Geofabrik extract outlines and the whole terrain patch; overlapping coverage and boundary crossings use the global endpoint. Show the selected endpoint and region. Preserve existing explicit endpoint configuration until the user selects Automatic. Provide Save and Save & retry OSM actions and an inline status/error message. Link the OSM failure message to this settings section.

This focused addition addresses the reported failure. A generic JSON editor would expose unrelated settings without explaining their behavior. A full configuration editor covering vehicle calibration, networking, launcher paths and terrain would require separate restart and validation rules and is outside this change.

## Persistence and application

Persist only the endpoint and timeout as local backend preferences in an ignored file beside the selected backend configuration. Merge those preferences into the OSM options at startup without rewriting the original configuration. Preserve cache paths, bundled data, default height and the explicit osm:false setting. Report read/write failures to the user rather than claiming a successful save.

Use the existing same-origin WebSocket channel for validated updates and acknowledgments. Broadcast effective preferences to connected clients without rebuilding the world. Do not overwrite a locally edited form on routine state broadcasts. Validate URLs as HTTP/HTTPS without credentials or fragments and timeout as 1–120000 integer milliseconds (0.001–120 seconds in the form), preserving existing short configured timeouts. Serialize saves and use atomic file replacement.

Saving affects subsequent requests. Reject saves while terrain or OSM is loading, with a clear message, so in-flight results cannot be confused with new settings. Save & retry invokes the existing retry path after persistence succeeds. An already started world continues to defer downloaded geometry until the next location load; the form explains this behavior. Saved and bundled overlays continue to work offline.

## Verification

Cover preference validation, persistence across restart, preservation of unrelated config, write failures, and absence of changes on rejected input. Exercise backend updates and retries against local fixture endpoints, including deferred geometry after physics starts. Verify browser preset/custom editing, inline feedback, offline state, and mobile layout using the existing browser testing setup. Do not contact public Overpass servers in automated tests.

## Status

Approved in conversation, including automatic regional selection. Implement on a feature branch; do not push.
