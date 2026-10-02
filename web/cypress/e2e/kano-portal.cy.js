const organization = {
  owner: "admin", name: "kano", displayName: "Kano 通行证",
  passwordObfuscatorType: "Plain",
  favicon: "/kano/logo.png",
  passwordOptions: [], mfaItems: [], languages: ["zh", "en"], accountItems: [],
};
const user = {
  owner: "kano", name: "portal-demo", id: "stable-demo-subject", displayName: "Kano 用户",
  email: "demo@example.com", emailVerified: true, password: "***", ldap: "",
  signupApplication: "kano", multiFactorAuths: [],
};
const application = {
  owner: "admin", name: "kano", organization: "kano", organizationObj: organization,
  displayName: "Kano 通行证", enablePassword: true, enableSignUp: true, providers: [],
  signinMethods: [{name: "Password", rule: "All"}],
  signinItems: [{name: "Username", visible: true}, {name: "Password", visible: true},
    {name: "Login button", visible: true}, {name: "Forgot password?", visible: true}],
};

function fixture({signedIn = true, factors = [], disableConsole = false, network} = {}) {
  let profile = {...user, multiFactorAuths: factors};
  cy.intercept({method: "GET", pathname: "/api/get-account"}, signedIn
    ? {status: "ok", data: {...user}, data2: {...organization, disableConsole}}
    : {status: "error", msg: "Please login first", data: "Please login first"});
  // Cypress handlers reply explicitly so updates below are reflected on reload.
  cy.intercept({method: "GET", pathname: "/api/get-user"}, (request) => request.reply({status: "ok", data: profile}));
  for (const path of ["get-user-application", "get-default-application", "get-application", "get-app-login"]) {
    cy.intercept({method: "GET", pathname: `/api/${path}`}, {status: "ok", data: application});
  }
  cy.intercept({method: "POST", pathname: "/api/update-user"}, (request) => {
    if (network?.offline) {
      request.destroy();
      return;
    }
    expect(request.query.columns).to.equal("displayName");
    expect(Object.keys(request.body)).to.deep.equal(["displayName"]);
    profile = {...profile, displayName: request.body.displayName};
    request.reply({status: "ok", data: "Affected"});
  }).as("saveProfile");
}

function visit(path) {
  cy.visit(path, {onBeforeLoad(window) {
    window.localStorage.clear();
    window.localStorage.setItem("language", "zh");
  }});
}

function noOverflow() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth);
  });
}

function pressEnter() {
  cy.then(() => Cypress.automation("remote:debugger:protocol", {command: "Input.dispatchKeyEvent",
    params: {type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13}}));
  cy.then(() => Cypress.automation("remote:debugger:protocol", {command: "Input.dispatchKeyEvent",
    params: {type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13}}));
}

