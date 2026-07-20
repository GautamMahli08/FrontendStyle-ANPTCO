'use client';

import { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';

export default function QRScanner({ onScan }: { onScan: (data: string) => void }) {
  const webcamRef = useRef<Webcam>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning) return;

    const interval = setInterval(() => {
      captureAndDecode();
    }, 500);

    return () => clearInterval(interval);
  }, [scanning]);

  const captureAndDecode = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    const image = new Image();
    image.src = imageSrc;
    
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;
      
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        setScanning(false);
        onScan(code.data);
      }
    };
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <h3 className="text-lg font-semibold mb-4">Scan Truck QR Code</h3>

      {!scanning ? (
        <div className="text-center">
          <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            <div className="text-center">
              <span className="text-6xl mb-4 block">📷</span>
              <p className="text-gray-600">Click below to start scanning</p>
            </div>
          </div>
          <button
            onClick={() => {
              setScanning(true);
              setError(null);
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors"
          >
            Start Camera
          </button>
        </div>
      ) : (
        <div>
          <div className="relative w-full h-64 bg-black rounded-lg overflow-hidden mb-4">
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={{
                facingMode: 'environment',
              }}
              className="w-full h-full object-cover"
              onUserMediaError={(err) => {
                setError('Camera access denied');
                setScanning(false);
              }}
            />
            <div className="absolute inset-0 border-4 border-blue-500 rounded-lg">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-4 border-white rounded-lg animate-pulse"></div>
            </div>
          </div>
          
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600 animate-pulse">🔍 Scanning for QR code...</p>
          </div>

          <button
            onClick={() => setScanning(false)}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg transition-colors"
          >
            Stop Scanning
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">❌ {error}</p>
        </div>
      )}
    </div>
  );
}
