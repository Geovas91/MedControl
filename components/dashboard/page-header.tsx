import { ButtonLink } from "@/components/ui/button";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
    icon?: React.ReactNode;
  };
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-normal text-ink sm:text-3xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--foreground-muted)]">{description}</p>
      </div>
      {action ? (
        <ButtonLink href={action.href} className="sm:w-auto">
          {action.icon}
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}
