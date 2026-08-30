export function PageHeading(
  { eyebrow, title, description, action }: {
    eyebrow?: string;
    title: string;
    description?: string;
    action?: React.ReactNode;
  },
) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#657068]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-[-.04em] md:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
