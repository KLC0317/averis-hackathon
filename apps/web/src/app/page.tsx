import { redirect } from "next/navigation";

export default function RootPage() {
  // Start operators at ingestion so the active import and its history are
  // visible before they move into the verification queue.
  redirect("/imports");
}
