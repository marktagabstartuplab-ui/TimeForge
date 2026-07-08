import { redirect } from "next/navigation";

// The landing page is merged into /login (hero + sign-in card).
// Keep "/" as a bare redirect so old links and the logo href still work.
export default function Home() {
  redirect("/login");
}
