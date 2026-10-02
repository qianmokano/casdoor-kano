/** Customer branding is scoped to Kano; organization administrators keep the console. */
export function isKanoCustomer(account: any): boolean {
  return account?.owner === "kano" && account.isAdmin !== true;
}

export function isKanoApplication(application: any): boolean {
  return application?.organization === "kano";
}

export const kanoServices = [
  {name: "Subscription center", description: "Manage subscriptions and orders", url: "https://store.kanoapi.top"},
  {name: "API gateway", description: "Manage API keys and usage", url: "https://api.kanoapi.top"},
];
