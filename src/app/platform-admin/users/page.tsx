'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, setCurrentUser, getUsers, updateUser, getWorkspaces, addNotification } from '@/src/lib/demo-data';

export default function AdminUsersPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [editWorkspace, setEditWorkspace] = useState('');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    if (currentUser) {
      loadData();
    }
  }, []);

  const loadData = () => {
    const allUsers = getUsers();
    const allWorkspaces = getWorkspaces();
    
    setUsers(allUsers.filter(u => u.role !== 'PLATFORM_ADMIN'));
    setWorkspaces(allWorkspaces);
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

  const handleVerifyUser = (userId: string) => {
    const userToVerify = users.find(u => u.id === userId);
    if (!userToVerify) return;

    updateUser(userId, {
      verified: true,
    });

    addNotification({
      id: `notif-${Date.now()}`,
      userId,
      type: 'ACCOUNT_VERIFIED',
      title: '✅ Account Verified',
      message: 'Your account has been verified. You can now access the platform.',
      read: false,
      createdAt: new Date(),
    });

    alert(`✅ ${userToVerify.email} has been verified!`);
    loadData();
  };

  const handleOpenEdit = (userToEdit: any) => {
    setSelectedUser(userToEdit);
    setEditWorkspace(userToEdit.workspaceId || '');
    setShowModal(true);
  };

  const handleUpdateWorkspace = () => {
    if (!selectedUser || !editWorkspace) {
      alert('❌ Please select a workspace');
      return;
    }

    const workspace = workspaces.find(w => w.id === editWorkspace);
    
    updateUser(selectedUser.id, {
      workspaceId: editWorkspace,
      verified: true,
    });

    addNotification({
      id: `notif-${Date.now()}`,
      userId: selectedUser.id,
      type: 'WORKSPACE_ASSIGNED',
      title: '✅ Workspace Assigned',
      message: `You have been assigned to workspace: ${workspace?.name}`,
      read: false,
      createdAt: new Date(),
    });

    alert(`✅ ${selectedUser.email} assigned to ${workspace?.name}!`);
    loadData();
    setShowModal(false);
    setSelectedUser(null);
  };

  const handleDeactivateUser = (userId: string) => {
    if (!confirm('⚠️ Are you sure you want to deactivate this user?')) return;

    updateUser(userId, {
      verified: false,
    });

    alert('✅ User deactivated');
    loadData();
  };

  if (!mounted) return null;
  
  if (!user) {
    router.push('/');
    return null;
  }
  
  if (user.role !== 'PLATFORM_ADMIN') {
    router.push('/');
    return null;
  }

  const pendingUsers = users.filter(u => !u.verified);
  const activeUsers = users.filter(u => u.verified);
  const unassignedUsers = users.filter(u => !u.workspaceId);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">User Management</h1>
            <p className="text-gray-600">Verify users and assign workspaces</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Total Users</p>
              <p className="text-3xl font-bold text-gray-900">{users.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Pending Verification</p>
              <p className="text-3xl font-bold text-orange-600">{pendingUsers.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Active</p>
              <p className="text-3xl font-bold text-green-600">{activeUsers.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">No Workspace</p>
              <p className="text-3xl font-bold text-red-600">{unassignedUsers.length}</p>
            </div>
          </div>

          {/* Pending Verification */}
          {pendingUsers.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Pending Verification ({pendingUsers.length})
              </h2>
              <div className="space-y-4">
                {pendingUsers.map((pendingUser) => (
                  <div key={pendingUser.id} className="bg-white rounded-xl p-6 border-2 border-orange-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          {pendingUser.firstName} {pendingUser.lastName}
                        </h3>
                        <p className="text-sm text-gray-600">{pendingUser.email}</p>
                      </div>
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 text-sm font-medium rounded-full">
                        PENDING
                      </span>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 mb-4 text-sm">
                      <div>
                        <span className="text-gray-600">Role:</span>
                        <span className="font-semibold ml-2">{pendingUser.role.replace('_', ' ')}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Company:</span>
                        <span className="font-semibold ml-2">{pendingUser.companyName || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Workspace:</span>
                        <span className="font-semibold ml-2">
                          {pendingUser.workspaceId 
                            ? workspaces.find(w => w.id === pendingUser.workspaceId)?.name 
                            : 'Not assigned'}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleOpenEdit(pendingUser)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
                      >
                        ✏️ Assign Workspace & Verify
                      </button>
                      {pendingUser.workspaceId && (
                        <button
                          onClick={() => handleVerifyUser(pendingUser.id)}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition-colors"
                        >
                          ✓ Verify Only
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Users */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Active Users ({activeUsers.length})
            </h2>
            <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workspace</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activeUsers.map((activeUser) => (
                    <tr key={activeUser.id}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {activeUser.firstName} {activeUser.lastName}
                          </p>
                          <p className="text-sm text-gray-600">{activeUser.email}</p>
                          {activeUser.companyName && (
                            <p className="text-xs text-gray-500">{activeUser.companyName}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {activeUser.role.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {activeUser.workspaceId 
                          ? workspaces.find(w => w.id === activeUser.workspaceId)?.name 
                          : <span className="text-red-600 font-medium">Not assigned</span>
                        }
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          ✓ VERIFIED
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenEdit(activeUser)}
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeactivateUser(activeUser.id)}
                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Edit Modal */}
      {showModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-2xl font-bold mb-4">Assign Workspace</h3>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600 mb-1">User</p>
              <p className="font-semibold text-lg">{selectedUser.firstName} {selectedUser.lastName}</p>
              <p className="text-sm text-gray-600">{selectedUser.email}</p>
              <p className="text-xs text-gray-500 mt-1">Role: {selectedUser.role.replace('_', ' ')}</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Workspace *
              </label>
              <select
                value={editWorkspace}
                onChange={(e) => setEditWorkspace(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select workspace --</option>
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.country})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUpdateWorkspace}
                disabled={!editWorkspace}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                ✓ Assign & Verify
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-8 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
