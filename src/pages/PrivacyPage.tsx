/**
 * PrivacyPage — Privacy Policy for Teka Muna
 *
 * URL: /privacy
 *
 * Required by:
 *  - Facebook Developer App submission
 *  - General data transparency obligations
 *
 * Sections:
 *  1. Hero
 *  2. What data we collect
 *  3. How we use data
 *  4. Data sharing
 *  5. Data retention & deletion
 *  6. Your rights
 *  7. Data deletion anchor (for Facebook)
 *  8. Contact
 */

import { Shield, Database, Eye, Share2, Trash2, UserCheck, Mail } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";

// ─── Last updated date ────────────────────────────────────────────────────────
const LAST_UPDATED = "August 9, 2026";
const CONTACT_EMAIL = "hancedagondon@gmail.com";
const APP_URL = "https://www.tekamuna.app";

// ─── Section data ─────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: "data-we-collect",
    icon: Database,
    title: "What Data We Collect",
    color: "text-primary",
    bg: "bg-primary/5 border-primary/20",
    content: [
      {
        subtitle: "Claims you submit",
        text: "When you use Teka Muna to fact-check a claim, we process the text you enter. This claim text is used solely to perform the fact-check and may be cached temporarily to speed up repeated lookups of the same claim.",
      },
      {
        subtitle: "Images you upload",
        text: "If you upload an image for OCR text extraction or analysis, the image is processed immediately and is not permanently stored on our servers beyond what is necessary to complete the request.",
      },
      {
        subtitle: "Usage analytics",
        text: "We may collect anonymous, aggregated usage data (e.g., number of fact-checks performed, response times) to improve our service. This data cannot be used to identify you personally.",
      },
      {
        subtitle: "Account information (Admin only)",
        text: "If you log in as an administrator, we store your email address and session tokens to authenticate your access. This is limited to authorized administrators of Teka Muna.",
      },
    ],
  },
  {
    id: "how-we-use-data",
    icon: Eye,
    title: "How We Use Your Data",
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    content: [
      {
        subtitle: "Fact-checking pipeline",
        text: "The claim text you submit is sent to third-party AI providers (Google Gemini, OpenRouter) and a web search service (Tavily) to retrieve evidence and generate a verdict. These providers process the data under their own privacy policies.",
      },
      {
        subtitle: "Caching results",
        text: "Fact-check results are cached in our database (Supabase) to avoid redundant processing and reduce costs. Cached results are keyed to a normalized version of the claim text — no personal identifiers are stored alongside them.",
      },
      {
        subtitle: "Service improvement",
        text: "Anonymous, aggregated statistics about fact-check volume and category distribution help us improve accuracy and reliability. No individual queries are analyzed for this purpose.",
      },
    ],
  },
  {
    id: "data-sharing",
    icon: Share2,
    title: "Data Sharing",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    content: [
      {
        subtitle: "Third-party AI providers",
        text: "Claim text is shared with Google (Gemini API) and/or OpenRouter to generate fact-check analysis. These services are governed by their respective privacy policies. We do not share your data with advertisers.",
      },
      {
        subtitle: "Web search",
        text: "Claim text is sent to Tavily (a web search API) to retrieve relevant news articles and sources. Tavily processes queries in accordance with their privacy policy.",
      },
      {
        subtitle: "No sale of data",
        text: "We do not sell, rent, or trade your personal information or claim submissions to any third party for commercial purposes.",
      },
      {
        subtitle: "Facebook integration",
        text: "If you tag the Teka Muna Facebook Page in a post, the text content of that post may be processed by our fact-checking pipeline to generate a public reply. By tagging our Page, you consent to this processing.",
      },
    ],
  },
  {
    id: "data-retention",
    icon: Trash2,
    title: "Data Retention",
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    content: [
      {
        subtitle: "Cached fact-checks",
        text: "Fact-check results are cached for varying periods depending on claim category (e.g., breaking news expires faster than evergreen topics). All cached entries are automatically purged after their expiry date.",
      },
      {
        subtitle: "Request deletion",
        text: `To request deletion of any data associated with your use of Teka Muna, email us at ${CONTACT_EMAIL} with the subject "Data Deletion Request." We will process your request within 30 days.`,
      },
      {
        subtitle: "Admin accounts",
        text: "Administrator accounts and associated session data are deleted upon request or when no longer needed for platform operations.",
      },
    ],
  },
  {
    id: "your-rights",
    icon: UserCheck,
    title: "Your Rights",
    color: "text-green-600",
    bg: "bg-green-50 border-green-200",
    content: [
      {
        subtitle: "Access",
        text: "You have the right to request a copy of any personal data we hold about you.",
      },
      {
        subtitle: "Correction",
        text: "You can request correction of inaccurate personal data.",
      },
      {
        subtitle: "Deletion",
        text: "You can request deletion of your personal data. See the Data Deletion section below.",
      },
      {
        subtitle: "Objection",
        text: "You can object to the processing of your personal data in certain circumstances.",
      },
    ],
  },
] as const;

