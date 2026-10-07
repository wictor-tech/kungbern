import Link from "next/link";
import { Shell } from "@/components/Shell";

export default function NotFound() {
  return (
    <Shell>
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-bold text-navy">Sidan finns inte</h1>
        <p className="mt-2 text-muted">Guiden kan ha flyttats eller avpublicerats.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-lup px-5 py-3 font-semibold text-white">
          Ställ en fråga
        </Link>
      </div>
    </Shell>
  );
}
