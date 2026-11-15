# Rebuild — Gym Comeback Tracker

A browser-based training companion focused on structured sessions, machine education, and gradual progression.

## Run locally
Open `index.html` in a modern browser. For camera-based QR scanning, serve it over HTTPS or localhost and grant camera permission.

## Current features
- 30/45/60-minute session planner.
- Warm-up and mobility always before strength work; cooldown always after.
- Exercise selection by training focus, with estimated work/rest/transition time.
- Session countdown timer.
- Printable workout sheets and machine instruction pages.
- Searchable starter machine catalogue with Rebuild QR identifiers.
- QR camera scanning where the browser supports BarcodeDetector; manual code lookup fallback.
- Local progress log and introductory training levels.

## Accuracy and safety notes
This is a starter reference catalogue, not a verified inventory of every Planet Fitness club. Equipment models and availability vary by club. Machine instructions are general; use the diagram and adjustment labels on the actual equipment and ask club staff to demonstrate unfamiliar machines. The schematic illustration is intentionally labelled as illustrative, not a machine-specific animation.

Planet Fitness machine QR codes may open official instructions in the Planet Fitness app. Rebuild's own QR lookup currently recognizes its internal catalogue identifiers (RB-...). External QR destinations are not scraped or represented as official Planet Fitness content.

## Planned improvements
- Replace schematic illustrations with reviewed, machine-specific animated sequences.
- Expand catalogue from verified model names and setup instructions across club variants.
- Support importing/printing a full multi-week progression plan.
- Add optional export/import for progress data across devices.
