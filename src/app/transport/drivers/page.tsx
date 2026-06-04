'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import ToggleSwitch from '@/src/components/ui/ToggleSwitch';
import {
  getCurrentUser,
  setCurrentUser,
  getUsers,
  getDrivers,
  getTrucks,
  addDriver,
  updateDriver,
  updateTruck,
  addNotification
} from '@/src/lib/demo-data';

export default function TransportDriversPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [assignedTruckId, setAssignedTruckId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    
    if (!currentUser) {
      router.push('/');
      return;
    }
    
    if (currentUser.role !== 'TRANSPORT_ADMIN') {
      router.push('/');
      return;
    }
    
    setUser(currentUser);
    loadData(currentUser);
  }, [router]);

  const loadData = (currentUser: any) => {
    const allDrivers = getDrivers();
    const allTrucks = getTrucks();
    
    // Filter for this TSP's drivers and trucks
    setDrivers(allDrivers.filter(d => d.tspId === currentUser.id));
    setTrucks(allTrucks.filter(t => t.tspId === currentUser.id));
  };

  // Enable / disable a driver
  const toggleDriver = (driver: any) => {
    updateDriver(driver.id, { disabled: !driver.disabled });
    if (user) loadData(user);
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

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!firstName || !lastName || !email || !password || !phone || !licenseNumber) {
        alert('❌ Please fill in all required fields');
        setLoading(false);
        return;
      }

      // Check if email already exists
      const existingDrivers = getDrivers();
      if (existingDrivers.find(d => d.email === email)) {
        alert('❌ A driver with this email already exists');
        setLoading(false);
        return;
      }

      const newDriver = {
        id: `driver-${Date.now()}`,
        email,
        password,
        firstName,
        lastName,
        phone,
        licenseNumber,
        tspId: user.id,
        tspName: user.companyName || user.name,
        workspaceId: user.workspaceId,
        verified: true, // Auto-verify since TSP is creating
        assignedTruckId: assignedTruckId || undefined,
        currentStatus: 'AVAILABLE' as const,
        createdAt: new Date(),
      };

      addDriver(newDriver);

if (assignedTruckId) {
  updateTruck(assignedTruckId, {
    assignedDriverId: newDriver.id,
  });
}

      // Notify the driver
      addNotification({
        id: `notif-${Date.now()}`,
        userId: newDriver.id,
        type: 'ACCOUNT_CREATED',
        title: '✅ Driver Account Created',
        message: `Your driver account has been created. Login with: ${email}`,
        read: false,
        createdAt: new Date(),
      });

      alert(`✅ Driver added successfully!\n\nLogin Email: ${email}\nPassword: ${password}\n\nShare these credentials with the driver.`);
      
      loadData(user);
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Error adding driver:', error);
      alert('❌ Error adding driver. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setLicenseNumber('');
    setAssignedTruckId('');
  };

  if (!mounted || !user) {
    return null;
  }

 const availableTrucks =
trucks.filter(
truck =>
!truck.assignedDriverId
);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Drivers 👥</h1>
              <p className="text-gray-600">Manage your driver team</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              + Add Driver
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Total Drivers</p>
              <p className="text-3xl font-bold text-gray-900">{drivers.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Available</p>
              <p className="text-3xl font-bold text-green-600">
                {drivers.filter(d => d.currentStatus === 'AVAILABLE').length}
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">On Trip</p>
              <p className="text-3xl font-bold text-blue-600">
                {drivers.filter(d => d.currentStatus === 'ON_TRIP').length}
              </p>
            </div>
          </div>

          {/* Drivers List */}
          {drivers.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {drivers.map((driver) => {
                const truck =
trucks.find(
truck =>
truck.assignedDriverId ===
driver.id
);
                return (
                  <div key={driver.id} className={`rounded-xl p-6 border ${
                    driver.disabled ? 'bg-red-50/40 border-red-200' : 'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          {driver.firstName} {driver.lastName}
                        </h3>
                        <p className="text-sm text-gray-600">{driver.email}</p>
                      </div>
                      {driver.disabled ? (
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          🚫 Disabled
                        </span>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          driver.currentStatus === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                          driver.currentStatus === 'ON_TRIP' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {driver.currentStatus === 'AVAILABLE' ? '✓ Available' :
                           driver.currentStatus === 'ON_TRIP' ? '🚛 On Trip' :
                           '⏸️ Off Duty'}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 text-sm mb-4">
                      <p className="text-gray-600">📞 {driver.phone}</p>
                      <p className="text-gray-600">🪪 {driver.licenseNumber}</p>
                      {truck && (
                        <div className="bg-blue-50 rounded p-2 mt-2">
                          <p className="text-xs text-blue-800 font-medium">Assigned Truck</p>
                          <p className="text-xs text-green-700">
Driver linked successfully
</p>
                          <p className="text-sm text-blue-900 font-semibold">{truck.registrationNumber}</p>
                        </div>
                      )}
                      {!truck && (
                        <div className="bg-orange-50 rounded p-2 mt-2">
                          <p className="text-xs text-orange-800">No truck assigned</p>
                        </div>
                      )}
                    </div>

                    {/* Enable / disable toggle */}
                    <div className="pt-3 border-t flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">
                        {driver.disabled ? 'Driver disabled' : 'Driver active'}
                      </span>
                      <ToggleSwitch
                        size="sm"
                        enabled={!driver.disabled}
                        onChange={() => toggleDriver(driver)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <span className="text-6xl mb-4 block">👥</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Drivers Yet</h3>
              <p className="text-gray-600 mb-6">Add your first driver to start managing deliveries</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                + Add Driver
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Add Driver Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6">Add New Driver</h3>

            <form onSubmit={handleAddDriver} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="driver@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Create a password"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Share this password with the driver</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="+968 XXXX XXXX"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  License Number *
                </label>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="DL-XX-XXXXXX"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign Truck (Optional)
                </label>
                <select
                  value={assignedTruckId}
                  onChange={(e) => setAssignedTruckId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select truck --</option>
                  {availableTrucks.map(truck => (
                    <option
key={truck.id}
value={truck.id}
>
{truck.registrationNumber}
—
{truck.status}
</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {availableTrucks.length === 0 
                    ? 'No available trucks. Register trucks first.' 
                    : 'Assign a truck to this driver'}
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {loading ? '⏳ Adding...' : '✓ Add Driver'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="px-8 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
