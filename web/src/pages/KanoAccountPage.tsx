import * as React from "react";
import {ArrowUpRight, Boxes, KeyRound, ShieldCheck, UserRound} from "lucide-react";
import {Link} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Loading} from "@/components/common/Loading";
import {PasswordModal} from "@/components/user/PasswordModal";
import {CropperDivModal} from "@/components/user/CropperDivModal";
import {SendCodeInput} from "@/components/auth/SendCodeInput";
import {mfaAuth} from "@/components/auth/mfa/constants";
import {useAccount} from "@/hooks/use-account";
import {kanoServices} from "@/lib/kano";
import * as ApplicationBackend from "@/backend/ApplicationBackend";
import * as MfaBackend from "@/backend/MfaBackend";
import * as UserBackend from "@/backend/UserBackend";
import * as Setting from "@/lib/setting";

const factorLabels: Record<string, string> = {app: "Authenticator", email: "Email", sms: "SMS", radius: "RADIUS", push: "Push notification"};

function RemoveMfaDialog({user, factors, application, onRemoved}: {
  user: any;
  factors: any[];
  application: any;
  onRemoved: () => void;
}) {
  const {t} = useTranslation("kano");
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [recovery, setRecovery] = React.useState(false);
  const [factor, setFactor] = React.useState(factors.find((item) => item.isPreferred)?.mfaType ?? factors[0]?.mfaType ?? "app");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const changeOpen = (next: boolean) => {
    if (saving) {
      return;
    }
    setOpen(next);
    setPassword("");
    setCode("");
    setError("");
  };
  const submit = async(event: React.FormEvent) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await MfaBackend.DeleteMfa({owner: user.owner, name: user.name, password, mfaType: factor, ...(recovery ? {recoveryCode: code} : {passcode: code})});
      if (res.status !== "ok") {
        setError(t(res.msg, {defaultValue: res.msg}));
        return;
      }
      setOpen(false);
      setPassword("");
      setCode("");
      Setting.showMessage("success", t("Two-step verification turned off"));
      onRemoved();
    } catch {
      setError(t("Connection failed. Please try again."));
    } finally {
      setSaving(false);
    }
  };
  const codeFactor = !recovery && (factor === "email" || factor === "sms");

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => changeOpen(true)}>{t("Turn off")}</Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Turn off two-step verification?")}</DialogTitle><DialogDescription>{t("This turns off all enabled factors. Confirm your current password and a verification code or recovery code.")}</DialogDescription></DialogHeader>
          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-2"><Label htmlFor="kano-mfa-password">{t("Current password")}</Label><Input id="kano-mfa-password" required autoComplete="current-password" type="password" value={password} disabled={saving} onChange={(e) => setPassword(e.target.value)} /></div>
            {!recovery && factors.length > 1 ? <div className="space-y-2"><Label htmlFor="kano-mfa-factor">{t("Verification method")}</Label><select id="kano-mfa-factor" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={factor} disabled={saving} onChange={(e) => { setFactor(e.target.value); setCode(""); }}>{factors.map((item) => <option key={item.mfaType} value={item.mfaType}>{t(factorLabels[item.mfaType] ?? item.mfaType)}</option>)}</select></div> : null}
            <div className="space-y-2">
              <Label htmlFor="kano-mfa-code">{t(recovery ? "mfa:Recovery code" : "login:Verification code")}</Label>
              {codeFactor && application ? <SendCodeInput value={code} onChange={setCode} method={mfaAuth} destType={factor === "email" ? "email" : "phone"} dest={factor === "email" ? user.email : user.phone} countryCode={user.countryCode} application={application} applicationId={Setting.getApplicationName(application)} checkUser={user.name} /> : <Input id="kano-mfa-code" required autoComplete="one-time-code" inputMode={recovery ? "text" : "numeric"} value={code} disabled={saving} onChange={(e) => setCode(e.target.value)} />}
              <button className="text-xs underline underline-offset-4" type="button" disabled={saving} onClick={() => { setRecovery(!recovery); setCode(""); setError(""); }}>{t(recovery ? "Use a verification code" : "mfa:Use a recovery code")}</button>
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>{t("general:Cancel")}</Button><Button type="submit" loading={saving} disabled={!password || !code}>{t("Confirm and turn off")}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function KanoAccountPage() {
  const {t} = useTranslation("kano");
  const {account, reload: reloadAccount} = useAccount();
  const [user, setUser] = React.useState<any>(null);
  const [application, setApplication] = React.useState<any>(null);
  const [loadError, setLoadError] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [nickname, setNickname] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const [preferredSaving, setPreferredSaving] = React.useState(false);

  const loadUser = React.useCallback(async() => {
    if (!account) {
      return;
    }
    setLoadError("");
    try {
      const res = await UserBackend.getUser(account.owner, account.name);
      if (res.status !== "ok" || !res.data) {
        setLoadError(res.msg || t("Unable to load your account"));
        return;
      }
      setUser(res.data);
      setNickname(res.data.displayName ?? "");
    } catch {
      setLoadError(t("Connection failed. Please try again."));
    }
  }, [account, t]);

  React.useEffect(() => { loadUser(); }, [loadUser]);
  React.useEffect(() => {
    if (!account) {
      return;
    }
    let active = true;
    ApplicationBackend.getUserApplication(account.owner, account.name).then((res: any) => {
      if (active && res.status === "ok") {
        setApplication(res.data);
      }
    }).catch(() => {/* The main account remains usable; email/SMS sending is unavailable. */});
    return () => { active = false; };
  }, [account]);

  if (!account) {
    return null;
  }
  if (loadError) {
    return <div className="kano-container kano-account"><p role="alert">{loadError}</p><Button className="mt-4" onClick={loadUser}>{t("Try again")}</Button></div>;
  }
  if (!user) {
    return <Loading className="min-h-[400px]" />;
  }

  const factors = (user.multiFactorAuths ?? []).filter((item: any) => item.enabled);
  const saveNickname = async(event: React.FormEvent) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const res = await UserBackend.updateUserFields(user.owner, user.name, {displayName: nickname.trim()});
      if (res.status !== "ok") {
        setSaveError(t(res.msg, {defaultValue: res.msg}));
        return;
      }
      setEditing(false);
      Setting.showMessage("success", t("Nickname updated"));
      await reloadAccount();
      await loadUser();
    } catch {
      setSaveError(t("Connection failed. Please try again."));
    } finally {
      setSaving(false);
    }
  };
  const setPreferred = async(mfaType: string) => {
    if (preferredSaving) {
      return;
    }
    setPreferredSaving(true);
    try {
      const res = await MfaBackend.SetPreferredMfa({owner: user.owner, name: user.name, mfaType});
      if (res.status !== "ok") {
        Setting.showMessage("error", res.msg);
        return;
      }
      await loadUser();
    } catch {
      Setting.showMessage("error", t("Connection failed. Please try again."));
    } finally {
      setPreferredSaving(false);
    }
  };

  return (
    <div className="kano-container kano-account kano-appear">
      <div className="kano-account-heading">
        <div><h1>{t("Account and security")}</h1><p className="kano-account-subtitle">{t("Your account belongs to you. Manage the identity and security settings used across Kano services.")}</p></div>
        <span className={`kano-status ${factors.length ? "" : "kano-status-pending"}`}>{t(factors.length ? "Two-step verification on" : "Two-step verification off")}</span>
      </div>
      <section className="kano-panel" aria-labelledby="kano-profile-heading">
        <div className="kano-panel-heading"><UserRound /><h2 id="kano-profile-heading">{t("Account information")}</h2></div>
        <div className="kano-account-row">
          <div className="flex items-center gap-4"><Avatar className="h-14 w-14"><AvatarImage src={Setting.getEffectiveAvatarUrl(user)} alt={t("Your avatar")} /><AvatarFallback>{(user.displayName || user.name).slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><div><p className="kano-row-title">{t("general:Avatar")}</p><p className="kano-row-detail">{t("A small way to make it yours.")}</p></div></div>
          <CropperDivModal tag="avatar" title={t("Change avatar")} setTitle={t("Save avatar")} buttonText={t("Change")} user={user} organization={account.organization} onUploaded={() => { loadUser(); reloadAccount(); }} />
        </div>
        <div className="kano-account-row">
          <div className="flex-1"><p className="kano-row-title">{t("Nickname")}</p><p className="kano-row-detail">{user.displayName || user.name}</p>
            {editing ? <form className="kano-inline-editor space-y-3" onSubmit={saveNickname}><Label htmlFor="kano-nickname" className="sr-only">{t("Nickname")}</Label><Input id="kano-nickname" autoFocus required maxLength={100} value={nickname} disabled={saving} onChange={(e) => setNickname(e.target.value)} />{saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}<div className="flex gap-2"><Button size="sm" type="submit" loading={saving} disabled={!nickname.trim() || nickname.trim() === user.displayName}>{t("general:Save")}</Button><Button size="sm" variant="outline" type="button" disabled={saving} onClick={() => { setEditing(false); setNickname(user.displayName ?? ""); setSaveError(""); }}>{t("general:Cancel")}</Button></div></form> : null}
          </div>
          {!editing ? <Button variant="outline" size="sm" onClick={() => setEditing(true)}>{t("general:Edit")}</Button> : null}
        </div>
        <div className="kano-account-row"><div><p className="kano-row-title">{t("general:Email")}</p><p className="kano-row-detail">{user.email || "—"}</p><p className="kano-row-detail">{t("Your identity email is read-only in this version.")}</p></div><span className={`kano-status ${user.emailVerified ? "" : "kano-status-pending"}`}>{t(user.emailVerified ? "user:Verified" : "Unverified")}</span></div>
      </section>
      <section className="kano-panel" aria-labelledby="kano-security-heading">
        <div className="kano-panel-heading"><ShieldCheck /><h2 id="kano-security-heading">{t("Sign-in and security")}</h2></div>
        <div className="kano-account-row"><div><p className="kano-row-title">{t("general:Password")}</p><p className="kano-row-detail">{t("Update your password for all Kano services.")}</p></div><PasswordModal user={user} userName={user.name} organization={account.organization} account={account} onPasswordUpdated={reloadAccount} /></div>
        <div className="kano-account-row"><div><p className="kano-row-title">{t("Two-step verification")}</p><p className="kano-row-detail">{t(factors.length ? "An extra check protects your account when you sign in." : "Use an authenticator to add a second layer of protection.")}</p></div>{factors.length ? <RemoveMfaDialog user={user} factors={factors} application={application} onRemoved={loadUser} /> : <Button size="sm" asChild><Link to="/mfa/setup?mfaType=app">{t("Set up")}</Link></Button>}</div>
        {factors.map((factor: any) => <div className="kano-account-row" key={factor.mfaType}><div><p className="kano-row-title">{t(factorLabels[factor.mfaType] ?? factor.mfaType)}</p><p className="kano-row-detail">{t(factor.isPreferred ? "Preferred verification method" : "Enabled verification method")}</p></div>{factor.isPreferred ? <span className="kano-status">{t("Preferred")}</span> : <Button variant="outline" size="sm" disabled={preferredSaving} onClick={() => setPreferred(factor.mfaType)}>{t("Make preferred")}</Button>}</div>)}
        {factors.length > 0 && !factors.some((factor: any) => factor.mfaType === "app") ? <Button variant="link" asChild className="mt-4 px-0"><Link to="/mfa/setup?mfaType=app">{t("Add an authenticator")}</Link></Button> : null}
      </section>
      <section id="services" className="kano-panel" aria-labelledby="kano-services-heading"><div className="kano-panel-heading"><Boxes /><h2 id="kano-services-heading">{t("My services")}</h2></div>{kanoServices.map((service, index) => <a className="kano-service-link" key={service.url} href={service.url} target="_blank" rel="noreferrer">{index === 0 ? <Boxes /> : <KeyRound />}<div><p className="kano-row-title">{t(service.name)}</p><p className="kano-row-detail">{t(service.description)}</p></div><ArrowUpRight /></a>)}</section>
      <p className="kano-note">{t("Identity settings apply to both services. Orders, balances and API keys are managed within each service; their sign-in sessions remain separate.")}</p>
    </div>
  );
}
