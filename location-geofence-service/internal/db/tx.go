package db

import (
	"context"

	"github.com/jmoiron/sqlx"
)

type txKey struct{}

// WithTx returns a child context that carries tx. Repository methods call
// TxFromContext to participate in the transaction without changing their
// signatures.
func WithTx(ctx context.Context, tx *sqlx.Tx) context.Context {
	return context.WithValue(ctx, txKey{}, tx)
}

// TxFromContext returns the *sqlx.Tx embedded in ctx, or nil when the context
// does not carry a transaction (i.e. a direct-DB call is expected).
func TxFromContext(ctx context.Context) *sqlx.Tx {
	tx, _ := ctx.Value(txKey{}).(*sqlx.Tx)
	return tx
}
