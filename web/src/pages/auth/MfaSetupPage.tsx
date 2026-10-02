import * as React from "react";
import i18next from "i18next";
import {Check, KeyRound, User} from "lucide-react";
import {useLocation, useNavigate, useSearchParams} from "react-router-dom";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Steps} from "@/components/ui/steps";
import {Loading} from "@/components/common/Loading";
import {CheckPasswordForm} from "@/components/auth/mfa/CheckPasswordForm";
import {MfaEnableForm} from "@/components/auth/mfa/MfaEnableForm";
import {MfaVerifySetupForm} from "@/components/auth/mfa/MfaVerifySetupForm";
import {
  EmailMfaType,
  PushMfaType,
  RadiusMfaType,
  SmsMfaType,
  TotpMfaType,
} from "@/components/auth/mfa/constants";
import {useAccount} from "@/hooks/use-account";
import * as ApplicationBackend from "@/backend/ApplicationBackend";
import * as MfaBackend from "@/backend/MfaBackend";
import * as Setting from "@/lib/setting";
import {isKanoCustomer} from "@/lib/kano";
import {useTranslation} from "react-i18next";

const MFA_TYPE_LABELS: {type: string; labelKey: string}[] = [
  {type: SmsMfaType, labelKey: "mfa:Use SMS"},
  {type: EmailMfaType, labelKey: "mfa:Use Email"},
  {type: TotpMfaType, labelKey: "mfa:Use Authenticator App"},
  {type: RadiusMfaType, labelKey: "mfa:Use Radius"},
  {type: PushMfaType, labelKey: "mfa:Use Push Notification"},
];

/** The factor the organization marks as "Required", used when the URL carries no "mfaType". */
function getRequiredMfaType(account: any) {
  if (!account) {
    return undefined;
  }
  return Setting.getMfaItemsByRules(account, account.organization, [Setting.MfaRuleRequired])[0]?.name;
}

/**
 * Three-step wizard that turns on a second factor: verify the password, verify
 * the factor, then enable it and hand over the recovery code. Ported from
 * web/src/auth/MfaSetupPage.js.
 */
