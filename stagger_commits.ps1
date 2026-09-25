git add add_birth_plan.js docs/mock_data_decisions.md insert_multi.js insert_p2_p3.js insert_p4.js insert_patients.js
git commit -m "chore: Add data seeding scripts and mock decisions"

git add "src/app/clinic/patients/[id]/cockpit/birth-plan.tsx" "src/app/clinic/patients/[id]/cockpit/page.tsx" "src/modules/pregnancies/pregnancy.mapper.ts" "src/modules/pregnancies/pregnancy.types.ts"
git commit -m "feat: Introduce Birth Preparedness Plan panel to patient cockpit"

git add "src/app/clinic/patients/[id]/cockpit/dictated-textarea.tsx" "src/app/clinic/patients/[id]/cockpit/consultation-form.tsx" "src/modules/orders/formulary.ts"
git commit -m "feat: Add diagnosis dropdowns and disease-specific prescription bundles"

git add "src/app/clinic/layout.tsx" "src/app/clinic/patients/[id]/cockpit/report-actions.ts" "src/app/clinic/visits/[visitId]/slip/print-button.tsx" "src/components/cockpit/sparkline.tsx"
git commit -m "feat: Enhance sparkline graph visualization, report actions, and layout"

git add package.json pnpm-lock.yaml
git commit -m "chore: Update dependencies"

git push origin main
