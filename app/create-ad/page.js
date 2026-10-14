import DashboardShell from "../../components/DashboardShell";
import CreateAdPage from "../../components/CreateAdPage";
import { getAuthenticatedPageContext } from "../../lib/page-auth";

export default async function Page() {
  const { user, perms } = await getAuthenticatedPageContext();
  return (
    <DashboardShell user={user} perms={perms} active="create-ad" pageTitle="Create Ad" pageSub="Marketing Panel">
      <CreateAdPage />
    </DashboardShell>
  );
}