export default function MfaSetupPage() {
  const {account, reload} = useAccount();
  const {t} = useTranslation("kano");
  const kano = isKanoCustomer(account);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Coming from a "RequiredMfa" sign-in the password was just entered, so skip step 1.
  const cameFromLogin = !kano && (location.state as any)?.from !== undefined;
  const [current, setCurrent] = React.useState(cameFromLogin ? 1 : 0);
  // A "RequiredMfa" sign-in lands here without a "mfaType", so fall back to the
  // required factor: plain SMS would ask for a phone code the organization never asked for.
  const [mfaType, setMfaType] = React.useState(
    () => kano ? TotpMfaType : searchParams.get("mfaType") ?? getRequiredMfaType(account) ?? SmsMfaType,
  );
  const [application, setApplication] = React.useState<any>(undefined);
  const [applicationError, setApplicationError] = React.useState<string | null>(null);
  const [mfaProps, setMfaProps] = React.useState<any>(null);
  const [initiating, setInitiating] = React.useState(false);
  const [verified, setVerified] = React.useState<{dest?: string; countryCode?: string; secret?: string}>({});

  React.useEffect(() => {
    if (!account) {
      return;
    }
    // LDAP-synced users can have an empty "signupApplication", so fall back to
    // the user-aware endpoint.
    const applicationName = account.signupApplication ?? localStorage.getItem("applicationName") ?? "";
    const promise = applicationName
      ? ApplicationBackend.getApplication("admin", applicationName)
      : ApplicationBackend.getUserApplication(account.owner, account.name);

    promise
      .then((res: any) => {
        if (res?.status === "error" || !res?.data) {
          const msg = res?.msg ?? i18next.t("general:Failed to get");
          setApplicationError(msg);
          setApplication(null);
          Setting.showMessage("error", msg);
          return;
        }
        setApplication(res.data);
      })
      .catch((error: any) => {
        setApplicationError(String(error));
        setApplication(null);
      });
  }, [account]);

  const initMfaProps = React.useCallback(() => {
    if (!account) {
      return;
    }
    setApplicationError(null);
    setInitiating(true);
    MfaBackend.MfaSetupInitiate({mfaType, ...account})
      .then((res: any) => {
        if (res.status === "ok") {
          setMfaProps(res.data);
        } else {
          setApplicationError(res.msg || i18next.t("mfa:Failed to initiate MFA"));
          Setting.showMessage("error", i18next.t("mfa:Failed to initiate MFA"));
        }
      })
      .catch(() => {
        setApplicationError(i18next.t("general:Failed to connect to server"));
      })
      .finally(() => setInitiating(false));
  }, [account, mfaType]);

  React.useEffect(() => {
    if (current === 1) {
      initMfaProps();
    }
  }, [current, initMfaProps]);

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="text-xl font-semibold">403 Unauthorized</h1>
        <p className="text-muted-foreground">
          {i18next.t("general:Sorry, you do not have permission to access this page or logged in status invalid.")}
        </p>
        <Button onClick={() => navigate("/")}>{i18next.t("general:Back Home")}</Button>
      </div>
    );
  }

  if (application === undefined) {
    return <Loading />;
  }

  const switchMfaType = (next: string) => {
    setMfaType(next);
    setMfaProps(null);
    setSearchParams({mfaType: next}, {replace: true});
  };

  const renderStep = () => {
    switch (current) {
    case 0:
      return (
        <CheckPasswordForm
          user={account}
          onSuccess={() => setCurrent(1)}
          onFail={(res) =>
            Setting.showMessage("error", `${i18next.t("mfa:Failed to initiate MFA")}: ${res.msg}`)
          }
        />
      );
    case 1:
      if (applicationError) {
        return (
          <Alert variant="destructive">
            <AlertDescription>
              {i18next.t("mfa:Failed to initiate MFA")}: {applicationError}
            </AlertDescription>
          </Alert>
        );
      }
      if (initiating || mfaProps === null) {
        return <Loading />;
      }
      return (
        <div className="space-y-4">
          <MfaVerifySetupForm
            mfaProps={mfaProps}
            application={application}
            user={account}
            onSuccess={(res) => {
              setVerified({dest: res.dest, countryCode: res.countryCode, secret: res.secret});
              setCurrent(2);
            }}
            onFail={(res) =>
              Setting.showMessage("error", `${i18next.t("general:Failed to verify")}: ${res.msg}`)
            }
          />
          {!cameFromLogin && !kano ? (
            <div className="flex flex-wrap justify-center gap-1">
              {MFA_TYPE_LABELS.filter((item) => item.type !== mfaType).map((item) => (
                <Button key={item.type} variant="link" size="sm" onClick={() => switchMfaType(item.type)}>
                  {i18next.t(item.labelKey)}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      );
    case 2:
      return (
        <MfaEnableForm
          user={account}
          mfaType={mfaType}
          secret={verified.secret ?? mfaProps?.secret}
          recoveryCodes={mfaProps?.recoveryCodes}
          dest={verified.dest}
          countryCode={verified.countryCode}
          requireRecoveryAcknowledgment={kano}
          onSuccess={() => {
            Setting.showMessage("success", i18next.t("general:Enabled successfully"));
            reload();
            // A "RequiredMfa" sign-in parks the URL it wanted to reach here.
            const mfaRedirectUrl = localStorage.getItem("mfaRedirectUrl");
            if (mfaRedirectUrl) {
              localStorage.removeItem("mfaRedirectUrl");
              Setting.goToLink(mfaRedirectUrl);
            } else {
              navigate("/account");
            }
          }}
          onFail={(res) => Setting.showMessage("error", `${i18next.t("general:Failed to enable")}: ${res.msg}`)}
        />
      );
    default:
      return null;
    }
  };

  return (
    <div className={kano ? "kano-container kano-account space-y-6" : "mx-auto max-w-2xl space-y-6 py-6"}>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {kano ? t("Set up your authenticator") : i18next.t("mfa:Protect your account with Multi-factor authentication")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {i18next.t(
            "mfa:Each time you sign in to your Account, you'll need your password and a authentication code",
          )}
        </p>
      </div>

      <Steps
        className="mx-auto max-w-[520px]"
        current={current}
        items={[
          {title: i18next.t("mfa:Verify Password"), icon: <User className="h-4 w-4" />},
          {title: i18next.t("mfa:Verify Code"), icon: <KeyRound className="h-4 w-4" />},
          {title: i18next.t("general:Enable"), icon: <Check className="h-4 w-4" />},
        ]}
      />

      <Card>
        <CardContent className="pt-6">{renderStep()}</CardContent>
      </Card>
      {kano ? <div className="flex justify-center gap-3"><Button variant="outline" onClick={() => navigate("/account")}>{t("Back to account")}</Button>{current > 0 ? <Button variant="ghost" onClick={() => { setCurrent(0); setMfaProps(null); setVerified({}); setApplicationError(null); }}>{t("Restart setup")}</Button> : null}</div> : null}
    </div>
  );
}
