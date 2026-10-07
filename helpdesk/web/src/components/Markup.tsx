import { Fragment } from "react";

/** Mycket liten och säker markup: **fet** blir <strong>. All annan text renderas som text (ingen innerHTML). */
export function Markup({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}
