/** Visar text där knappnamn är markerade med **…** som fetstil. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-navy">
            {p}
          </strong>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Samma text utan markering (för t.ex. aria-label och sökning). */
export function plain(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}
