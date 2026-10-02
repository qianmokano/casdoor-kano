import * as React from "react";
import i18next from "i18next";
import {Copy} from "lucide-react";
import {Button} from "@/components/ui/button";
import * as MfaBackend from "@/backend/MfaBackend";
import * as Setting from "@/lib/setting";
import {useTranslation} from "react-i18next";

/** Step 3 of the MFA wizard: show the recovery code and turn MFA on. */
export function MfaEnableForm({
  user,
  mfaType,
  secret,
  recoveryCodes,
  dest,
  countryCode,
  requireRecoveryAcknowledgment = false,
  onSuccess,
  onFail,
}: {
  user: any;
  mfaType: string;
  secret?: string;
  recoveryCodes?: string[];
  dest?: string;
  countryCode?: string;
  requireRecoveryAcknowledgment?: boolean;
  onSuccess: (res: any) => void;
  onFail: (res: any) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const {t} = useTranslation("kano");
  const recoveryCode = recoveryCodes?.[0] ?? "";

  const enable = () => {
    setLoading(true);
    MfaBackend.MfaSetupEnable({mfaType, secret, dest, countryCode, ...user, recoveryCodes: recoveryCode})
      .then((res: any) => {
        if (res.status === "ok") {
          onSuccess(res);
        } else {
          onFail(res);
        }
      })
      .catch(() => onFail({msg: i18next.t("general:Failed to connect to server")}))
      .finally(() => setLoading(false));
  };

  return (
    <div className="mx-auto w-full max-w-[400px] space-y-4">
      <p className="text-sm text-muted-foreground">
        {i18next.t(
          "mfa:Please save this recovery code. Once your device cannot provide an authentication code, you can reset mfa authentication by this recovery code",
        )}
      </p>
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
        <code className="flex-1 break-all font-mono text-sm">{recoveryCode}</code>
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          aria-label={i18next.t("general:Copy")}
          onClick={() => Setting.copyToClipboard(recoveryCode)}
        >
          <Copy />
        </Button>
      </div>
      {requireRecoveryAcknowledgment ? <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={saved} onChange={(e) => setSaved(e.target.checked)} />{t("I have saved my recovery code")}</label> : null}
      <Button className="w-full" loading={loading} disabled={requireRecoveryAcknowledgment && !saved} onClick={enable}>
        {i18next.t("general:Enable")}
      </Button>
    </div>
  );
}
