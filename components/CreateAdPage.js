"use client";

/* ============================================================
   components/CreateAdPage.js — Create Ad (apna module)

   Pehle ye Campaigns ka ek tab tha. Ab alag page: upar seedhi
   samjhaish, neeche wahi 5-step wizard + live preview + summary.
   Publish ke baad seedha Campaigns pe le jaata hai, jahan naya ad
   dikh jaata hai.
   ============================================================ */

import { useRouter } from "next/navigation";
import CreateAdWizard from "./CreateAdWizard";

export default function CreateAdPage() {
  const router = useRouter();
  return (
    <div className="cad-wrap">
      <header className="cad-head">
        <div>
          <h1>Create an ad</h1>
          <p>Build a real Meta campaign in five short steps. Nothing goes live until you confirm on the last screen.</p>
        </div>
        <ol className="cad-flow" aria-label="How it works">
          <li><em>1</em><div><b>Fill five steps</b><span>Account, budget, audience, placement, creative</span></div></li>
          <li><em>2</em><div><b>Check the preview</b><span>See exactly what people will see</span></div></li>
          <li><em>3</em><div><b>Publish or save draft</b><span>It appears in Campaigns right away</span></div></li>
        </ol>
      </header>
      <CreateAdWizard onPublished={() => router.push("/campaigns")} />
    </div>
  );
}
