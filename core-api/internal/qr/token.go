package qr

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
)

// Token format: "<truck_id>.<version>.<base64url(HMAC-SHA256(key, truck_id+"."+version))>"
// The HMAC signs exactly the "truck_id.version" string so the token is self-contained
// and can be verified without a DB round-trip for the signature itself.

// Build returns the signed QR token string for a truck version.
func Build(key []byte, truckID string, version int) string {
	msg := message(truckID, version)
	sig := sign(key, msg)
	return fmt.Sprintf("%s.%s", msg, sig)
}

// Verify checks the token's HMAC and returns the embedded truckID + version.
// Returns an error if the token is malformed or the HMAC is wrong.
func Verify(key []byte, token string) (truckID string, version int, err error) {
	// token = truck_id.version.sig
	// truck_id contains hyphens but no dots; version is a plain integer; sig is base64url.
	// Split from the right to isolate sig, then split once from the right again for version.
	lastDot := strings.LastIndex(token, ".")
	if lastDot < 0 {
		return "", 0, fmt.Errorf("malformed token: missing signature")
	}
	sig := token[lastDot+1:]
	msg := token[:lastDot]

	secondDot := strings.LastIndex(msg, ".")
	if secondDot < 0 {
		return "", 0, fmt.Errorf("malformed token: missing version")
	}
	versionStr := msg[secondDot+1:]
	truckID = msg[:secondDot]

	version, err = strconv.Atoi(versionStr)
	if err != nil {
		return "", 0, fmt.Errorf("malformed token: version not an integer")
	}

	expected := sign(key, msg)
	if subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) != 1 {
		return "", 0, fmt.Errorf("invalid token signature")
	}
	return truckID, version, nil
}

// TokenHash returns the hex SHA-256 of the raw token — stored in qr_codes for audit.
func TokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", h)
}

func message(truckID string, version int) string {
	return fmt.Sprintf("%s.%d", truckID, version)
}

func sign(key []byte, msg string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
