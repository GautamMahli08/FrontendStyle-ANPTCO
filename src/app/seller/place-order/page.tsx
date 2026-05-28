'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { 
  getCurrentUser, 
  setCurrentUser, 
  getUsers, 
  getClients, 
  addOrder,
  addNotification 
} from '@/src/lib/demo-data';

export default function PlaceOrderPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  
  // Form state
  const [selectedClient, setSelectedClient] = useState('');
  const [fuelType, setFuelType] = useState('DIESEL');
  const [volume, setVolume] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [destinationLat, setDestinationLat] = useState('');
  const [destinationLng, setDestinationLng] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    if (currentUser) {
      loadClients(currentUser);
    }
  }, []);

  const loadClients = (currentUser: any) => {
    const allClients = getClients();
    // Filter clients by workspace
    const workspaceClients = allClients.filter(c => c.workspaceId === currentUser.workspaceId);
    setClients(workspaceClients);
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
        DRIVER: '/driver/dashboard',
      };
      router.push(routes[newUser.role]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const client = clients.find(c => c.id === selectedClient);
      
      if (!client) {
        alert('Please select a client');
        setLoading(false);
        return;
      }

      const newOrder = {
        id: `order-${Date.now()}`,
        workspaceId: user.workspaceId,
        clientId: selectedClient,
        clientName: client.name,
        fuelType,
        volume: parseFloat(volume),
        destinationName,
        destinationLat: parseFloat(destinationLat),
        destinationLng: parseFloat(destinationLng),
        deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
        specialInstructions,
        status: 'PLACED',
        createdAt: new Date(),
        createdBy: user.id,
      };

      addOrder(newOrder);

      // Notify the client
      addNotification({
        id: `notif-${Date.now()}`,
        userId: selectedClient,
        type: 'ORDER_PLACED',
        title: '📦 New Order Placed',
        message: `Your order for ${volume}L of ${fuelType} has been placed and is being processed.`,
        read: false,
        createdAt: new Date(),
      });

      alert('✅ Order placed successfully!');
      
      // Reset form
      setSelectedClient('');
      setFuelType('DIESEL');
      setVolume('');
      setDestinationName('');
      setDestinationLat('');
      setDestinationLng('');
      setDeliveryDate('');
      setSpecialInstructions('');
      
      router.push('/seller/orders');
    } catch (error) {
      console.error('Error placing order:', error);
      alert('❌ Error placing order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Quick fill for demo
  const quickFill = () => {
    setDestinationName('Shell Station - Downtown');
    setDestinationLat('23.3441');
    setDestinationLng('85.3096');
    setVolume('5000');
  };

  if (!mounted) return null;
  
  if (!user) {
    router.push('/');
    return null;
  }
  
  if (user.role !== 'SELLER_MANAGER') {
    router.push('/');
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Place New Order 📦</h1>
            <p className="text-gray-600">Create a new fuel delivery order for your clients</p>
          </div>

          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 border border-gray-200">
              
              {/* Client Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Client <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">-- Choose a client --</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.email})
                    </option>
                  ))}
                </select>
                {clients.length === 0 && (
                  <p className="text-sm text-orange-600 mt-2">
                    ⚠️ No clients registered yet. Add clients first.
                  </p>
                )}
              </div>

              {/* Fuel Type */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fuel Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-4">
                  {['DIESEL', 'PETROL', 'PREMIUM'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFuelType(type)}
                      className={`py-3 px-4 rounded-lg font-medium transition-all ${
                        fuelType === type
                          ? 'bg-blue-600 text-white border-2 border-blue-600'
                          : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Volume */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Volume (Liters) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., 5000"
                  min="100"
                  step="100"
                  required
                />
              </div>

              {/* Destination */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Destination Name <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={quickFill}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Quick Fill Demo 🎯
                  </button>
                </div>
                <input
                  type="text"
                  value={destinationName}
                  onChange={(e) => setDestinationName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Shell Station - Downtown"
                  required
                />
              </div>

              {/* Coordinates */}
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Latitude <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={destinationLat}
                    onChange={(e) => setDestinationLat(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 23.3441"
                    step="0.0001"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Longitude <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={destinationLng}
                    onChange={(e) => setDestinationLng(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 85.3096"
                    step="0.0001"
                    required
                  />
                </div>
              </div>

              {/* Delivery Date */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Delivery Date
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Special Instructions */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Special Instructions (Optional)
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Any special delivery instructions..."
                />
              </div>

              {/* Summary */}
              {volume && selectedClient && (
                <div className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-200">
                  <p className="text-sm font-medium text-blue-900 mb-2">Order Summary</p>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>• Client: {clients.find(c => c.id === selectedClient)?.name}</p>
                    <p>• Fuel: {volume}L of {fuelType}</p>
                    <p>• Destination: {destinationName || 'Not specified'}</p>
                    {deliveryDate && <p>• Delivery: {new Date(deliveryDate).toLocaleDateString()}</p>}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading || clients.length === 0}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {loading ? '⏳ Placing Order...' : '📦 Place Order'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/seller/orders')}
                  className="px-8 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
