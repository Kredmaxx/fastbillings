import { BRAND } from "@constants/brand";

interface BrandLogoProps {
  variant?: "light" | "dark" | "compact" | "icon" | "mark" | "auth" | "sidebar" | "auto";
  className?: string;
  showTagline?: boolean;
}

const BrandLogo = ({
  variant = "compact",
  className = "h-10 w-auto max-w-full object-contain",
  showTagline = false,
}: BrandLogoProps) => {
  const src =
    variant === "light"
      ? BRAND.logos.light
      : variant === "dark" || variant === "sidebar"
        ? BRAND.logos.sidebar
        : variant === "icon"
          ? BRAND.logos.icon
          : variant === "mark"
            ? BRAND.logos.mark
            : BRAND.logos.auth;

  return (
    <div className="flex flex-col items-start gap-1">
      <img src={`${src}?v=12`} alt={BRAND.displayName} className={className} />
      {showTagline && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {BRAND.tagline}
        </p>
      )}
    </div>
  );
};

export default BrandLogo;
