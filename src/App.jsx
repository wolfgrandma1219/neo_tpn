import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  User, Lock, Settings, Users, FileText, Plus, 
  Search, ArrowLeft, Save, CheckCircle, XCircle, 
  Edit, AlertTriangle, Syringe, Trash2, CloudUpload,
  Beaker, Calculator, Activity, RefreshCw, ShieldCheck
} from 'lucide-react';

// === 未來串接 Google Apps Script 的網址請填入此處 ===
const GAS_URL = "https://script.google.com/macros/s/AKfycbw9_vt0R-rAUt8sAjSlquSUMk7l98Nf5ZcQnuDeXUNDjbQOfKrsTowpEsnnUSfZzvFu/exec";

// --- 系統預設防呆資料 (防止資料庫完全空白時系統崩潰或無法登入) ---
const INITIAL_USERS = [
  { id: 'u1', username: 'admin', password: '123', role: 'admin', name: '系統管理員' } // 僅保留管理員，避免空資料庫時無法登入建立其他帳號
];

// LIMITS 結構為介面渲染必須，保留作為預設基底
const INITIAL_LIMITS = {
  kcal: { min: 40, max: 120, unit: 'Kcal/kg' },
  cho: { min: 4, max: 15, unit: 'GIR mg/kg/min' },
  aa: { min: 1, max: 4, unit: 'g/kg' },
  na: { min: 2, max: 5, unit: 'mEq/kg' },
  k: { min: 1, max: 3, unit: 'mEq/kg' },
  cl: { min: 2, max: 5, unit: 'mEq/kg' },
  ca: { min: 1, max: 3, unit: 'mEq/kg' },
  p: { min: 1, max: 2, unit: 'mmol/kg' },
  mg: { min: 0.2, max: 0.5, unit: 'mEq/kg' },
};

// 套餐因目前沒有 UI 可以新增，保留預設選項
const INITIAL_PACKAGES = [
  { code: 'P01', name: 'Preterm Standard A', kcal: 400, cho: 100, aa: 25, na: 30, k: 20, cl: 30, ca: 15, p: 10, mg: 5 },
  { code: 'P02', name: 'Term Standard B', kcal: 500, cho: 120, aa: 30, na: 40, k: 25, cl: 40, ca: 20, p: 15, mg: 5 },
  { code: 'C01', name: 'Custom (自訂)', kcal: 0, cho: 0, aa: 0, na: 0, k: 0, cl: 0, ca: 0, p: 0, mg: 0 },
];

const ELEMENTS = [
  { key: 'kcal', label: '熱量', unit1: 'kcal/L', unit2: 'Kcal/kg', isGIR: false },
  { key: 'cho', label: 'CHO', unit1: 'g/L', unit2: 'GIR mg/kg/min', isGIR: true },
  { key: 'aa', label: 'Amino acid', unit1: 'g/L', unit2: 'g/kg', isGIR: false },
  { key: 'na', label: 'Na', unit1: 'mEq/L', unit2: 'mEq/kg', isGIR: false },
  { key: 'k', label: 'K', unit1: 'mEq/L', unit2: 'mEq/kg', isGIR: false },
  { key: 'cl', label: 'Cl', unit1: 'mEq/L', unit2: 'mEq/kg', isGIR: false },
  { key: 'ca', label: 'Ca', unit1: 'mEq/L', unit2: 'mEq/kg', isGIR: false },
  { key: 'p', label: 'P', unit1: 'mmol/L', unit2: 'mmol/kg', isGIR: false },
  { key: 'mg', label: 'Mg', unit1: 'mEq/L', unit2: 'mEq/kg', isGIR: false },
];

const OTHER_ADDITIONS = [
  { key: 'znso4', label: 'ZnSO4 (1.35mg/mL)', unit: 'mL' },
  { key: 'heparin', label: 'Heparin', unit: 'IU' },
  { key: 'lyo', label: 'Lyo-povigent', unit: 'mL' },
  { key: 'peditrace', label: 'Peditrace', unit: 'mL' }
];

const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// --- 新增：自訂處方單號生成邏輯 (TPN-就醫序號-日期-流水號) ---
const generateOrderId = (encounterId, orders) => {
  const encId = encounterId || 'UNKNOWN';
  const d = new Date();
  // 產生 YYYYMMDD 格式的日期字串
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const prefix = `TPN-${encId}-${dateStr}-`;
  
  let maxSeq = 0;
  if (orders && Array.isArray(orders)) {
    orders.forEach(o => {
      // 如果存在相同前綴的處方，解析最後的流水號
      if (o.orderId && String(o.orderId).startsWith(prefix)) {
        const parts = String(o.orderId).split('-');
        const seqStr = parts[parts.length - 1]; 
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
  }
  
  // 流水號加 1，並補齊雙碼
  const nextSeq = String(maxSeq + 1).padStart(2, '0');
  return `${prefix}${nextSeq}`;
};
// -------------------------------------------------------------

const getAgeInDays = (dob, targetDate) => {
  if (!dob) return 0;
  const endDate = targetDate ? new Date(targetDate) : new Date();
  const diffTime = Math.abs(endDate - new Date(dob));
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return isNaN(days) ? 0 : days;
};

const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const cleanDateString = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString).split('T')[0];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const cleanTimeString = (timeString) => {
  if (!timeString) return '';
  const str = String(timeString);
  if (/^\d{1,2}:\d{2}/.test(str)) return str.substring(0, 5);
  const d = new Date(str);
  if (!isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return str;
};

const evaluateFormula = (formulaString, formData) => {
  if (!formulaString) return 0;
  try {
    let mathStr = formulaString;
    
    const prepVol = parseFloat(formData.prepVol) || 0;
    const weight = parseFloat(formData.weight) || 0;
    mathStr = mathStr.replace(/V/g, prepVol);
    mathStr = mathStr.replace(/W/g, weight);

    ELEMENTS.forEach(el => {
      const conc = formData.elements[el.key]?.conc || 0;
      const regex = new RegExp(`\\[${el.key}\\]`, 'gi');
      mathStr = mathStr.replace(regex, conc);
    });

    OTHER_ADDITIONS.forEach(item => {
      const val = parseFloat(formData.otherAdditions[item.key]) || 0;
      const regex = new RegExp(`\\[${item.key}\\]`, 'gi');
      mathStr = mathStr.replace(regex, val);
    });

    const result = new Function('return ' + mathStr)();
    if (isNaN(result) || !isFinite(result)) return 0;
    return result < 0 ? 0 : Number(result.toFixed(1));

  } catch (error) {
    console.warn("公式運算錯誤:", formulaString, error);
    return null;
  }
};

const evaluateCondition = (conditionString, formData) => {
  if (!conditionString) return true;
  try {
    let mathStr = conditionString;
    ELEMENTS.forEach(el => {
      const dose = parseFloat(formData.elements[el.key]?.dose) || 0;
      const regex = new RegExp(`\\[${el.key}\\]`, 'gi');
      mathStr = mathStr.replace(regex, dose);
    });
    const result = new Function('return ' + mathStr)();
    return !!result;
  } catch (error) {
    console.warn("稽核規則運算錯誤:", conditionString, error);
    return false; 
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [db, setDb] = useState({
    users: INITIAL_USERS,
    limits: INITIAL_LIMITS,
    packages: INITIAL_PACKAGES,
    medications: [], 
    auditRules: [],
    patients: [],
    admissions: [],
    orders: []
  });

  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedAdmission, setSelectedAdmission] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [alertMsg, setAlertMsg] = useState('');

  const showAlert = (msg) => {
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(''), 4000);
  };

  const fetchAllData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsSyncing(true);
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'getAllData' })
      });
      const result = await response.json();
      
      if (result.success) {
        const fetchedLimits = result.data.limits || {};
        const safeLimits = Object.keys(fetchedLimits).length > 0 ? { ...INITIAL_LIMITS, ...fetchedLimits } : INITIAL_LIMITS;
        
        const normalizedPatients = (result.data.patients || []).map(p => ({ ...p, dob: cleanDateString(p.dob) }));
        const normalizedAdmissions = (result.data.admissions || []).map(a => ({ ...a, adminDate: cleanDateString(a.adminDate), dischargeDate: cleanDateString(a.dischargeDate) }));
        const normalizedOrders = (result.data.orders || []).map(o => ({ 
          ...o, 
          startDate: cleanDateString(o.startDate),
          startTime: cleanTimeString(o.startTime)
        }));

        const rawMedications = result.data.medications || result.data.Medications || [];
        const normalizedMedications = rawMedications.filter(m => m.id || m.ID).map(m => {
          const rawIsActive = m.isActive !== undefined ? m.isActive : m.IsActive;
          return {
            ...m,
            id: m.id || m.ID,
            name: m.name || m.Name || '',
            formula: m.formula || m.Formula || '',
            unit: m.unit || m.Unit || 'mL',
            seq: Number(m.seq || m.Seq || 0),
            isActive: rawIsActive === undefined ? true : (rawIsActive === true || String(rawIsActive).toLowerCase() === 'true')
          };
        });

        const rawAuditRules = result.data.auditRules || result.data.AuditRules || [];
        const normalizedAuditRules = rawAuditRules.filter(r => r.id || r.ID).map(r => {
          const rawIsActive = r.isActive !== undefined ? r.isActive : r.IsActive;
          return {
            ...r, 
            id: r.id || r.ID,
            condition: r.condition || r.Condition || '',
            description: r.description || r.Description || '',
            isActive: rawIsActive === undefined ? true : (rawIsActive === true || String(rawIsActive).toLowerCase() === 'true')
          };
        });

        setDb({
          users: result.data.users?.length > 0 ? result.data.users : INITIAL_USERS,
          limits: safeLimits,
          packages: result.data.packages?.length > 0 ? result.data.packages : INITIAL_PACKAGES,
          medications: normalizedMedications, 
          auditRules: normalizedAuditRules,
          patients: normalizedPatients,
          admissions: normalizedAdmissions,
          orders: normalizedOrders
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.warn("連線錯誤，使用預設或快取資料繼續運行。");
      if (showLoading) showAlert(`無法連線至資料庫，使用預設或快取資料。`);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const apiSync = async (action, table, pk, data, successCallback) => {
    setIsSyncing(true);
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action, table, pk, data })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      await new Promise(resolve => setTimeout(resolve, 300));
      successCallback();
      
    } catch (error) {
      console.warn("API 連線錯誤，繼續以本地模式運行。");
      showAlert(`連線存檔失敗: 進入本地離線模式`);
      successCallback(); 
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchAllData(true);
    const intervalId = setInterval(() => {
      fetchAllData(false);
    }, 60000);
    return () => clearInterval(intervalId);
  }, [fetchAllData]);

  const handleLogin = (username, password) => {
    const found = db.users.find(u => String(u.username) === String(username) && String(u.password) === String(password));
    if (found) {
      setUser(found);
      if (found.role === 'admin') setView('settings');
      else if (found.role === 'pharmacist') setView('globalOrders');
      else setView('patients');
    } else {
      showAlert('帳號或密碼錯誤');
    }
  };

  const AlertBanner = () => alertMsg && (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border-l-4 border-red-500 text-red-700 px-6 py-3 rounded shadow-xl z-50 flex items-center gap-3 transition-all duration-300">
      <AlertTriangle size={20} /> <span className="font-bold">{alertMsg}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
      <AlertBanner />
      
      {user && (
        <nav className="bg-blue-900 text-white p-4 shadow-md flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-3 text-xl font-bold tracking-wide">
            <Beaker /> Neo TPN System
            {isSyncing && <span className="text-xs bg-blue-700 px-2 py-1 rounded animate-pulse">連線同步中...</span>}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => fetchAllData(true)} className="flex items-center gap-1 hover:bg-blue-700 transition text-sm font-bold bg-blue-800 px-3 py-1.5 rounded-full border border-blue-700 cursor-pointer">
              <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} /> 手動更新
            </button>
            <span className="text-sm bg-blue-800 px-3 py-1 rounded-full border border-blue-700 shadow-inner hidden md:inline-block">
              {user.name} ({user.role})
            </span>
            {user.role === 'admin' && (
              <button onClick={() => setView('settings')} className="hover:text-blue-200 transition"><Settings size={20}/></button>
            )}
            <button onClick={() => { setUser(null); setView('login'); }} className="hover:text-red-300 text-sm font-semibold transition">
              登出
            </button>
          </div>
        </nav>
      )}

      <main className="p-4 md:p-6 max-w-7xl mx-auto">
        {view === 'login' && <LoginView onLogin={handleLogin} />}
        {view === 'settings' && <SettingsView db={db} setDb={setDb} apiSync={apiSync} showAlert={showAlert} />}
        {view === 'patients' && <CombinedAdmissionsView db={db} setDb={setDb} apiSync={apiSync} showAlert={showAlert} onSelect={(p, a) => { setSelectedPatient(p); setSelectedAdmission(a); setView('orders'); }} />}
        {view === 'orders' && <OrdersView db={db} setDb={setDb} apiSync={apiSync} patient={selectedPatient} admission={selectedAdmission} user={user} onBack={() => setView('patients')} onEdit={(o) => { setEditingOrder(o); setView('orderForm'); }} showAlert={showAlert} />}
        {view === 'globalOrders' && <GlobalOrdersView db={db} user={user} onEdit={(o, p, a) => { setEditingOrder(o); setSelectedPatient(p); setSelectedAdmission(a); setView('orderForm'); }} />}
        {view === 'orderForm' && <OrderFormView db={db} setDb={setDb} apiSync={apiSync} patient={selectedPatient} admission={selectedAdmission} user={user} order={editingOrder} onBack={() => setView(user.role === 'pharmacist' ? 'globalOrders' : 'orders')} showAlert={showAlert} />}
      </main>
    </div>
  );
}

