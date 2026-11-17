import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Box,
  CheckCircle2,
  ClipboardList,
  Clock,
  Cloud,
  Cpu,
  Database,
  Edit3,
  Eye,
  EyeOff,
  Factory,
  History,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Mail,
  Menu,
  Package,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  Wrench,
  X,
  Check,
  Paperclip
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { isFirebaseConfigured, missingConfigKeys, isUsingEmulators } from './firebase/config';
import {
  addMachine,
  adjustStock,
  createMaterialRequest,
  deleteInventoryItem,
  errorMessage,
  getPhotoUrl,
  loadProfile,
  markAllRead,
  processMaterialRequest,
  registerFactoryWorker,
  saveInventoryItem,
  sendResetEmail,
  signInUser,
  signOutUser,
  submitComplaint,
  subscribeComplaints,
  subscribeMachines,
  subscribeMaintenanceRecords,
  subscribeNotifications,
  subscribeOtherItems,
  subscribeRequests,
  subscribeSpareParts,
  subscribeStockAlerts,
  subscribeTransactions,
  updateMachine,
  updateRepair,
  uploadComplaintPhoto,
  watchAuthState
} from './services';

// Standardized ID validation: Two uppercase alphabets, a dash, and two digits (e.g., FW-01, SP-01)
const STRICT_ID_REGEX = /^[A-Za-z]{2}-[0-9]{2}$/;

const formatRoleLabel = (role) => {
  switch (role) {
    case 'worker':
      return 'Factory Worker';
    case 'maintenance':
      return 'Maintenance Team';
    case 'warehouse':
      return 'Warehouse Manager';
    default:
      return 'Staff Member';
  }
};

const formatTimestamp = (iso) => {
  if (!iso) return 'Just now';
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
};

