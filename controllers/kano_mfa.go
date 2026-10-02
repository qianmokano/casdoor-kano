// Copyright 2026 Kano. Licensed under the Apache License, Version 2.0.
// Kano fork: bind security confirmations to the authenticated browser session.

package controllers

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/casdoor/casdoor/object"
)

const (
	kanoMfaSetupSession    = "kanoMfaSetup"
	kanoMfaRecoverySession = "kanoMfaRecovery"
	kanoMfaLifetime        = 5 * time.Minute
)

type kanoMfaSetup struct {
	UserId    string           `json:"userId"`
	ExpiresAt int64            `json:"expiresAt"`
	Props     *object.MfaProps `json:"props,omitempty"`
	Verified  bool             `json:"verified"`
}

func (state *kanoMfaSetup) valid(userId string, now int64) bool {
	return state != nil && userId != "" && state.UserId == userId && state.ExpiresAt > now
}

type kanoMfaRecovery struct {
	UserId    string `json:"userId"`
	ExpiresAt int64  `json:"expiresAt"`
	CodeHash  string `json:"codeHash"`
}

func recoveryCodeHash(code string) string {
	hash := sha256.Sum256([]byte(code))
	return hex.EncodeToString(hash[:])
}

func (proof *kanoMfaRecovery) matches(userId, code string, now int64) bool {
	return proof != nil && userId != "" && code != "" && proof.UserId == userId && proof.ExpiresAt > now &&
		subtle.ConstantTimeCompare([]byte(proof.CodeHash), []byte(recoveryCodeHash(code))) == 1
}

func (c *ApiController) saveKanoMfaSetup(state *kanoMfaSetup) {
	encoded, _ := json.Marshal(state)
	c.SetSession(kanoMfaSetupSession, string(encoded))
}

func (c *ApiController) getKanoMfaSetup(user *object.User) (*kanoMfaSetup, error) {
	if c.GetSessionUsername() != user.GetId() {
		return nil, errors.New("Unauthorized operation")
	}
	var state kanoMfaSetup
	encoded, ok := c.GetSession(kanoMfaSetupSession).(string)
	if !ok || json.Unmarshal([]byte(encoded), &state) != nil || !state.valid(user.GetId(), time.Now().Unix()) {
		c.DelSession(kanoMfaSetupSession)
		return nil, errors.New("Please verify your current password again")
	}
	return &state, nil
}

func (c *ApiController) isKanoMfaCustomer(user *object.User) bool {
	return object.IsKanoCustomer(user) && !c.IsAdminOf(user)
}

func (c *ApiController) recordKanoMfaPassword(user *object.User) {
	c.saveKanoMfaSetup(&kanoMfaSetup{UserId: user.GetId(), ExpiresAt: time.Now().Add(kanoMfaLifetime).Unix()})
}

// The single recovery code is consumed at login. Retain a short-lived hash proof
// so the same browser can subsequently remove the lost factor with that code and
// its current password; the proof is consumed on removal and never restores a code.
func (c *ApiController) recordKanoMfaRecovery(user *object.User, code string) {
	if !object.IsKanoCustomer(user) || code == "" {
		return
	}
	proof := kanoMfaRecovery{UserId: user.GetId(), ExpiresAt: time.Now().Add(kanoMfaLifetime).Unix(), CodeHash: recoveryCodeHash(code)}
	encoded, _ := json.Marshal(proof)
	c.SetSession(kanoMfaRecoverySession, string(encoded))
}

func (c *ApiController) verifyKanoMfaRemoval(user *object.User) error {
	if c.GetSessionUsername() != user.GetId() {
		return errors.New("Unauthorized operation")
	}
	password := c.Ctx.Request.Form.Get("password")
	if password == "" {
		return errors.New("Please enter your current password")
	}
	var err error
	if user.Ldap != "" {
		err = object.CheckLdapUserPassword(user, password, c.GetAcceptLanguage())
	} else {
		err = object.CheckPassword(user, password, c.GetAcceptLanguage())
	}
	if err != nil {
		return err
	}
	code := c.Ctx.Request.Form.Get("recoveryCode")
	passcode := c.Ctx.Request.Form.Get("passcode")
	if (code == "") == (passcode == "") {
		return errors.New("Enter an authentication code or recovery code")
	}
	return object.VerifyMfaWithLimit(user, func() error {
		if code != "" {
			var proof kanoMfaRecovery
			encoded, _ := c.GetSession(kanoMfaRecoverySession).(string)
			if json.Unmarshal([]byte(encoded), &proof) == nil && proof.matches(user.GetId(), code, time.Now().Unix()) {
				return nil
			}
			return object.MfaRecover(user, code)
		}
		props := user.GetMfaProps(c.Ctx.Request.Form.Get("mfaType"), false)
		if !props.Enabled {
			return errors.New("Invalid multi-factor authentication type")
		}
		mfa := object.GetMfaUtil(props.MfaType, props)
		if mfa == nil {
			return errors.New("Invalid multi-factor authentication type")
		}
		return mfa.Verify(passcode, c.GetAcceptLanguage())
	}, c.GetAcceptLanguage())
}
