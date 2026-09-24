# Mock Data Decisions

## High-Risk Multi-Morbidity Patient Profile (Priya Rathi)

To ensure the Doctor Dashboard can adequately visualize longitudinal graphs for complex, high-risk pregnancies, we have seeded a single patient (Priya Rathi) who simultaneously presents with four separate conditions: **Pregnancy-Induced Hypertension (PIH), Gestational Diabetes Mellitus (GDM), Moderate Anemia, and Rh-Negative status**.

### Graphing Requirements Fulfilled:
For all conditions, we generated at least **3 discrete data points spaced exactly 4 weeks apart** (at Gestational Weeks 20, 24, and 28) to demonstrate rising or falling trends in the UI charts:

1. **Hypertension (PIH):** 
   - Sourced from `visit_vitals`. 
   - Shows rising Blood Pressure (140/90 ➔ 145/95 ➔ 155/100 mmHg).
   - Shows progressive proteinuria via Urine Dipstick (TRACE ➔ ONE_PLUS ➔ TWO_PLUS).

2. **Diabetes (GDM):**
   - Sourced from `observations` (Test Code: `ogtt_2hr`).
   - Shows rising blood sugar levels crossing the threshold (140 ➔ 165 ➔ 180 mg/dL).

3. **Anemia:**
   - Sourced from `observations` (Test Code: `hb`).
   - Shows falling Hemoglobin levels (10.5 ➔ 9.8 ➔ 8.5 g/dL).

4. **Rh-Negative Status:**
   - Sourced from `anti_d_events`.
   - Records escalating serum anti-D antibody titers (1:4 ➔ 1:8 ➔ 1:16).

### Version Control & Integration:
- We successfully pulled from `origin main` to inherit the latest `history` and `cockpit` features.
- Merge conflicts in `package.json` were safely resolved to maintain our current environment.
- Note: This mock data is pushed directly to the hosted Supabase instance due to local Docker limitations. 

## Individual Disease-Specific Patients

In addition to the multi-morbidity patient, we have seeded two distinct, realistic patient profiles to demonstrate isolated conditions along with their comprehensive clinical history:

### 1. Meera Patel (Gestational Diabetes Mellitus - GDM)
- **Profile:** 30 years old, G2 P1 L1 A0 at 28 weeks.
- **History:** 
  - *Menstrual:* Regular 28-day cycles, 5 days duration.
  - *Obstetric:* 1 previous live birth (Vaginal delivery, 4000g Macrosomic baby) with a history of Gestational Diabetes in the previous pregnancy.
- **Visits (Cockpit Narrative):** 
  - Shows progression across 3 visits (Weeks 20, 24, 28).
  - *Examinations:* "Accelerated weight gain noted", "Fundal height 30cm (large for dates). Suspect polyhydramnios."
  - *Summaries:* Progresses from "Advised early OGTT" to "Started on Insulin therapy."
- **Lab Findings:** 3 OGTT 2-hour observations rising across the threshold (145 ➔ 160 ➔ 185 mg/dL).

### 2. Kavita Desai (Pregnancy Induced Hypertension / Preeclampsia)
- **Profile:** 28 years old, G1 P0 L0 A0 (Primigravida) at 34 weeks.
- **History:**
  - *Menstrual:* Regular 30-day cycles, 4 days duration.
  - *Obstetric:* None (First pregnancy).
- **Visits (Cockpit Narrative):**
  - Shows progression across 3 visits (Weeks 26, 30, 34).
  - *Examinations:* Notes worsening pedal edema ("Mild pedal edema" ➔ "Significant pedal edema extending to shin").
  - *Summaries:* Progresses from "Advised strict salt restriction" to "Started on Tab Labetalol" and finally "Admit for observation".
- **Lab Findings:**
  - *Blood Pressure:* Escalating (130/85 ➔ 140/90 ➔ 150/100).
  - *Urine Albumin (Proteinuria):* Deteriorating (NIL ➔ TRACE ➔ ONE_PLUS).
