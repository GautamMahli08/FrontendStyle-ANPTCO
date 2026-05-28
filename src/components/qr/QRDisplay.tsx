'use client';

export default function QRDisplay({ 
  qrCodeUrl, 
  truckNumber 
}: { 
  qrCodeUrl: string; 
  truckNumber: string; 
}) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `qr-${truckNumber}.png`;
    link.click();
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>QR Code - ${truckNumber}</title>
            <style>
              body { 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                min-height: 100vh;
                font-family: Arial, sans-serif;
              }
              img { 
                width: 400px; 
                height: 400px; 
                border: 2px solid #000;
                padding: 20px;
              }
              h2 { margin: 20px 0; }
            </style>
          </head>
          <body>
            <h2>Truck: ${truckNumber}</h2>
            <img src="${qrCodeUrl}" alt="QR Code" />
            <p>Scan this QR code to accept fuel delivery</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 text-center">
      <h3 className="text-lg font-semibold mb-4">Truck QR Code</h3>
      
      <div className="bg-gray-50 p-6 rounded-lg mb-4 inline-block">
        <img 
          src={qrCodeUrl} 
          alt={`QR Code for ${truckNumber}`}
          className="w-64 h-64 border-4 border-white shadow-lg"
        />
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Truck: <span className="font-semibold">{truckNumber}</span>
      </p>

      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          ⬇️ Download
        </button>
        <button
          onClick={handlePrint}
          className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          🖨️ Print
        </button>
      </div>
    </div>
  );
}
