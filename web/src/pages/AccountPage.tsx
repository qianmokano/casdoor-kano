import UserEditPage from "@/pages/UserEditPage";
import KanoAccountPage from "@/pages/KanoAccountPage";
import {useAccount} from "@/hooks/use-account";
import {isKanoCustomer} from "@/lib/kano";

/** "My account" — the same editor as /users/:org/:name, bound to the signed-in user. */
export default function AccountPage() {
  const {account} = useAccount();
  if (isKanoCustomer(account)) {
    return <KanoAccountPage />;
  }
  return <UserEditPage self />;
}
