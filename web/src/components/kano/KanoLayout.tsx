import * as React from "react";
import {ArrowUpRight, LogOut} from "lucide-react";
import {Link} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button";
import {LanguageSelect} from "@/components/common/LanguageSelect";
import {useAccount} from "@/hooks/use-account";
import {useLogout} from "@/hooks/use-logout";
import {kanoServices} from "@/lib/kano";
import * as Setting from "@/lib/setting";
import * as OrganizationBackend from "@/backend/OrganizationBackend";
import "./kano.css";

export function KanoHero({className = "", priority = false}: {className?: string; priority?: boolean}) {
  return (
    <img
      className={`kano-hero-image ${className}`}
      src="/kano/hero-768.webp"
      srcSet="/kano/hero-480.webp 480w, /kano/hero-768.webp 768w, /kano/hero-1280.webp 1280w"
      sizes="(max-width: 767px) 100vw, 560px"
      width="1536"
      height="1024"
      alt=""
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

export function KanoLayout({children, publicPage = false, application}: {
  children: React.ReactNode;
  publicPage?: boolean;
  application?: any;
}) {
  const {t} = useTranslation("kano");
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
    const title = document.title;
    document.title = "Kano 通行证 · 账户与安全";
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
      document.title = title;
      icons.forEach(({element, previousHref}) => {
        if (previousHref) {
          element?.setAttribute("href", previousHref);
        }
      });
    };
  }, []);

  return (
    <div className="kano-portal">
      <a className="kano-skip-link" href="#kano-main">{t("Skip to content")}</a>
      <header className="kano-header kano-container">
        <Link to="/" className="kano-brand" aria-label={t("Kano Passport")}>
          <img className="kano-brand-image" src="/kano/logo.png" width="32" height="32" alt="" />
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
