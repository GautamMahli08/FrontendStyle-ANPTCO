'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import QRDisplay from '@/src/components/qr/QRDisplay';
import { getTickets, getCurrentUser } from '@/src/lib/demo-data';
import { workflowSimulator } from '@/src/lib/workflow-simulator';
import { generateQRCode } from '@/src/lib/utils';

export default function SensorIntegrationPage() {
  const router   = useRouter();
  const params   = useParams();
  const ticketId = params.id as string;

  const [user,         setUser]         = useState<any>(null);
  const [mounted,      setMounted]      = useState(false);
  const [ticket,       setTicket]       = useState<any>(null);
  const [deviceId,     setDeviceId]     = useState('');
  const [showSuccess,  setShowSuccess]  = useState(false);
  const [qrGenerated,  setQrGenerated]  = useState(false);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'PLATFORM_ADMIN') {
      router.push('/');
      return;
    }
    setUser(currentUser);

    const tickets   = getTickets();
    const found     = tickets.find((t: any) => t.id === ticketId);
    setTicket(found ?? null);
  }, [ticketId]);

  if (!mounted || !user) return null;

  if (!ticket) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar userRole="PLATFORM_ADMIN" />
        <div className="flex-1">
          <Header user={user} />
          <main className="p-8">
            <div className="text-center py-20">
              <p className="text-5xl mb-4">🎫</p>
              <p className="text-gray-500 text-lg">Ticket not found.</p>
              <button
                onClick={() => router.push('/platform-admin/tickets')}
                className="mt-4 text-blue-600 hover:underline font-medium"
              >
                ← Back to Tickets
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const canIntegrate =
    ticket?.metadata?.kycApproved &&
    ticket?.metadata?.commercialApproval &&
    ticket?.metadata?.safetyApproval;

  const handleIntegrate = () => {
    if (!ticket || !deviceId) return;

    const qrCodeUrl = generateQRCode({
      truck_id:     ticket.relatedTruckId,
      workspace_id: 'workspace-1',
    });

    workflowSimulator.resolveSensorIntegration(
      ticket.id,
      ticket.relatedTruckId,
      deviceId,
      qrCodeUrl
    );

    setTicket({ ...ticket, status: 'RESOLVED' });
    setShowSuccess(true);
    setQrGenerated(true);

    setTimeout(() => {
      router.push('/platform-admin/tickets');
    }, 3000);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          {/* Page Header */}
          <div className="mb-8">
            <button
              onClick={() => router.push('/platform-admin/tickets')}
              className="text-blue-600 hover:text-blue-700 font-medium mb-4 block"
            >
              ← Back to Tickets
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{ticket.title}</h1>
                <p className="text-gray-600">{ticket.description}</p>
              </div>
              <StatusBadge status={ticket.status} />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">

              {/* Truck Info */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Truck Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Registration:</span>
                    <span className="font-medium">{ticket.truck?.registrationNumber ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Driver:</span>
                    <span className="font-medium">{ticket.truck?.driverName ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Phone:</span>
                    <span className="font-medium">{ticket.truck?.driverPhone ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <StatusBadge status={ticket.truck?.status ?? 'PENDING_INTEGRATION'} />
                  </div>
                </div>
              </div>

              {/* Compartments */}
              {ticket.metadata?.compartments?.length > 0 && (
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h3 className="text-lg font-semibold mb-4">Compartment Configuration</h3>
                  <div className="space-y-3">
                    {ticket.metadata.compartments.map((comp: any, index: number) => (
                      <div key={comp.id ?? index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium">Compartment {index + 1}</p>
                            <p className="text-sm text-gray-600">Capacity: {comp.capacity}L</p>
                          </div>
                        </div>
                        <span className="text-sm text-gray-500">Sensor {index + 1} required</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prerequisites */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Prerequisites Validation</h3>
                <div className="space-y-3">
                  <PrerequisiteItem label="TSP KYC Approved"    status={!!ticket.metadata?.kycApproved}          />
                  <PrerequisiteItem label="Commercial Approval" status={!!ticket.metadata?.commercialApproval}   />
                  <PrerequisiteItem label="Safety Approval"     status={!!ticket.metadata?.safetyApproval}       />
                </div>
                {!canIntegrate && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">
                      ⚠️ Cannot proceed with sensor integration. All prerequisites must be met.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">

              {/* Integration Form — only show when status is PENDING or IN_PROGRESS */}
              {(ticket.status === 'PENDING' || ticket.status === 'IN_PROGRESS') && (
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h3 className="text-lg font-semibold mb-4">Sensor Integration</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Galileosky Device ID
                      </label>
                      <input
                        type="text"
                        value={deviceId}
                        onChange={e => setDeviceId(e.target.value)}
                        placeholder="GSKY-XXX-YYY"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={!canIntegrate}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enter the device ID from flespi dashboard
                      </p>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">Integration Steps:</h4>
                      <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                        <li>Configure Galileosky device in flespi</li>
                        <li>Map sensors to compartments</li>
                        <li>Set calibration tables per sensor</li>
                        <li>Test sensor readings</li>
                        <li>Enter device ID and complete integration</li>
                      </ol>
                    </div>

                    <button
                      onClick={handleIntegrate}
                      disabled={!canIntegrate || !deviceId}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
                    >
                      {canIntegrate ? 'Complete Integration & Generate QR' : 'Prerequisites Not Met'}
                    </button>
                  </div>
                </div>
              )}

              {/* Success Banner */}
              {showSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                  <div className="text-center mb-4">
                    <span className="text-6xl mb-4 block">✅</span>
                    <h3 className="text-xl font-bold text-green-900 mb-2">Integration Complete!</h3>
                    <p className="text-green-700">QR code generated successfully</p>
                  </div>
                </div>
              )}

              {/* QR Code */}
              {qrGenerated && (
                <QRDisplay
                  qrCodeUrl={generateQRCode({
                    truck_id:     ticket.relatedTruckId,
                    workspace_id: 'workspace-1',
                  })}
                  truckNumber={ticket.truck?.registrationNumber ?? ''}
                />
              )}

              {/* Activity Log */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Activity Log</h3>
                <div className="space-y-3">
                  <ActivityLogItem
                    action="Ticket Created"
                    timestamp={new Date(ticket.createdAt)}
                    actor="Transport Admin"
                  />
                  {ticket.status === 'RESOLVED' && (
                    <ActivityLogItem
                      action="Sensor Integration Completed"
                      timestamp={new Date()}
                      actor="Platform Admin"
                    />
                  )}
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PrerequisiteItem({ label, status }: { label: string; status: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <span className="text-gray-700">{label}</span>
      <span className={`font-medium ${status ? 'text-green-600' : 'text-red-600'}`}>
        {status ? '✓ Approved' : '✗ Not Approved'}
      </span>
    </div>
  );
}

function ActivityLogItem({ action, timestamp, actor }: {
  action:    string;
  timestamp: Date;
  actor:     string;
}) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b last:border-b-0">
      <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-medium text-gray-900">{action}</p>
        <p className="text-sm text-gray-600">{actor}</p>
        <p className="text-xs text-gray-500">{timestamp.toLocaleString()}</p>
      </div>
    </div>
  );
}