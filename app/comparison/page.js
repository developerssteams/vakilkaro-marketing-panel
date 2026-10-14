import DashboardShell from "../../components/DashboardShell";
import ComparisonClient from "../../components/ComparisonClient";
import { getAuthenticatedPageContext } from "../../lib/page-auth";

export default async function Page() {
  const { user, perms } = await getAuthenticatedPageContext();
  return (
    <DashboardShell user={user} perms={perms} active="comparison" pageTitle="Comparison" pageSub="Marketing Panel">
      <ComparisonClient />
    </DashboardShell>
  );
}
