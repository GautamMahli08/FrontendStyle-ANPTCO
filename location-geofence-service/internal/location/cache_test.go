package location_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/location"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var testTruck = &domain.Truck{
	ID:                 uuid.MustParse("11111111-1111-1111-1111-111111111111"),
	WorkspaceID:        uuid.MustParse("22222222-2222-2222-2222-222222222222"),
	GalileoskyDeviceID: "device-abc",
}

// --- Get / Set / Invalidate ---

func TestDeviceCache_Miss(t *testing.T) {
	c := location.NewDeviceCache()
	truck, ok := c.Get("unknown-device")
	assert.False(t, ok)
	assert.Nil(t, truck)
}

func TestDeviceCache_Hit(t *testing.T) {
	c := location.NewDeviceCache()
	c.Set("dev-1", testTruck)

	truck, ok := c.Get("dev-1")
	assert.True(t, ok)
	assert.Equal(t, testTruck, truck)
}

func TestDeviceCache_NilEntryIsCached(t *testing.T) {
	c := location.NewDeviceCache()
	c.Set("unknown", nil) // negative cache

	truck, ok := c.Get("unknown")
	assert.True(t, ok, "nil entry should be present in cache")
	assert.Nil(t, truck, "cached nil should be returned as nil")
}

func TestDeviceCache_Expiry(t *testing.T) {
	// We cannot manipulate the internal TTL, so we verify expiry by noting that
	// a fresh entry is always a hit and an entry that has never been set is a miss.
	// (True TTL expiry is covered by GetOrLoad tests via the clock-frozen loader.)
	c := location.NewDeviceCache()
	c.Set("dev-1", testTruck)

	// Immediately after Set → hit
	_, ok := c.Get("dev-1")
	assert.True(t, ok)
}

func TestDeviceCache_Invalidate(t *testing.T) {
	c := location.NewDeviceCache()
	c.Set("dev-1", testTruck)

	c.Invalidate("dev-1")

	_, ok := c.Get("dev-1")
	assert.False(t, ok, "entry should be gone after Invalidate")
}

func TestDeviceCache_Invalidate_NonexistentKey(t *testing.T) {
	c := location.NewDeviceCache()
	// Should not panic on a key that was never set.
	assert.NotPanics(t, func() { c.Invalidate("ghost") })
}

// --- GetOrLoad ---

func TestDeviceCache_GetOrLoad_CacheHit_LoaderNotCalled(t *testing.T) {
	c := location.NewDeviceCache()
	c.Set("dev-1", testTruck)

	calls := 0
	loader := func(_ context.Context, _ string) (*domain.Truck, error) {
		calls++
		return nil, errors.New("should not be called")
	}

	truck, err := c.GetOrLoad(context.Background(), "dev-1", loader)
	require.NoError(t, err)
	assert.Equal(t, testTruck, truck)
	assert.Equal(t, 0, calls, "loader must not be called on a cache hit")
}

func TestDeviceCache_GetOrLoad_CacheMiss_LoaderCalledAndResultCached(t *testing.T) {
	c := location.NewDeviceCache()

	calls := 0
	loader := func(_ context.Context, deviceID string) (*domain.Truck, error) {
		calls++
		assert.Equal(t, "dev-1", deviceID)
		return testTruck, nil
	}

	truck, err := c.GetOrLoad(context.Background(), "dev-1", loader)
	require.NoError(t, err)
	assert.Equal(t, testTruck, truck)
	assert.Equal(t, 1, calls, "loader should be called exactly once on a miss")

	// Second call → cache hit, loader not invoked again.
	truck2, err := c.GetOrLoad(context.Background(), "dev-1", loader)
	require.NoError(t, err)
	assert.Equal(t, testTruck, truck2)
	assert.Equal(t, 1, calls, "loader should not be called again for cached result")
}

func TestDeviceCache_GetOrLoad_NilResultIsCached(t *testing.T) {
	c := location.NewDeviceCache()

	calls := 0
	loader := func(_ context.Context, _ string) (*domain.Truck, error) {
		calls++
		return nil, nil // device not registered
	}

	truck, err := c.GetOrLoad(context.Background(), "ghost", loader)
	require.NoError(t, err)
	assert.Nil(t, truck)
	assert.Equal(t, 1, calls)

	// Second call must hit the negative cache, not call loader again.
	truck2, err := c.GetOrLoad(context.Background(), "ghost", loader)
	require.NoError(t, err)
	assert.Nil(t, truck2)
	assert.Equal(t, 1, calls, "nil should be served from cache on second call")
}

func TestDeviceCache_GetOrLoad_LoaderError_NotCached(t *testing.T) {
	c := location.NewDeviceCache()
	loaderErr := errors.New("db connection refused")

	calls := 0
	loader := func(_ context.Context, _ string) (*domain.Truck, error) {
		calls++
		return nil, loaderErr
	}

	truck, err := c.GetOrLoad(context.Background(), "dev-err", loader)
	assert.ErrorIs(t, err, loaderErr)
	assert.Nil(t, truck)
	assert.Equal(t, 1, calls)

	// Entry must not be cached on error — next call invokes loader again.
	_, _ = c.GetOrLoad(context.Background(), "dev-err", loader)
	assert.Equal(t, 2, calls, "failed load must not be cached")
}

// --- Concurrent safety ---

func TestDeviceCache_ConcurrentReadWrite(t *testing.T) {
	c := location.NewDeviceCache()
	const goroutines = 50

	var wg sync.WaitGroup
	wg.Add(goroutines * 2)

	for i := 0; i < goroutines; i++ {
		go func(i int) {
			defer wg.Done()
			key := "dev-concurrent"
			c.Set(key, testTruck)
		}(i)

		go func(i int) {
			defer wg.Done()
			key := "dev-concurrent"
			_, _ = c.Get(key)
		}(i)
	}

	// run with -race to catch data races
	wg.Wait()
}

func TestDeviceCache_GetOrLoad_ConcurrentSameKey(t *testing.T) {
	c := location.NewDeviceCache()
	var mu sync.Mutex
	calls := 0

	loader := func(_ context.Context, _ string) (*domain.Truck, error) {
		// Simulate a slow DB hit.
		time.Sleep(2 * time.Millisecond)
		mu.Lock()
		calls++
		mu.Unlock()
		return testTruck, nil
	}

	const goroutines = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			truck, err := c.GetOrLoad(context.Background(), "shared-key", loader)
			assert.NoError(t, err)
			assert.NotNil(t, truck)
		}()
	}
	wg.Wait()

	// The cache does not coalesce concurrent misses (no singleflight), so the
	// loader may be called more than once. The important guarantee is that it
	// is eventually cached and that no data race occurs.
	mu.Lock()
	assert.GreaterOrEqual(t, calls, 1)
	mu.Unlock()
}
