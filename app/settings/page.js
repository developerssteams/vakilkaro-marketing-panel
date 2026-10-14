import DashboardShell from "../../components/DashboardShell";
import MarketingSettingsClient from "../../components/MarketingSettingsClient";
import { getAuthenticatedPageContext } from "../../lib/page-auth";
export default async function Page(){ const {user,perms}=await getAuthenticatedPageContext(); return <DashboardShell user={user} perms={perms} active="settings" pageTitle="Settings" pageSub="Marketing Panel"><MarketingSettingsClient/></DashboardShell> }