describe("Kano customer portal", () => {
  it("renders the Chinese public home before a slow session query completes", () => {
    fixture({signedIn: false});
    cy.intercept({method: "GET", pathname: "/api/get-account"}, {
      delay: 5000,
      body: {status: "error", data: "Please login first"},
    }).as("slowAccount");
    cy.visit("/", {onBeforeLoad(window) { window.localStorage.clear(); }});
    cy.contains("h1", "一个账户，连接 Kano 服务。", {timeout: 3000}).should("be.visible");
    cy.title().should("eq", "Kano 通行证");
    cy.wait("@slowAccount");
    cy.contains("h1", "一个账户，连接 Kano 服务。").should("be.visible");
  });

  it("redirects an existing customer session from the public home to the account", () => {
    fixture();
    visit("/");
    cy.location("pathname").should("eq", "/account");
    cy.contains("h1", "账户与安全").should("be.visible");
    cy.title().should("eq", "Kano 通行证 · 账户与安全");
  });

  for (const width of [375, 768, 1440]) {
    it(`public home fits ${width}px and explains separate service sessions`, () => {
      fixture({signedIn: false});
      cy.viewport(width, 900);
      visit("/");
      cy.contains("h1", "一个账户，连接 Kano 服务。").should("be.visible");
      cy.get(".kano-brand-image").should("be.visible").and(($image) => {
        expect($image[0].naturalWidth).to.be.greaterThan(0);
      });
      cy.get("head link[rel=icon]").should("have.attr", "href", "/kano/logo.png");
      cy.contains("summary", "进入另一个服务时需要重新登录吗？").click();
      cy.contains("各自管理登录会话").should("be.visible");
      noOverflow();
      cy.screenshot(`kano-home-${width}`, {capture: "fullPage"});
    });
  }

  it("anonymous account access chooses Kano and keeps the branded authentication page", () => {
    fixture({signedIn: false});
    visit("/account");
    cy.location("pathname").should("eq", "/login/kano");
    cy.get(".kano-auth-panel").should("be.visible");
    cy.title().should("eq", "Kano 通行证 · 登录");
    cy.get("head link[rel=icon]").should("have.attr", "href", "/kano/logo.png");
    cy.get("head link[rel=apple-touch-icon]").should("have.attr", "href", "/kano/logo.png");
    cy.contains("a", "忘记密码").should("have.attr", "href", "/forget/kano");
  });

  it("shows real verification state, hides internal fields, and saves nickname alone", () => {
    fixture();
    visit("/account");
    cy.contains("h1", "账户与安全").should("be.visible");
    cy.get("head link[rel=icon]").should("have.attr", "href", "/kano/logo.png");
    cy.contains("demo@example.com").should("be.visible");
    cy.get("input[type=email]").should("not.exist");
    cy.get("main").should("not.contain", "stable-demo-subject");
    cy.contains("button", "编辑").click();
    cy.get("#kano-nickname").clear().type("新的昵称");
    cy.contains("button", "保存").click();
    cy.wait("@saveProfile");
    cy.contains(".kano-row-detail", "新的昵称").should("be.visible");
    cy.screenshot("kano-account-desktop", {capture: "fullPage"});
  });

  it("cancel does not update the nickname; network errors allow retry", () => {
    const network = {offline: true};
    fixture({network});
    visit("/account");
    cy.contains("button", "编辑").click();
    cy.get("#kano-nickname").clear().type("取消的昵称");
    cy.contains("button", "取消").click();
    cy.contains(".kano-row-detail", "Kano 用户").should("be.visible");
    cy.get("@saveProfile.all").should("have.length", 0);
    cy.contains("button", "编辑").click();
    cy.get("#kano-nickname").clear().type("重试昵称");
    cy.contains("button", "保存").click();
    cy.get("[role=alert]").should("be.visible");
    cy.then(() => { network.offline = false; });
    cy.contains("button", "保存").should("be.enabled").click();
    cy.contains(".kano-row-detail", "重试昵称").should("be.visible");
  });

  it("keeps account access available with a disabled console and redirects old profile URLs", () => {
    fixture({disableConsole: true});
    visit("/account");
    cy.contains("h1", "账户与安全").should("be.visible");
    visit("/users/kano/portal-demo");
    cy.location("pathname").should("eq", "/account");
    visit("/apps");
    cy.location("pathname").should("eq", "/account");
  });

  it("password mismatch and cancellation make no password request", () => {
    fixture();
    cy.intercept("POST", "**/api/set-password", {status: "ok"}).as("setPassword");
    visit("/account");
    cy.contains("button", "编辑密码").click();
    cy.get("#old-password").type("test-old", {log: false});
    cy.get("#new-password").type("test-new", {log: false});
    cy.get("#re-password").type("different", {log: false});
    cy.contains("button", "设置密码").click();
    cy.get("#re-password").should("be.visible");
    cy.get("@setPassword.all").should("have.length", 0);
    cy.contains("button", "取消").click();
    cy.contains("button", "编辑密码").click();
    cy.get("#old-password").should("have.value", "");
  });

  it("MFA removal requires confirmation, reports wrong codes, and permits retry", () => {
    fixture({factors: [{enabled: true, mfaType: "app", isPreferred: true}]});
    let attempts = 0;
    cy.intercept("POST", "**/api/delete-mfa", (request) => {
      attempts++;
      request.reply(attempts === 1 ? {status: "error", msg: "totp passcode error"} : {status: "ok", data: []});
    }).as("removeMfa");
    visit("/account");
    cy.contains("button", "关闭").click();
    cy.get("[role=dialog]").should("be.visible");
    cy.contains("button", "确认关闭").should("be.disabled");
    cy.get("#kano-mfa-password").type("test-password", {log: false});
    cy.get("#kano-mfa-code").type("000000", {log: false});
    cy.contains("button", "确认关闭").click();
    cy.wait("@removeMfa");
    cy.get("[role=alert]").should("contain", "totp passcode error");
    cy.get("#kano-mfa-code").clear().type("123456", {log: false});
    cy.contains("button", "确认关闭").click();
    cy.wait("@removeMfa");
    cy.get("[role=dialog]").should("not.exist");
  });

  it("mobile account and MFA password step fit 375px and keep recovery code hidden", () => {
    fixture();
    cy.viewport(375, 900);
    visit("/account");
    cy.contains("h1", "账户与安全").should("be.visible");
    noOverflow();
    cy.screenshot("kano-account-mobile", {capture: "fullPage"});
    cy.contains("a", "设置").click();
    cy.get("input[type=password]").should("be.visible");
    cy.get("code").should("not.exist");
    noOverflow();
  });

  it("expired sessions return to sign-in and initial user fetch errors offer retry", () => {
    fixture();
    cy.intercept({method: "GET", pathname: "/api/get-user"}, {status: "error", msg: "Session expired"});
    visit("/account");
    cy.contains("Session expired").should("be.visible");
    cy.contains("button", "重试").should("be.visible");
    fixture({signedIn: false});
    visit("/account");
    cy.location("pathname").should("eq", "/login/kano");
  });

  it("completes the MFA wizard only after verification and recovery acknowledgement", () => {
    fixture();
    cy.intercept("POST", "**/api/check-user-password", {status: "ok"});
    cy.intercept("POST", "**/api/mfa/setup/initiate", {status: "ok", data: {
      mfaType: "app", secret: "JBSWY3DPEHPK3PXP", url: "otpauth://totp/Kano?secret=JBSWY3DPEHPK3PXP",
      recoveryCodes: ["local-recovery-fixture"],
    }});
    let attempts = 0;
    cy.intercept("POST", "**/api/mfa/setup/verify", (request) => {
      request.reply(++attempts === 1 ? {status: "error", msg: "Invalid code"} : {status: "ok"});
    }).as("verifyMfa");
    cy.intercept("POST", "**/api/mfa/setup/enable", {status: "ok"}).as("enableMfa");
    visit("/mfa/setup?mfaType=app");
    cy.get("input[type=password]").type("local-password{enter}", {log: false});
    cy.get("#passcode").should("be.visible");
    cy.get("code").should("not.exist");
    cy.get("#passcode").type("000000{enter}");
    cy.wait("@verifyMfa");
    cy.get("#passcode").should("have.value", "").type("123456{enter}");
    cy.wait("@verifyMfa");
    cy.get("code").should("contain", "local-recovery-fixture");
    cy.title().should("eq", "Kano 通行证 · 双重验证");
    cy.screenshot("kano-mfa-setup", {capture: "fullPage"});
    cy.contains("button", /^启用$/).should("be.disabled");
    cy.get("input[type=checkbox]").check();
    cy.contains("button", /^启用$/).click();
    cy.wait("@enableMfa");
    cy.location("pathname").should("eq", "/account");
  });

  it("crops an avatar before uploading and cancel leaves the account unchanged", () => {
    fixture();
    cy.intercept({method: "GET", pathname: "/api/get-resources"}, {status: "ok", data: []});
    cy.intercept({method: "POST", pathname: "/api/upload-resource"}, (request) => {
      expect(request.query.tag).to.equal("avatar");
      expect(request.query.fullFilePath).to.match(/^avatar\/kano\/portal-demo\./);
      request.reply({status: "ok", data: "/kano/favicon.svg"});
    }).as("uploadAvatar");
    visit("/account");
    cy.contains("button", /^修改$/).click();
    cy.get("[role=dialog]").should("be.visible");
    cy.get("body").type("{esc}");
    cy.get("@uploadAvatar.all").should("have.length", 0);
    cy.contains("button", /^修改$/).click();
    cy.get("input[type=file]").selectFile({
      contents: Cypress.Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64"),
      fileName: "avatar.png", mimeType: "image/png",
    }, {force: true});
    cy.get(".cropper-container").should("be.visible");
    cy.get(".cropper-canvas img").should((image) => expect(image[0].naturalWidth).to.be.greaterThan(0));
    cy.contains("button", "保存头像").click();
    cy.wait("@uploadAvatar");
    cy.get("[role=dialog]").should("not.exist");
  });

  it("OIDC login keeps state and PKCE context and returns to the application", () => {
    fixture({signedIn: false});
    cy.intercept({method: "POST", pathname: "/api/login"}, (request) => {
      expect(request.query.code_challenge).to.equal("test-pkce-challenge");
      expect(request.query.state).to.equal("state-with-context");
      request.reply({status: "ok", data: "local-authorization-code"});
    }).as("oidcLogin");
    cy.intercept("GET", "**/__kano-callback*", {statusCode: 200, headers: {"content-type": "text/html"}, body: "<p>OIDC callback</p>"});
    const query = new URLSearchParams({client_id: "local-client", response_type: "code", scope: "openid profile email",
      redirect_uri: "http://localhost:7001/__kano-callback", state: "state-with-context",
      code_challenge: "test-pkce-challenge", code_challenge_method: "S256"});
    visit(`/login/oauth/authorize?${query}`);
    cy.get("#username").type("portal-demo");
    cy.get("#password").type("local-password", {log: false});
    cy.get("form button[type=submit]").click();
    cy.wait("@oidcLogin");
    cy.location("pathname").should("eq", "/__kano-callback");
    cy.location("search").should("contain", "state=state-with-context").and("contain", "code=local-authorization-code");
  });

  it("provides keyboard access and honors reduced motion", () => {
    fixture({signedIn: false});
    visit("/");
    cy.then(() => Cypress.automation("remote:debugger:protocol", {command: "Emulation.setEmulatedMedia",
      params: {features: [{name: "prefers-reduced-motion", value: "reduce"}]}}));
    cy.get(".kano-hero").should("have.css", "animation-name", "none");
    cy.get(".kano-primary-link").should("have.css", "transition-duration", "0s");
    cy.get(".kano-skip-link").focus().should("be.visible");
    pressEnter();
    cy.location("hash").should("eq", "#kano-main");
    // Cypress 13's focus whitelist omits native <summary>; use the browser's focus method.
    cy.get("summary").first().then((summary) => summary[0].focus());
    pressEnter();
    cy.get("details").first().should("have.attr", "open");
    cy.then(() => Cypress.automation("remote:debugger:protocol", {command: "Emulation.setEmulatedMedia", params: {features: []}}));
  });
});
