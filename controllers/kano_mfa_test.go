// Copyright 2026 Kano. Licensed under the Apache License, Version 2.0.

package controllers

import (
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"github.com/beego/beego/v2/server/web/context"
	"github.com/beego/beego/v2/server/web/session"
	"github.com/casdoor/casdoor/object"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

func kanoTestController(t *testing.T, username string, values url.Values) *ApiController {
	t.Helper()
	request := httptest.NewRequest("POST", "/api/delete-mfa", nil)
	request.Form = values
	recorder := httptest.NewRecorder()
	ctx := context.NewContext()
	ctx.Reset(recorder, request)
	manager, err := session.NewManager("memory", &session.ManagerConfig{CookieName: "test", Gclifetime: 3600})
	if err != nil {
		t.Fatal(err)
	}
	ctx.Input.CruSession, err = manager.SessionStart(recorder, request)
	if err != nil {
		t.Fatal(err)
	}
	c := &ApiController{}
	c.Init(ctx, "ApiController", "DeleteMfa", c)
	c.SetSessionUsername(username)
	return c
}

func TestKanoSecuritySession(t *testing.T) {
	user := &object.User{Owner: "kano", Name: "alice"}
	c := kanoTestController(t, user.GetId(), nil)
	if _, err := c.getKanoMfaSetup(user); err == nil {
		t.Fatal("setup without password confirmation accepted")
	}
	c.SetSession(kanoMfaSetupSession, "invalid JSON")
	if _, err := c.getKanoMfaSetup(user); err == nil {
		t.Fatal("malformed proof accepted")
	}
	c.recordKanoMfaPassword(user)
	state, err := c.getKanoMfaSetup(user)
	if err != nil || state.Props != nil || state.Verified {
		t.Fatalf("password proof invalid: %v", err)
	}
	if _, err := c.getKanoMfaSetup(&object.User{Owner: "kano", Name: "bob"}); err == nil {
		t.Fatal("proof shared with another user")
	}
	c.saveKanoMfaSetup(&kanoMfaSetup{UserId: user.GetId(), ExpiresAt: time.Now().Unix() - 1})
	if _, err := c.getKanoMfaSetup(user); err == nil || c.GetSession(kanoMfaSetupSession) != nil {
		t.Fatal("expired proof retained")
	}
	c.recordKanoMfaRecovery(&object.User{Owner: "other", Name: "alice"}, "code")
	c.recordKanoMfaRecovery(user, "")
	if c.GetSession(kanoMfaRecoverySession) != nil {
		t.Fatal("invalid recovery proof stored")
	}
	c.recordKanoMfaRecovery(user, "recovery-test-code")
	if c.GetSession(kanoMfaRecoverySession) == nil {
		t.Fatal("successful recovery proof missing")
	}
}

func TestKanoMfaRemovalCredentials(t *testing.T) {
	t.Setenv("driverName", "sqlite")
	t.Setenv("dataSourceName", "file:"+filepath.Join(t.TempDir(), "security.db"))
	t.Setenv("dbName", "casdoor")
	t.Chdir("..")
	object.InitFlag()
	object.InitAdapter()
	object.CreateTables()
	if _, err := object.AddOrganization(&object.Organization{Owner: "admin", Name: "kano", PasswordType: "bcrypt", DefaultApplication: "kano"}); err != nil {
		t.Fatal(err)
	}
	if _, err := object.AddApplication(&object.Application{Owner: "admin", Name: "kano", Organization: "kano"}, "en"); err != nil {
		t.Fatal(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("test-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	user := &object.User{
		Owner: "kano", Name: "alice", Id: "stable-id", Password: string(hash), PasswordType: "bcrypt", SignupApplication: "kano",
		TotpSecret: "JBSWY3DPEHPK3PXP", RecoveryCodes: []string{"recovery-one"},
	}
	if _, err = object.AddUsersInBatch([]*object.User{user}); err != nil {
		t.Fatal(err)
	}
	passcode, err := totp.GenerateCode(user.TotpSecret, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, username, password, factor, passcode, recovery string
		wantError                                            bool
	}{
		{"anonymous", "", "test-password", "app", passcode, "", true},
		{"other user", "kano/bob", "test-password", "app", passcode, "", true},
		{"missing password", user.GetId(), "", "app", passcode, "", true},
		{"wrong password", user.GetId(), "wrong", "app", passcode, "", true},
		{"missing factor", user.GetId(), "test-password", "app", "", "", true},
		{"ambiguous factor", user.GetId(), "test-password", "app", passcode, "recovery-one", true},
		{"inactive factor", user.GetId(), "test-password", "sms", passcode, "", true},
		{"wrong code", user.GetId(), "test-password", "app", "invalid", "", true},
		{"correct code", user.GetId(), "test-password", "app", passcode, "", false},
		{"wrong recovery", user.GetId(), "test-password", "app", "", "missing", true},
		{"recovery code", user.GetId(), "test-password", "app", "", "recovery-one", false},
		{"replayed recovery", user.GetId(), "test-password", "app", "", "recovery-one", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := kanoTestController(t, tc.username, url.Values{"password": {tc.password}, "mfaType": {tc.factor}, "passcode": {tc.passcode}, "recoveryCode": {tc.recovery}})
			current, getErr := object.GetUser(user.GetId())
			if getErr != nil {
				t.Fatal(getErr)
			}
			if err := c.verifyKanoMfaRemoval(current); (err != nil) != tc.wantError {
				t.Fatalf("unexpected verification result: %v", err)
			}
		})
	}
	c := kanoTestController(t, user.GetId(), url.Values{"password": {"test-password"}, "recoveryCode": {"already-consumed"}})
	c.recordKanoMfaRecovery(user, "already-consumed")
	if err := c.verifyKanoMfaRemoval(user); err != nil {
		t.Fatal(err)
	}
	if !c.isKanoMfaCustomer(user) || c.isKanoMfaCustomer(&object.User{Owner: "other", Name: "alice"}) {
		t.Fatal("incorrect policy scope")
	}
}

func TestKanoMfaSetupValidity(t *testing.T) {
	state := &kanoMfaSetup{UserId: "kano/alice", ExpiresAt: 100}
	for _, tc := range []struct {
		user string
		now  int64
		want bool
	}{
		{"kano/alice", 99, true},
		{"kano/alice", 100, false},
		{"kano/alice", 101, false},
		{"kano/bob", 99, false},
		{"", 99, false},
	} {
		if state.valid(tc.user, tc.now) != tc.want {
			t.Fatalf("wrong validity for %q at %d", tc.user, tc.now)
		}
	}
	var empty *kanoMfaSetup
	if empty.valid("kano/alice", 0) {
		t.Fatal("nil state accepted")
	}
}

func TestKanoMfaRecoveryProof(t *testing.T) {
	proof := &kanoMfaRecovery{UserId: "kano/alice", ExpiresAt: 100, CodeHash: recoveryCodeHash("recovery-test-code")}
	for _, tc := range []struct {
		user, code string
		now        int64
		want       bool
	}{
		{"kano/alice", "recovery-test-code", 99, true},
		{"kano/alice", "recovery-test-code", 100, false},
		{"kano/bob", "recovery-test-code", 99, false},
		{"kano/alice", "wrong", 99, false},
		{"kano/alice", "", 99, false},
		{"", "recovery-test-code", 99, false},
	} {
		if proof.matches(tc.user, tc.code, tc.now) != tc.want {
			t.Fatalf("unexpected proof validation for user %q", tc.user)
		}
	}
	var empty *kanoMfaRecovery
	if empty.matches("kano/alice", "code", 0) {
		t.Fatal("nil proof accepted")
	}
}
