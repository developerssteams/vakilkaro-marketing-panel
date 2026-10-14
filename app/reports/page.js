import DashboardShell from "../../components/DashboardShell";
import ReportsClient from "../../components/ReportsClient";
import { getAuthenticatedPageContext } from "../../lib/page-auth";

/* Reports — pehle "Analytics" tha. Permission key wahi "analytics" rakhi hai
   taaki jin logon ko pehle access tha unka access bana rahe. */
export default async function Page() {
  const { user, perms } = await getAuthenticatedPageContext();
  return (
    <DashboardShell user={user} perms={perms} active="analytics" pageTitle="Reports" pageSub="Marketing Panel">
      <ReportsClient />
    </DashboardShell>
  );
}
