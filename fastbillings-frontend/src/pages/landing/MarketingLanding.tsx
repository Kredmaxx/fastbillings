import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ChevronDown, Loader2 } from "lucide-react";
import Seo from "@components/admin/Seo";
import { BRAND } from "@constants/brand";
import Constants from "@constants/api";
import type { LandingPageContent, LandingPagePayload, PublicPlan } from "@models/landingPage";

export default function MarketingLanding() {
  const [payload, setPayload] = useState<LandingPagePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(Constants.LANDING_PAGE_URL)
      .then((res) => setPayload(res.data?.data ?? null))
      .catch(() => setPayload(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#000B1E]">
        <Loader2 className="animate-spin text-white" size={36} />
      </div>
    );
  }

  const content = payload?.content;
  if (!content) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#000B1E] text-white">
        <p>Unable to load landing page.</p>
        <Link to="/admin/login" className="text-[#00D2FF] underline">Log in</Link>
      </div>
    );
  }

  return (
    <>
      <Seo title={content.meta.title} description={content.meta.description} />
      <div className="min-h-screen bg-white text-gray-900">
        {content.header.enabled && <LandingHeader data={content.header} />}
        {content.hero.enabled && <LandingHero data={content.hero} />}
        {content.modules.enabled && <LandingModules data={content.modules} />}
        {content.features.enabled && <LandingFeatures data={content.features} />}
        {content.howItWorks.enabled && <LandingHowItWorks data={content.howItWorks} />}
        {content.pricing.enabled && <LandingPricing data={content.pricing} plans={payload?.plans ?? []} />}
        {content.testimonials.enabled && <LandingTestimonials data={content.testimonials} />}
        {content.faq.enabled && <LandingFaq data={content.faq} />}
        {content.cta.enabled && <LandingCta data={content.cta} />}
        {content.footer.enabled && <LandingFooter data={content.footer} />}
      </div>
    </>
  );
}

