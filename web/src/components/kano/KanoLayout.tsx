import * as React from "react";
import {ArrowUpRight, LogOut} from "lucide-react";
import {Link, useLocation} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button";
import {LanguageSelect} from "@/components/common/LanguageSelect";
import {useAccount} from "@/hooks/use-account";
import {useLogout} from "@/hooks/use-logout";
import {kanoServices} from "@/lib/kano";
import * as Setting from "@/lib/setting";
import * as OrganizationBackend from "@/backend/OrganizationBackend";
import "./kano.css";

export function KanoLayout({children, publicPage = false, application}: {
  children: React.ReactNode;
  publicPage?: boolean;
  application?: any;
}) {
  const {t} = useTranslation("kano");
  const {pathname} = useLocation();
  const {account} = useAccount();
  const [publicApplication, setPublicApplication] = React.useState<any>(null);
  React.useEffect(() => {
    if (!publicPage || application) {
      return;
    }
    let active = true;
    OrganizationBackend.getDefaultApplication("admin", "kano").then((res: any) => {
      if (active && res.status === "ok") {
        setPublicApplication(res.data);
      }
    }).catch(() => {/* A unavailable legal-link lookup does not block the landing page. */});
    return () => { active = false; };
  }, [application, publicPage]);
  const logout = useLogout();

  React.useEffect(() => {
    document.documentElement.setAttribute("data-kano-portal", "");
    const icons = [
      {selector: "link[rel='icon']", href: "/kano/logo.png"},
      {selector: "link[rel='apple-touch-icon']", href: "/kano/logo.png"},
    ].map(({selector, href}) => {
      const element = document.querySelector<HTMLLinkElement>(selector);
      const previousHref = element?.getAttribute("href");
      element?.setAttribute("href", href);
      return {element, previousHref};
    });
    if (!localStorage.getItem("language")) {
      Setting.setLanguage("zh");
    }
    return () => {
      document.documentElement.removeAttribute("data-kano-portal");
      icons.forEach(({element, previousHref}) => {
        if (previousHref) {
          element?.setAttribute("href", previousHref);
        }
      });
    };
  }, []);

  // Kano is not the console: its tab title names the portal section, not the account page.
  React.useEffect(() => {
    const previous = document.title;
    const section = pathname === "/account" ? "Account and security"
      : pathname.startsWith("/mfa/setup") ? "Two-step verification"
        : pathname.startsWith("/login") ? "Sign in" : null;
    document.title = section ? `${t("Kano Passport")} · ${t(section)}` : t("Kano Passport");
    return () => { document.title = previous; };
  }, [pathname, t]);

  // Sticky header hairline + one-time scroll reveals for .kano-reveal sections.
  React.useEffect(() => {
    const header = document.querySelector(".kano-header");
    const onScroll = () => header?.classList.toggle("kano-header-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, {passive: true});
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, {rootMargin: "0px 0px -12% 0px"});
    document.querySelectorAll(".kano-reveal").forEach((element) => revealObserver.observe(element));
    return () => {
      window.removeEventListener("scroll", onScroll);
      revealObserver.disconnect();
    };
  }, []);

  return (
    <div className="kano-portal">
      <a className="kano-skip-link" href="#kano-main">{t("Skip to content")}</a>
      <header className="kano-header">
        <div className="kano-container kano-header-inner">
          <Link to="/" className="kano-brand" aria-label={t("Kano Passport")}>
            <img className="kano-brand-image" src="/kano/logo.png" width="28" height="28" alt="" />
            <span>Kano <span className="kano-brand-subtitle">{t("Passport")}</span></span>
          </Link>
          <nav aria-label={t("Main navigation")} className="kano-nav">
            {publicPage ? (
              <>
                <a className="kano-nav-secondary" href="#features">{t("Features")}</a>
                <a className="kano-nav-secondary" href="#faq">{t("FAQ")}</a>
              </>
            ) : account ? <Link to="/account">{t("Account and security")}</Link> : null}
            <LanguageSelect languages={["zh", "en"]} />
            {account ? (
              <Button variant="ghost" size="sm" onClick={logout} aria-label={t("Sign out")}>
                <LogOut className="h-4 w-4" /><span className="kano-nav-secondary">{t("Sign out")}</span>
              </Button>
            ) : <Link className="kano-nav-login" to="/login/kano">{t("Sign in")}</Link>}
          </nav>
        </div>
      </header>
      <main id="kano-main" className="kano-main" tabIndex={-1}>{children}</main>
      <footer className="kano-footer kano-container">
        <div><span className="kano-footer-brand">{t("Kano Passport")}</span><p>{t("One identity. Your services.")}</p></div>
        <div className="kano-footer-links">
          {kanoServices.map((service) => <a key={service.url} href={service.url} target="_blank" rel="noreferrer">{t(service.name)}<ArrowUpRight className="h-3 w-3" /></a>)}
          {(application ?? publicApplication)?.termsOfUse ? <a href={(application ?? publicApplication).termsOfUse} target="_blank" rel="noreferrer">{t("Terms")}</a> : null}
          <a href="https://github.com/qianmokano/casdoor-kano" target="_blank" rel="noreferrer">{t("Open source")}</a>
        </div>
      </footer>
    </div>
  );
}
