import ConnectWhatsApp from "../../components/ConnectWhatsApp";

/* Public page — client yahan apna WhatsApp Business number jodta hai
   (login nahi chahiye, pehle whatsapp-ai.vakilkaro.com/connect tha). */
export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Connect your WhatsApp · VakilKaro" } };

export default function Page() {
  return (
    <ConnectWhatsApp
      appId={process.env.WA_APP_ID || process.env.META_APP_ID || "1752005389283386"}
      configId={process.env.WA_SIGNUP_CONFIG_ID || "2799457600508929"}
    />
  );
}