function LandingHeader({ data }: { data: LandingPageContent["header"] }) {
  return (
    <header className="sticky top-0 z-50 bg-[#000B1E]/95 backdrop-blur border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src={data.logoUrl || BRAND.logos.light} alt={BRAND.name} className="h-8 w-auto" />
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {data.navLinks.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-white/80 hover:text-white transition">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <Link to={data.loginButton.href} className="text-sm font-medium text-white/90 hover:text-white px-3 py-2">
            {data.loginButton.text}
          </Link>
          <Link to={data.signupButton.href} className="text-sm font-medium bg-[#0066FF] hover:bg-[#0052CC] text-white px-4 py-2 rounded-lg transition">
            {data.signupButton.text}
          </Link>
        </div>
      </div>
    </header>
  );
}

function LandingHero({ data }: { data: LandingPageContent["hero"] }) {
  return (
    <section id="home" className="relative overflow-hidden bg-gradient-to-b from-[#000B1E] via-[#0B1533] to-[#000B1E] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          {data.badge && (
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-[#00D2FF] bg-[#00D2FF]/10 px-3 py-1 rounded-full mb-4">
              {data.badge}
            </span>
          )}
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            {data.title}{" "}
            {data.highlightedText && <span className="text-[#0066FF]">{data.highlightedText}</span>}
          </h1>
          <p className="mt-4 text-lg text-white/70 max-w-xl">{data.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={data.primaryButton.href} className="inline-flex items-center justify-center bg-[#0066FF] hover:bg-[#0052CC] text-white font-medium px-6 py-3 rounded-lg transition">
              {data.primaryButton.text}
            </Link>
            {data.secondaryButton && (
              <Link to={data.secondaryButton.href} className="inline-flex items-center justify-center border border-white/30 hover:bg-white/10 text-white font-medium px-6 py-3 rounded-lg transition">
                {data.secondaryButton.text}
              </Link>
            )}
          </div>
        </div>
        {data.imageUrl && (
          <div className="flex justify-center">
            <img src={data.imageUrl} alt="" className="max-w-full h-auto drop-shadow-2xl" />
          </div>
        )}
      </div>
    </section>
  );
}

function SectionHeading({ badge, title }: { badge?: string; title: string }) {
  return (
    <div className="text-center max-w-3xl mx-auto mb-12">
      {badge && <p className="text-sm font-semibold uppercase tracking-wider text-[#0066FF] mb-2">{badge}</p>}
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">{title}</h2>
    </div>
  );
}

function LandingModules({ data }: { data: LandingPageContent["modules"] }) {
  return (
    <section id="modules" className="py-20 bg-[#F4F8FF]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading badge={data.badge} title={data.title} />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.items.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-gray-600 text-sm">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingFeatures({ data }: { data: LandingPageContent["features"] }) {
  return (
    <section id="features" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading badge={data.badge} title={data.title} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.items.map((item, i) => (
            <div key={i} className="flex items-start gap-4 p-5 rounded-xl border border-gray-200 bg-white">
              <span className="text-2xl font-bold text-[#0066FF]/30">{item.number ?? String(i + 1).padStart(2, "0")}</span>
              <h3 className="font-semibold text-gray-900">{item.title}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingHowItWorks({ data }: { data: LandingPageContent["howItWorks"] }) {
  return (
    <section id="how-it-works" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading badge={data.badge} title={data.title} />
        <div className="grid md:grid-cols-3 gap-8">
          {data.steps.map((step, i) => (
            <div key={i} className="relative text-center">
              <div className="w-12 h-12 rounded-full bg-[#0066FF] text-white font-bold flex items-center justify-center mx-auto mb-4">
                {i + 1}
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-gray-600 text-sm">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingPricing({ data, plans }: { data: LandingPageContent["pricing"]; plans: PublicPlan[] }) {
  return (
    <section id="pricing" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading badge={data.badge} title={data.title} />
        {data.description && <p className="text-center text-gray-600 -mt-8 mb-10">{data.description}</p>}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 flex flex-col ${plan.isFeatured ? "border-[#0066FF] ring-2 ring-[#0066FF]/20 shadow-lg" : "border-gray-200 bg-white"}`}
            >
              {plan.isFeatured && <span className="text-xs font-semibold text-[#0066FF] mb-2">Most popular</span>}
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <p className="text-3xl font-bold mt-3">
                {plan.currencyCode} {plan.price.toFixed(0)}
                <span className="text-sm font-normal text-gray-500">/{plan.billingCycleLabel ?? plan.billingCycle}</span>
              </p>
              {plan.description && <p className="text-sm text-gray-600 mt-2 flex-1">{plan.description}</p>}
              <p className="text-xs text-gray-500 mt-3">{plan.trialDays} day trial · {plan.maxUsers} users</p>
              <Link to="/register" className="mt-6 block text-center bg-[#0066FF] hover:bg-[#0052CC] text-white font-medium py-2.5 rounded-lg transition">
                Get started
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingTestimonials({ data }: { data: LandingPageContent["testimonials"] }) {
  return (
    <section className="py-20 bg-[#F4F8FF]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading badge={data.badge} title={data.title} />
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {data.items.map((item, i) => (
            <blockquote key={i} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-700 italic">"{item.quote}"</p>
              <footer className="mt-4">
                <p className="font-semibold text-gray-900">{item.name}</p>
                <p className="text-sm text-gray-500">{item.role}</p>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingFaq({ data }: { data: LandingPageContent["faq"] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading badge={data.badge} title={data.title} />
        {data.description && <p className="text-center text-gray-600 -mt-8 mb-8">{data.description}</p>}
        <div className="space-y-3">
          {data.items.map((item, i) => (
            <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-5 py-4 text-left font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => setOpen(open === i ? null : i)}
              >
                {item.question}
                <ChevronDown size={18} className={`shrink-0 transition ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <div className="px-5 pb-4 text-sm text-gray-600">{item.answer}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingCta({ data }: { data: LandingPageContent["cta"] }) {
  return (
    <section className="py-20 bg-gradient-to-r from-[#0066FF] to-[#0052CC] text-white">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold">{data.title}</h2>
        {data.description && <p className="mt-3 text-white/80">{data.description}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to={data.primaryButton.href} className="bg-white text-[#0066FF] font-medium px-6 py-3 rounded-lg hover:bg-gray-100 transition">
            {data.primaryButton.text}
          </Link>
          {data.secondaryButton && (
            <Link to={data.secondaryButton.href} className="border border-white/50 text-white font-medium px-6 py-3 rounded-lg hover:bg-white/10 transition">
              {data.secondaryButton.text}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function LandingFooter({ data }: { data: LandingPageContent["footer"] }) {
  return (
    <footer className="bg-[#000B1E] text-white/70 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm">{data.copyright}</p>
        <div className="flex flex-wrap gap-4 text-sm">
          {data.links.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-white transition">
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex gap-4 text-sm">
          {data.socialLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-white transition">
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
