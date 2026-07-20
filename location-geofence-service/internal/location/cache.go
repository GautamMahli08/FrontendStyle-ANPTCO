package location

import (
	"context"
	"sync"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
)

const cacheTTL = 5 * time.Minute

type cachedEntry struct {
	truck     *domain.Truck // nil encodes a "known miss" (device not registered)
	expiresAt time.Time
}

// DeviceCache is a thread-safe, TTL-based in-memory cache for the
// galileosky_device_id → Truck mapping.
//
// nil truck values are cached (negative caching) so that unregistered devices
// do not cause a DB round-trip on every message; they remain unknown for the
// duration of cacheTTL before the next live lookup is attempted.
type DeviceCache struct {
	mu      sync.RWMutex
	entries map[string]cachedEntry
}

// NewDeviceCache allocates an empty cache ready for use.
func NewDeviceCache() *DeviceCache {
	return &DeviceCache{entries: make(map[string]cachedEntry)}
}

// Get returns (truck, true) when a non-expired entry exists.
// truck may be nil — that indicates the device was looked up and not found.
// Expired entries are lazily deleted on access so the map does not grow
// unboundedly inside a long-lived warm Lambda container.
func (c *DeviceCache) Get(deviceID string) (*domain.Truck, bool) {
	c.mu.RLock()
	e, ok := c.entries[deviceID]
	c.mu.RUnlock()

	if !ok {
		return nil, false
	}
	if time.Now().After(e.expiresAt) {
		c.mu.Lock()
		// Re-check under write lock: another goroutine may have refreshed the entry.
		if e2, still := c.entries[deviceID]; still && time.Now().After(e2.expiresAt) {
			delete(c.entries, deviceID)
		}
		c.mu.Unlock()
		return nil, false
	}
	return e.truck, true
}

// Set stores truck (may be nil for unknown device) under deviceID for cacheTTL.
func (c *DeviceCache) Set(deviceID string, truck *domain.Truck) {
	c.mu.Lock()
	c.entries[deviceID] = cachedEntry{
		truck:     truck,
		expiresAt: time.Now().Add(cacheTTL),
	}
	c.mu.Unlock()
}

// Invalidate removes an entry so the next lookup refreshes from the DB.
// Use when a truck's device assignment changes.
func (c *DeviceCache) Invalidate(deviceID string) {
	c.mu.Lock()
	delete(c.entries, deviceID)
	c.mu.Unlock()
}

// GetOrLoad returns the cached truck for deviceID. On a cache miss it calls
// loader, stores the result (including nil for unknown devices), and returns it.
// If loader returns an error the cache is not updated and the error is returned.
func (c *DeviceCache) GetOrLoad(
	ctx context.Context,
	deviceID string,
	loader func(context.Context, string) (*domain.Truck, error),
) (*domain.Truck, error) {
	if t, ok := c.Get(deviceID); ok {
		return t, nil
	}
	t, err := loader(ctx, deviceID)
	if err != nil {
		return nil, err
	}
	c.Set(deviceID, t)
	return t, nil
}
