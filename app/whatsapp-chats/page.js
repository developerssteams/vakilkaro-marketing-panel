import DashboardShell from "../../components/DashboardShell";
import WhatsAppChats from "../../components/WhatsAppChats";
import { getAuthenticatedPageContext } from "../../lib/page-auth";

export default async function Page() {
  const { user, perms } = await getAuthenticatedPageContext();
  return (
    <DashboardShell user={user} perms={perms} active="whatsapp-chats" pageTitle="WhatsApp Chats" pageSub="Marketing Panel">
      <WhatsAppChats />
    </DashboardShell>
  );
}
