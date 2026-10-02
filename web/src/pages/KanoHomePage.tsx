import {ArrowRight, Fingerprint, KeyRound, ShieldCheck} from "lucide-react";
import {Link} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {KanoHero, KanoLayout} from "@/components/kano/KanoLayout";

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
  return (
    <KanoLayout publicPage>
      <section className="kano-container kano-hero kano-appear">
        <div>
          <p className="kano-eyebrow">KANO PASSPORT</p>
          <h1>{t("One account. Connected to Kano.")}</h1>
          <p className="kano-hero-description">{t("A single place for your identity, password and account security. Simple to use, always yours.")}</p>
          <Link className="kano-primary-link" to="/account">{t("Manage my account")}<ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="kano-hero-visual">
          <KanoHero priority />
          <p className="kano-hero-caption">ONE IDENTITY · CONNECTED SERVICES</p>
        </div>
      </section>
      <section id="features" className="kano-container kano-section">
        <div className="kano-section-heading">
          <div><p className="kano-eyebrow">{t("Designed around you")}</p><h2>{t("Your identity, in one place.")}</h2></div>
          <p className="kano-section-description">{t("Keep the essentials close. Manage your identity here, and your subscriptions and API usage in each service.")}</p>
        </div>
        <div className="kano-features">
          {features.map(({icon: Icon, title, detail}) => <div key={title} className="kano-feature"><div className="kano-feature-icon"><Icon strokeWidth={1.25} /></div><h3>{t(title)}</h3><p>{t(detail)}</p></div>)}
        </div>
      </section>
      <section id="faq" className="kano-container kano-section kano-faq">
        <div><p className="kano-eyebrow">{t("A little clarity")}</p><h2>{t("Common questions.")}</h2></div>
        <div>{questions.map(([question, answer]) => <details key={question}><summary>{t(question)}</summary><p>{t(answer)}</p></details>)}</div>
      </section>
    </KanoLayout>
  );
}
