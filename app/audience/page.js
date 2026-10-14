import { redirect } from "next/navigation";

/* Remarketing modules panel se hata diye gaye — purana link Dashboard pe le jaata hai */
export default function Page() { redirect("/dashboard"); }
