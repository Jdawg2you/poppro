# Rate inventory — what POP Pro can price today

Taken 2026-09-27 from the rate tables inside `tool/index.html` (not from the July spreadsheet
export). **Y** means rates are loaded for that state.

⚠️ **A blank does not always mean POP Pro refuses to price.** For Gap and SDR, a state with no
rates is priced from another state's table, with only a small "not loaded — verify" note
(checked for a TX couple aged 45: Gap $42.34–$92.16, SDR $39.21–$99.83, all borrowed).
Those prices must not reach a client until the state's own rates are loaded.

## ManhattanLife, by state

Dental/Vision/Hearing and 24-Hour Accident are priced nationally, so they are not in the table.

| Product | States with rates | Texas |
|---|---|---|
| Affordable Choice (AFC) | 40 | ✅ |
| Hospital Indemnity Select (HIS) | 37 | ✅ |
| Home Health Care (HHC) | 38 | ✅ |
| Specified Disease Rider (SDR) | 26 | ❌ **not loaded** |
| Out-of-Pocket / Gap | 20 | ❌ **not loaded**, though a Texas policy form exists (C-GAPJ15-TX) |

**No AFC at all:** CO, CT, DC, ID, KS, MA, NH, NJ, NY, VT, WA. **Nothing at all:** KS, MA, NJ, NY,
VT, WA. Not yet checked against ManhattanLife's filing list, so some of these may be missing
rates rather than missing products.

<details><summary>Full state grid (AFC · SDR · HIS · Gap · HHC)</summary>

```
AL YYYYY  AK Y.YYY  AZ YYYYY  AR YYYYY  CA Y.Y..  CO ....Y  CT ..Y..  DE YY..Y
DC ..Y.Y  FL Y.Y..  GA YYYYY  HI YYYYY  ID ....Y  IL YYYYY  IN Y.YYY  IA YYYYY
KS .....  KY YYY..  LA YYYYY  ME YYY.Y  MD Y.Y.Y  MA .....  MI YYY.Y  MN YYY..
MS YYY.Y  MO YYY.Y  MT Y..YY  NE YYYYY  NV YYYYY  NH ....Y  NJ .....  NM Y....
NY .....  NC YYY.Y  ND Y.Y.Y  OH Y.YYY  OK YYYYY  OR Y...Y  PA Y.Y.Y  RI YY..Y
SC YYYYY  SD YYY.Y  TN YYYYY  TX Y.Y.Y  UT Y.Y..  VT .....  VA Y.Y.Y  WA .....
WV YYYYY  WI YYYYY  WY YYYYY
```
</details>

### Levels POP Pro can price vs what the brochures allow

| Product | In POP Pro | Brochure allows |
|---|---|---|
| AFC | Classic, Classic Plus, Elite, Elite Plus | same ✅ |
| SDR | $250K / $500K max × $25K–$100K deductible | same ✅ |
| HI Select | $5K and $10K, outpatient rider $0 / $500 / $1,000, ambulance | **$50–$10,000 in $50 steps**; skilled-nursing and first-day-admission riders |
| 24-Hr Accident | 1 or 2 units | ✅ |
| Gap | $100 / $200 a day, $2,500 / $5,000 / $6,350 admission, outpatient, ER-accident | ✅ |
| DVH | $1K / $1.5K / $3K / $5K max, $0 / $100 deductible, vision + hearing riders | ✅ |
| HHC | Classic, Premier, Deluxe | ✅ |

## Not rated by age / state — flat numbers typed in by hand

- **Cancer / Heart Attack & Stroke lump sum**: one flat $74.00 a month in the bundle builder,
  whatever the client's age, state or amount. The product is issue ages 18–89 and $5K–$75K, with
  a $180 minimum annual premium (per the benefit summary in the HealthStack teardown).
  **This needs its rate table.**
- **"Cancer Lump Sum — Aetna Cancer $30K"**: a flat catalog entry.
- **Master plan list (Google Sheet)**: the prices behind Manage Plans are typed in and are not
  carrier-verified.

## Term life (living benefits)

| | Americo Term 125 | Mutual of Omaha TLE |
|---|---|---|
| Ages | 20–64, all loaded | 18–50, all loaded (matches the full CSV, checked row by row) |
| Rated by | age, tobacco (unisex) | age, sex, tobacco |
| Term | **20-year only** | **20-year only** |
| Face amounts | **$25K, $50K only** | **$25K, $50K only** |
| States | all identical except NY (verified) | pulled for Texas only; other states unverified |

The auto-pick ladder tries **$100K for 30 years first, then $100K for 20 years**, then $50K and
$25K. Neither $100K rung has rates, so every quote today falls through to $50K / 20-year.

**To pull:** $100K face (both carriers), 30-year term (both), Mutual of Omaha outside Texas.

## Non-Manhattan plans (needed for the lineup presets)

| Plan | Status |
|---|---|
| Triad / Cigna PPO | Rates on disk: `Health Insurance/USA Health Plans/TRIAD-Cigna-PPO.md`, 2026, by age band, six deductible plans (1000–7350), cross-checked against the rate sheet PDF. **Not in POP Pro yet.** |
| LifeX | **No rates anywhere.** Jesse is getting them. |
| ACA | National age-band averages only (`ACA_EST`). No state data. |

## What to go get, in priority order

1. **Texas Gap and Texas SDR rates**, from the ManhattanLife portal. Texas is the main market, and
   Gap is the deductible buster.
2. **CHAS rate table**, so cancer / heart attack & stroke is priced by age and amount instead of a
   flat $74.
3. **LifeX rates** (Jesse).
4. **Term $100K + 30-year**, Americo and Mutual of Omaha.
5. **ACA state averages**: research, see the plan in the thread.
