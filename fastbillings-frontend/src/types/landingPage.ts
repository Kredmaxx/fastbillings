export interface LandingButton {
  text: string;
  href: string;
  variant?: "primary" | "secondary" | "outline";
}

export interface LandingNavLink {
  label: string;
  href: string;
}

export interface LandingPageContent {
  meta: { title: string; description: string };
  header: {
    enabled: boolean;
    logoUrl: string;
    navLinks: LandingNavLink[];
    loginButton: LandingButton;
    signupButton: LandingButton;
  };
  hero: {
    enabled: boolean;
    badge?: string;
    title: string;
    highlightedText?: string;
    description: string;
    primaryButton: LandingButton;
    secondaryButton?: LandingButton;
    imageUrl?: string;
  };
  modules: {
    enabled: boolean;
    badge?: string;
    title: string;
    items: { title: string; description: string }[];
  };
  features: {
    enabled: boolean;
    badge?: string;
    title: string;
    items: { title: string; icon?: string; number?: string }[];
  };
  howItWorks: {
    enabled: boolean;
    badge?: string;
    title: string;
    steps: { title: string; description: string; imageUrl?: string }[];
  };
  pricing: {
    enabled: boolean;
    badge?: string;
    title: string;
    description?: string;
    useLivePlans: boolean;
  };
  testimonials: {
    enabled: boolean;
    badge?: string;
    title: string;
    items: { name: string; role: string; quote: string; avatarUrl?: string }[];
  };
  faq: {
    enabled: boolean;
    badge?: string;
    title: string;
    description?: string;
    items: { question: string; answer: string }[];
  };
  cta: {
    enabled: boolean;
    title: string;
    description?: string;
    primaryButton: LandingButton;
    secondaryButton?: LandingButton;
  };
  footer: {
    enabled: boolean;
    copyright: string;
    links: { label: string; href: string }[];
    socialLinks: { label: string; href: string }[];
  };
}

export interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  currencyCode: string;
  billingCycle: string;
  billingCycleLabel?: string;
  trialDays: number;
  isFeatured: boolean;
  maxUsers: number;
  maxInvoices: number;
}

export interface LandingPagePayload {
  id: string;
  content: LandingPageContent;
  plans: PublicPlan[];
  updatedAt: string;
}
