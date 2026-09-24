import { getPatientI18n } from '../lib/i18n/server'
import { ScanReportForm } from './scan-report-form'

export default async function ScanReportPage() {
  const { t } = await getPatientI18n()
  return <ScanReportForm t={t.scanReport} />
}
