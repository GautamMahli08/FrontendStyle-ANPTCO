// Truck QR helpers — the QR encodes the truck's ID so that, when scanned at
// delivery, the decoded value can be matched directly against the order's
// assigned truck. Generation (qrcode) + PDF export (jspdf) run client-side only.

import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

export interface TruckLike {
  id: string;
  registrationNumber: string;
  tspName?: string;
  capacity?: number;
  compartments?: { id: number | string }[];
}

/** The exact string encoded into a truck's QR code — its unique truck ID. */
export function truckQrPayload(truck: Pick<TruckLike, 'id'>): string {
  return truck.id;
}

/** Does a scanned QR string identify the given truck? Tolerant of whitespace. */
export function qrMatchesTruck(scanned: string, truck: { id: string }): boolean {
  return scanned.trim() === truck.id;
}

/** PNG data URL of the truck's QR code (high error correction for print). */
export async function truckQrDataUrl(truck: Pick<TruckLike, 'id'>): Promise<string> {
  return QRCode.toDataURL(truckQrPayload(truck), {
    width: 600,
    margin: 2,
    errorCorrectionLevel: 'H',
  });
}

/** Build and download an A4 PDF with the truck's printable QR code + details. */
export async function downloadTruckQrPdf(truck: TruckLike): Promise<void> {
  const dataUrl = await truckQrDataUrl(truck);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const cx = W / 2;

  // Header band
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('FuelFleet', cx, 13, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('ANPTCO · Vehicle Identification QR', cx, 21, { align: 'center' });

  // Truck registration
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text(truck.registrationNumber, cx, 50, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(107, 114, 128);
  doc.text('Scan this code at delivery to confirm the truck identity', cx, 59, { align: 'center' });

  // QR code in a bordered card
  const qr = 95;
  const qx = cx - qr / 2;
  const qy = 70;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.6);
  doc.roundedRect(qx - 6, qy - 6, qr + 12, qr + 12, 4, 4);
  doc.addImage(dataUrl, 'PNG', qx, qy, qr, qr);

  // Details
  let y = qy + qr + 22;
  const rows: [string, string][] = [
    ['Truck ID', truck.id],
    ['Registration', truck.registrationNumber],
    ['Transporter', truck.tspName ?? '—'],
    ['Capacity', truck.capacity ? `${truck.capacity.toLocaleString()} L` : '—'],
    ['Compartments', String(truck.compartments?.length ?? '—')],
  ];
  doc.setFontSize(11);
  rows.forEach(([label, value]) => {
    doc.setTextColor(107, 114, 128);
    doc.text(label, cx - 55, y);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.text(value, cx + 55, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(241, 245, 249);
    doc.line(cx - 55, y + 3, cx + 55, y + 3);
    y += 11;
  });

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Encoded value: ${truck.id}   ·   Generated ${new Date().toLocaleDateString('en-GB')}`,
    cx, 285, { align: 'center' },
  );

  doc.save(`truck-${truck.registrationNumber}-QR.pdf`);
}