// ─── Components ───────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <div className="flex flex-col items-center text-center pt-10 pb-12 gap-4">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl" />
        <div className="relative flex items-center justify-center h-20 w-20 rounded-full bg-primary/10 border border-primary/20">
          <Shield className="h-10 w-10 text-primary" />
        </div>
      </div>
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground max-w-[620px] mx-auto">
          Teka Muna is committed to protecting your privacy. This policy explains what data we
          collect, how we use it, and your rights regarding your information.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: <span className="font-semibold text-foreground">{LAST_UPDATED}</span>
        </p>
      </div>
    </div>
  );
}

function PolicySection({
  id,
  icon: Icon,
  title,
  color,
  bg,
  content,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  color: string;
  bg: string;
  content: ReadonlyArray<{ subtitle: string; text: string }>;
}) {
  return (
    <section id={id} className={`rounded-2xl border p-6 sm:p-8 ${bg}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/80 border border-white/60 shadow-sm">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <h2 className={`text-xl font-bold ${color}`}>{title}</h2>
      </div>
      <div className="space-y-5">
        {content.map((item) => (
          <div key={item.subtitle}>
            <h3 className="text-sm font-bold text-foreground mb-1">{item.subtitle}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataDeletionSection() {
  return (
    <section
      id="data-deletion"
      className="rounded-2xl border bg-red-50 border-red-200 p-6 sm:p-8"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/80 border border-white/60 shadow-sm">
          <Trash2 className="h-5 w-5 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-red-600">Request Data Deletion</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground mb-4">
        In compliance with Facebook Platform Policy and applicable data protection laws, you may
        request deletion of any personal data associated with your use of Teka Muna.
      </p>
      <div className="bg-white/70 rounded-xl border border-red-200 p-4">
        <p className="text-sm font-semibold text-foreground mb-2">How to request deletion:</p>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>
            Send an email to{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Data Deletion Request`}
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            with the subject:{" "}
            <span className="font-mono font-semibold text-foreground">"Data Deletion Request"</span>
          </li>
          <li>Include any relevant details (e.g., your Facebook username or the post content)</li>
          <li>We will confirm receipt and process your request within 30 days</li>
        </ol>
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section
      id="contact"
      className="rounded-2xl border bg-primary/5 border-primary/20 p-6 sm:p-8"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/80 border border-white/60 shadow-sm">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-primary">Contact Us</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground mb-4">
        If you have questions about this Privacy Policy or want to exercise your data rights,
        please reach out:
      </p>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Platform:</span>
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            {APP_URL}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Email:</span>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  return (
    <PageContainer>
      <title>Privacy Policy — Teka Muna</title>

      <HeroSection />

      <div className="max-w-[780px] mx-auto pb-16 space-y-6">
        {SECTIONS.map((section) => (
          <PolicySection key={section.id} {...section} />
        ))}

        <DataDeletionSection />
        <ContactSection />

        <p className="text-xs text-center text-muted-foreground pt-2">
          This Privacy Policy may be updated from time to time. Continued use of Teka Muna after
          any changes constitutes your acceptance of the updated policy.
        </p>
      </div>
    </PageContainer>
  );
}