const StatusBadge = ({ status }) => {
  const styles = {
    Operational: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    'Under Maintenance': 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    Breakdown: 'bg-red-500/15 text-red-300 border-red-500/40',
    New: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
    Accepted: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
    'In Progress': 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    'Waiting for Parts': 'bg-purple-500/15 text-purple-300 border-purple-500/40',
    Resolved: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
    Verified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    Pending: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    Approved: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
    Issued: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    Rejected: 'bg-red-500/15 text-red-300 border-red-500/40',
    Low: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
    Medium: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
    High: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    Critical: 'bg-red-500/15 text-red-300 border-red-500/40'
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        styles[status] || 'bg-slate-500/15 text-slate-300 border-slate-500/40'
      }`}
    >
      {status}
    </span>
  );
};

const KpiCard = ({ title, value, subtitle, icon: Icon, accent = 'cyan', onClick }: any) => {
  const accentMap = {
    cyan: 'text-[#22D3EE] bg-[#22D3EE]/10 border-[#22D3EE]/30',
    blue: 'text-[#38BDF8] bg-[#38BDF8]/10 border-[#38BDF8]/30',
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    red: 'text-red-400 bg-red-500/10 border-red-500/30'
  };

  return (
    <div
      onClick={onClick}
      className={`bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-5 shadow-lg shadow-black/20 flex items-center justify-between transition ${
        onClick ? 'cursor-pointer hover:border-[#38BDF8]/70 hover:bg-[#132947]' : ''
      }`}
    >
      <div>
        <p className="text-xs font-medium text-[#94A3B8]">{title}</p>
        <p className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{value}</p>
        {subtitle && <p className="text-[11px] text-[#94A3B8] mt-1">{subtitle}</p>}
      </div>
      <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${accentMap[accent]}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
};

const Modal = ({ open, onClose, title, children, maxWidth = 'max-w-lg' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        className={`w-full ${maxWidth} bg-[#10233D] border border-[#1E3A5F] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col`}
      >
        <div className="px-5 py-4 bg-[#0A1930] border-b border-[#1E3A5F] flex items-center justify-between">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#142B49] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  );
};

/**
 * ============================================================================
 * LOGIN & SIGN-UP PORTAL (CLEAN FACTORY AUTHENTICATION)
 * ============================================================================
 */
const LoginView = ({ onSignIn, onSignUp, onResetPassword, initialError }) => {
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [selectedRole, setSelectedRole] = useState('worker');
  const [name, setName] = useState('');
  const [badgeId, setBadgeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  // Role quick-select only. No credentials are stored or pre-filled anywhere.
  const handleQuickFill = (role) => {
    setAuthMode('signin');
    setSelectedRole(role);
    setError('');
    setInfo('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (busy) return;

    if (authMode === 'forgot') {
      if (!email.trim()) {
        setError('Please enter your registered work email.');
        return;
      }
      setBusy(true);
      try {
        await onResetPassword(email.trim());
        setInfo(`If an account exists for ${email.trim()}, a password reset link has been sent.`);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (authMode === 'signup') {
      if (!name.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!STRICT_ID_REGEX.test(badgeId.trim())) {
        setError('Employee ID must be two letters followed by a dash and two numbers (e.g., FW-02).');
        return;
      }
      if (!email.trim() || !password) {
        setError('Email and password are required.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setBusy(true);
      try {
        await onSignUp({
          name: name.trim(),
          badgeId: badgeId.trim().toUpperCase(),
          email: email.trim().toLowerCase(),
          password
        });
      } catch (err) {
        setError(err.message);
        setBusy(false);
      }
      return;
    }

    // Sign In
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await onSignIn(email.trim(), password, selectedRole);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#071426] text-[#F1F5F9] flex flex-col justify-between p-4 sm:p-8">
      {/* Top Bar */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#22D3EE] flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white">IndustrialCare</h1>
            <p className="text-[11px] uppercase tracking-widest text-[#38BDF8]">
              Smart Factory Operations
            </p>
          </div>
        </div>
      </header>

      {/* Main Auth Container */}
      <main className="max-w-5xl w-full mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Clean Factory Overview Panel */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#10233D] border border-[#1E3A5F] text-xs font-semibold text-[#22D3EE]">
            <Factory className="w-3.5 h-3.5" />
            <span>Plant Floor & Warehouse Portal</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
            Machine Maintenance & Warehouse Control
          </h2>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Sign in or create your employee account to report machine issues, coordinate repairs,
            and manage warehouse spare parts across the factory floor.
          </p>

          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-[#10233D]/80 border border-[#1E3A5F] flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-[#38BDF8]">
                <Factory className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Factory Worker</h3>
                <p className="text-xs text-[#94A3B8]">
                  Inspect machine status, report faults, and request floor materials.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#10233D]/80 border border-[#1E3A5F] flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Maintenance Team</h3>
                <p className="text-xs text-[#94A3B8]">
                  Register machines, resolve complaints, and request repair parts.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#10233D]/80 border border-[#1E3A5F] flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Warehouse Manager</h3>
                <p className="text-xs text-[#94A3B8]">
                  Manage spare parts, manufactured items, and approve material requests.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sign In / Sign Up Card */}
        <div className="lg:col-span-6 bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">
                {authMode === 'signin'
                  ? 'Employee Sign In'
                  : authMode === 'signup'
                  ? 'Create Employee Account'
                  : 'Reset Password'}
              </h3>
              <p className="text-xs text-[#94A3B8] mt-1">
                {authMode === 'signin'
                  ? 'Select your role and enter your credentials'
                  : authMode === 'signup'
                  ? 'Register a new account with your Employee ID'
                  : 'Enter your email to receive a password reset link'}
              </p>
            </div>

            {authMode !== 'signin' && (
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setError('');
                  setInfo('');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#38BDF8] hover:underline"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{info}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode !== 'forgot' && (
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Select Job Role
                </label>
                <select
                  value={authMode === 'signup' ? 'worker' : selectedRole}
                  disabled={authMode === 'signup'}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white focus:outline-none focus:border-[#38BDF8] disabled:opacity-70"
                >
                  <option value="worker">Factory Worker</option>
                  <option value="maintenance">Maintenance Team</option>
                  <option value="warehouse">Warehouse Manager</option>
                </select>
                {authMode === 'signup' && (
                  <p className="text-[11px] text-[#94A3B8] mt-1.5">
                    Self-registration creates Factory Worker accounts. Maintenance Team and Warehouse
                    Manager accounts are issued by your administrator.
                  </p>
                )}
              </div>
            )}

            {authMode === 'signup' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Sam Carter"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                    Employee ID (AA-00)
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                    <input
                      type="text"
                      value={badgeId}
                      onChange={(e) => setBadgeId(e.target.value.toUpperCase())}
                      placeholder="e.g. FW-02"
                      maxLength={5}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm font-mono text-white focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@industrialcare.io"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white focus:outline-none focus:border-[#38BDF8]"
                />
              </div>
            </div>

            {authMode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#94A3B8]">Password</label>
                  {authMode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot');
                        setError('');
                      }}
                      className="text-xs text-[#38BDF8] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white focus:outline-none focus:border-[#38BDF8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-3 text-[#94A3B8] hover:text-white"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0284C7] hover:from-[#1D4ED8] hover:to-[#0369A1] text-white text-sm font-bold shadow-lg shadow-blue-600/25 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy
                ? 'Please wait…'
                : authMode === 'signin'
                ? 'Sign In'
                : authMode === 'signup'
                ? 'Create Account'
                : 'Send Reset Link'}
            </button>
          </form>

          {/* Toggle Sign In / Sign Up */}
          <div className="mt-5 pt-4 border-t border-[#1E3A5F] flex flex-col gap-3">
            {authMode === 'signin' ? (
              <p className="text-xs text-center text-[#94A3B8]">
                New employee?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setError('');
                  }}
                  className="text-[#38BDF8] font-semibold hover:underline"
                >
                  Create an account
                </button>
              </p>
            ) : (
              <p className="text-xs text-center text-[#94A3B8]">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setError('');
                  }}
                  className="text-[#38BDF8] font-semibold hover:underline"
                >
                  Sign In
                </button>
              </p>
            )}

            {/* Quick-Fill Sample Buttons */}
            <div className="pt-2">
              <p className="text-[11px] text-center text-[#94A3B8] mb-2">
                Quick-Select Role:
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickFill('worker')}
                  className="px-2 py-1.5 rounded-lg bg-[#071426] hover:bg-[#142B49] border border-[#1E3A5F] text-[11px] font-medium text-[#38BDF8] transition"
                >
                  Factory Worker
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('maintenance')}
                  className="px-2 py-1.5 rounded-lg bg-[#071426] hover:bg-[#142B49] border border-[#1E3A5F] text-[11px] font-medium text-amber-300 transition"
                >
                  Maintenance
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('warehouse')}
                  className="px-2 py-1.5 rounded-lg bg-[#071426] hover:bg-[#142B49] border border-[#1E3A5F] text-[11px] font-medium text-emerald-300 transition"
                >
                  Warehouse
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-center text-[11px] text-[#94A3B8]">
        IndustrialCare • Cloud Machine Maintenance & Inventory System
      </footer>
    </div>
  );
};

/**
 * ============================================================================
 * FACTORY WORKER VIEWS
 * ============================================================================
 */
const WorkerOverview = ({ machines, complaints, user, onNavigate, onOpenReport }) => {
  const operationalCount = machines.filter((m) => m.status === 'Operational').length;
  const maintenanceCount = machines.filter((m) => m.status === 'Under Maintenance').length;
  const breakdownCount = machines.filter((m) => m.status === 'Breakdown').length;
  const myComplaints = complaints.filter((c) => c.reportedByUid === user.uid);

  const chartData = [
    { name: 'Operational', value: operationalCount, color: '#22C55E' },
    { name: 'Under Maintenance', value: maintenanceCount, color: '#F59E0B' },
    { name: 'Breakdown', value: breakdownCount, color: '#EF4444' }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Machines"
          value={machines.length}
          icon={Cpu}
          accent="cyan"
          onClick={() => onNavigate('machines')}
        />
        <KpiCard
          title="Operational"
          value={operationalCount}
          icon={CheckCircle2}
          accent="green"
          onClick={() => onNavigate('machines')}
        />
        <KpiCard
          title="Under Maintenance"
          value={maintenanceCount + breakdownCount}
          icon={Wrench}
          accent="amber"
          onClick={() => onNavigate('machines')}
        />
        <KpiCard
          title="My Reported Issues"
          value={myComplaints.length}
          icon={ClipboardList}
          accent="blue"
          onClick={() => onNavigate('complaints')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-4">Machine Fleet Status</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                >
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A1930',
                    borderColor: '#1E3A5F',
                    borderRadius: '12px',
                    color: '#fff'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 text-xs mt-2">
            {chartData.map((d) => (
              <span key={d.name} className="flex items-center gap-1.5 text-[#94A3B8]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}: <strong className="text-white">{d.value}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">Factory Floor Machines</h3>
            <button
              onClick={() => onNavigate('machines')}
              className="text-xs font-semibold text-[#38BDF8] hover:underline"
            >
              View All →
            </button>
          </div>
          <div className="space-y-3">
            {machines.map((m) => (
              <div
                key={m.machineId}
                className="p-3.5 rounded-xl bg-[#071426] border border-[#1E3A5F] flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#38BDF8]">
                      {m.machineId}
                    </span>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="text-sm font-bold text-white mt-1">{m.name}</p>
                </div>
                {m.status === 'Under Maintenance' ? (
                  <span className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-medium text-amber-300">
                    Already Under Maintenance
                  </span>
                ) : (
                  <button
                    onClick={() => onOpenReport(m)}
                    className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-semibold text-white transition"
                  >
                    Report Issue
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const WorkerMachines = ({ machines, onOpenReport }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const filtered = machines.filter((m) => {
    const matchesSearch =
      m.machineId.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Machine ID or Name..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#10233D] border border-[#1E3A5F] text-sm text-white focus:outline-none focus:border-[#38BDF8]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-[#10233D] border border-[#1E3A5F] text-sm text-white"
        >
          <option value="All">All Statuses</option>
          <option value="Operational">Operational</option>
          <option value="Under Maintenance">Under Maintenance</option>
          <option value="Breakdown">Breakdown</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((m) => (
          <div
            key={m.machineId}
            className="bg-[#10233D] border border-[#1E3A5F] hover:border-[#38BDF8]/60 rounded-2xl p-5 flex flex-col justify-between gap-4 transition"
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#1E3A5F]">
                <span className="px-2.5 py-1 rounded-lg bg-[#071426] border border-[#38BDF8]/40 font-mono text-xs font-bold text-[#38BDF8]">
                  {m.machineId}
                </span>
                <StatusBadge status={m.status} />
              </div>
              <h4 className="text-base font-bold text-white">{m.name}</h4>
              <p className="text-xs text-[#94A3B8] mt-1">
                Updated: {formatTimestamp(m.lastUpdated)}
              </p>
            </div>

            {m.status === 'Under Maintenance' ? (
              <div className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center text-xs font-semibold text-amber-300">
                Maintenance In Progress
              </div>
            ) : (
              <button
                onClick={() => onOpenReport(m)}
                className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-bold text-white transition"
              >
                Report Machine Issue
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const WorkerComplaints = ({ complaints, user }) => {
  const [selected, setSelected] = useState(null);
  const myComplaints = complaints.filter((c) => c.reportedByUid === user.uid);

  return (
    <div className="space-y-4">
      {myComplaints.length === 0 ? (
        <div className="bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-8 text-center">
          <p className="text-sm text-[#94A3B8]">
            You have not reported any machine issues yet. Go to All Machines to report an issue.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {myComplaints.map((c) => (
            <div
              key={c.complaintId}
              onClick={() => setSelected(c)}
              className="bg-[#10233D] border border-[#1E3A5F] hover:border-[#38BDF8]/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#38BDF8]">
                    {c.complaintId}
                  </span>
                  <StatusBadge status={c.status} />
                  <StatusBadge status={c.priority} />
                </div>
                <h4 className="text-sm font-bold text-white mt-1.5">
                  {c.machineName} ({c.machineId}) – {c.category}
                </h4>
                <p className="text-xs text-[#94A3B8] mt-0.5">{c.description}</p>
              </div>
              <span className="text-xs font-semibold text-[#38BDF8] shrink-0">
                View Timeline →
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Complaint ${selected?.complaintId} Timeline`}
      >
        {selected && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#071426] border border-[#1E3A5F]">
              <p className="text-xs text-[#94A3B8]">Machine</p>
              <p className="text-sm font-bold text-white">
                {selected.machineName} ({selected.machineId})
              </p>
              <p className="text-xs text-[#94A3B8] mt-2">Issue Description</p>
              <p className="text-sm text-white">{selected.description}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-[#94A3B8] uppercase">Repair Updates</p>
              {(selected.history || []).map((h, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-[#071426] border border-[#1E3A5F] text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <StatusBadge status={h.status} />
                    <span className="text-[#94A3B8]">{formatTimestamp(h.timestamp)}</span>
                  </div>
                  <p className="text-white pt-1">{h.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

/**
 * ============================================================================
 * MAINTENANCE TEAM VIEWS
 * ============================================================================
 */
const MaintenanceOverview = ({
  machines,
  complaints,
  sparePartsRequests,
  onNavigate,
  onSelectComplaint
}) => {
  const [inspectModal, setInspectModal] = useState(null); // 'all' | 'active' | null

  const newCount = complaints.filter((c) => c.status === 'New').length;
  const inProgressCount = complaints.filter((c) =>
    ['Accepted', 'In Progress'].includes(c.status)
  ).length;
  const waitingPartsCount = complaints.filter((c) => c.status === 'Waiting for Parts').length;
  const resolvedCount = complaints.filter((c) =>
    ['Resolved', 'Verified'].includes(c.status)
  ).length;

  const activeComplaints = complaints.filter(
    (c) => !['Resolved', 'Verified'].includes(c.status)
  );

  const activeMachineIds = new Set(activeComplaints.map((c) => c.machineId));
  const machinesWithIssues = machines.filter(
    (m) => m.status !== 'Operational' || activeMachineIds.has(m.machineId)
  );

  return (
    <div className="space-y-6">
      {/* Top 5 KPI Cards matching screenshot layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Total Machines"
          value={machines.length}
          icon={Cpu}
          accent="cyan"
          onClick={() => setInspectModal('all')}
        />
        <KpiCard
          title="New Complaints"
          value={newCount}
          icon={AlertTriangle}
          accent="red"
          onClick={() => onNavigate('complaints')}
        />
        <KpiCard
          title="In Progress"
          value={inProgressCount}
          icon={Wrench}
          accent="amber"
          onClick={() => setInspectModal('active')}
        />
        <KpiCard
          title="Waiting for Parts"
          value={waitingPartsCount}
          icon={Package}
          accent="blue"
          onClick={() => onNavigate('requests')}
        />
        <KpiCard
          title="Resolved Repairs"
          value={resolvedCount}
          icon={CheckCircle2}
          accent="green"
          onClick={() => onNavigate('history')}
        />
      </div>

      {/* Active Complaints Queue */}
      <div className="bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Active Complaints Queue</h3>
          <button
            onClick={() => onNavigate('complaints')}
            className="text-xs font-semibold text-[#38BDF8] hover:underline"
          >
            View All &gt;
          </button>
        </div>

        {activeComplaints.length === 0 ? (
          <p className="text-xs text-[#94A3B8] py-4">No active complaints in queue.</p>
        ) : (
          <div className="space-y-3">
            {activeComplaints.map((c) => (
              <div
                key={c.complaintId}
                className="p-4 rounded-xl bg-[#071426] border border-[#1E3A5F] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#38BDF8]">
                      {c.complaintId}
                    </span>
                    <StatusBadge status={c.status} />
                    <span className="text-[11px] text-[#94A3B8]">
                      Raised by: <strong className="text-white">{c.reportedByName}</strong>
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1.5">
                    {c.machineName} ({c.machineId}) – {c.category}
                  </h4>
                  <p className="text-xs text-[#94A3B8] mt-0.5">{c.description}</p>
                </div>

                <button
                  onClick={() => onSelectComplaint(c)}
                  className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-bold text-white shrink-0 transition"
                >
                  Manage Repair
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inspect Modal when clicking Total Machines or In Progress */}
      <Modal
        open={!!inspectModal}
        onClose={() => setInspectModal(null)}
        title={
          inspectModal === 'all'
            ? `All Registered Machines (${machines.length})`
            : `Machines With Active Issues (${machinesWithIssues.length})`
        }
        maxWidth="max-w-2xl"
      >
        {inspectModal === 'all' ? (
          <div className="space-y-2.5">
            {machines.map((m) => (
              <div
                key={m.machineId}
                className="p-3.5 rounded-xl bg-[#071426] border border-[#1E3A5F] flex items-center justify-between"
              >
                <div>
                  <span className="font-mono text-xs font-bold text-[#38BDF8]">{m.machineId}</span>
                  <p className="text-sm font-bold text-white">{m.name}</p>
                </div>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>
        ) : machinesWithIssues.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">All machines are currently operational.</p>
        ) : (
          <div className="space-y-3">
            {machinesWithIssues.map((m) => {
              const related = activeComplaints.filter((c) => c.machineId === m.machineId);
              return (
                <div
                  key={m.machineId}
                  className="p-4 rounded-xl bg-[#071426] border border-[#1E3A5F] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#38BDF8]">
                        {m.machineId}
                      </span>
                      <h4 className="text-sm font-bold text-white">{m.name}</h4>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>
                  {related.map((c) => (
                    <div
                      key={c.complaintId}
                      className="pt-2 border-t border-[#1E3A5F] text-xs text-[#94A3B8] space-y-1"
                    >
                      <p className="text-white font-medium">{c.description}</p>
                      <p>
                        Raised by: <strong className="text-[#38BDF8]">{c.reportedByName}</strong> •{' '}
                        {c.complaintId}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
};

const MaintenanceMachines = ({ machines, onAddMachine, onEditMachine, onUpdateMachineStatus }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [machineId, setMachineId] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('Operational');
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setMachineId('');
    setName('');
    setStatus('Operational');
    setErr('');
    setModalOpen(true);
  };

  const openEdit = (m) => {
    setEditing(m.machineId);
    setMachineId(m.machineId);
    setName(m.name);
    setStatus(m.status);
    setErr('');
    setModalOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setErr('');
    if (saving) return;
    if (!machineId.trim() || !name.trim()) {
      setErr('Machine ID and Name are required.');
      return;
    }
    if (
      !editing &&
      machines.some((m) => m.machineId.toLowerCase() === machineId.trim().toLowerCase())
    ) {
      setErr('Machine ID already exists.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await onEditMachine({ machineId: editing, name: name.trim() });
      } else {
        await onAddMachine({
          machineId: machineId.trim().toUpperCase(),
          name: name.trim(),
          status
        });
      }
      setMachineId('');
      setName('');
      setStatus('Operational');
      setEditing(null);
      setModalOpen(false);
    } catch (error) {
      setErr(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#94A3B8]">
          Register new plant equipment or update machine status in real time.
        </p>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add Machine</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {machines.map((m) => (
          <div
            key={m.machineId}
            className="bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1E3A5F]">
              <span className="px-2.5 py-1 rounded-lg bg-[#071426] border border-[#38BDF8]/40 font-mono text-xs font-bold text-[#38BDF8]">
                {m.machineId}
              </span>
              <StatusBadge status={m.status} />
            </div>

            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-base font-bold text-white">{m.name}</h4>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Last Updated: {formatTimestamp(m.lastUpdated)}
                </p>
              </div>
              <button
                onClick={() => openEdit(m)}
                className="p-1.5 rounded-lg bg-[#142B49] hover:bg-[#2563EB] text-sky-300 hover:text-white transition"
                title="Edit Machine"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">Update Status</label>
              <select
                value={m.status}
                onChange={(e) => onUpdateMachineStatus(m.machineId, e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-xs text-white"
              >
                <option value="Operational">Operational</option>
                <option value="Under Maintenance">Under Maintenance</option>
                <option value="Breakdown">Breakdown</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Machine' : 'Register New Machine'}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">Machine ID</label>
            <input
              type="text"
              value={machineId}
              disabled={!!editing}
              onChange={(e) => setMachineId(e.target.value)}
              placeholder="e.g. M-104"
              className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm font-mono text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">Machine Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CNC Milling Center"
              className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">
              {editing ? 'Current Status (change it from the machine card)' : 'Initial Status'}
            </label>
            <select
              value={status}
              disabled={!!editing}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white disabled:opacity-60"
            >
              <option value="Operational">Operational</option>
              <option value="Under Maintenance">Under Maintenance</option>
              <option value="Breakdown">Breakdown</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-[#142B49] text-xs text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#2563EB] text-xs font-bold text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Machine'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const MaintenanceComplaints = ({ complaints, onSelectComplaint }) => {
  const [filter, setFilter] = useState('All');
  const filtered = complaints.filter((c) => filter === 'All' || c.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['All', 'New', 'Accepted', 'In Progress', 'Waiting for Parts', 'Resolved', 'Verified'].map(
          (st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                filter === st
                  ? 'bg-[#2563EB] border-[#38BDF8] text-white'
                  : 'bg-[#10233D] border-[#1E3A5F] text-[#94A3B8] hover:text-white'
              }`}
            >
              {st}
            </button>
          )
        )}
      </div>

      <div className="space-y-3">
        {filtered.map((c) => (
          <div
            key={c.complaintId}
            className="bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#38BDF8]">{c.complaintId}</span>
                <StatusBadge status={c.status} />
                <StatusBadge status={c.priority} />
                <span className="text-xs text-[#94A3B8]">by {c.reportedByName}</span>
              </div>
              <h4 className="text-sm font-bold text-white mt-1.5">
                {c.machineName} ({c.machineId}) – {c.category}
              </h4>
              <p className="text-xs text-[#94A3B8] mt-0.5">{c.description}</p>
            </div>

            <button
              onClick={() => onSelectComplaint(c)}
              className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-bold text-white shrink-0 transition"
            >
              Manage Repair
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const MaintenanceHistoryView = ({ records }) => {
  const [search, setSearch] = useState('');
  const filtered = records.filter(
    (r) =>
      r.machineId.toLowerCase().includes(search.toLowerCase()) ||
      r.machineName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search maintenance history by Machine ID or Name..."
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#10233D] border border-[#1E3A5F] text-sm text-white"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((r) => (
          <div
            key={r.recordId}
            className="bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#38BDF8]">{r.recordId}</span>
                <span className="text-xs text-[#94A3B8]">• {r.complaintId}</span>
              </div>
              <StatusBadge status={r.finalStatus} />
            </div>
            <h4 className="text-sm font-bold text-white">
              {r.machineName} ({r.machineId})
            </h4>
            <p className="text-xs text-[#94A3B8]">
              <strong className="text-white">Issue:</strong> {r.problemDescription}
            </p>
            <p className="text-xs text-[#94A3B8]">
              <strong className="text-white">Action Taken:</strong> {r.repairActions}
            </p>
            {r.partsUsedSummary && (
              <p className="text-xs text-[#94A3B8]">
                <strong className="text-white">Parts Used:</strong> {r.partsUsedSummary}
              </p>
            )}
            <p className="text-[11px] text-[#38BDF8]">
              Completed: {formatTimestamp(r.completionDate)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * ============================================================================
 * MATERIAL / SPARE PARTS REQUESTS VIEW (SHARED BY WORKER, MAINTENANCE & WAREHOUSE)
 * ============================================================================
 */
const MaterialRequestsView = ({
  role,
  requests,
  machines,
  complaints,
  spareParts,
  otherInventoryItems,
  onCreateRequest,
  onProcessRequest
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [machineId, setMachineId] = useState(machines[0]?.machineId || '');
  const [complaintId, setComplaintId] = useState('');
  const [itemRef, setItemRef] = useState('');
  const [qty, setQty] = useState<any>(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const allWarehouseItems = useMemo(() => {
    const spares = spareParts.map((s) => ({
      id: s.partId,
      name: s.name,
      available: s.availableQuantity,
      unit: s.unit,
      section: 'Spare Parts'
    }));
    const others = otherInventoryItems.map((o) => ({
      id: o.itemId,
      name: o.name,
      available: o.availableQuantity,
      unit: o.unit,
      section: 'Other Inventory'
    }));
    return [...spares, ...others];
  }, [spareParts, otherInventoryItems]);

  const openNewRequest = () => {
    setError('');
    setMachineId(machines[0]?.machineId || '');
    setComplaintId('');
    setItemRef(allWarehouseItems[0]?.id || '');
    setQty(1);
    setReason('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (submitting) return;
    const chosenItem = allWarehouseItems.find((i) => i.id === itemRef);
    const chosenMachine = machines.find((m) => m.machineId === machineId);
    if (!chosenItem || !chosenMachine || Number(qty) <= 0 || !reason.trim()) {
      setError('Please select a machine, material item, valid quantity, and reason.');
      return;
    }
    setSubmitting(true);
    try {
      await onCreateRequest({
        machineId: chosenMachine.machineId,
        relatedComplaintId: complaintId || 'General Floor Request',
        partId: chosenItem.id,
        requestedQty: Number(qty),
        reason: reason.trim()
      });
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#94A3B8]">
          {role === 'warehouse'
            ? 'Review incoming material requests. Accepting a request immediately subtracts stock from warehouse inventory.'
            : 'Request spare parts or warehouse materials. Approved items are deducted automatically from warehouse stock.'}
        </p>

        {role !== 'warehouse' && (
          <button
            onClick={openNewRequest}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Request Material</span>
          </button>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-8 text-center text-xs text-[#94A3B8]">
          No material requests found.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const stockItem = allWarehouseItems.find((i) => i.id === req.partId);
            return (
              <div
                key={req.requestId}
                className="bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#38BDF8]">
                      {req.requestId}
                    </span>
                    <StatusBadge status={req.status} />
                    <span className="text-xs text-[#94A3B8]">
                      Requested by: <strong className="text-white">{req.requestedBy}</strong>
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white">
                    {req.partName} ({req.partId}) — Qty: {req.requestedQty}
                  </h4>
                  <p className="text-xs text-[#94A3B8]">
                    Machine: {req.machineName} ({req.machineId}) • Reason: {req.reason}
                  </p>
                  {req.status === 'Issued' && (
                    <p className="text-[11px] text-[#22D3EE]">
                      Issued: {req.issuedQty} • Used in repair:{' '}
                      {req.usedQty === null || req.usedQty === undefined
                        ? 'not recorded yet'
                        : req.usedQty}
                    </p>
                  )}
                  {role === 'warehouse' && stockItem && (
                    <p className="text-[11px] text-[#22D3EE]">
                      Current Warehouse Stock: {stockItem.available} {stockItem.unit}
                    </p>
                  )}
                </div>

                {role === 'warehouse' && req.status === 'Pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onProcessRequest(req.requestId, 'Issued')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept & Subtract Stock</span>
                    </button>
                    <button
                      onClick={() => onProcessRequest(req.requestId, 'Rejected')}
                      className="px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-xs font-semibold text-red-300 transition"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Request Warehouse Material">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">Select Machine</label>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
            >
              {machines.map((m) => (
                <option key={m.machineId} value={m.machineId}>
                  {m.machineId} – {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">
              Select Warehouse Item (Spare Part or Manufactured Item)
            </label>
            <select
              value={itemRef}
              onChange={(e) => setItemRef(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
            >
              {allWarehouseItems.map((it) => (
                <option key={it.id} value={it.id}>
                  [{it.section}] {it.id} – {it.name} (Available: {it.available} {it.unit})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Required Quantity</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Related Complaint (Optional)</label>
              <select
                value={complaintId}
                onChange={(e) => setComplaintId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              >
                <option value="">None / General</option>
                {complaints.map((c) => (
                  <option key={c.complaintId} value={c.complaintId}>
                    {c.complaintId} ({c.machineId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">Reason for Request</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this part/material is needed..."
              className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-[#142B49] text-xs text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-[#2563EB] text-xs font-bold text-white disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

/**
 * ============================================================================
 * WAREHOUSE MANAGER VIEWS
 * ============================================================================
 */
const WarehouseOverview = ({
  spareParts,
  otherInventoryItems,
  requests,
  stockAlerts,
  onNavigate,
  onProcessRequest
}) => {
  const pendingRequests = requests.filter((r) => r.status === 'Pending');
  const activeAlerts = stockAlerts.filter((a) => !a.resolved);

  const stockChartData = [
    ...spareParts.map((s) => ({ name: s.partId, qty: s.availableQuantity })),
    ...otherInventoryItems.map((o) => ({ name: o.itemId, qty: o.availableQuantity }))
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Spare Parts SKUs"
          value={spareParts.length}
          icon={Wrench}
          accent="cyan"
          onClick={() => onNavigate('spareParts')}
        />
        <KpiCard
          title="Manufactured Items"
          value={otherInventoryItems.length}
          icon={Package}
          accent="blue"
          onClick={() => onNavigate('otherItems')}
        />
        <KpiCard
          title="Pending Requests"
          value={pendingRequests.length}
          icon={PackageCheck}
          accent="amber"
          onClick={() => onNavigate('requests')}
        />
        <KpiCard
          title="Low-Stock Alerts"
          value={activeAlerts.length}
          icon={AlertTriangle}
          accent="red"
          onClick={() => onNavigate('alerts')}
        />
      </div>

      {/* Two Primary Warehouse Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          onClick={() => onNavigate('spareParts')}
          className="bg-[#10233D] border border-[#1E3A5F] hover:border-[#38BDF8] rounded-2xl p-6 cursor-pointer transition flex items-center justify-between"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
              Warehouse Section 01
            </span>
            <h3 className="text-lg font-extrabold text-white mt-1">Spare Parts Inventory</h3>
            <p className="text-xs text-[#94A3B8] mt-1">
              View all machine spare parts by Part ID and manage stock quantities.
            </p>
          </div>
          <Wrench className="w-8 h-8 text-[#38BDF8]" />
        </div>

        <div
          onClick={() => onNavigate('otherItems')}
          className="bg-[#10233D] border border-[#1E3A5F] hover:border-[#22D3EE] rounded-2xl p-6 cursor-pointer transition flex items-center justify-between"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#22D3EE]">
              Warehouse Section 02
            </span>
            <h3 className="text-lg font-extrabold text-white mt-1">
              Other Inventory (Manufactured)
            </h3>
            <p className="text-xs text-[#94A3B8] mt-1">
              View factory-manufactured parts by Item ID and available quantity.
            </p>
          </div>
          <Box className="w-8 h-8 text-[#22D3EE]" />
        </div>
      </div>

      {/* Incoming Material Requests Queue on Overview */}
      <div className="bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">
            Incoming Material Requests ({pendingRequests.length})
          </h3>
          <button
            onClick={() => onNavigate('requests')}
            className="text-xs font-semibold text-[#38BDF8] hover:underline"
          >
            All Requests &gt;
          </button>
        </div>

        {pendingRequests.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">No pending material requests.</p>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.requestId}
                className="p-4 rounded-xl bg-[#071426] border border-[#1E3A5F] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#38BDF8]">
                      {req.requestId}
                    </span>
                    <StatusBadge status={req.status} />
                    <span className="text-xs text-[#94A3B8]">from {req.requestedBy}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1">
                    {req.partName} ({req.partId}) — Qty: {req.requestedQty}
                  </h4>
                  <p className="text-xs text-[#94A3B8]">
                    For {req.machineName} ({req.machineId}): {req.reason}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onProcessRequest(req.requestId, 'Issued')}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition"
                  >
                    Accept & Subtract Stock
                  </button>
                  <button
                    onClick={() => onProcessRequest(req.requestId, 'Rejected')}
                    className="px-3 py-2 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-semibold"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stock Chart */}
      <div className="bg-[#10233D] border border-[#1E3A5F] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-4">Available Quantity by Item ID</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stockChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E3A5F" />
              <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
              <YAxis stroke="#94A3B8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0A1930',
                  borderColor: '#1E3A5F',
                  borderRadius: '12px',
                  color: '#fff'
                }}
              />
              <Bar dataKey="qty" fill="#38BDF8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const WarehouseInventoryView = ({
  section,
  items,
  onSaveItem,
  onDeleteItem,
  onAdjustStock
}) => {
  const isSpare = section === 'spareParts';
  const idKey = isSpare ? 'partId' : 'itemId';
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [stockQty, setStockQty] = useState(5);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [stockErr, setStockErr] = useState('');
  const [stockBusy, setStockBusy] = useState(false);

  useEffect(() => {
    setStockErr('');
  }, [stockModal]);

  const [form, setForm] = useState({
    id: '',
    name: '',
    category: '',
    availableQuantity: 10,
    minThreshold: 5,
    unit: 'pcs',
    unitPrice: 50,
    supplier: ''
  });

  const filtered = items.filter(
    (item) =>
      item[idKey].toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setIsEdit(false);
    setErr('');
    setForm({
      id: '',
      name: '',
      category: isSpare ? 'Mechanical' : 'Manufactured Assembly',
      availableQuantity: 10,
      minThreshold: 5,
      unit: isSpare ? 'pcs' : 'units',
      unitPrice: 50,
      supplier: isSpare ? '' : 'In-House Production Line'
    });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setIsEdit(true);
    setErr('');
    setForm({
      id: item[idKey],
      name: item.name,
      category: item.category,
      availableQuantity: item.availableQuantity,
      minThreshold: item.minThreshold,
      unit: item.unit,
      unitPrice: item.unitPrice || 0,
      supplier: item.supplier || ''
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErr('');
    if (saving) return;
    if (!STRICT_ID_REGEX.test(form.id.trim())) {
      setErr('Item ID must be two alphabets, a dash, and two digits (e.g., SP-04 or MF-03).');
      return;
    }
    if (!form.name.trim()) {
      setErr('Item Name is required.');
      return;
    }
    if (!isEdit && items.some((i) => i[idKey].toLowerCase() === form.id.trim().toLowerCase())) {
      setErr('This ID already exists in this section.');
      return;
    }
    setSaving(true);
    try {
      await onSaveItem(section, form, isEdit);
      setModalOpen(false);
    } catch (error) {
      setErr(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search by ${isSpare ? 'Part ID' : 'Item ID'} or Name...`}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#10233D] border border-[#1E3A5F] text-sm text-white"
          />
        </div>

        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add {isSpare ? 'Spare Part' : 'Manufactured Item'}</span>
        </button>
      </div>

      {/* Clean ID-Focused Inventory Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((item) => (
          <div
            key={item[idKey]}
            className="bg-[#10233D] border border-[#1E3A5F] hover:border-[#38BDF8]/60 rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg shadow-black/25 transition"
          >
            <div className="p-4">
              <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[#1E3A5F]/80">
                <span className="px-2.5 py-1 rounded-lg bg-[#071426] border border-[#38BDF8]/40 font-mono text-xs font-bold text-[#38BDF8]">
                  {item[idKey]}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-medium truncate">
                  {item.category}
                </span>
              </div>

              <h4 className="text-sm font-bold text-white line-clamp-1">{item.name}</h4>
              <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate">{item.supplier}</p>

              <div className="mt-3 p-3 rounded-xl bg-[#071426] border border-[#1E3A5F] flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#94A3B8]">
                    Quantity Available
                  </p>
                  <p className="text-xl font-extrabold mt-0.5 text-[#22D3EE]">
                    {item.availableQuantity}{' '}
                    <span className="text-xs font-medium text-[#94A3B8]">{item.unit}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-[#0A1930] border-t border-[#1E3A5F] flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setStockQty(5);
                    setStockModal({ item, type: 'Stock In' });
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition"
                >
                  + Stock In
                </button>
                <button
                  onClick={() => {
                    setStockQty(1);
                    setStockModal({ item, type: 'Stock Out' });
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
                >
                  - Out
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(item)}
                  className="p-1.5 rounded-lg bg-[#142B49] hover:bg-[#2563EB] text-sky-300 hover:text-white transition"
                  title="Edit Item"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete ${item.name} (${item[idKey]}) permanently?`)) {
                      onDeleteItem(section, item[idKey]);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-[#142B49] hover:bg-red-600 text-red-300 hover:text-white transition"
                  title="Delete Item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Item Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`${isEdit ? 'Edit' : 'Add'} ${isSpare ? 'Spare Part' : 'Manufactured Item'}`}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">
                {isSpare ? 'Part ID (AA-00)' : 'Item ID (AA-00)'}
              </label>
              <input
                type="text"
                disabled={isEdit}
                maxLength={5}
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value.toUpperCase() })}
                placeholder={isSpare ? 'SP-04' : 'MF-03'}
                className="w-full px-3 py-2 rounded-lg bg-[#071426] border border-[#1E3A5F] text-sm font-mono text-white disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">Item Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-[#071426] border border-[#1E3A5F] text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Quantity</label>
              <input
                type="number"
                min={0}
                value={form.availableQuantity}
                onChange={(e) => setForm({ ...form, availableQuantity: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Min Alert</label>
              <input
                type="number"
                min={0}
                value={form.minThreshold}
                onChange={(e) => setForm({ ...form, minThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Unit</label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">Supplier / Line</label>
            <input
              type="text"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-[#071426] border border-[#1E3A5F] text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#1E3A5F]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-[#142B49] text-xs text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#2563EB] text-xs font-bold text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Item'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Stock In / Stock Out Modal */}
      <Modal
        open={!!stockModal}
        onClose={() => setStockModal(null)}
        title={`${stockModal?.type} – ${stockModal?.item?.name}`}
      >
        {stockModal && (
          <div className="space-y-4">
            <p className="text-xs text-[#94A3B8]">
              Current Available Quantity:{' '}
              <strong className="text-white">
                {stockModal.item.availableQuantity} {stockModal.item.unit}
              </strong>
            </p>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                value={stockQty}
                onChange={(e) => setStockQty(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              />
            </div>
            {stockErr && <p className="text-xs text-red-400">{stockErr}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStockModal(null)}
                className="px-4 py-2 rounded-lg bg-[#142B49] text-xs text-white"
              >
                Cancel
              </button>
              <button
                disabled={stockBusy}
                onClick={async () => {
                  if (stockBusy) return;
                  setStockErr('');
                  setStockBusy(true);
                  try {
                    await onAdjustStock(
                      section,
                      stockModal.item[idKey],
                      stockModal.type,
                      Number(stockQty)
                    );
                    setStockModal(null);
                  } catch (error) {
                    setStockErr(error.message);
                  } finally {
                    setStockBusy(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-[#2563EB] text-xs font-bold text-white disabled:opacity-60"
              >
                {stockBusy ? 'Saving…' : `Confirm ${stockModal.type}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

/**
 * ============================================================================
 * STARTUP SCREENS (missing configuration / loading)
 * ============================================================================
 */
const ConfigMissingView = ({ keys }) => (
  <div className="min-h-screen bg-[#071426] text-[#F1F5F9] flex items-center justify-center p-6">
    <div className="max-w-xl w-full bg-[#10233D] border border-amber-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-white">Firebase configuration needed</h1>
          <p className="text-xs text-[#94A3B8]">IndustrialCare could not find your Firebase project settings.</p>
        </div>
      </div>
      <p className="text-sm text-[#94A3B8]">
        Copy <code className="text-[#38BDF8]">.env.example</code> to{' '}
        <code className="text-[#38BDF8]">.env</code>, paste your Firebase web-app values, then restart the
        dev server. Missing variables:
      </p>
      <ul className="space-y-1.5">
        {keys.map((k) => (
          <li key={k} className="px-3 py-1.5 rounded-lg bg-[#071426] border border-[#1E3A5F] font-mono text-xs text-amber-300">
            {k}
          </li>
        ))}
      </ul>
      <p className="text-xs text-[#94A3B8]">See README.md → “Step 7 – Add your Firebase configuration”.</p>
    </div>
  </div>
);

const LoadingScreen = () => (
  <div className="min-h-screen bg-[#071426] text-[#94A3B8] flex items-center justify-center text-sm">
    Connecting to IndustrialCare cloud…
  </div>
);

/**
 * ============================================================================
 * MAIN APPLICATION SHELL (LEFT TASKBAR + ROLE DASHBOARDS)
 * Data now comes from Firebase (Auth + Firestore real-time listeners + Cloud Functions).
 * ============================================================================
 */
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const signingInRef = useRef(false);
  const processingRef = useRef(new Set());

  const [activeTab, setActiveTab] = useState('overview');
  const [navHistory, setNavHistory] = useState(['overview']);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Live Firestore data (kept in the same shape the dashboards already expect)
  const [machines, setMachines] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [sparePartsRequests, setSparePartsRequests] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [otherInventoryItems, setOtherInventoryItems] = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [inventoryTransactions, setInventoryTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [dataError, setDataError] = useState('');
  const [actionError, setActionError] = useState('');

  const db = {
    machines,
    complaints,
    maintenanceRecords,
    sparePartsRequests,
    spareParts,
    otherInventoryItems,
    stockAlerts,
    inventoryTransactions,
    notifications
  };

  // Modals for Reporting Issue & Managing Repair
  const [reportMachine, setReportMachine] = useState(null);
  const [reportCategory, setReportCategory] = useState('Mechanical');
  const [reportPriority, setReportPriority] = useState('Medium');
  const [reportDesc, setReportDesc] = useState('');
  const [reportPhoto, setReportPhoto] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');

  const [manageComplaint, setManageComplaint] = useState(null);
  const [repairStatus, setRepairStatus] = useState('In Progress');
  const [repairNote, setRepairNote] = useState('');
  const [partsInputs, setPartsInputs] = useState({});
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairError, setRepairError] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const flashError = (message) => setActionError(message);

  const resetLiveData = () => {
    setMachines([]);
    setComplaints([]);
    setMaintenanceRecords([]);
    setSparePartsRequests([]);
    setSpareParts([]);
    setOtherInventoryItems([]);
    setStockAlerts([]);
    setInventoryTransactions([]);
    setNotifications([]);
    setDataError('');
    setActionError('');
  };

  // Restore an existing Firebase session after a page refresh.
  useEffect(() => {
    return watchAuthState(async (fbUser) => {
      if (signingInRef.current) return; // sign-in / sign-up handlers manage state themselves
      if (!fbUser) {
        setCurrentUser(null);
        setAuthReady(true);
        return;
      }
      try {
        const profile = await loadProfile(fbUser);
        setCurrentUser(profile);
      } catch (err) {
        setAuthNotice(err.message);
        await signOutUser();
        setCurrentUser(null);
      } finally {
        setAuthReady(true);
      }
    });
  }, []);

  // Real-time Firestore listeners, scoped by role (also enforced by security rules).
  useEffect(() => {
    if (!currentUser) return undefined;
    setDataError('');
    const onErr = (err) => setDataError(errorMessage(err));
    const { uid, role } = currentUser;

    const unsubs = [
      subscribeMachines(setMachines, onErr),
      subscribeNotifications(uid, setNotifications, onErr),
      subscribeSpareParts(setSpareParts, onErr),
      subscribeOtherItems(setOtherInventoryItems, onErr),
      subscribeRequests(role, uid, setSparePartsRequests, onErr)
    ];
    if (role === 'worker' || role === 'maintenance') {
      unsubs.push(subscribeComplaints(role, uid, setComplaints, onErr));
    }
    if (role === 'maintenance') {
      unsubs.push(subscribeMaintenanceRecords(setMaintenanceRecords, onErr));
    }
    if (role === 'warehouse') {
      unsubs.push(subscribeStockAlerts(setStockAlerts, onErr));
      unsubs.push(subscribeTransactions(setInventoryTransactions, onErr));
    }
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid, currentUser?.role]);

  // Complaint photograph (Maintenance Team) – resolved from Firebase Storage on demand.
  useEffect(() => {
    setPhotoUrl('');
    if (!manageComplaint?.photoPath) return undefined;
    let cancelled = false;
    getPhotoUrl(manageComplaint.photoPath)
      .then((u) => !cancelled && setPhotoUrl(u))
      .catch(() => !cancelled && setPhotoUrl('error'));
    return () => {
      cancelled = true;
    };
  }, [manageComplaint?.photoPath]);

  const navigateTo = (tab) => {
    setActiveTab(tab);
    setNavHistory((prev) => [...prev, tab]);
    setMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } finally {
      resetLiveData();
      setCurrentUser(null);
      setActiveTab('overview');
      setNavHistory(['overview']);
    }
  };

  const handleBack = () => {
    if (navHistory.length > 1) {
      const nextHist = navHistory.slice(0, -1);
      setNavHistory(nextHist);
      setActiveTab(nextHist[nextHist.length - 1]);
    } else {
      handleSignOut();
    }
  };

  const startSession = (profile) => {
    setAuthNotice('');
    setCurrentUser(profile);
    setActiveTab('overview');
    setNavHistory(['overview']);
  };

  const handleSignIn = async (email, password, role) => {
    signingInRef.current = true;
    try {
      const profile = await signInUser(email, password);
      if (profile.role !== role) {
        await signOutUser();
        throw new Error(
          `Access Denied: This account is registered as ${formatRoleLabel(
            profile.role
          )}, not ${formatRoleLabel(role)}.`
        );
      }
      startSession(profile);
    } finally {
      signingInRef.current = false;
    }
  };

  // Self-registration creates Factory Worker accounts only (role is assigned by the backend).
  const handleSignUp = async (input) => {
    signingInRef.current = true;
    try {
      const profile = await registerFactoryWorker(input);
      startSession(profile);
    } finally {
      signingInRef.current = false;
    }
  };

  // Factory Worker: Submit Machine Complaint (photo -> Storage, complaint -> Cloud Function -> Firestore)
  const openReport = (m) => {
    setReportError('');
    setReportPhoto(null);
    setReportMachine(m);
  };

  const handleSubmitComplaint = async (e) => {
    e.preventDefault();
    if (!reportMachine || !reportDesc.trim() || reportBusy) return;
    setReportBusy(true);
    setReportError('');
    try {
      const photoPath = reportPhoto ? await uploadComplaintPhoto(currentUser.uid, reportPhoto) : null;
      await submitComplaint({
        machineId: reportMachine.machineId,
        category: reportCategory,
        priority: reportPriority,
        description: reportDesc.trim(),
        photoPath
      });
      setReportMachine(null);
      setReportDesc('');
      setReportPhoto(null);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReportBusy(false);
    }
  };

  // Maintenance Team: Update Complaint & Repair Workflow
  const openManage = (c) => {
    setManageComplaint(c);
    setRepairStatus(c.status === 'New' ? 'Accepted' : c.status === 'Resolved' ? 'Verified' : c.status);
    setRepairNote('');
    setPartsInputs({});
    setRepairError('');
  };

  const handleUpdateRepair = async (e) => {
    e.preventDefault();
    if (!manageComplaint || repairBusy) return;
    setRepairBusy(true);
    setRepairError('');
    try {
      const partsUsed = Object.entries(partsInputs)
        .filter(([, v]) => v !== '' && v !== undefined)
        .map(([requestId, v]) => ({ requestId, qty: Number(v) }));
      await updateRepair({
        complaintId: manageComplaint.complaintId,
        status: repairStatus,
        note: repairNote.trim(),
        partsUsed
      });
      setManageComplaint(null);
      setRepairNote('');
      setPartsInputs({});
    } catch (err) {
      setRepairError(err.message);
    } finally {
      setRepairBusy(false);
    }
  };

  // Machines (Maintenance Team)
  const handleAddMachine = (m) => addMachine(m);
  const handleEditMachine = (m) => updateMachine(m);
  const handleUpdateMachineStatus = async (machineId, status) => {
    try {
      await updateMachine({ machineId, status });
    } catch (err) {
      flashError(err.message);
    }
  };

  // Warehouse: Save / Edit / Delete Inventory Item and manual stock movements
  const handleSaveInventoryItem = (section, form, isEdit) =>
    saveInventoryItem(section, { ...form, id: form.id.trim().toUpperCase() }, isEdit);

  const handleDeleteInventoryItem = async (section, id) => {
    try {
      await deleteInventoryItem(section, id);
    } catch (err) {
      flashError(err.message);
    }
  };

  const handleAdjustStock = (section, id, type, qty) => adjustStock(section, id, type, qty);

  // Create Material Request (Worker or Maintenance)
  const handleCreateMaterialRequest = (payload) =>
    createMaterialRequest({
      machineId: payload.machineId,
      relatedComplaintId: payload.relatedComplaintId,
      partId: payload.partId,
      requestedQty: payload.requestedQty,
      reason: payload.reason
    });

  // Warehouse Manager: Accept & Subtract Stock or Reject Request.
  // The stock deduction itself happens atomically in a Firestore transaction on the server.
  const handleProcessMaterialRequest = async (requestId, decision) => {
    if (processingRef.current.has(requestId)) return; // ignore double clicks
    processingRef.current.add(requestId);
    try {
      await processMaterialRequest(requestId, decision);
    } catch (err) {
      flashError(err.message);
    } finally {
      processingRef.current.delete(requestId);
    }
  };

  if (!isFirebaseConfigured) {
    return <ConfigMissingView keys={missingConfigKeys} />;
  }

  if (!authReady) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return (
      <LoginView
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onResetPassword={sendResetEmail}
        initialError={authNotice}
      />
    );
  }

  const complaintIssuedRequests = manageComplaint
    ? db.sparePartsRequests.filter(
        (r) => r.relatedComplaintId === manageComplaint.complaintId && r.status === 'Issued'
      )
    : [];

  // Notifications are addressed to this specific user by the backend.
  const roleNotifications = db.notifications;
  const unreadCount = roleNotifications.filter((n) => !n.read).length;

  const navItemsByRole = {
    worker: [
      { id: 'overview', label: 'Overview', icon: Activity },
      { id: 'machines', label: 'All Machines', icon: Cpu },
      { id: 'complaints', label: 'My Complaints', icon: ClipboardList },
      { id: 'requests', label: 'Material Requests', icon: Package },
      { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount }
    ],
    maintenance: [
      { id: 'overview', label: 'Overview', icon: Activity },
      { id: 'machines', label: 'Machine Management', icon: Cpu },
      { id: 'complaints', label: 'Complaints Queue', icon: Wrench },
      { id: 'history', label: 'Maintenance History', icon: History },
      { id: 'requests', label: 'Spare Part Requests', icon: Package },
      { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount }
    ],
    warehouse: [
      { id: 'overview', label: 'Overview', icon: Activity },
      { id: 'spareParts', label: 'Spare Parts', icon: Wrench },
      { id: 'otherItems', label: 'Other Inventory', icon: Box },
      { id: 'requests', label: 'Material Requests', icon: PackageCheck },
      { id: 'alerts', label: 'Low-Stock Alerts', icon: AlertTriangle },
      { id: 'transactions', label: 'Stock Ledger', icon: History },
      { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount }
    ]
  };

  const navItems = navItemsByRole[currentUser.role] || [];
  const headerTitles = {
    worker: 'FACTORY FLOOR CONTROL PANEL',
    maintenance: 'MAINTENANCE CONTROL PANEL',
    warehouse: 'WAREHOUSE INVENTORY CONTROL PANEL'
  };

  return (
    <div className="min-h-screen bg-[#071426] text-[#F1F5F9] flex">
      {/* Persistent Left Taskbar matching reference screenshot */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0A1930] border-r border-[#1E3A5F] flex flex-col justify-between transition-transform lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Header */}
          <div className="px-5 py-5 border-b border-[#1E3A5F] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#22D3EE] flex items-center justify-center shadow-md shadow-blue-500/20">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white tracking-tight">IndustrialCare</h1>
              <p className="text-[10px] uppercase tracking-widest text-[#38BDF8]">
                CLOUD MAINTENANCE OS
              </p>
            </div>
          </div>

          {/* Role Navigation Links */}
          <nav className="p-3 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                    isActive
                      ? 'bg-[#10233D] text-[#38BDF8] border border-[#38BDF8]/50 shadow-sm shadow-sky-500/10'
                      : 'text-[#94A3B8] hover:text-white hover:bg-[#10233D]/60 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Profile & Sign Out Button */}
        <div className="p-4 border-t border-[#1E3A5F] space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#10233D] border border-[#38BDF8]/40 flex items-center justify-center text-xs font-bold text-[#38BDF8]">
              {currentUser.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {currentUser.name} ({formatRoleLabel(currentUser.role)})
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[#94A3B8]">
                {currentUser.role} • {currentUser.badgeId}
              </p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full py-2.5 px-3 rounded-xl bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 text-xs font-semibold text-red-300 flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Right Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 px-4 sm:px-6 bg-[#0A1930]/90 border-b border-[#1E3A5F] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-[#10233D] text-white"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10233D] hover:bg-[#142B49] border border-[#1E3A5F] text-xs font-semibold text-[#38BDF8] transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{navHistory.length > 1 ? 'Back' : 'Back to Login'}</span>
            </button>

            <h2 className="text-xs sm:text-sm font-extrabold tracking-wider text-white uppercase truncate">
              {headerTitles[currentUser.role]}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateTo('notifications')}
              className="relative p-2 rounded-xl bg-[#10233D] border border-[#1E3A5F] text-[#94A3B8] hover:text-white transition"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#10233D] border border-[#1E3A5F]">
              <span className="px-2 py-0.5 rounded bg-[#071426] font-mono text-[11px] font-bold text-[#38BDF8]">
                {currentUser.badgeId}
              </span>
              <div className="text-left">
                <p className="text-xs font-bold text-white leading-none">{currentUser.name}</p>
                <p className="text-[10px] text-emerald-400 mt-0.5">Online Cloud Session</p>
              </div>
            </div>
          </div>
        </header>

        {/* Active View Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {(actionError || dataError) && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-300 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{actionError || dataError}</span>
              </span>
              <button
                onClick={() => {
                  setActionError('');
                  setDataError('');
                }}
                className="p-1 rounded-lg hover:bg-red-500/20"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Shared Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Real-Time Notifications</h3>
                <button
                  onClick={() => markAllRead(roleNotifications).catch((err) => flashError(err.message))}
                  className="text-xs font-semibold text-[#38BDF8] hover:underline"
                >
                  Mark all as read
                </button>
              </div>
              {roleNotifications.length === 0 ? (
                <p className="text-xs text-[#94A3B8]">No notifications yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {roleNotifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 rounded-xl border ${
                        n.read
                          ? 'bg-[#10233D]/60 border-[#1E3A5F]'
                          : 'bg-[#10233D] border-[#38BDF8]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white">{n.title}</h4>
                        <span className="text-[11px] text-[#94A3B8]">
                          {formatTimestamp(n.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-1">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Shared Material Requests Tab */}
          {activeTab === 'requests' && (
            <MaterialRequestsView
              role={currentUser.role}
              requests={db.sparePartsRequests}
              machines={db.machines}
              complaints={db.complaints}
              spareParts={db.spareParts}
              otherInventoryItems={db.otherInventoryItems}
              onCreateRequest={handleCreateMaterialRequest}
              onProcessRequest={handleProcessMaterialRequest}
            />
          )}

          {/* FACTORY WORKER VIEWS */}
          {currentUser.role === 'worker' && activeTab === 'overview' && (
            <WorkerOverview
              machines={db.machines}
              complaints={db.complaints}
              user={currentUser}
              onNavigate={navigateTo}
              onOpenReport={openReport}
            />
          )}
          {currentUser.role === 'worker' && activeTab === 'machines' && (
            <WorkerMachines machines={db.machines} onOpenReport={openReport} />
          )}
          {currentUser.role === 'worker' && activeTab === 'complaints' && (
            <WorkerComplaints complaints={db.complaints} user={currentUser} />
          )}

          {/* MAINTENANCE TEAM VIEWS */}
          {currentUser.role === 'maintenance' && activeTab === 'overview' && (
            <MaintenanceOverview
              machines={db.machines}
              complaints={db.complaints}
              sparePartsRequests={db.sparePartsRequests}
              onNavigate={navigateTo}
              onSelectComplaint={openManage}
            />
          )}
          {currentUser.role === 'maintenance' && activeTab === 'machines' && (
            <MaintenanceMachines
              machines={db.machines}
              onAddMachine={handleAddMachine}
              onEditMachine={handleEditMachine}
              onUpdateMachineStatus={handleUpdateMachineStatus}
            />
          )}
          {currentUser.role === 'maintenance' && activeTab === 'complaints' && (
            <MaintenanceComplaints
              complaints={db.complaints}
              onSelectComplaint={openManage}
            />
          )}
          {currentUser.role === 'maintenance' && activeTab === 'history' && (
            <MaintenanceHistoryView records={db.maintenanceRecords} />
          )}

          {/* WAREHOUSE MANAGER VIEWS */}
          {currentUser.role === 'warehouse' && activeTab === 'overview' && (
            <WarehouseOverview
              spareParts={db.spareParts}
              otherInventoryItems={db.otherInventoryItems}
              requests={db.sparePartsRequests}
              stockAlerts={db.stockAlerts}
              onNavigate={navigateTo}
              onProcessRequest={handleProcessMaterialRequest}
            />
          )}
          {currentUser.role === 'warehouse' && activeTab === 'spareParts' && (
            <WarehouseInventoryView
              section="spareParts"
              items={db.spareParts}
              onSaveItem={handleSaveInventoryItem}
              onDeleteItem={handleDeleteInventoryItem}
              onAdjustStock={handleAdjustStock}
            />
          )}
          {currentUser.role === 'warehouse' && activeTab === 'otherItems' && (
            <WarehouseInventoryView
              section="otherInventoryItems"
              items={db.otherInventoryItems}
              onSaveItem={handleSaveInventoryItem}
              onDeleteItem={handleDeleteInventoryItem}
              onAdjustStock={handleAdjustStock}
            />
          )}
          {currentUser.role === 'warehouse' && activeTab === 'alerts' && (
            <div className="space-y-3">
              {db.stockAlerts.length === 0 && (
                <p className="text-xs text-[#94A3B8]">No low-stock alerts. All items are above their threshold.</p>
              )}
              {db.stockAlerts.map((a) => (
                <div
                  key={a.alertId}
                  className={`bg-[#10233D] border ${
                    a.resolved ? 'border-emerald-500/30 opacity-70' : 'border-amber-500/40'
                  } rounded-2xl p-4 flex items-center justify-between`}
                >
                  <div>
                    <span className="font-mono text-xs font-bold text-amber-400">{a.itemId}</span>
                    <h4 className="text-sm font-bold text-white">{a.itemName}</h4>
                    <p className="text-xs text-[#94A3B8]">
                      Available: <strong className="text-red-400">{a.currentQty}</strong> • Minimum
                      Threshold: {a.minThreshold}
                    </p>
                  </div>
                  {a.resolved ? (
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-300">
                      Replenished
                    </span>
                  ) : (
                    <button
                      onClick={() =>
                        navigateTo(a.section === 'otherInventoryItems' ? 'otherItems' : 'spareParts')
                      }
                      className="px-3.5 py-2 rounded-xl bg-[#2563EB] text-xs font-bold text-white"
                    >
                      Restock Item
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {currentUser.role === 'warehouse' && activeTab === 'transactions' && (
            <div className="space-y-2.5">
              {db.inventoryTransactions.map((tx) => (
                <div
                  key={tx.txId}
                  className="bg-[#10233D] border border-[#1E3A5F] rounded-xl p-4 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-[#38BDF8]">{tx.txId}</span> •{' '}
                    <strong className="text-white">
                      {tx.itemName} ({tx.itemId})
                    </strong>
                    <p className="text-[#94A3B8] mt-0.5">
                      {tx.type}: <strong>{tx.quantity}</strong> • By {tx.userResponsible}
                    </p>
                  </div>
                  <span className="text-[#94A3B8]">{formatTimestamp(tx.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Report Machine Issue Modal (Worker) */}
      <Modal
        open={!!reportMachine}
        onClose={() => setReportMachine(null)}
        title={`Report Issue – ${reportMachine?.name} (${reportMachine?.machineId})`}
      >
        <form onSubmit={handleSubmitComplaint} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Issue Category</label>
              <select
                value={reportCategory}
                onChange={(e) => setReportCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              >
                <option value="Mechanical">Mechanical</option>
                <option value="Electrical">Electrical</option>
                <option value="Hydraulic System">Hydraulic System</option>
                <option value="Sensor / Calibration">Sensor / Calibration</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Priority</label>
              <select
                value={reportPriority}
                onChange={(e) => setReportPriority(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">Problem Description</label>
            <textarea
              rows={3}
              required
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              placeholder="Describe the machine issue..."
              className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">Photograph (Optional)</label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#071426] border border-dashed border-[#1E3A5F] hover:border-[#38BDF8] text-xs text-[#94A3B8] cursor-pointer transition">
              <Paperclip className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {reportPhoto ? reportPhoto.name : 'Attach a photo of the fault (max 5 MB)'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setReportPhoto(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          {reportError && <p className="text-xs text-red-400">{reportError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setReportMachine(null)}
              className="px-4 py-2 rounded-xl bg-[#142B49] text-xs text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reportBusy}
              className="px-4 py-2 rounded-xl bg-[#2563EB] text-xs font-bold text-white disabled:opacity-60"
            >
              {reportBusy ? 'Submitting…' : 'Submit Complaint'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manage Repair Modal (Maintenance Team) */}
      <Modal
        open={!!manageComplaint}
        onClose={() => setManageComplaint(null)}
        title={`Manage Repair – ${manageComplaint?.complaintId}`}
      >
        {manageComplaint && (
          <form onSubmit={handleUpdateRepair} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#071426] border border-[#1E3A5F] text-xs space-y-1">
              <p className="text-white font-bold">
                {manageComplaint.machineName} ({manageComplaint.machineId})
              </p>
              <p className="text-[#94A3B8]">{manageComplaint.description}</p>
              <p className="text-[#38BDF8]">Raised by: {manageComplaint.reportedByName}</p>
            </div>

            {manageComplaint.photoPath && (
              <div className="rounded-xl overflow-hidden border border-[#1E3A5F] bg-[#071426]">
                {photoUrl && photoUrl !== 'error' ? (
                  <img src={photoUrl} alt="Reported fault" className="w-full max-h-64 object-contain" />
                ) : (
                  <p className="p-3 text-xs text-[#94A3B8]">
                    {photoUrl === 'error' ? 'Photo could not be loaded.' : 'Loading photo…'}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Update Repair Status</label>
              <select
                value={repairStatus}
                onChange={(e) => setRepairStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              >
                <option value="Accepted">Accepted</option>
                <option value="In Progress">In Progress</option>
                <option value="Waiting for Parts">Waiting for Parts</option>
                <option value="Resolved">Resolved</option>
                <option value="Verified">Verified (Close & Restore Machine)</option>
              </select>
              <p className="text-[11px] text-[#94A3B8] mt-1.5">
                Resolved = repair work completed. Verified = completion checked by Maintenance; only then is
                the machine set to Operational. On-site safety checks remain a separate manual process.
              </p>
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">
                Repair Action / Progress Note
              </label>
              <textarea
                rows={3}
                value={repairNote}
                onChange={(e) => setRepairNote(e.target.value)}
                placeholder="Document repair steps or parts replaced..."
                className="w-full px-3 py-2 rounded-xl bg-[#071426] border border-[#1E3A5F] text-sm text-white"
              />
            </div>

            {complaintIssuedRequests.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs text-[#94A3B8]">
                  Parts Actually Used (optional – does not change warehouse stock)
                </label>
                {complaintIssuedRequests.map((r) => (
                  <div
                    key={r.requestId}
                    className="p-3 rounded-xl bg-[#071426] border border-[#1E3A5F] flex items-center justify-between gap-3"
                  >
                    <div className="text-xs">
                      <p className="text-white font-semibold">
                        {r.partName} ({r.partId})
                      </p>
                      <p className="text-[#94A3B8]">
                        {r.requestId} • Issued: {r.issuedQty}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={r.issuedQty}
                      placeholder="Used"
                      value={partsInputs[r.requestId] ?? r.usedQty ?? ''}
                      onChange={(e) =>
                        setPartsInputs({ ...partsInputs, [r.requestId]: e.target.value })
                      }
                      className="w-20 px-2 py-1.5 rounded-lg bg-[#0A1930] border border-[#1E3A5F] text-sm text-white"
                    />
                  </div>
                ))}
              </div>
            )}
            {repairError && <p className="text-xs text-red-400">{repairError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setManageComplaint(null)}
                className="px-4 py-2 rounded-xl bg-[#142B49] text-xs text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={repairBusy}
                className="px-4 py-2 rounded-xl bg-[#2563EB] text-xs font-bold text-white disabled:opacity-60"
              >
                {repairBusy ? 'Saving…' : 'Save Update'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}