'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import QRScanner from '@/src/components/qr/QRScanner';
import { getUsers, getOrders, getCurrentUser, setCurrentUser, updateOrder, addNotification } from '@/src/lib/demo-data';

export default function ScanQRPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    if (!currentUser || currentUser.role !== 'CLIENT') {
      router.push('/');
      return;
    }
    
    loadActiveOrder(currentUser);
  }, []);

  const loadActiveOrder = (currentUser: any) => {
    const orders = getOrders();
    const myOrders = orders.filter(o => o.clientId === currentUser.id);
    const arrived = myOrders.find(o => o.status === 'ARRIVED');
    setActiveOrder(arrived);
  };

  const handleRoleChange = (userId: string) => {
    const users = getUsers();
    const newUser = users.find(u => u.id === userId);
    if (newUser) {
      setUser(newUser);
      setCurrentUser(newUser);
      
      const routes: Record<string, string> = {
        PLATFORM_ADMIN: '/platform-admin/dashboard',
        SELLER_MANAGER: '/seller/dashboard',
        TRANSPORT_ADMIN: '/transport/dashboard',
        CLIENT: '/client/dashboard',
      };
      router.push(routes[newUser.role]);
    }
  };

  const handleScan = (data: string) => {
    try {
      const qrData = JSON.parse(data);
      setScannedData(qrData);
      setScanning(false);

      // Verify QR code matches the active order's truck
      if (activeOrder && qrData.truckId === activeOrder.assignedTruckId) {
        // Accept delivery
        updateOrder(activeOrder.id, {
          status: 'COMPLETED',
          completedAt: new Date(),
        });

        // Notify driver
        if (activeOrder.assignedDriverId) {
          addNotification({
            id: `notif-${Date.now()}`,
            userId: activeOrder.assignedDriverId,
            type: 'DELIVERY_COMPLETED',
            title: '✅ Delivery Completed',
            message: `Order #${activeOrder.id.slice(0, 8)} has been accepted by client`,
            read: false,
            createdAt: new Date(),
          });
        }

        // Notify transporter
        if (activeOrder.transporterId) {
          addNotification({
            id: `notif-${Date.now()}-tsp`,
            userId: activeOrder.transporterId,
            type: 'DELIVERY_COMPLETED',
            title: '✅ Delivery Completed',
            message: `Order #${activeOrder.id.slice(0, 8)} completed successfully`,
            read: false,
            createdAt: new Date(),
          });
        }

        alert('✅ Delivery accepted successfully!');
        router.push('/client/dashboard');
      } else {
        alert('❌ QR code does not match the expected truck!');
      }
    } catch (error) {
      alert('❌ Invalid QR code');
      setScanning(false);
    }
  };

  if (!mounted || !user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Scan QR Code</h1>
            <p className="text-gray-600">Scan the truck's QR code to accept delivery</p>
          </div>

          {activeOrder ? (
            <div className="max-w-2xl mx-auto">
              {/* Active Order Info */}
              <div className="bg-white rounded-xl p-6 border-2 border-green-200 mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Active Delivery</h2>
                <div className="space-y-2 text-sm">
                  <p className="text-gray-600">
                    <strong>Order:</strong> #{activeOrder.id.slice(0, 8)}
                  </p>
                  <p className="text-gray-600">
                    <strong>Fuel:</strong> {activeOrder.volume}L {activeOrder.fuelType}
                  </p>
                  <p className="text-gray-600">
                    <strong>Driver:</strong> {activeOrder.assignedDriverName}
                  </p>
                  <p className="text-gray-600">
                    <strong>Truck:</strong> {activeOrder.assignedTruckRegistration}
                  </p>
                </div>
              </div>

              {/* Scanner */}
              {scanning ? (
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <QRScanner onScan={handleScan} />
                  <button
                    onClick={() => setScanning(false)}
                    className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition-colors"
                  >
                    Cancel Scan
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
                  <div className="text-8xl mb-6">📷</div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Ready to Scan</h3>
                  <p className="text-gray-600 mb-8">
                    Point your camera at the truck's QR code to accept the delivery
                  </p>
                  <button
                    onClick={() => setScanning(true)}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg transition-colors text-lg"
                  >
                    📷 Start Scanning
                  </button>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-blue-50 rounded-xl p-6 mt-8">
                <h3 className="font-bold text-blue-900 mb-3">📋 Instructions:</h3>
                <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                  <li>Verify the driver's identity and truck registration</li>
                  <li>Check fuel delivery quantity matches your order</li>
                  <li>Click "Start Scanning" and point camera at QR code</li>
                  <li>System will automatically verify and complete delivery</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200 max-w-2xl mx-auto">
              <span className="text-6xl mb-4 block">📦</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Delivery</h3>
              <p className="text-gray-600 mb-6">
                You don't have any deliveries awaiting acceptance
              </p>
              <button
                onClick={() => router.push('/client/orders')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
              >
                View My Orders →
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
