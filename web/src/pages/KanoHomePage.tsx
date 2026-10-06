import * as React from "react";
import {ArrowRight, Fingerprint, KeyRound, ShieldCheck} from "lucide-react";
import {Link} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {KanoLayout} from "@/components/kano/KanoLayout";
import {KanoOrb} from "@/components/kano/KanoOrb";
import {useAccount} from "@/hooks/use-account";

const features = [
  {icon: Fingerprint, title: "One unified identity", detail: "Use your Kano account across the subscription center and API gateway."},
  {icon: KeyRound, title: "A password you control", detail: "Change or recover your password in one place, for both services."},
  {icon: ShieldCheck, title: "An extra layer of security", detail: "Protect your account with an authenticator and keep a recovery code safely."},
];
const questions = [
  ["Where can I use this account?", "Your Kano Passport works with the Kano subscription center and API gateway. Orders, balances and API keys stay in their respective services."],
  ["Will I stay signed in across services?", "The services share your identity, while each manages its own session. You may need to sign in again when moving between them."],
  ["What if I forget my password?", "Choose Forgot password on the sign-in page and follow the existing email verification steps."],
  ["What if I lose my authenticator?", "Use the recovery code saved during setup to sign in. Then verify your password and recovery code to turn off MFA, and set up a new authenticator."],
  ["Can I change my email?", "Email changes are not available in this version. Contact support if your identity email needs to change."],
];

export default function KanoHomePage() {
  const {t} = useTranslation("kano");
  const {account} = useAccount();
  const orbRef = React.useRef<HTMLDivElement>(null);

  // Gentle scroll parallax on the hero orb; skipped for reduced motion.
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (orbRef.current) {
          orbRef.current.style.transform = `translateY(${Math.min(window.scrollY * 0.08, 60)}px)`;
        }
      });
    };
    window.addEventListener("scroll", onScroll, {passive: true});
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <KanoLayout publicPage>
      <section className="kano-hero kano-container">
        <div className="kano-hero-glow" aria-hidden="true" />
        <div className="kano-hero-orb" ref={orbRef}><KanoOrb /></div>
        <h1>{t("One account. Connected to Kano.")}</h1>
        <p className="kano-hero-description">{t("A single place for your identity, password and account security. Simple to use, always yours.")}</p>
        <div className="kano-hero-actions">
          {account ? (
            <Link className="kano-primary-link" to="/account">{t("Manage my account")}<ArrowRight className="h-4 w-4" /></Link>
          ) : (
            <Link className="kano-primary-link" to="/login/kano">{t("Sign in")}<ArrowRight className="h-4 w-4" /></Link>
          )}
        </div>
      </section>
      <section id="features" className="kano-container kano-section kano-reveal">
        <div className="kano-section-heading">
          <h2>{t("Your identity, in one place.")}</h2>
          <p className="kano-section-description">{t("Keep the essentials close. Manage your identity here, and your subscriptions and API usage in each service.")}</p>
        </div>
        <div className="kano-features">
          {features.map(({icon: Icon, title, detail}) => <div key={title} className="kano-feature"><div className="kano-feature-icon"><Icon strokeWidth={1.25} /></div><h3>{t(title)}</h3><p>{t(detail)}</p></div>)}
        </div>
      </section>
      <section id="faq" className="kano-container kano-section kano-faq kano-reveal">
        <h2>{t("Common questions.")}</h2>
        <div>{questions.map(([question, answer]) => <details key={question}><summary>{t(question)}</summary><p>{t(answer)}</p></details>)}</div>
      </section>
    </KanoLayout>
  );
}
