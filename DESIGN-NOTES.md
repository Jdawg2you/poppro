# Design notes from Jesse (2026-09-28) — for the package-builder design pass

Reference: HealthStack Pro screenshots (Hugh Allen demo).

- **Each product is its own row, named for what it is** — "Dental / Vision / Hearing",
  "Cancer / Heart / Stroke", "Hospital Indemnity Select" — with a **Benefits** link right there
  and the monthly price on the right.
- **The row's dropdown chevron opens that product's own controls, inline, in the package card.**
  Examples Jesse liked:
  - DVH: *Max benefit* ($1,000 / $1,500 / $3,000 / $5,000) + *Deductible* ($0 / $100) side by side,
    then Vision rider and Hearing rider as separate toggles.
  - Cancer / Heart / Stroke: *Cancer* checkbox with its amount dropdown ($10K–$50K… portal goes
    $5K–$75K), and *Heart & Stroke* as its own checkbox.
  - HI Select: *Benefit period* (1 Day), then *Benefit amount* + *Ambulance* side by side.
  - Affordable Choice: *Plan* dropdown (Elite Plus / Elite / Classic Plus / Classic).
  - Price in the row header and the package total update live.
- **A + button to add a product to a package, and an × on each row to remove it.**
- Products the client can't buy show greyed with the reason (e.g. "Affordable Choice — N/A,
  age 18–64 only").
