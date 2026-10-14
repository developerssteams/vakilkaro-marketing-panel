import DashboardShell from "../../components/DashboardShell";
import LoginToast from "../../components/LoginToast";
import GrowthDashboard from "../../components/GrowthDashboard";
import { getAuthenticatedPageContext } from "../../lib/page-auth";

export default async function DashboardPage() {
  const { user, perms } = await getAuthenticatedPageContext();
  return (
    <>
      <LoginToast name={user.name} />
      <DashboardShell user={user} perms={perms} active="dashboard" pageTitle="Dashboard" pageSub="Marketing Panel">
        <GrowthDashboard userName={user.name || ""} />
      </DashboardShell>
    </>
  );
}
