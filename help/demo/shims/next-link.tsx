import { navigate } from "./router";

export default function Link({ href, children, target, ...rest }: { href: string; children?: React.ReactNode; target?: string } & Record<string, unknown>) {
  const external = /^https?:/.test(href);
  return (
    <a
      href={external ? href : `#`}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      onClick={(e) => {
        if (external) return;
        e.preventDefault();
        navigate(href);
      }}
      {...(rest as object)}
    >
      {children}
    </a>
  );
}
