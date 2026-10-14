import DashboardShell from "../../components/DashboardShell";
import MarketingModuleClient from "../../components/MarketingModuleClient";
import { getAuthenticatedPageContext } from "../../lib/page-auth";

export default async function Page() {
  const { user, perms } = await getAuthenticatedPageContext();
  return <DashboardShell user={user} perms={perms} active="campaigns" pageTitle="Campaigns" pageSub="Marketing Panel"><MarketingModuleClient moduleKey="campaigns" /></DashboardShell>;
}
