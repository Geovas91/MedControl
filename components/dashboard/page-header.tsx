import { ButtonLink } from "@/components/ui/button";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  action?: {
    label: string;
    href: string;
    icon?: React.ReactNode;
  };
};

export function PageHeader({ title, description, eyebrow, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-clinic">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink sm:text-[1.75rem]">{title}</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--foreground-muted)]">{description}</p>
      </div>
      {action ? (
        <ButtonLink href={action.href} className="non-printable-action sm:w-auto">
          {action.icon}
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}
