import Link from "next/link";
import { FileSearch } from "lucide-react";

export default function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <FileSearch size={40} style={{ color: "var(--ink-faint)", marginBottom: "16px" }} />
      <h2 style={{ fontSize: "20px", fontWeight: 800 }}>Page Not Found</h2>
      <p style={{ color: "var(--ink-muted)", margin: "8px 0 20px" }}>
        The requested verification route does not exist.
      </p>
      <Link href="/inbox" className="btn btn-primary">
        Return to Inbox
      </Link>
    </div>
  );
}
