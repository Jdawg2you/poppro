# My POP Pro — notes for whoever works on this repo

**Live:** https://mypoppro.com (GitHub Pages, repo `Jdawg2you/poppro`, `CNAME` → mypoppro.com).
Pushing `main` publishes within a minute or two. There is no build step.

**Working clone:** `~/Documents/poppro`. The `~/Downloads/pop-pro-DEPLOY-mypoppro-v4 … v12`
folders are pre-repo snapshots. Never copy from them.

**Owner:** the "My POP Pro" Claude Code thread owns this repo. The Script Navigator repo belongs to
another thread. Make navigator-side changes there, or hand them over; do not edit it from here.

## Files

| Path | What it is |
|---|---|
| `index.html` | Landing page and the **gate** (agent registration) |
| `tool/index.html` | The whole tool, a single ~500 KB page: intake, quote, client view, enroll |
| `tools-check.sh` | Run before every push. Syntax-checks the page and runs `tools-parity.py` |
| `tools-parity.py` | Fails if `MEDS` / `MED_FOR` drift from `~/script-navigator/index.html` |

## The gate

`index.html` posts name + email to a Google Apps Script web app (`REG_ENDPOINT`), which appends a
row to the **POP Pro Registrations** Sheet in Jesse's Drive. The script is bound to that Sheet
(Extensions → Apps Script); a copy of its source is `RegistrationAppsScript.gs` in the Health
Insurance project folder. Registration is remembered in `localStorage` + a cookie, so the gate is
a sign-up, not a login.

## Where prices come from

- **Manhattan products** — `HF_RATES` in `tool/index.html`, built from ManhattanLife rate guides
  (`HealthFirst Package Pro Rate Guide.xlsx`). `HealthFirst — Master Rate Sheet.xlsx` in the Health
  Insurance folder is a flattened export of the same tables. Editing it changes nothing here.
- **AFC** — `AFC_RATES` / `AFC_STATE`.
- **Term life ("living benefits")** — `LB_RATES`. Americo Term 125 + Mutual of Omaha TLE, 20-year,
  $25K/$50K only. The engine returns `null` + "rate not loaded" rather than guessing.
- **Master plan list** — `MASTER_SHEET_CSV_URL`, a public Google Sheet read on load. It feeds the
  Manage Plans list and default bundles. **Its prices are not carrier-verified.**
- **ACA** — `ACA_EST` holds *national* placeholder averages by age band. The agent is meant to
  replace them with the client's real HealthSherpa quote plus the subsidy (`in_subsidy`).
- **Package levels** — `TIERCFG` sets the Good / Better / Best level of each Manhattan product.

See `RATE-INVENTORY.md` for what is and is not loaded.

## Handoff from the Script Navigator

The navigator's health script opens `mypoppro.com/tool/` and re-posts the client profile every
300 ms until POP Pro answers `{source:"optimum-poppro", type:"applied"}`. The listener is
`applySuiteClient()`. **Deploy POP Pro before the navigator** whenever the contract changes. If the
navigator goes first, its button falls back to downloading a file for Load Quote.

POP Pro's intake uses dropdowns where the navigator uses words: height is total inches, sex is
M/F, `in_health` is a rating (Excellent / Good / Average / Complicated). Free text written into
any of them silently selects nothing. Spouse and children tick themselves from the handoff
(`I.who`), and the household tier follows from those boxes (`householdKey()`).

## Business rules (Jesse's, not visible in the code)

- **SSN and bank account / routing numbers never go in the tool.** Driver's licence is allowed.
- **Dental / vision / hearing is an add-on**, outside the package comparison, so the comparison
  stays like-for-like.
- **Compare premium to premium.** Do not present the ACA deductible as "savings". It is a feature
  of the package, and it only turns into money in a year they would have hit it.
- **The middle package is the one most clients buy.** Build it deliberately.
- **Never state a client / carrier / policy pairing from memory.** Look it up.
- **Deductible buster:** Out-of-Pocket / Gap pays only on inpatient admission, and there are no
  Texas Gap rates loaded. HI Select 1-day, sized to the deductible, is the Texas stand-in.

## Before you push

1. `bash tools-check.sh`, which must print `syntax OK` and both parity lines.
2. Load `tool/index.html` from a local server and exercise the part you changed. Check the
   console for errors.
3. Tell Jesse what changed in plain words.
