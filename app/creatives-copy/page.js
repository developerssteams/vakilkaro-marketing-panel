import { redirect } from "next/navigation";

/* Creatives & Copy module hata diya — ads ab Campaigns → Ads me
   seedhe Meta se dikhte hain (preview + video play). Purana link
   khule to Campaigns pe bhej do. */
export default function Page() {
  redirect("/campaigns");
}
