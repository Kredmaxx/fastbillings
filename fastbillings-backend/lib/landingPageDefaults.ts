import type { LandingPageContent } from './landingPageTypes';

export const DEFAULT_LANDING_PAGE_CONTENT: LandingPageContent = {
  meta: {
    title: 'FastBillings — Smart Invoicing & ERP',
    description:
      'FastBillings helps you manage invoicing, inventory, accounting, and business operations efficiently.',
  },
  header: {
    enabled: true,
    logoUrl: '/brand/fastbillings-logo.svg',
    navLinks: [
      { label: 'Home', href: '#home' },
      { label: 'Modules', href: '#modules' },
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
    ],
    loginButton: { text: 'Log in', href: '/admin/login', variant: 'outline' },
    signupButton: { text: 'Sign up', href: '/register', variant: 'primary' },
  },
  hero: {
    enabled: true,
    badge: 'All-in-one billing platform',
    title: 'Sales, Invoices & Accounts',
    highlightedText: 'Management System',
    description:
      'FastBillings is a complete accounts & finance platform for your business — invoicing, inventory, purchases, and reporting in one place.',
    primaryButton: { text: 'Get started free', href: '/register', variant: 'primary' },
    secondaryButton: { text: 'View demo', href: '/admin/login', variant: 'secondary' },
    imageUrl: '/landing/assets/img/demos/banner-img.svg',
  },
  modules: {
    enabled: true,
    badge: 'Modules',
    title: 'Advanced modules for your invoice management system',
    items: [
      {
        title: 'Dashboard',
        description: 'Summary of all business data in one view.',
      },
      {
        title: 'Inventory & Sales',
        description: 'Manage products, customers, invoices, and quotations.',
      },
      {
        title: 'Purchase',
        description: 'Suppliers, purchase orders, and supplier payments.',
      },
      {
        title: 'Finance & Accounts',
        description: 'Expenses, bank accounts, journals, and ledgers.',
      },
      {
        title: 'Reports',
        description: 'Sales, inventory, tax, and financial reports.',
      },
      {
        title: 'Settings',
        description: 'Roles, taxes, currencies, and company configuration.',
      },
    ],
  },
  features: {
    enabled: true,
    badge: 'Powerful features',
    title: 'Everything you need to invoice like a pro',
    items: [
      { title: 'Invoice & quotation builder', number: '01' },
      { title: 'Multi-currency support', number: '02' },
      { title: 'Client management', number: '03' },
      { title: 'Custom roles & permissions', number: '04' },
      { title: 'GST & tax engine', number: '05' },
      { title: 'AI-assisted workflows', number: '06' },
    ],
  },
  howItWorks: {
    enabled: true,
    badge: 'How it works',
    title: 'Get started in three simple steps',
    steps: [
      {
        title: 'Create your workspace',
        description: 'Sign up and set up your company profile in minutes.',
      },
      {
        title: 'Add customers & products',
        description: 'Import or create customers, products, and tax settings.',
      },
      {
        title: 'Send invoices & get paid',
        description: 'Create professional invoices and track payments effortlessly.',
      },
    ],
  },
  pricing: {
    enabled: true,
    badge: 'Pricing',
    title: 'Simple, transparent plans',
    description: 'Start with a free trial. Upgrade as you grow.',
    useLivePlans: true,
  },
  testimonials: {
    enabled: true,
    badge: 'Testimonials',
    title: 'Trusted by growing businesses',
    items: [
      {
        name: 'Priya Sharma',
        role: 'Founder, Bright Retail',
        quote: 'FastBillings cut our invoicing time in half. The dashboard gives us clarity we never had before.',
      },
      {
        name: 'James Okonkwo',
        role: 'Finance Lead, Nova Services',
        quote: 'Multi-currency and tax handling just work. Our team adopted it within a week.',
      },
    ],
  },
  faq: {
    enabled: true,
    badge: 'FAQ',
    title: 'Frequently asked questions',
    description: 'Everything you need to know about FastBillings.',
    items: [
      {
        question: 'Is there a free trial?',
        answer: 'Yes. Every new workspace starts with a trial on the Starter plan.',
      },
      {
        question: 'Can I invite my team?',
        answer: 'Yes. Add users and assign roles with granular permissions.',
      },
      {
        question: 'Do you support multiple currencies?',
        answer: 'Yes. FastBillings supports multi-currency invoicing and reporting.',
      },
    ],
  },
  cta: {
    enabled: true,
    title: 'Ready to streamline your billing?',
    description: 'Join businesses that run on FastBillings.',
    primaryButton: { text: 'Start free trial', href: '/register', variant: 'primary' },
    secondaryButton: { text: 'Log in', href: '/admin/login', variant: 'outline' },
  },
  footer: {
    enabled: true,
    copyright: `© ${new Date().getFullYear()} FastBillings. All rights reserved.`,
    links: [
      { label: 'Documentation', href: '/documentation' },
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
    ],
    socialLinks: [
      { label: 'Twitter', href: '#' },
      { label: 'LinkedIn', href: '#' },
    ],
  },
};

export const LANDING_SECTION_KEYS = [
  'meta',
  'header',
  'hero',
  'modules',
  'features',
  'howItWorks',
  'pricing',
  'testimonials',
  'faq',
  'cta',
  'footer',
] as const;

export type LandingSectionKey = (typeof LANDING_SECTION_KEYS)[number];