// ==========================================
// 1. 登入畫面
// ==========================================
function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
        <div className="flex justify-center mb-6 text-blue-700"><Beaker size={56} strokeWidth={1.5} /></div>
        <h2 className="text-2xl font-black text-center mb-8 text-gray-800 tracking-tight">新生兒靜脈營養處方系統</h2>
        <form onSubmit={(e) => { e.preventDefault(); onLogin(username, password); }} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">使用者帳號</label>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" size={18} />
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full pl-10 pr-3 py-2 border-2 rounded-xl focus:ring-0 focus:border-blue-500 outline-none transition" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">登入密碼</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-3 py-2 border-2 rounded-xl focus:ring-0 focus:border-blue-500 outline-none transition" required />
            </div>
          </div>
          <button type="submit" className="w-full bg-blue-700 text-white py-3 rounded-xl hover:bg-blue-800 font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 mt-2">
            登入系統
          </button>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 2. 設定畫面 (Admin)
// ==========================================
function SettingsView({ db, setDb, apiSync, showAlert }) {
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'doctor', name: '' });
  const [localLimits, setLocalLimits] = useState(db.limits);
  const [newMed, setNewMed] = useState({ name: '', formula: '', unit: 'mL', seq: db.medications.length + 1 });

  const [newRule, setNewRule] = useState({ condition: '', description: '', isActive: true });
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editingRuleData, setEditingRuleData] = useState({});

  useEffect(() => { setLocalLimits(db.limits); }, [db.limits]);

  const handleSaveLimits = () => {
    apiSync('saveRecord', 'limits', 'element', localLimits, () => {
      setDb(p => ({ ...p, limits: localLimits }));
      showAlert('濃度設定已成功儲存！');
    });
  };

  const handleAddUser = () => {
    if (!newUser.username || !newUser.password || !newUser.name) return showAlert('請填寫完整資訊');
    if (db.users.find(u => String(u.username) === String(newUser.username))) return showAlert('此帳號已存在');
    const userToAdd = { id: generateId('u'), ...newUser };
    apiSync('saveRecord', 'users', 'id', userToAdd, () => {
      setDb(p => ({ ...p, users: [...p.users, userToAdd] }));
      setNewUser({ username: '', password: '', role: 'doctor', name: '' });
      showAlert('操作者已新增');
    });
  };

  const handleDeleteUser = (id) => {
    const user = db.users.find(u => String(u.id) === String(id));
    if (user && user.username === 'admin') return showAlert('無法刪除預設管理員帳號');
    if(confirm(`確定要刪除帳號 ${user ? user.username : ''} 嗎？`)) {
      apiSync('deleteRecord', 'users', 'id', { id }, () => {
        setDb(p => ({...p, users: p.users.filter(u => String(u.id) !== String(id))}));
        showAlert('帳號已刪除');
      });
    }
  };

  const handleAddMedication = () => {
    if (!newMed.name || !newMed.formula) return showAlert('藥品名稱與公式為必填');
    const mockFormData = { prepVol: 100, weight: 1, elements: ELEMENTS.reduce((acc, el) => ({...acc, [el.key]:{conc:1}}), {}), otherAdditions: {} };
    if (evaluateFormula(newMed.formula, mockFormData) === null) {
      return showAlert('公式語法錯誤，請檢查符號與括號是否正確！');
    }
    const medToAdd = { id: generateId('med'), ...newMed, isActive: true };
    apiSync('saveRecord', 'medications', 'id', medToAdd, () => {
      setDb(p => ({ ...p, medications: [...p.medications, medToAdd].sort((a,b)=>a.seq-b.seq) }));
      setNewMed({ name: '', formula: '', unit: 'mL', seq: db.medications.length + 2 });
      showAlert('調配藥品與公式已新增');
    });
  };

  const handleDeleteMedication = (id) => {
    if(confirm('確定要刪除此調配藥品設定嗎？')) {
      apiSync('deleteRecord', 'medications', 'id', { id }, () => {
        setDb(p => ({...p, medications: p.medications.filter(m => String(m.id) !== String(id))}));
      });
    }
  };

  const handleAddRule = () => {
    if (!newRule.condition || !newRule.description) return showAlert('規則條件與說明為必填');
    const ruleToAdd = { id: generateId('ar'), ...newRule };
    apiSync('saveRecord', 'auditRules', 'id', ruleToAdd, () => {
      setDb(p => ({ ...p, auditRules: [...p.auditRules, ruleToAdd] }));
      setNewRule({ condition: '', description: '', isActive: true });
      showAlert('處方稽核規則已新增');
    });
  };

  const handleDeleteRule = (id) => {
    if(confirm('確定要刪除此稽核規則嗎？')) {
      apiSync('deleteRecord', 'auditRules', 'id', { id }, () => {
        setDb(p => ({...p, auditRules: p.auditRules.filter(r => String(r.id) !== String(id))}));
      });
    }
  };

  const toggleRuleActive = (rule) => {
    const ruleToSave = { ...rule, isActive: !rule.isActive };
    apiSync('saveRecord', 'auditRules', 'id', ruleToSave, () => {
      setDb(p => ({ ...p, auditRules: p.auditRules.map(r => r.id === rule.id ? ruleToSave : r) }));
    });
  };

  const startEditRule = (rule) => {
    setEditingRuleId(rule.id);
    setEditingRuleData({ condition: rule.condition, description: rule.description });
  };

  const saveEditRule = (rule) => {
    if (!editingRuleData.condition || !editingRuleData.description) return showAlert('條件與說明不能為空');
    const ruleToSave = { ...rule, ...editingRuleData };
    apiSync('saveRecord', 'auditRules', 'id', ruleToSave, () => {
      setDb(p => ({ ...p, auditRules: p.auditRules.map(r => r.id === rule.id ? ruleToSave : r) }));
      setEditingRuleId(null);
      showAlert('稽核規則已更新');
    });
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 animate-in fade-in zoom-in duration-300">
      <h2 className="text-2xl font-black mb-6 flex items-center gap-2 text-gray-800"><Settings /> 系統管理設定</h2>
      
      {/* 區塊 1: 濃度設定 */}
      <div className="mb-10 bg-gray-50 p-5 rounded-xl border border-gray-200">
        <div className="flex justify-between items-center mb-4 border-b border-gray-300 pb-3">
          <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2"><Activity size={20}/> 處方濃度安全上下限</h3>
          <button onClick={handleSaveLimits} className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-bold shadow transition">
            <CloudUpload size={18}/> 儲存濃度設定
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(localLimits).map(([key, limit]) => {
            const elementLabel = ELEMENTS.find(e => e.key === key)?.label || key.toUpperCase();
            return (
            <div key={key} className="p-4 border rounded-lg bg-white shadow-sm flex flex-col gap-2">
              <span className="font-bold text-gray-800">{elementLabel} <span className="text-xs text-gray-500 font-normal">({limit.unit})</span></span>
              <div className="flex items-center gap-2">
                <input type="number" step="0.1" value={limit.min} onChange={e => setLocalLimits(p => ({...p, [key]: {...limit, min: Number(e.target.value)}}))} className="w-20 p-2 border-2 rounded focus:ring-0 focus:border-blue-500 text-sm font-bold text-center" />
                <span className="text-gray-400">~</span>
                <input type="number" step="0.1" value={limit.max} onChange={e => setLocalLimits(p => ({...p, [key]: {...limit, max: Number(e.target.value)}}))} className="w-20 p-2 border-2 rounded focus:ring-0 focus:border-blue-500 text-sm font-bold text-center" />
              </div>
            </div>
          )})}
        </div>
      </div>

      {/* 區塊 2: 藥品公式管理 */}
      <div className="mb-10 bg-indigo-50 p-5 rounded-xl border border-indigo-100">
        <div className="flex justify-between items-center mb-4 border-b border-indigo-200 pb-3">
          <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2"><Calculator size={20}/> 藥局調配藥品與公式管理</h3>
        </div>
        
        <div className="bg-white p-4 rounded-lg text-sm text-gray-700 mb-6 shadow-sm border border-indigo-100">
          <p className="font-bold text-indigo-800 mb-2">可用公式變數 (請區分大小寫)：</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-xs">
            <span className="bg-gray-100 p-1 rounded">V : 目標調配體積</span>
            <span className="bg-gray-100 p-1 rounded">W : 病人體重</span>
            <span className="bg-gray-100 p-1 rounded">[aa] : Amino Acid 濃度</span>
            <span className="bg-gray-100 p-1 rounded">[cho] : CHO 濃度</span>
            <span className="bg-gray-100 p-1 rounded">[na] : 鈉濃度</span>
            <span className="bg-gray-100 p-1 rounded">[k] : 鉀濃度</span>
            <span className="text-gray-500 italic col-span-2">... 其他依此類推 [cl], [ca], [p], [mg], [heparin]</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border-2 border-indigo-200 mb-6 flex flex-col gap-4 shadow-sm">
          <h4 className="font-bold text-indigo-800 border-b pb-2">新增調配藥品</h4>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">排序</label>
              <input type="number" value={newMed.seq} onChange={e=>setNewMed({...newMed, seq: Number(e.target.value)})} className="border-2 p-2 rounded-lg w-20 text-center focus:border-indigo-500 outline-none" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-gray-600 mb-1">藥品名稱 (供藥局檢視)</label>
              <input type="text" value={newMed.name} onChange={e=>setNewMed({...newMed, name: e.target.value})} className="border-2 p-2 rounded-lg w-full focus:border-indigo-500 outline-none font-bold text-indigo-900" placeholder="e.g. Aminosteril 10%" />
            </div>
            <div className="flex-2 min-w-[300px]">
              <label className="block text-xs font-bold text-gray-600 mb-1">換算公式 (算出抽取體積)</label>
              <input type="text" value={newMed.formula} onChange={e=>setNewMed({...newMed, formula: e.target.value})} className="border-2 p-2 rounded-lg w-full font-mono focus:border-indigo-500 outline-none bg-gray-50" placeholder="e.g. [aa] * (V / 1000) / 0.1" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">單位</label>
              <input type="text" value={newMed.unit} onChange={e=>setNewMed({...newMed, unit: e.target.value})} className="border-2 p-2 rounded-lg w-20 text-center focus:border-indigo-500 outline-none" />
            </div>
            <button onClick={handleAddMedication} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 font-bold shadow transition shrink-0">
              <Plus size={18} className="inline mr-1"/> 新增藥品
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-indigo-100 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
              <tr>
                <th className="p-3 w-16 text-center">排序</th>
                <th className="p-3 w-1/4">藥品名稱</th>
                <th className="p-3 w-1/2">換算公式</th>
                <th className="p-3 w-20 text-center">單位</th>
                <th className="p-3 text-center w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {db.medications.map(m => (
                <tr key={m.id} className="hover:bg-indigo-50 transition">
                  <td className="p-3 text-center font-bold text-gray-500">{m.seq}</td>
                  <td className="p-3 font-bold text-indigo-900">{m.name}</td>
                  <td className="p-3 font-mono text-xs text-gray-600 bg-gray-50 m-2 rounded border">{m.formula}</td>
                  <td className="p-3 text-center text-gray-500">{m.unit}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => handleDeleteMedication(m.id)} className="text-red-400 hover:text-red-600 p-2 rounded hover:bg-red-50 transition">
                      <Trash2 size={18}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 區塊 2.5: 處方稽核規則管理 */}
      <div className="mb-10 bg-rose-50 p-5 rounded-xl border border-rose-100">
        <div className="flex justify-between items-center mb-4 border-b border-rose-200 pb-3">
          <h3 className="text-lg font-bold text-rose-900 flex items-center gap-2"><ShieldCheck size={20}/> 處方稽核規則設定</h3>
        </div>
        
        <div className="bg-white p-5 rounded-lg border-2 border-rose-200 mb-6 flex flex-col gap-4 shadow-sm">
          <h4 className="font-bold text-rose-800 border-b pb-2">新增稽核規則</h4>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-gray-600 mb-1">條件判斷式 (例如: [na]&gt;=[p]*2)</label>
              <input type="text" value={newRule.condition} onChange={e=>setNewRule({...newRule, condition: e.target.value})} className="border-2 p-2 rounded-lg w-full font-mono focus:border-rose-500 outline-none bg-gray-50 text-sm" placeholder="e.g. [na] >= [p] * 2" />
            </div>
            <div className="flex-2 min-w-[300px]">
              <label className="block text-xs font-bold text-gray-600 mb-1">規則說明 (違反時的提示訊息)</label>
              <input type="text" value={newRule.description} onChange={e=>setNewRule({...newRule, description: e.target.value})} className="border-2 p-2 rounded-lg w-full focus:border-rose-500 outline-none font-bold text-gray-800 text-sm" placeholder="e.g. 因使用glycophos" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" checked={newRule.isActive} onChange={e=>setNewRule({...newRule, isActive: e.target.checked})} className="w-5 h-5 cursor-pointer text-rose-600 rounded focus:ring-rose-500" id="newRuleActive"/>
              <label htmlFor="newRuleActive" className="text-sm font-bold text-gray-700 cursor-pointer">預設生效</label>
            </div>
            <button onClick={handleAddRule} className="bg-rose-600 text-white px-5 py-2 rounded-lg hover:bg-rose-700 font-bold shadow transition ml-auto">
              <Plus size={18} className="inline mr-1"/> 新增規則
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-rose-100 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-rose-50 text-rose-900 border-b border-rose-100">
              <tr>
                <th className="p-3 w-16 text-center">生效</th>
                <th className="p-3 w-1/3">條件判斷式 (Formula)</th>
                <th className="p-3 w-1/2">說明 (Description)</th>
                <th className="p-3 text-center w-32">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {db.auditRules.map(r => {
                const isEditing = editingRuleId === r.id;
                return (
                <tr key={r.id} className="hover:bg-rose-50/50 transition">
                  <td className="p-3 text-center">
                    <input type="checkbox" checked={r.isActive} onChange={() => toggleRuleActive(r)} className="w-4 h-4 cursor-pointer text-rose-600 rounded" />
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input type="text" value={editingRuleData.condition} onChange={e => setEditingRuleData({...editingRuleData, condition: e.target.value})} className="border-2 p-1.5 rounded-lg w-full text-xs font-mono focus:border-rose-500 outline-none" />
                    ) : (
                      <span className="font-mono text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded border">{r.condition}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input type="text" value={editingRuleData.description} onChange={e => setEditingRuleData({...editingRuleData, description: e.target.value})} className="border-2 p-1.5 rounded-lg w-full text-sm font-bold text-gray-800 focus:border-rose-500 outline-none" />
                    ) : (
                      <span className="font-bold text-gray-800">{r.description}</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEditRule(r)} className="text-green-700 bg-green-100 p-1.5 rounded-lg font-bold shadow-sm hover:bg-green-200 transition" title="儲存修改"><Save size={16}/></button>
                          <button onClick={() => setEditingRuleId(null)} className="text-gray-500 bg-gray-100 p-1.5 rounded-lg font-bold shadow-sm hover:bg-gray-200 transition" title="取消"><XCircle size={16}/></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditRule(r)} className="text-gray-500 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-100 transition" title="修改"><Edit size={16}/></button>
                          <button onClick={() => handleDeleteRule(r.id)} className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition" title="刪除"><Trash2 size={16}/></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
              {db.auditRules.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-gray-400 font-bold">尚無設定稽核規則</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 區塊 3: 操作者管理 */}
      <div>
        <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2"><Users size={20}/> 操作者管理</h3>
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 flex gap-4 items-end flex-wrap mb-6">
          <div><label className="block text-xs font-bold text-gray-600 mb-1">帳號</label><input type="text" value={newUser.username} onChange={e=>setNewUser({...newUser, username: e.target.value})} className="border-2 p-2 rounded-lg w-32 focus:border-blue-500 outline-none" placeholder="登入帳號" /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1">密碼</label><input type="text" value={newUser.password} onChange={e=>setNewUser({...newUser, password: e.target.value})} className="border-2 p-2 rounded-lg w-32 focus:border-blue-500 outline-none" placeholder="登入密碼" /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1">顯示名稱</label><input type="text" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})} className="border-2 p-2 rounded-lg w-32 focus:border-blue-500 outline-none" placeholder="如: 陳醫師" /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1">身份</label>
            <select value={newUser.role} onChange={e=>setNewUser({...newUser, role: e.target.value})} className="border-2 p-2 rounded-lg w-32 bg-white focus:border-blue-500 outline-none font-bold">
              <option value="doctor">醫師</option>
              <option value="np">專師</option>
              <option value="pharmacist">藥師</option>
              <option value="admin">管理員</option>
            </select>
          </div>
          <button onClick={handleAddUser} className="bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-black flex items-center gap-2 font-bold shadow-sm transition">
            <Plus size={18}/> 新增操作者
          </button>
        </div>
        <div className="bg-white rounded-lg border overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100">
              <tr><th className="p-3">帳號</th><th className="p-3">密碼</th><th className="p-3">顯示名稱</th><th className="p-3">身份</th><th className="p-3 text-center">操作</th></tr>
            </thead>
            <tbody className="divide-y">
              {db.users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition">
                  <td className="p-3 font-bold text-gray-800">{u.username}</td>
                  <td className="p-3 text-gray-400 font-mono text-xs">{u.password}</td>
                  <td className="p-3 font-bold text-gray-800">{u.name}</td>
                  <td className="p-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      u.role === 'admin' ? 'bg-red-50 text-red-700 border-red-200' : 
                      u.role === 'pharmacist' ? 'bg-green-50 text-green-700 border-green-200' : 
                      'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {u.role === 'admin' ? '管理員' : u.role === 'pharmacist' ? '藥師' : u.role === 'doctor' ? '醫師' : '專師'}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {u.username !== 'admin' && (
                      <button onClick={() => handleDeleteUser(u.id)} className="text-red-400 hover:text-red-600 p-2 rounded hover:bg-red-50 transition"><Trash2 size={18}/></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. 病人與就醫紀錄列表 (智能整併表單版)
// ==========================================
function CombinedAdmissionsView({ db, apiSync, setDb, showAlert, onSelect }) {
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false); // 新增：控制是否顯示結案病人
  const [showForm, setShowForm] = useState(false);

  const [editingAdmId, setEditingAdmId] = useState(null);
  const [editingAdmData, setEditingAdmData] = useState({ bed: '', isClosed: false });

  const getToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  
  const [formData, setFormData] = useState({
    mrn: '', name: '', dob: '', gender: '男',
    encounterId: '', bed: '', adminDate: getToday(), isClosed: false
  });
  
  const [isExistingPt, setIsExistingPt] = useState(false);

  const combinedList = db.admissions.map(adm => {
    const pt = db.patients.find(p => String(p.mrn) === String(adm.mrn)) || {};
    return { ...adm, patient: pt };
  }).sort((a, b) => new Date(b.adminDate) - new Date(a.adminDate));

  const filtered = combinedList.filter(item => {
    // 新增：如果未勾選顯示結案，且該項目為已結案，則過濾掉
    if (!showClosed && item.isClosed) return false;
    
    return (
      (item.mrn != null && String(item.mrn).includes(search)) || 
      (item.patient.name != null && String(item.patient.name).includes(search)) ||
      (item.encounterId != null && String(item.encounterId).includes(search)) ||
      (item.bed != null && String(item.bed).includes(search))
    );
  });

  const handleMrnChange = (e) => {
    const val = e.target.value;
    const existingPt = db.patients.find(p => String(p.mrn) === String(val));
    
    if (existingPt) {
      setFormData(prev => ({
        ...prev, mrn: val, name: existingPt.name, dob: existingPt.dob, gender: existingPt.gender
      }));
      setIsExistingPt(true);
    } else {
      setFormData(prev => ({
        ...prev, mrn: val, name: prev.name && isExistingPt ? '' : prev.name, dob: prev.dob && isExistingPt ? '' : prev.dob
      }));
      setIsExistingPt(false);
    }
  };

  const handleSave = () => {
    if(!formData.mrn || !formData.encounterId || !formData.bed || !formData.adminDate) return showAlert('請填寫帶星號(*)的必填欄位');
    if(!isExistingPt && (!formData.name || !formData.dob)) return showAlert('新病人請填寫完整姓名與生日');
    if(db.admissions.find(a => String(a.encounterId) === String(formData.encounterId))) return showAlert('此就醫序號已存在！');

    const admissionRecord = {
      encounterId: formData.encounterId, mrn: formData.mrn, adminDate: formData.adminDate, dischargeDate: '', bed: formData.bed, isClosed: false
    };

    const saveAdmissionOnly = () => {
      apiSync('saveRecord', 'admissions', 'encounterId', admissionRecord, () => {
        setDb(p => ({ ...p, admissions: [...p.admissions, admissionRecord] })); 
        setShowForm(false); 
        setFormData({ mrn: '', name: '', dob: '', gender: '男', encounterId: '', bed: '', adminDate: getToday(), isClosed: false });
        setIsExistingPt(false);
        showAlert('就醫紀錄建立成功！');
      });
    };

    if (!isExistingPt) {
      const patientRecord = { mrn: formData.mrn, name: formData.name, dob: formData.dob, gender: formData.gender };
      apiSync('saveRecord', 'patients', 'mrn', patientRecord, () => {
        setDb(p => ({ ...p, patients: [...p.patients, patientRecord] }));
        saveAdmissionOnly();
      });
    } else {
      saveAdmissionOnly();
    }
  };

  const startEdit = (item) => {
    setEditingAdmId(item.encounterId);
    setEditingAdmData({ bed: item.bed, isClosed: item.isClosed });
  };

  const saveEdit = (item) => {
    if (!editingAdmData.bed) return showAlert('床號不能為空');
    
    const recordToSave = {
      encounterId: item.encounterId, mrn: item.mrn, adminDate: item.adminDate, dischargeDate: item.dischargeDate || '', bed: editingAdmData.bed, isClosed: editingAdmData.isClosed
    };

    apiSync('saveRecord', 'admissions', 'encounterId', recordToSave, () => {
      setDb(p => ({
        ...p, admissions: p.admissions.map(a => String(a.encounterId) === String(item.encounterId) ? recordToSave : a)
      }));
      setEditingAdmId(null);
      showAlert('就醫狀態/床號已成功更新！');
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-5 rounded-2xl shadow-sm border border-gray-100 gap-4">
        {/* 新增：將搜尋框與 Checkbox 組合在一起 */}
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-3 text-gray-400" size={18} />
            <input type="text" placeholder="搜尋病歷號、姓名、就醫序號或床號..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-12 pr-4 py-2.5 border-2 rounded-xl w-full focus:border-blue-500 outline-none font-bold text-gray-800" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-500 hover:text-gray-800 transition bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-200 w-full md:w-auto justify-center">
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
            顯示結案病人
          </label>
        </div>
        
        <button onClick={() => setShowForm(true)} className="w-full md:w-auto bg-blue-700 text-white px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-800 font-bold shadow-md transition shrink-0">
          <Plus size={18} /> 新增就醫序號
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-2xl shadow-xl border-2 border-blue-200 relative animate-in fade-in slide-in-from-top-4 duration-300">
          <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><XCircle size={24}/></button>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-black text-blue-900 border-b-2 border-blue-100 pb-2 flex items-center gap-2">
                <User size={18}/> 病患基本資料
                {isExistingPt && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200 font-bold flex items-center gap-1"><CheckCircle size={12}/> 已代入舊檔</span>}
                {!isExistingPt && formData.mrn.length > 0 && <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full border border-yellow-200 font-bold">新病患</span>}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">* 病歷號 (MRN)</label>
                  <input type="text" value={formData.mrn} onChange={handleMrnChange} className="border-2 p-2.5 rounded-lg w-full focus:border-blue-500 outline-none font-black text-blue-900 text-lg transition-colors bg-blue-50 focus:bg-white" maxLength={7} placeholder="請先輸入病歷號" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">姓名</label>
                  <input type="text" value={formData.name} onChange={e=>setFormData(prev => ({...prev, name: e.target.value}))} disabled={isExistingPt} className={`border-2 p-2 rounded-lg w-full outline-none font-bold ${isExistingPt ? 'bg-gray-100 text-gray-500 border-gray-200' : 'focus:border-blue-500'}`} maxLength={6} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">性別</label>
                  <select value={formData.gender} onChange={e=>setFormData(prev => ({...prev, gender: e.target.value}))} disabled={isExistingPt} className={`border-2 p-2 rounded-lg w-full outline-none font-bold ${isExistingPt ? 'bg-gray-100 text-gray-500 border-gray-200' : 'focus:border-blue-500'}`}>
                    <option>男</option><option>女</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">生日 (DOB)</label>
                  <input type="date" value={formData.dob} onChange={e=>setFormData(prev => ({...prev, dob: e.target.value}))} disabled={isExistingPt} className={`border-2 p-2 rounded-lg w-full outline-none font-bold font-mono ${isExistingPt ? 'bg-gray-100 text-gray-500 border-gray-200' : 'focus:border-blue-500'}`} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-black text-indigo-900 border-b-2 border-indigo-100 pb-2 flex items-center gap-2">
                <FileText size={18}/> 本次就醫資訊
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">* 就醫序號 (Encounter ID)</label>
                  <input type="text" value={formData.encounterId} onChange={e=>setFormData(prev => ({...prev, encounterId: e.target.value}))} className="border-2 p-2.5 rounded-lg w-full focus:border-indigo-500 outline-none font-black text-lg" maxLength={12} placeholder="例如: I26020001" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">* 入院日期</label>
                  <input type="date" value={formData.adminDate} onChange={e=>setFormData(prev => ({...prev, adminDate: e.target.value}))} className="border-2 p-2 rounded-lg w-full focus:border-indigo-500 outline-none font-bold font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">* 報到床號</label>
                  <input type="text" value={formData.bed} onChange={e=>setFormData(prev => ({...prev, bed: e.target.value}))} className="border-2 p-2 rounded-lg w-full focus:border-indigo-500 outline-none font-bold text-indigo-900" maxLength={8} placeholder="例如: NICU01" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
            <button onClick={handleSave} className="bg-green-600 text-white px-8 py-3 rounded-xl hover:bg-green-700 font-black shadow-lg hover:shadow-xl transition flex items-center gap-2 text-lg transform hover:-translate-y-0.5">
              <Save size={20}/> 儲存並建立紀錄
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto mt-2">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
            <tr>
              <th className="p-4 font-bold text-center">住院狀態</th>
              <th className="p-4 font-bold">就醫序號</th>
              <th className="p-4 font-bold">住院日期</th>
              <th className="p-4 font-bold">病歷號</th>
              <th className="p-4 font-bold">床號</th>
              <th className="p-4 font-bold">姓名</th>
              <th className="p-4 font-bold text-center">性別</th>
              <th className="p-4 font-bold">出生日期</th>
              <th className="p-4 font-bold text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(item => {
              const isEditing = editingAdmId === item.encounterId;
              
              return (
              <tr key={item.encounterId} className="hover:bg-blue-50 transition">
                <td className="p-4 text-center">
                  {isEditing ? (
                    <select
                      value={editingAdmData.isClosed}
                      onChange={e => setEditingAdmData({...editingAdmData, isClosed: e.target.value === 'true'})}
                      className="border-2 p-1.5 rounded-lg w-full text-xs font-bold focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <option value={false}>住院中</option>
                      <option value={true}>已結案</option>
                    </select>
                  ) : (
                    item.isClosed ? <span className="bg-gray-200 text-gray-600 px-3 py-1 text-xs rounded-full font-bold">已結案</span> : <span className="bg-green-100 border border-green-300 text-green-700 px-3 py-1 text-xs rounded-full font-bold shadow-sm">住院中</span>
                  )}
                </td>
                <td className="p-4 font-black text-indigo-900">{item.encounterId}</td>
                <td className="p-4 font-mono text-gray-600">{item.adminDate}</td>
                <td className="p-4 font-black text-blue-900 text-lg">{item.mrn}</td>
                <td className="p-4 font-bold text-blue-700 text-lg">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingAdmData.bed}
                      onChange={e => setEditingAdmData({...editingAdmData, bed: e.target.value})}
                      className="border-2 p-1.5 rounded-lg w-24 text-sm font-bold focus:border-blue-500 outline-none"
                      maxLength={8}
                    />
                  ) : (
                    item.bed
                  )}
                </td>
                <td className="p-4 font-bold text-gray-800">{item.patient?.name || '未知'}</td>
                <td className="p-4 text-center font-bold">{item.patient?.gender || '-'}</td>
                <td className="p-4 font-mono text-gray-600">{item.patient?.dob || '-'}</td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {isEditing ? (
                      <>
                        <button onClick={() => saveEdit(item)} className="text-green-700 bg-green-100 p-2 rounded-lg font-bold shadow-sm hover:bg-green-200 transition" title="儲存修改"><Save size={18}/></button>
                        <button onClick={() => setEditingAdmId(null)} className="text-gray-500 bg-gray-100 p-2 rounded-lg font-bold shadow-sm hover:bg-gray-200 transition" title="取消"><XCircle size={18}/></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(item)} className="text-gray-500 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-100 transition" title="修改床號與狀態"><Edit size={18}/></button>
                        <button onClick={() => onSelect(item.patient, item)} className="text-white bg-blue-600 px-4 py-1.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition transform hover:scale-105">
                          進入TPN處方 &rarr;
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )})}
            {filtered.length === 0 && <tr><td colSpan="9" className="p-10 text-center text-gray-400 font-bold">查無資料，請確認搜尋條件或新增資料。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// 4. 處方列表 & 全局列表
// ==========================================
const formatDateTime = (iso) => {
  if(!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? String(iso) : `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

function OrdersView({ db, setDb, apiSync, patient, admission, user, onBack, onEdit, showAlert }) {
  const [showVoid, setShowVoid] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const encounterOrders = db.orders.filter(o => String(o.encounterId) === String(admission?.encounterId));
  const visibleOrders = encounterOrders.filter(o => {
    if (!showVoid && o.status === 'Void') return false;
    if (!showDeleted && o.status === 'Deleted') return false;
    return true;
  });
  const sortedOrders = [...visibleOrders].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-4 animate-in fade-in zoom-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-white shadow-sm border border-gray-200 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
          <div>
            <h2 className="text-2xl font-black text-gray-800">TPN 處方紀錄</h2>
            <p className="text-sm font-bold text-gray-500 mt-1">{patient?.name} ({patient?.mrn}) | 就醫: {admission?.encounterId} | 床號: <span className="text-blue-600">{admission?.bed}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-500 hover:text-gray-800 transition bg-white px-3 py-2 rounded-xl shadow-sm border border-gray-200">
            <input type="checkbox" checked={showVoid} onChange={e => setShowVoid(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
            顯示作廢處方
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-500 hover:text-gray-800 transition bg-white px-3 py-2 rounded-xl shadow-sm border border-gray-200">
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer" />
            顯示刪除處方
          </label>
          <button onClick={() => ['doctor','np'].includes(user.role) ? onEdit(null) : showAlert('僅醫師或專師可開立新處方')} className="bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-blue-800 font-bold shadow-lg transition">
            <FileText size={18} /> 新開處方單
          </button>
        </div>
      </div>
      <OrderTable orders={sortedOrders} patientName={patient?.name} onEdit={onEdit} />
    </div>
  );
}

function GlobalOrdersView({ db, user, onEdit }) {
  const [showVoid, setShowVoid] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const visibleOrders = db.orders.filter(o => {
    if (!showVoid && o.status === 'Void') return false;
    if (!showDeleted && o.status === 'Deleted') return false;
    return true;
  });
  const sortedOrders = visibleOrders.map(o => {
    const admission = db.admissions.find(a => String(a.encounterId) === String(o.encounterId));
    const patient = admission ? db.patients.find(p => String(p.mrn) === String(admission.mrn)) : { name: '未知' };
    return { ...o, patient, admission };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-blue-900 flex items-center gap-3">
          <Beaker size={28} /> 全院 TPN 處方調配清單
        </h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-500 hover:text-gray-800 transition bg-white px-3 py-2 rounded-xl shadow-sm border border-gray-200">
            <input type="checkbox" checked={showVoid} onChange={e => setShowVoid(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
            顯示作廢處方
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-500 hover:text-gray-800 transition bg-white px-3 py-2 rounded-xl shadow-sm border border-gray-200">
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer" />
            顯示刪除處方
          </label>
        </div>
      </div>
      <OrderTable orders={sortedOrders} onEdit={(o) => onEdit(o, o.patient, o.admission)} isGlobal />
    </div>
  );
}

function OrderTable({ orders, patientName, onEdit, isGlobal }) {
  const statusColors = {
    'Draft': 'bg-gray-100 text-gray-600 border-gray-300',
    'Submitted': 'bg-blue-100 text-blue-800 border-blue-400 font-bold shadow-sm',
    'Dispensed': 'bg-green-100 text-green-800 border-green-400 font-bold shadow-sm',
    'Void': 'bg-red-50 text-red-500 border-red-200 line-through',
    'Deleted': 'bg-gray-50 text-gray-300 border-gray-200'
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 border-b border-gray-200 text-gray-700">
          <tr>
            <th className="p-4 font-bold">單號 (版次)</th>
            <th className="p-4 font-bold text-center">狀態</th>
            <th className="p-4 font-bold">姓名</th>
            <th className="p-4 font-bold">開立時間</th>
            <th className="p-4 font-bold">開始執行</th>
            {/* 新增: 判斷是否為全院清單以替換為調配體積 */}
            <th className="p-4 font-bold text-right">{isGlobal ? '調配體積' : '給藥體積'}</th>
            <th className="p-4 font-bold">開立者</th>
            {/* 新增: 調配藥師欄位 */}
            <th className="p-4 font-bold">調配藥師</th>
            <th className="p-4 font-bold text-center">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map(o => (
            <tr key={o.orderId} className="hover:bg-blue-50 transition group">
              <td className="p-4 font-mono font-bold text-indigo-900">
                {o.orderId} <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 ml-1">v{o.version}</span>
              </td>
              <td className="p-4 text-center">
                <span className={`px-3 py-1 rounded-full text-xs border ${statusColors[o.status]}`}>
                  {o.status === 'Submitted' ? '醫師完成' : o.status === 'Dispensed' ? '已調配' : o.status === 'Draft' ? '暫存中' : o.status === 'Void' ? '作廢' : '刪除'}
                </span>
              </td>
              <td className="p-4 font-bold text-gray-800">{isGlobal ? o.patient?.name : patientName}</td>
              <td className="p-4 text-gray-500 text-xs font-mono">{formatDateTime(o.date)}</td>
              <td className="p-4 text-gray-800 font-bold font-mono">{o.startDate} <span className="text-xs">{o.startTime}</span></td>
              <td className="p-4 text-right font-black text-blue-900">
                {/* 新增: 判斷是否為全院清單以顯示對應體積數值 */}
                {Number(isGlobal ? o.prepVol : o.calcAdminVol).toFixed(0)} <span className="text-xs font-normal text-gray-500">mL</span>
              </td>
              <td className="p-4 text-gray-600 font-bold text-xs">{o.authorName}</td>
              <td className="p-4 text-gray-600 font-bold text-xs">{o.dispenserName || '-'}</td>
              <td className="p-4 text-center">
                <button onClick={() => onEdit(o)} className="text-white bg-indigo-600 px-4 py-1.5 rounded-lg shadow-sm hover:bg-indigo-700 font-bold text-xs transition transform group-hover:scale-105">
                  {/* 新增: 如果是全院清單，顯示 覆核/調配，否則維持 檢視/修改 */}
                  {isGlobal ? '覆核/調配' : '檢視/修改'}
                </button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan="9" className="p-10 text-center text-gray-400 font-bold text-lg">尚無紀錄</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================
// 6. 處方開立/編輯表單核心邏輯
// ==========================================
function OrderFormView({ db, setDb, apiSync, patient, admission, user, order, onBack, showAlert }) {
  const [formData, setFormData] = useState(() => {
    if (order) {
      const parsed = JSON.parse(JSON.stringify(order));
      if (!parsed.otherAdditions) parsed.otherAdditions = { znso4: '', heparin: '', lyo: '', peditrace: '' };
      if (!parsed.startDate) parsed.startDate = getTodayLocal();
      if (!parsed.startTime) parsed.startTime = '14:00';
      if (!parsed.durationDays) parsed.durationDays = 1;
      if (parsed.lipid === undefined) parsed.lipid = '';
      if (parsed.useGlycophos === undefined) parsed.useGlycophos = true;
      if (parsed.useSodiumAcetate === undefined) parsed.useSodiumAcetate = false;
      return parsed;
    }
    return {
      // ✅ 修改點：使用自訂的 generateOrderId 取代原本的 generateId('TPN')
      orderId: generateOrderId(admission?.encounterId, db.orders), 
      groupId: generateId('G'), 
      version: 1, 
      status: 'Draft',
      encounterId: admission?.encounterId || '', date: new Date().toISOString(), authorId: user.id, authorName: user.name, parentOrderId: null,
      weight: '', height: '', startDate: getTodayLocal(), startTime: '14:00', durationDays: 1, packageCode: '', prepVol: '', rate: '', calcAdminVol: 0,
      lipid: '',
      useGlycophos: true, // 新增：預設勾選
      useSodiumAcetate: false, // 新增：預設不勾選
      elements: ELEMENTS.reduce((acc, el) => { acc[el.key] = { conc: 0, dose: 0, remark: '' }; return acc; }, {}),
      otherAdditions: { znso4: '', heparin: '', lyo: '', peditrace: '' },
      dispenserId: '', dispenserName: '' // 預留欄位供寫入
    };
  });

  const isReadOnly = formData.status !== 'Draft';
  const [validationErrors, setValidationErrors] = useState({});
  
  const ageDays = getAgeInDays(patient?.dob, formData.startDate);

  useEffect(() => {
    const vol = parseFloat(formData.rate) * 24;
    setFormData(prev => ({ ...prev, calcAdminVol: isNaN(vol) ? 0 : vol }));
  }, [formData.rate]);

  // --- 新增：專門處理 Cl (氯) 邏輯的自動計算引擎 ---
  useEffect(() => {
    if (isReadOnly) return;

    const pDose = Number(formData.elements.p?.dose) || 0;
    const naDose = Number(formData.elements.na?.dose) || 0;
    const kDose = Number(formData.elements.k?.dose) || 0;

    // 步驟 1: 計算 Extra Na
    const pBase = Number((pDose * 2).toFixed(1));
    const extraNa = Math.max(0, naDose - (formData.useGlycophos ? pBase : 0));
    
    // 步驟 2: 計算 Cl 總量與對應備註
    let clDose = 0;
    let remark = "";

    if (extraNa > 0.0001) {
      if (formData.useSodiumAcetate) {
        clDose = kDose; // 額外的 Na 來自 Acetate，不帶入 Cl
        remark = "自動計算 (僅含 KCl，額外鈉來自 Acetate)";
      } else {
        clDose = kDose + extraNa; // 額外的 Na 來自 3% NaCl，1:1 帶入 Cl
        remark = "自動計算 (KCl + 3% NaCl)";
      }
    } else {
      clDose = kDose;
      remark = "自動計算 (僅含 KCl)";
    }

    clDose = Number(clDose.toFixed(1));

    // 更新 Cl 的處方濃度 (Conc)
    const wt = parseFloat(formData.weight) || 0;
    const volL = (formData.calcAdminVol || 0) / 1000;
    let clConc = 0;
    if (wt > 0 && volL > 0) {
      clConc = (clDose * wt) / volL;
    }

    // 為了防止無限 Re-render，先比對數值是否真的有改變
    setFormData(prev => {
      if (
        Math.abs(Number(prev.elements.cl.dose) - clDose) < 0.0001 &&
        prev.elements.cl.remark === remark
      ) {
        return prev;
      }
      return {
        ...prev,
        elements: {
          ...prev.elements,
          cl: { ...prev.elements.cl, dose: clDose, conc: clConc, remark: remark }
        }
      };
    });

  }, [
    formData.elements.p?.dose,
    formData.elements.na?.dose,
    formData.elements.k?.dose,
    formData.useGlycophos,
    formData.useSodiumAcetate,
    formData.weight,
    formData.calcAdminVol,
    isReadOnly
  ]);
  // ------------------------------------------------

  useEffect(() => {
    if (!isReadOnly && formData.weight && formData.calcAdminVol) {
      setFormData(prev => {
        const volL = prev.calcAdminVol / 1000;
        const wt = parseFloat(prev.weight);
        const newElements = { ...prev.elements };
        let hasChanges = false;

        ELEMENTS.forEach(el => {
          if (el.key === 'cl') return; // Cl 由上面的專屬 useEffect 負責，這裡跳過

          const concVal = prev.elements[el.key].conc;
          let doseVal = 0;
          if (el.isGIR) { doseVal = ((concVal * volL) / wt) * (1000 / 1440); } 
          else { doseVal = (concVal * volL) / wt; }

          if (Math.abs(Number(newElements[el.key].dose) - doseVal) > 0.0001) {
            newElements[el.key] = { ...newElements[el.key], dose: doseVal };
            hasChanges = true;
          }
        });
        return hasChanges ? { ...prev, elements: newElements } : prev;
      });
    }
  }, [formData.weight, formData.calcAdminVol, isReadOnly]);

  const handlePackageChange = (e) => {
    const newPkgCode = e.target.value;
    setFormData(prev => {
      const newState = { ...prev, packageCode: newPkgCode };
      if (newPkgCode && newPkgCode !== 'C01') {
        const pkg = db.packages.find(p => String(p.code) === String(newPkgCode));
        if(!pkg) return newState; // 當選到 -modified 的項目，跳過重設元素直接返回
        
        const newElements = { ...prev.elements };
        const volL = prev.calcAdminVol ? prev.calcAdminVol / 1000 : 0;
        const wt = prev.weight ? parseFloat(prev.weight) : 0;

        ELEMENTS.forEach(el => {
          const concVal = pkg[el.key] || 0;
          let doseVal = 0;
          if (volL > 0 && wt > 0) {
            if (el.isGIR) doseVal = ((concVal * volL) / wt) * (1000 / 1440);
            else doseVal = (concVal * volL) / wt;
          }
          newElements[el.key] = { ...newElements[el.key], conc: concVal, dose: doseVal };
        });
        newState.elements = newElements;
      }
      return newState;
    });
  };

  const handleDoseChange = (key, newDoseStr) => {
    if (key === 'kcal' || key === 'cl') return; // 防呆：熱量與氯均鎖定不允許手動修改
    const newDose = parseFloat(newDoseStr);
    const wt = parseFloat(formData.weight);
    const volL = formData.calcAdminVol / 1000;

    if (isNaN(newDose) || !wt || !volL) {
      setFormData(prev => ({ ...prev, elements: { ...prev.elements, [key]: { ...prev.elements[key], dose: newDoseStr } }}));
      return;
    }

    let newConc = 0;
    const isGIR = ELEMENTS.find(e => e.key === key).isGIR;

    if (isGIR) { newConc = ((newDose * (1440 / 1000)) * wt) / volL; } 
    else { newConc = (newDose * wt) / volL; }

    setFormData(prev => {
      const newElements = { ...prev.elements, [key]: { ...prev.elements[key], dose: newDoseStr, conc: newConc } };
      if (key === 'cho' || key === 'aa') {
        const choConc = key === 'cho' ? newConc : prev.elements.cho.conc;
        const aaConc = key === 'aa' ? newConc : prev.elements.aa.conc;
        const newKcalConc = (choConc * 3.4) + (aaConc * 4);
        const newKcalDose = (newKcalConc * volL) / wt;
        newElements.kcal = { ...newElements.kcal, conc: newKcalConc, dose: newKcalDose };
      }

      // --- P 與 Na 的單向地板連動 (當調高 P 時) ---
      if (key === 'p' && prev.useGlycophos) {
        const pDoseNum = parseFloat(newDoseStr) || 0;
        const minNa = Number((pDoseNum * 2).toFixed(1));
        const currentNa = parseFloat(prev.elements.na.dose) || 0;
        
        if (currentNa < minNa) {
          const naWt = parseFloat(prev.weight) || 0;
          const naVolL = (prev.calcAdminVol || 0) / 1000;
          let naConc = 0;
          if (naWt > 0 && naVolL > 0) {
            naConc = (minNa * naWt) / naVolL;
          }
          newElements.na = { ...prev.elements.na, dose: minNa.toString(), conc: naConc };
        }
      }

      // --- 判斷並寫入 -modified ---
      let newPackageCode = prev.packageCode;
      if (newPackageCode && newPackageCode !== 'C01' && !newPackageCode.endsWith('-modified')) {
        newPackageCode = `${newPackageCode}-modified`;
      } else if (!newPackageCode) {
        newPackageCode = 'C01';
      }

      return { ...prev, packageCode: newPackageCode, elements: newElements };
    });
  };

  // --- 2. 處理離開欄位 (onBlur) 的 Na 地板強制彈回與警告 ---
  const handleDoseBlur = (key) => {
    if (key === 'na' && formData.useGlycophos) {
      const currentNa = parseFloat(formData.elements.na.dose) || 0;
      const currentP = parseFloat(formData.elements.p.dose) || 0;
      const minNa = Number((currentP * 2).toFixed(1));
      
      if (currentNa < minNa) {
        showAlert(`因使用 Glycophos，Na 劑量不可低於 P 的兩倍 (最低 ${minNa.toFixed(1)} mEq/kg)`);
        handleDoseChange('na', minNa.toString()); // 強制彈回 P*2
      }
    }
  };
  // ---------------------------------------------------------------

  const validateOrder = () => {
    if (!formData.weight || !formData.height || !formData.rate || !formData.packageCode || !formData.startDate || !formData.startTime || !formData.prepVol) {
      showAlert('請填寫所有必填欄位 (身高、體重、速率、調配體積、處方套餐、時間)');
      return false;
    }
    const prepVolNum = parseFloat(formData.prepVol);
    if (isNaN(prepVolNum) || prepVolNum <= formData.calcAdminVol) {
      showAlert(`調配體積 (${prepVolNum} mL) 必須大於 給藥體積 (${formData.calcAdminVol.toFixed(1)} mL)`);
      return false;
    }
    const errors = {};
    ELEMENTS.forEach(el => {
      const dose = Number(formData.elements[el.key].dose);
      const limit = db.limits[el.key];
      if (limit && (dose < Number(limit.min) || dose > Number(limit.max))) {
        errors[el.key] = `超出範圍 (${limit.min}~${limit.max})`;
      }
    });
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) { showAlert('部分劑量超出安全範圍，請修正後再提交'); return false; }
    
    const activeRules = db.auditRules.filter(r => r.isActive);
    for (let rule of activeRules) {
      if (!evaluateCondition(rule.condition, formData)) {
        showAlert(`【稽核警示】${rule.description} (違反規則: ${rule.condition})`);
        return false;
      }
    }

    return true;
  };

  const saveOrder = (newStatus) => {
    if (newStatus === 'Submitted' && !validateOrder()) return;
    let finalOrder = { ...formData, status: newStatus, date: new Date().toISOString() };

    // === 新增：如果由藥師確認調配，寫入調配藥師資訊 ===
    if (newStatus === 'Dispensed' && user.role === 'pharmacist') {
      finalOrder.dispenserId = user.id;
      finalOrder.dispenserName = user.name;
    }

    const saveNewOrder = () => {
      apiSync('saveRecord', 'orders', 'orderId', finalOrder, () => {
        setDb(prev => {
          let newOrders = [...prev.orders];
          if (newStatus === 'Submitted' && finalOrder.parentOrderId) {
            newOrders = newOrders.map(o => String(o.orderId) === String(finalOrder.parentOrderId) ? { ...o, status: 'Void' } : o);
          }
          const existingIdx = newOrders.findIndex(o => String(o.orderId) === String(finalOrder.orderId));
          if (existingIdx >= 0) newOrders[existingIdx] = finalOrder; else newOrders.push(finalOrder);
          return { ...prev, orders: newOrders };
        });
        onBack();
      });
    };

    if (newStatus === 'Submitted' && finalOrder.parentOrderId) {
      const oldOrder = db.orders.find(o => String(o.orderId) === String(finalOrder.parentOrderId));
      if (oldOrder) {
        apiSync('saveRecord', 'orders', 'orderId', { ...oldOrder, status: 'Void' }, saveNewOrder);
        return;
      }
    }
    saveNewOrder();
  };

  const handleRevise = () => {
    if (formData.status === 'Dispensed') return showAlert('藥師已調配，禁止直接修改！請聯繫藥局。');
    setFormData(prev => ({
      ...prev, 
      // ✅ 修改點：修改處方時也給予新的特定規則流水號
      orderId: generateOrderId(prev.encounterId, db.orders), 
      version: prev.version + 1, 
      status: 'Draft', 
      parentOrderId: prev.orderId, 
      date: new Date().toISOString()
    }));
  };

  const handleDelete = () => {
    if (confirm('確定要刪除此暫存處方嗎？')) {
      apiSync('saveRecord', 'orders', 'orderId', { ...formData, status: 'Deleted' }, () => {
        setDb(prev => ({ ...prev, orders: prev.orders.map(o => String(o.orderId) === String(formData.orderId) ? { ...o, status: 'Deleted' } : o) }));
        onBack();
      });
    }
  };

  const renderDispensingSimulation = () => {
    let totalMedsVol = 0;
    const targetVol = parseFloat(formData.prepVol) || 0;
    
    const medRows = db.medications.filter(m => m.isActive).map(med => {
      const vol = evaluateFormula(med.formula, formData);
      const isNum = typeof vol === 'number' && !isNaN(vol);
      if (isNum) totalMedsVol += vol;
      return { ...med, calculatedVol: isNum ? vol : 'Error' };
    }).sort((a,b) => a.seq - b.seq);

    const wfiVol = targetVol - totalMedsVol;
    const isOverload = wfiVol < 0;

    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-indigo-100 mt-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Beaker size={120} /></div>
        
        <div className="flex justify-between items-end mb-4 border-b-2 border-indigo-100 pb-2 relative z-10">
          <h3 className="text-xl font-black flex items-center gap-2 text-indigo-900">
            <span className="bg-indigo-600 text-white w-7 h-7 rounded-full inline-flex justify-center items-center text-sm shadow">5</span> 
            調配抽藥明細 (Dispensing Simulation)
          </h3>
          <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
            目標調配體積: <span className="text-lg font-black">{targetVol}</span> mL
          </span>
        </div>

        <div className="overflow-x-auto relative z-10">
          <table className="w-full text-sm text-left">
            <thead className="bg-indigo-50 text-indigo-900 border-b-2 border-indigo-200">
              <tr>
                <th className="p-3 font-bold rounded-tl-lg">藥品/材料名稱</th>
                <th className="p-3 font-bold text-gray-500">換算公式</th>
                <th className="p-3 font-black text-right text-indigo-700 rounded-tr-lg">應抽取量</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {medRows.map(row => (
                <tr key={row.id} className="hover:bg-indigo-50/50">
                  <td className="p-3 font-bold text-gray-800 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-400"></div> {row.name}
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-400">{row.formula}</td>
                  <td className="p-3 text-right">
                    <span className={`font-black text-lg ${row.calculatedVol > 0 ? 'text-indigo-800' : 'text-gray-300'}`}>
                      {row.calculatedVol}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">{row.unit}</span>
                  </td>
                </tr>
              ))}
              
              <tr className={`${isOverload ? 'bg-red-50' : 'bg-blue-50'} border-t-2 border-indigo-200`}>
                <td className="p-4 font-black text-blue-900 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div> Sterile Water (WFI) 加水補足
                </td>
                <td className="p-4 font-mono text-xs text-blue-500 text-right">Target - Sum(Meds)</td>
                <td className="p-4 text-right">
                  {isOverload ? (
                    <span className="text-red-600 font-black text-xl bg-red-100 px-3 py-1 rounded border border-red-300 shadow-inner">
                      不足 {-wfiVol.toFixed(1)} mL !
                    </span>
                  ) : (
                    <>
                      <span className="font-black text-2xl text-blue-700">{wfiVol.toFixed(1)}</span>
                      <span className="text-xs text-blue-500 ml-1 font-bold">mL</span>
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {isOverload && (
          <div className="mt-4 bg-red-600 text-white p-4 rounded-xl shadow-lg flex items-center gap-3 animate-bounce">
            <AlertTriangle size={24} />
            <div>
              <div className="font-black text-lg">嚴重警告：處方藥品總體積已超過目標調配體積！</div>
              <div className="text-sm font-medium opacity-90">目前藥液總和為 {totalMedsVol.toFixed(1)} mL，但目標調配體積僅設定為 {targetVol} mL，請增加調配體積或降低處方濃度。</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white p-5 rounded-2xl shadow-sm flex flex-wrap justify-between items-center border-l-8 border-blue-700">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
          <div>
            <h2 className="text-2xl font-black flex items-center gap-3 text-gray-800">
              TPN 處方單 
              <span className="text-sm font-mono bg-blue-50 text-blue-800 px-3 py-1 rounded-full border border-blue-200 shadow-inner">
                {formData.orderId} <span className="text-blue-500 ml-1">v{formData.version}</span>
              </span>
            </h2>
            <div className="text-sm text-gray-500 font-bold mt-1">群組: {formData.groupId} {formData.parentOrderId && `| 修改自: ${formData.parentOrderId}`}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-400">目前狀態</span>
          {formData.status === 'Draft' && <span className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded-full text-sm font-black shadow-sm">暫存編輯中</span>}
          {formData.status === 'Submitted' && <span className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-black flex items-center gap-1 shadow"><CheckCircle size={16}/> 醫師完成</span>}
          {formData.status === 'Dispensed' && <span className="bg-green-500 text-white px-4 py-1.5 rounded-full text-sm font-black flex items-center gap-1 shadow"><CheckCircle size={16}/> 藥師已調配</span>}
          {formData.status === 'Void' && <span className="bg-red-100 text-red-600 border border-red-300 px-4 py-1.5 rounded-full text-sm font-black line-through">已作廢</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-blue-900 border-b-2 border-gray-100 pb-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm shadow">1</span> 基本資料
            </h3>
            <div className="grid grid-cols-2 gap-y-4 text-sm bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4">
              <div className="text-gray-500 font-bold">病歷號</div><div className="font-black text-gray-800 text-right">{patient?.mrn}</div>
              <div className="text-gray-500 font-bold">姓名/性別</div><div className="font-black text-gray-800 text-right">{patient?.name} / {patient?.gender}</div>
              <div className="text-gray-500 font-bold">日齡</div><div className="font-black text-blue-700 text-right">{ageDays} 天</div>
              <div className="text-gray-500 font-bold">就醫/床號</div><div className="font-black text-gray-800 text-right">{admission?.encounterId} / {admission?.bed}</div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">體重 (kg) <span className="text-red-500">*</span></label>
                <input type="number" step="0.001" value={formData.weight} onChange={e=>setFormData(prev => ({...prev, weight: e.target.value}))} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-lg disabled:bg-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">身高 (cm) <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" value={formData.height} onChange={e=>setFormData(prev => ({...prev, height: e.target.value}))} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-lg disabled:bg-gray-100" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-blue-900 border-b-2 border-gray-100 pb-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm shadow">2</span> 處方開立
            </h3>
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1">處方開始時間 <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <input type="date" value={formData.startDate} onChange={e=>setFormData(prev => ({...prev, startDate: e.target.value}))} disabled={isReadOnly} className="w-full border-2 border-blue-200 p-2 rounded-lg font-bold disabled:bg-transparent" />
                    <input type="text" maxLength="5" placeholder="HH:mm" value={formData.startTime} onChange={e => { let val = e.target.value.replace(/[^\d:]/g, ''); if (val.length === 2 && !val.includes(':') && formData.startTime.length < val.length) val += ':'; setFormData(prev => ({...prev, startTime: val})); }} disabled={isReadOnly} className="w-20 shrink-0 border-2 border-blue-200 p-2 rounded-lg font-bold text-center disabled:bg-transparent" />
                  </div>
                </div>
                <div className="flex gap-4 items-center">
                  <span className="text-xs font-bold text-blue-800">天數 <span className="text-red-500">*</span></span>
                  <label className="flex items-center gap-1 cursor-pointer font-bold"><input type="checkbox" checked={formData.durationDays===1} onChange={()=>setFormData(prev => ({...prev, durationDays: 1}))} disabled={isReadOnly} className="w-4 h-4 rounded text-blue-600"/> 1 天</label>
                  <label className="flex items-center gap-1 cursor-pointer font-bold"><input type="checkbox" checked={formData.durationDays===2} onChange={()=>setFormData(prev => ({...prev, durationDays: 2}))} disabled={isReadOnly} className="w-4 h-4 rounded text-blue-600"/> 2 天</label>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border-2 border-indigo-100 shadow-sm space-y-4 relative">
                <div className="absolute top-0 right-0 bg-indigo-100 text-indigo-800 text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-[10px]">主靜脈營養 (Main TPN)</div>
                
                <div className="pt-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">標準處方套餐 <span className="text-red-500">*</span></label>
                  <select value={formData.packageCode} onChange={handlePackageChange} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-bold disabled:bg-gray-100 text-blue-900 bg-gray-50">
                    <option value="">-- 請選擇 --</option>
                    {db.packages.map(p => <option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}
                    {/* 新增動態選項，如果 packageCode 為手動 modified 的狀態且不在清單內，長出此選項供顯示 */}
                    {formData.packageCode && !db.packages.find(p => String(p.code) === String(formData.packageCode)) && (
                      <option value={formData.packageCode}>{formData.packageCode}</option>
                    )}
                  </select>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">調配體積 (mL) <span className="text-red-500">*</span></label>
                    <input type="number" value={formData.prepVol} onChange={e=>setFormData(prev => ({...prev, prepVol: e.target.value}))} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-black text-lg text-indigo-700 disabled:bg-gray-100" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Rate (mL/hr) <span className="text-red-500">*</span></label>
                    <input type="number" step="0.1" value={formData.rate} onChange={e=>setFormData(prev => ({...prev, rate: e.target.value}))} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-black text-lg text-blue-700 disabled:bg-gray-100" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">給藥體積 (mL/d)</label>
                    <input type="text" value={formData.calcAdminVol.toFixed(1)} disabled className="w-full border-2 p-3 rounded-xl outline-none font-black text-lg text-green-600 bg-gray-100 border-gray-200 cursor-not-allowed" />
                  </div>
                </div>
              </div>

              {/* === 脂肪乳劑 (Lipid) === */}
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 shadow-sm relative">
                <div className="absolute top-0 right-0 bg-purple-200 text-purple-800 text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-[10px]">脂肪乳劑 (Lipid) 0.2g/mL</div>
                <div className="pt-2">
                  <p className="text-[11px] text-purple-600 font-bold leading-tight mb-3">※ 獨立管路輸注 20 小時，不混入主 TPN 袋中</p>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-purple-900 mb-1">日劑量 (mL)</label>
                      <input type="number" step="0.1" value={formData.lipid} onChange={e=>setFormData(prev => ({...prev, lipid: e.target.value}))} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl border-purple-200 focus:border-purple-500 outline-none font-black text-lg text-purple-800 disabled:bg-purple-100/50 bg-white" placeholder="0.0" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-purple-900 mb-1">Lipid (g/kg)</label>
                      <input type="text" value={parseFloat(formData.weight) > 0 ? ((parseFloat(formData.lipid) || 0) * 0.2 / parseFloat(formData.weight)).toFixed(1) : "0.0"} disabled className="w-full border-2 p-3 rounded-xl outline-none font-black text-lg text-purple-600 bg-purple-100/50 border-purple-200 cursor-not-allowed" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-purple-900 mb-1">日熱量 (Kcal)</label>
                      <input type="text" value={((parseFloat(formData.lipid) || 0) * 2).toFixed(1).replace(/\.0$/, '')} disabled className="w-full border-2 p-3 rounded-xl outline-none font-black text-lg text-purple-600 bg-purple-100/50 border-purple-200 cursor-not-allowed" />
                    </div>
                  </div>
                </div>
              </div>
              {/* ================================= */}

            </div>
          </div>
        </div>

        <div className="xl:col-span-8 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex-1">
            <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 border-b-2 border-gray-100 pb-2 gap-4">
              <h3 className="text-lg font-black flex items-center gap-2 text-blue-900 shrink-0">
                <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm shadow">3</span> 成分與劑量調整
              </h3>
              
              {/* --- 勾選框邏輯 --- */}
              <div className="flex flex-wrap gap-3">
                <label className={`flex items-center gap-2 cursor-pointer text-xs font-bold px-3 py-1.5 rounded-lg border transition ${formData.useGlycophos ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  <input type="checkbox" checked={formData.useGlycophos} onChange={e => {
                    const checked = e.target.checked;
                    setFormData(p => {
                      const newState = {...p, useGlycophos: checked};
                      // 防漏設計：當重新勾選 Glycophos 時，立刻檢查並連動 Na
                      if (checked) {
                        const currentP = parseFloat(p.elements.p.dose) || 0;
                        const minNa = Number((currentP * 2).toFixed(1));
                        const currentNa = parseFloat(p.elements.na.dose) || 0;
                        if (currentNa < minNa) {
                          const naWt = parseFloat(p.weight) || 0;
                          const naVolL = (p.calcAdminVol || 0) / 1000;
                          let naConc = 0;
                          if (naWt > 0 && naVolL > 0) naConc = (minNa * naWt) / naVolL;
                          newState.elements = {
                            ...p.elements,
                            na: { ...p.elements.na, dose: minNa.toString(), conc: naConc }
                          };
                          
                          // 同步套用 -modified
                          if (newState.packageCode && newState.packageCode !== 'C01' && !newState.packageCode.endsWith('-modified')) {
                            newState.packageCode = `${newState.packageCode}-modified`;
                          } else if (!newState.packageCode) {
                            newState.packageCode = 'C01';
                          }

                          showAlert(`勾選 Glycophos，Na 劑量已自動提升為 P 的兩倍 (最低 ${minNa.toFixed(1)} mEq/kg)`);
                        }
                      }
                      return newState;
                    });
                  }} disabled={isReadOnly} className="w-4 h-4 rounded text-blue-600 cursor-pointer" />
                  使用 Glycophos
                </label>
                <label className={`flex items-center gap-2 cursor-pointer text-xs font-bold px-3 py-1.5 rounded-lg border transition ${formData.useSodiumAcetate ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  <input type="checkbox" checked={formData.useSodiumAcetate} onChange={e => setFormData(p => ({...p, useSodiumAcetate: e.target.checked}))} disabled={isReadOnly} className="w-4 h-4 rounded text-blue-600 cursor-pointer" />
                  額外補鈉用 Sodium Acetate (不增Cl)
                </label>
              </div>
              {/* ------------------------- */}

            </div>
            
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-left w-1/4 font-bold">成分名稱</th>
                    <th className="p-3 text-right w-1/4 font-bold">處方濃度</th>
                    <th className="p-3 text-right w-1/4 bg-yellow-100/50 font-black text-yellow-900 border-x border-yellow-200">劑量/體重 (可編輯)</th>
                    <th className="p-3 text-left w-1/4 font-bold">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ELEMENTS.map(el => {
                    const data = formData.elements[el.key];
                    const hasError = validationErrors[el.key];
                    const isCl = el.key === 'cl'; // 識別是否為氯
                    const isDisabled = isReadOnly || el.key === 'kcal' || isCl; // 鎖定 kcal 與 cl
                    
                    // --- 新增：動態判斷是否被手動修改過 ---
                    let isModified = false;
                    if (formData.packageCode) {
                      const basePkgCode = formData.packageCode.replace('-modified', '');
                      const basePkg = db.packages.find(p => String(p.code) === String(basePkgCode));
                      // 如果有選標準處方，且該項目不是純自訂(C01)，也不是系統鎖死的 Cl 和 Kcal
                      if (basePkg && basePkgCode !== 'C01' && !isCl && el.key !== 'kcal') {
                        const originalConc = basePkg[el.key] || 0;
                        // 比較目前的處方濃度是否與原始標準處方濃度不同 (容許浮點數誤差)
                        if (Math.abs(Number(data.conc) - Number(originalConc)) > 0.1) {
                          isModified = true;
                        }
                      }
                    }
                    // -------------------------------------
                    
                    return (
                      <tr key={el.key} className={hasError ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                        <td className="p-3 font-bold text-gray-700 align-middle">
                          {el.label} 
                          {isCl && <span className="ml-1 text-[10px] bg-gray-200 text-gray-500 px-1 rounded">Auto</span>}
                          {/* 新增：有調整的紅色小標籤 */}
                          {isModified && <span className="ml-1 text-[10px] bg-red-100 border border-red-200 text-red-600 px-1.5 py-0.5 rounded font-black shadow-sm">有調整</span>}
                        </td>
                        <td className="p-3 text-right align-middle">
                          <span className={`font-mono font-bold text-lg mr-1 ${isCl ? 'text-gray-400' : 'text-gray-800'}`}>
                            {Number(data.conc).toFixed(1)}
                          </span>
                          <span className="text-xs text-gray-400">{el.unit1}</span>
                        </td>
                        <td className={`p-3 text-right border-x align-middle relative ${isCl ? 'bg-gray-50 border-gray-100' : 'bg-yellow-50/30 border-yellow-100'}`}>
                          <div className="flex items-center justify-end gap-2">
                            <input 
                              type="number" step="0.1" 
                              value={data.dose === 0 ? '' : (typeof data.dose === 'number' ? Number(data.dose).toFixed(1).replace(/\.?0+$/, '') : data.dose)} 
                              onChange={(e) => handleDoseChange(el.key, e.target.value)}
                              onBlur={() => handleDoseBlur(el.key)}
                              disabled={isDisabled}
                              className={`w-20 text-right p-2 border-2 rounded-lg font-black text-lg focus:outline-none transition-colors
                                ${hasError ? 'border-red-400 focus:border-red-600 bg-red-50 text-red-700' : 
                                 (isCl ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'border-yellow-300 focus:border-yellow-600 bg-white text-gray-800')} 
                                disabled:bg-transparent disabled:border-transparent ${el.key === 'kcal' ? 'text-blue-800' : ''}`}
                            />
                            <span className="text-xs font-bold text-gray-500 w-16 text-left">{el.unit2}</span>
                          </div>
                          {hasError && <div className="text-[10px] text-red-600 font-black absolute right-20 bottom-0 translate-y-full pt-1">{hasError}</div>}
                        </td>
                        <td className="p-3 align-middle">
                          <input 
                            type="text" 
                            value={data.remark} 
                            onChange={e => setFormData(p => ({...p, elements: {...p.elements, [el.key]: {...p.elements[el.key], remark: e.target.value}}}))} 
                            disabled={isReadOnly || isCl} // Cl 的備註也鎖定唯讀
                            className={`w-full p-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400
                              ${isCl ? 'bg-gray-50 text-blue-700 font-bold border-transparent' : 'disabled:bg-transparent disabled:border-transparent'}`} 
                            placeholder={isReadOnly ? '' : (isCl ? '' : "備註")} 
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* === 4. 其他添加 (Additions) === */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-blue-900 border-b-2 border-gray-100 pb-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm shadow">4</span> 其他添加 (Additions)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {OTHER_ADDITIONS.map(item => {
                const val = formData.otherAdditions[item.key];
                const wt = parseFloat(formData.weight) || 0;
                const doseVal = parseFloat(val) || 0;
                let calcDisplay = null;

                // 根據項目與體重計算每公斤劑量
                if (item.key === 'znso4' && wt > 0 && doseVal > 0) {
                  const mcgPerKg = (doseVal * 1.35 * 1000) / wt;
                  calcDisplay = `${mcgPerKg.toFixed(1)} mcg/kg`;
                } else if (item.key === 'peditrace' && wt > 0 && doseVal > 0) {
                  const mlPerKg = doseVal / wt;
                  calcDisplay = `${mlPerKg.toFixed(2)} mL/kg`;
                }

                return (
                  <div key={item.key} className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col justify-between h-full">
                    <div>
                      <label 
                        className="block text-sm font-bold text-gray-600 mb-2 whitespace-nowrap overflow-hidden text-ellipsis" 
                        title={item.label}
                      >
                        {item.label}
                      </label>
                      <div className="flex items-center gap-2 border-b-2 border-gray-300 pb-1 focus-within:border-blue-500 transition-colors">
                        <input 
                          type="number" 
                          step={item.key === 'heparin' ? "1" : "0.1"} 
                          value={val} 
                          onChange={e => {
                            let valStr = e.target.value;
                            // 強制鎖定輸入位數 (防呆設計)
                            if (valStr.includes('.')) {
                              const parts = valStr.split('.');
                              if (item.key === 'heparin') {
                                valStr = parts[0]; // Heparin 僅限整數
                              } else {
                                valStr = parts[0] + '.' + parts[1].substring(0, 1); // 其他限制小數點後 1 位
                              }
                            }
                            setFormData(p => ({...p, otherAdditions: { ...p.otherAdditions, [item.key]: valStr }}));
                          }} 
                          disabled={isReadOnly} 
                          className="w-full bg-transparent focus:outline-none text-right font-black text-lg disabled:text-blue-900" 
                          placeholder="0" 
                        />
                        <span className="text-xs font-bold text-gray-400 w-6">{item.unit}</span>
                      </div>
                    </div>
                    {/* 劑量計算結果顯示區 */}
                    <div className="mt-2 h-5 text-right">
                      {calcDisplay ? (
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm">
                          {calcDisplay}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* ======================================= */}
          
        </div>
      </div>

      {user.role === 'pharmacist' && renderDispensingSimulation()}

      <div className="bg-gray-900 p-5 rounded-2xl shadow-xl flex justify-between items-center mt-8 border-t-4 border-gray-700 sticky bottom-4 z-50">
        <div>
          {!isReadOnly && formData.orderId && !formData.parentOrderId && (
            <button onClick={handleDelete} className="text-gray-400 hover:text-red-400 flex items-center gap-2 text-sm font-bold px-4 py-2 rounded hover:bg-gray-800 transition">
              <Trash2 size={18}/> 刪除草稿
            </button>
          )}
        </div>
        <div className="flex gap-4">
          {!isReadOnly && (
            <>
              {!formData.parentOrderId && (
                <button onClick={() => saveOrder('Draft')} className="bg-gray-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-600 transition shadow">
                  儲存暫存
                </button>
              )}
              {['doctor', 'np'].includes(user.role) && (
                <button onClick={() => saveOrder('Submitted')} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black hover:bg-blue-500 transition shadow-lg flex items-center gap-2 text-lg">
                  <CheckCircle size={20}/> 醫師完成送出
                </button>
              )}
            </>
          )}
          {formData.status === 'Submitted' && (
            <>
              {['doctor', 'np'].includes(user.role) && (
                <button onClick={handleRevise} className="bg-yellow-500 text-white px-8 py-3 rounded-xl font-black hover:bg-yellow-400 transition shadow-lg flex items-center gap-2 text-lg">
                  <Edit size={20}/> 修改處方 (新版)
                </button>
              )}
              {user.role === 'pharmacist' && (
                <button onClick={() => saveOrder('Dispensed')} className="bg-green-500 text-white px-8 py-3 rounded-xl font-black hover:bg-green-400 transition shadow-lg flex items-center gap-2 text-lg transform hover:scale-105">
                  <Syringe size={22}/> 確認已調配
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}