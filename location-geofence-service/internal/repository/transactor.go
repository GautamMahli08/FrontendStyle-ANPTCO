package repository

import "context"

// Transactor wraps a set of repository operations in a single database
// transaction. The implementation embeds the transaction in the context so
// that repositories can transparently participate without changing their
// method signatures (see internal/db.WithTx / TxFromContext).
//
// If fn returns a non-nil error the transaction is rolled back; otherwise it
// is committed. The error from Commit is returned to the caller.
type Transactor interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
}
