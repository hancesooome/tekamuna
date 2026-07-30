/**
 * MaintenancePage — shown when the site is under maintenance.
 *
 * Design matches the existing brand: blue gradient background, dot grid,
 * mascot logo, and Filipino text.
 */

import { Wrench } from "lucide-react";
import { LOGO_ICON_URL, APP_NAME } from "@/constants";

export default function MaintenancePage() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-gradient-primary">
      {/* Dot grid overlay */}
      <div className="bg-dot-grid absolute inset-0 pointer-events-none" />

      {/* Wave top separator */}
      <div className="absolute top-0 left-0 right-0 overflow-hidden leading-[0] rotate-180">
        <svg
          viewBox="0 0 1440 56"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full block"
          preserveAspectRatio="none"
          height="56"
        >
          <path
            d="M0,32 C360,56 1080,8 1440,32 L1440,56 L0,56 Z"
            fill="white"
          />
        </svg>
      </div>

      {/* Wave bottom separator */}
      <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-[0]">
        <svg
          viewBox="0 0 1440 56"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full block"
          preserveAspectRatio="none"
          height="56"
        >
          <path
            d="M0,32 C360,56 1080,8 1440,32 L1440,56 L0,56 Z"
            fill="white"
          />
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center max-w-lg">
        {/* Logo */}
        <div className="relative">
          <div className="absolute inset-0 bg-accent/30 rounded-full blur-2xl" />
          <img
            src={LOGO_ICON_URL}
            alt={`${APP_NAME} logo`}
            className="relative h-24 w-24 object-contain drop-shadow-xl"
          />
        </div>

        {/* Wrench icon with accent background */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent shadow-lg">
          <Wrench className="h-8 w-8 text-foreground" />
        </div>

        {/* Heading */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
          Under Maintenance
        </h1>

        {/* Tagalog sub-heading */}
        <p className="text-lg sm:text-xl font-bold text-accent">
          Pansamantalang hindi magagamit
        </p>

        {/* Description */}
        <p className="text-base text-white/80 leading-relaxed max-w-md">
          Nagsasagawa kami ng mahahalagang pag-update upang mas mapagbuti ang{" "}
          <span className="font-semibold text-white">{APP_NAME}</span>.
          {" "}Muli kaming magbabalik sa lalong madaling panahon. Salamat sa iyong pang-unawa!
        </p>

        {/* Info pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          Ongoing Maintenance
        </div>
      </div>
    </div>
  );
}
