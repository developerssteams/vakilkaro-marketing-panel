import DashboardShell from "../../components/DashboardShell";
import { LeadReport } from "../../components/ByTimeTab";
import { getAuthenticatedPageContext } from "../../lib/page-auth";

/* Lead Report — CRM ki leads, stage-wise. Permission "analytics" (Reports) wali hi. */
export default async function Page() {
  const { user, perms } = await getAuthenticatedPageContext();
  return (
    <DashboardShell user={user} perms={perms} active="lead-report" pageTitle="Lead Report" pageSub="Marketing Panel">
      <LeadReport />
    </DashboardShell>
  );
}