'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { createDeliveryQrToken, TOKEN_TTL_MS } from '@/src/lib/qr-token';

const REFRESH_MS = 20_000; // well under TOKEN_TTL_MS, so a scan is never right at the edge

/**
 * The dynamic replacement for a static printed truck QR (plan §8): a
 * short-lived signed token bound to this trip, rendered as a QR image that
 * regenerates on a timer. A photo of this code stops working the moment it
 * rotates — unlike the truck's permanent placard, it can't be replayed later.
 */
export default function DeliveryQrPanel({ tripId }: { tripId: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await createDeliveryQrToken(tripId);
      const url = await QRCode.toDataURL(token, { width: 260, margin: 2, errorCorrectionLevel: 'M' });
      if (!cancelled) setDataUrl(url);
    })();
    return () => { cancelled = true; };
  }, [tripId, tick]);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), REFRESH_MS);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Delivery Verification Code</p>
      {dataUrl && <img src={dataUrl} alt="Signed delivery QR" className="w-40 h-40 mx-auto rounded-lg border border-gray-100" />}
      <p className="text-[11px] text-gray-400 mt-2">
        Signed &amp; trip-bound — refreshes every {Math.round(REFRESH_MS / 1000)}s, expires after {Math.round(TOKEN_TTL_MS / 1000)}s
      </p>
    </div>
  );
}
