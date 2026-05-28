import { TelemetryData } from '@/src/types';

export class TelemetrySimulator {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  startTracking(truckId: string, fromLat: number, fromLng: number, toLat: number, toLng: number) {
    // Simulate truck movement from depot to destination
    let progress = 0;
    const totalSteps = 50; // 50 updates over journey
    const updateInterval = 2000; // Every 2 seconds

    const interval = setInterval(() => {
      progress += 1 / totalSteps;

      if (progress >= 1) {
        progress = 1;
        this.stopTracking(truckId);
      }

      // Interpolate position
      const lat = fromLat + (toLat - fromLat) * progress;
      const lng = fromLng + (toLng - fromLng) * progress;

      // Simulate fuel consumption (decreases during journey)
      const telemetry: TelemetryData = {
        truckId,
        lat,
        lng,
        speed: progress < 1 ? 60 + Math.random() * 20 : 0,
        timestamp: new Date(),
        compartmentSensors: [
          { compartmentId: 'comp-1-1', fuelLevel: 5000 - (progress * 1000), fuelType: 'DIESEL' },
          { compartmentId: 'comp-1-2', fuelLevel: 3000 - (progress * 600), fuelType: 'DIESEL' },
          { compartmentId: 'comp-1-3', fuelLevel: 2000 - (progress * 400), fuelType: 'DIESEL' },
        ],
      };

      this.emit('telemetry:update', telemetry);
    }, updateInterval);

    this.intervals.set(truckId, interval);
  }

  stopTracking(truckId: string) {
    const interval = this.intervals.get(truckId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(truckId);
    }
  }

  simulateOffloading(truckId: string, compartments: any[]) {
    // Simulate fuel level dropping during offloading
    let offloadProgress = 0;
    const offloadInterval = setInterval(() => {
      offloadProgress += 0.1;

      if (offloadProgress >= 1) {
        clearInterval(offloadInterval);
      }

      const telemetry: TelemetryData = {
        truckId,
        lat: 23.6100, // At destination
        lng: 58.4100,
        speed: 0,
        timestamp: new Date(),
        compartmentSensors: compartments.map((comp: any) => ({
          compartmentId: comp.compartmentId,
          fuelLevel: comp.volume * (1 - offloadProgress * 0.9), // Offload 90% of fuel
          fuelType: comp.fuelType,
        })),
      };

      this.emit('telemetry:update', telemetry);
    }, 1000);
  }
}

export const telemetrySimulator = new TelemetrySimulator();
