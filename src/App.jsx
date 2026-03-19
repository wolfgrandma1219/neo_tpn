import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, Lock, Settings, Users, FileText, Plus, 
  Search, ArrowLeft, Save, CheckCircle, XCircle, 
  Edit, AlertTriangle, Syringe, Trash2, CloudUpload,
  Beaker, Calculator, Activity
} from 'lucide-react';

// === 未來串接 Google Apps Script 的網址請填入此處 ===
const GAS_URL = "https://script.google.com/macros/s/AKfycby6h1FoAxmLKm6ptfrzNfnSLbAmvyp9bPR8hvMQ3T6GRopF-7MuFMV4fy3jZ3QoO82eIg/exec";

// --- 初始化模擬資料 ---
const INITIAL_USERS = [
  { id: 'u1', username: 'admin', password: '123', role: 'admin', name: '系統管理員' },
  { id: 'u2', username: 'dr', password: '123', role: 'doctor', name: '王醫師' },
  { id: 'u3', username: 'np', password: '123', role: 'np', name: '李專師' },
  { id: 'u4', username: 'ph', password: '123', role: 'pharmacist', name: '林藥師' },
];

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

const INITIAL_PACKAGES = [
  { code: 'P01', name: 'Preterm Standard A', kcal: 400, cho: 100, aa: 25, na: 30, k: 20, cl: 30, ca: 15, p: 10, mg: 5 },
  { code: 'P02', name: 'Term Standard B', kcal: 500, cho: 120, aa: 30, na: 40, k: 25, cl: 40, ca: 20, p: 15, mg: 5 },
  { code: 'C01', name: 'Custom (自訂)', kcal: 0, cho: 0, aa: 0, na: 0, k: 0, cl: 0, ca: 0, p: 0, mg: 0 },
];

// 【新增】初始化藥品調配公式資料
const INITIAL_MEDICATIONS = [
  { id: 'm1', name: 'Aminosteril(R) 10%', formula: '[aa] * (V / 1000) / 0.1', unit: 'mL', isActive: true, seq: 1 },
  { id: 'm2', name: 'Dextrose 50%', formula: '[cho] * (V / 1000) / 0.5', unit: 'mL', isActive: true, seq: 2 },
  { id: 'm3', name: 'NaCl 20%', formula: '[na] * (V / 1000) / 3.42', unit: 'mL', isActive: true, seq: 3 },
  { id: 'm4', name: 'KCl 15%', formula: '[k] * (V / 1000) / 2', unit: 'mL', isActive: true, seq: 4 },
  { id: 'm5', name: 'Calcium Gluconate 10%', formula: '[ca] * (V / 1000) / 0.46', unit: 'mL', isActive: true, seq: 5 },
  { id: 'm6', name: 'Heparin (純量)', formula: '[heparin]', unit: 'IU', isActive: true, seq: 6 },
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
  { key: 'znso4', label: 'ZnSO4', unit: 'mL' },
  { key: 'heparin', label: 'Heparin', unit: 'IU' },
  { key: 'lyo', label: 'Lyo-povigent', unit: 'mL' },
  { key: 'peditrace', label: 'Peditrace', unit: 'mL' }
];

// --- 工具函數 ---
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const getAgeInDays = (dob) => {
  if (!dob) return 0;
  const diffTime = Math.abs(new Date() - new Date(dob));
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

// 【核心】動態公式安全解析引擎
const evaluateFormula = (formulaString, formData) => {
  if (!formulaString) return 0;
  try {
    let mathStr = formulaString;
    
    // 替換 V (調配體積) 與 W (體重)
    const prepVol = parseFloat(formData.prepVol) || 0;
    const weight = parseFloat(formData.weight) || 0;
    mathStr = mathStr.replace(/V/g, prepVol);
    mathStr = mathStr.replace(/W/g, weight);

    // 替換 ELEMENTS (處方濃度 conc)
    ELEMENTS.forEach(el => {
      const conc = formData.elements[el.key]?.conc || 0;
      const regex = new RegExp(`\\[${el.key}\\]`, 'gi'); // 支援大小寫不敏感
      mathStr = mathStr.replace(regex, conc);
    });

    // 替換 OTHER_ADDITIONS (直接數值)
    OTHER_ADDITIONS.forEach(item => {
      const val = parseFloat(formData.otherAdditions[item.key]) || 0;
      const regex = new RegExp(`\\[${item.key}\\]`, 'gi');
      mathStr = mathStr.replace(regex, val);
    });

    // 安全運算
    const result = new Function('return ' + mathStr)();
    
    // 確保回傳為合理的數字，避免 NaN 或 Infinity
    if (isNaN(result) || !isFinite(result)) return 0;
    return result < 0 ? 0 : Number(result.toFixed(1));

  } catch (error) {
    console.warn("公式運算錯誤:", formulaString, error);
    return null; // 回傳 null 代表公式解析失敗
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
    medications: INITIAL_MEDICATIONS, // 新增藥品設定
    patients: [
      { mrn: '0123456', name: '測試嬰', dob: '2026-02-15', gender: '男' }
    ],
    admissions: [
      { encounterId: 'I26020001', mrn: '0123456', adminDate: '2026-02-15', dischargeDate: '', bed: 'NICU01', isClosed: false }
    ],
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
      console.error("API 錯誤:", error);
      showAlert(`連線存檔失敗: ${error.message} (目前以本地模式繼續)`);
      // 離線降級處理：即使 API 失敗也執行 Callback，讓前端不卡死
      successCallback(); 
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const fetchAllData = async () => {
      setIsSyncing(true);
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

          setDb({
            users: result.data.users?.length > 0 ? result.data.users : INITIAL_USERS,
            limits: safeLimits,
            packages: result.data.packages?.length > 0 ? result.data.packages : INITIAL_PACKAGES,
            medications: result.data.medications?.length > 0 ? result.data.medications : INITIAL_MEDICATIONS, // 載入藥品公式
            patients: normalizedPatients,
            admissions: normalizedAdmissions,
            orders: normalizedOrders
          });
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error("連線錯誤:", error);
        showAlert(`無法連線至資料庫，使用預設模擬資料。`);
      } finally {
        setIsSyncing(false);
      }
    };

    fetchAllData();
  }, []);

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
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border-l-4 border-red-500 text-red-700 px-6 py-3 rounded shadow-xl z-50 flex items-center gap-3">
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
            <span className="text-sm bg-blue-800 px-3 py-1 rounded-full border border-blue-700 shadow-inner">
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
        {view === 'patients' && <PatientsView db={db} setDb={setDb} apiSync={apiSync} showAlert={showAlert} onSelect={(p) => { setSelectedPatient(p); setView('admissions'); }} />}
        {view === 'admissions' && <AdmissionsView db={db} setDb={setDb} apiSync={apiSync} showAlert={showAlert} patient={selectedPatient} onBack={() => setView('patients')} onSelect={(a) => { setSelectedAdmission(a); setView('orders'); }} />}
        {view === 'orders' && <OrdersView db={db} setDb={setDb} apiSync={apiSync} patient={selectedPatient} admission={selectedAdmission} user={user} onBack={() => setView('admissions')} onEdit={(o) => { setEditingOrder(o); setView('orderForm'); }} showAlert={showAlert} />}
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
// 2. 設定畫面 (Admin) 包含藥品公式設定
// ==========================================
function SettingsView({ db, setDb, apiSync, showAlert }) {
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'doctor', name: '' });
  const [localLimits, setLocalLimits] = useState(db.limits);
  
  // 新增藥品狀態
  const [newMed, setNewMed] = useState({ name: '', formula: '', unit: 'mL', seq: db.medications.length + 1 });
  
  // 公式測試器狀態
  const [testData, setTestData] = useState({ V: '300', W: '2.5', aa: '35', cho: '100', na: '30' });
  const [testResult, setTestResult] = useState(null);

  useEffect(() => { setLocalLimits(db.limits); }, [db.limits]);

  // --- 存檔與刪除邏輯 ---
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
    
    // 儲存前先測試一次公式語法
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

  // 測試公式按鈕
  const runTest = () => {
    if (!newMed.formula) return setTestResult('請先輸入公式');
    const mockFormData = {
      prepVol: testData.V,
      weight: testData.W,
      elements: ELEMENTS.reduce((acc, el) => {
        acc[el.key] = { conc: testData[el.key] || 0 };
        return acc;
      }, {}),
      otherAdditions: {}
    };
    const res = evaluateFormula(newMed.formula, mockFormData);
    if (res === null) setTestResult('❌ 語法錯誤解析失敗');
    else setTestResult(`✅ 計算結果: ${res} ${newMed.unit}`);
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
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

      {/* 區塊 2: 藥品公式管理 (新增功能) */}
      <div className="mb-10 bg-indigo-50 p-5 rounded-xl border border-indigo-100">
        <div className="flex justify-between items-center mb-4 border-b border-indigo-200 pb-3">
          <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2"><Calculator size={20}/> 藥局調配藥品與公式管理</h3>
        </div>
        
        {/* 公式說明 */}
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

        {/* 新增藥品與公式測試 */}
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
          </div>
          
          {/* 測試區 */}
          <div className="bg-indigo-50 p-3 rounded-lg flex items-center gap-3 border border-indigo-100 flex-wrap">
            <span className="text-sm font-bold text-indigo-800">公式測試器 &rarr;</span>
            <div className="flex gap-2 items-center text-xs font-mono">
              V=<input type="text" value={testData.V} onChange={e=>setTestData({...testData, V: e.target.value})} className="w-12 p-1 rounded border text-center"/>
              W=<input type="text" value={testData.W} onChange={e=>setTestData({...testData, W: e.target.value})} className="w-12 p-1 rounded border text-center"/>
              [aa]=<input type="text" value={testData.aa} onChange={e=>setTestData({...testData, aa: e.target.value})} className="w-12 p-1 rounded border text-center"/>
              [cho]=<input type="text" value={testData.cho} onChange={e=>setTestData({...testData, cho: e.target.value})} className="w-12 p-1 rounded border text-center"/>
              [na]=<input type="text" value={testData.na} onChange={e=>setTestData({...testData, na: e.target.value})} className="w-12 p-1 rounded border text-center"/>
            </div>
            <button onClick={runTest} className="bg-white text-indigo-600 border border-indigo-300 px-3 py-1 rounded hover:bg-indigo-100 font-bold text-sm ml-auto">執行測試</button>
            {testResult && <span className="text-sm font-bold bg-white px-3 py-1 rounded border border-indigo-200 text-indigo-900">{testResult}</span>}
            <button onClick={handleAddMedication} className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 font-bold shadow transition ml-4">
              <Plus size={18} className="inline mr-1"/> 新增藥品
            </button>
          </div>
        </div>

        {/* 藥品列表 */}
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

      {/* 區塊 3: 操作者管理 (維持原樣) */}
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
// 3. 病人與就醫紀錄列表 (精簡以節省篇幅，邏輯不變)
// ==========================================
function PatientsView({ db, apiSync, setDb, showAlert, onSelect }) {
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newPt, setNewPt] = useState({ mrn: '', name: '', dob: '', gender: '男' });

  const filtered = db.patients.filter(p => (p.mrn != null && String(p.mrn).includes(search)) || (p.name != null && String(p.name).includes(search)));
  const handleSave = () => {
    if(newPt.mrn.length < 1 || newPt.mrn.length > 7) return showAlert('病歷號須為7碼內');
    if(db.patients.find(p => String(p.mrn) === String(newPt.mrn))) return showAlert('病歷號已存在');
    apiSync('saveRecord', 'patients', 'mrn', newPt, () => {
      setDb(p => ({ ...p, patients: [...p.patients, newPt] })); setShowNew(false); setNewPt({ mrn: '', name: '', dob: '', gender: '男' }); showAlert('建立成功！');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div className="relative w-80">
          <Search className="absolute left-4 top-3 text-gray-400" size={18} />
          <input type="text" placeholder="搜尋病歷號或姓名..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-12 pr-4 py-2.5 border-2 rounded-xl w-full focus:border-blue-500 outline-none font-bold" />
        </div>
        <button onClick={() => setShowNew(true)} className="bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-blue-800 font-bold shadow-md transition">
          <Plus size={18} /> 建立新病人
        </button>
      </div>
      {showNew && (
        <div className="bg-white p-5 rounded-2xl shadow-lg border-2 border-blue-200 flex gap-4 items-end flex-wrap">
          <div><label className="block text-xs font-bold text-gray-600 mb-1">病歷號 (7碼)</label><input type="text" value={newPt.mrn} onChange={e=>setNewPt({...newPt, mrn: e.target.value})} className="border-2 p-2 rounded-lg w-32 focus:border-blue-500 outline-none font-bold text-blue-900" maxLength={7} /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1">姓名</label><input type="text" value={newPt.name} onChange={e=>setNewPt({...newPt, name: e.target.value})} className="border-2 p-2 rounded-lg w-32 focus:border-blue-500 outline-none font-bold" maxLength={6} /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1">生日</label><input type="date" value={newPt.dob} onChange={e=>setNewPt({...newPt, dob: e.target.value})} className="border-2 p-2 rounded-lg w-40 focus:border-blue-500 outline-none font-bold" /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1">性別</label>
            <select value={newPt.gender} onChange={e=>setNewPt({...newPt, gender: e.target.value})} className="border-2 p-2 rounded-lg w-24 focus:border-blue-500 outline-none font-bold">
              <option>男</option><option>女</option>
            </select>
          </div>
          <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold shadow transition mb-0.5"><Save size={18}/></button>
          <button onClick={() => setShowNew(false)} className="text-gray-500 px-4 font-bold hover:text-gray-800 mb-2">取消</button>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
            <tr><th className="p-4 font-bold">病歷號</th><th className="p-4 font-bold">姓名</th><th className="p-4 font-bold text-center">性別</th><th className="p-4 font-bold">出生日期</th><th className="p-4 font-bold text-right">操作</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(p => (
              <tr key={p.mrn} className="hover:bg-blue-50 transition">
                <td className="p-4 font-black text-blue-900 text-lg">{p.mrn}</td><td className="p-4 font-bold text-gray-800">{p.name}</td><td className="p-4 text-center font-bold">{p.gender}</td><td className="p-4 font-mono text-gray-600">{p.dob}</td>
                <td className="p-4 text-right"><button onClick={() => onSelect(p)} className="text-white bg-blue-600 px-4 py-1.5 rounded-lg font-bold shadow hover:bg-blue-700 transition">選擇就醫序號 &rarr;</button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-gray-400 font-bold">查無資料</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdmissionsView({ db, apiSync, setDb, showAlert, patient, onBack, onSelect }) {
  const [showNew, setShowNew] = useState(false);
  const [newAdm, setNewAdm] = useState({ encounterId: '', adminDate: '', dischargeDate: '', bed: '', isClosed: false });
  const [editingAdm, setEditingAdm] = useState(null); 
  const admissions = db.admissions.filter(a => String(a.mrn) === String(patient.mrn));

  const handleSave = () => {
    if(!newAdm.encounterId || !newAdm.adminDate || !newAdm.bed) return showAlert('請填寫必填欄位');
    const recordToSave = { ...newAdm, mrn: patient.mrn };
    apiSync('saveRecord', 'admissions', 'encounterId', recordToSave, () => {
      setDb(p => ({ ...p, admissions: [...p.admissions, recordToSave] })); setShowNew(false); setNewAdm({ encounterId: '', adminDate: '', dischargeDate: '', bed: '', isClosed: false });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 bg-white shadow-sm border border-gray-200 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
        <div>
          <h2 className="text-2xl font-black text-gray-800">就醫序號</h2>
          <p className="text-blue-600 font-bold">{patient.name} ({patient.mrn})</p>
        </div>
      </div>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
        <span className="text-gray-500 font-bold">共 {admissions.length} 筆紀錄</span>
        <button onClick={() => { setShowNew(true); setEditingAdm(null); }} className="bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-blue-800 font-bold shadow-md transition">
          <Plus size={18} /> 建立就醫序號
        </button>
      </div>
      {showNew && (
        <div className="bg-white p-5 rounded-2xl shadow-lg border-2 border-blue-200 flex gap-4 items-end flex-wrap">
          <div><label className="block text-xs font-bold text-gray-600 mb-1">* 就醫序號 (9碼)</label><input type="text" value={newAdm.encounterId} onChange={e=>setNewAdm({...newAdm, encounterId: e.target.value})} className="border-2 p-2 rounded-lg w-32 focus:border-blue-500 outline-none font-bold" maxLength={9} /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1">* 入院日期</label><input type="date" value={newAdm.adminDate} onChange={e=>setNewAdm({...newAdm, adminDate: e.target.value})} className="border-2 p-2 rounded-lg w-40 focus:border-blue-500 outline-none font-bold" /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1">* 床號 (6碼)</label><input type="text" value={newAdm.bed} onChange={e=>setNewAdm({...newAdm, bed: e.target.value})} className="border-2 p-2 rounded-lg w-28 focus:border-blue-500 outline-none font-bold" maxLength={6} /></div>
          <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold shadow transition mb-0.5"><Save size={18}/></button>
          <button onClick={() => setShowNew(false)} className="text-gray-500 px-4 font-bold hover:text-gray-800 mb-2">取消</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {admissions.map(a => (
          <div key={a.encounterId} className={`p-5 rounded-2xl border-2 cursor-pointer transition transform hover:-translate-y-1 ${a.isClosed ? 'bg-gray-50 border-gray-200' : 'bg-white border-blue-200 hover:border-blue-500 shadow-md'}`} onClick={() => onSelect(a)}>
            <div className="flex justify-between mb-3 items-center">
              <span className="font-black text-xl text-blue-900 tracking-tight">{a.encounterId}</span>
              <div className="flex items-center gap-2">
                {a.isClosed ? <span className="bg-gray-200 text-gray-600 px-3 py-1 text-xs rounded-full font-bold">已結案</span> : <span className="bg-green-100 border border-green-300 text-green-700 px-3 py-1 text-xs rounded-full font-bold shadow-sm">住院中</span>}
              </div>
            </div>
            <div className="text-sm font-bold text-gray-600 space-y-1">
              <p>床號：<span className="text-gray-900 text-lg ml-1">{a.bed}</span></p>
              <p className="font-mono mt-2 text-xs text-gray-500">In: {a.adminDate}</p>
            </div>
          </div>
        ))}
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
  const encounterOrders = db.orders.filter(o => String(o.encounterId) === String(admission.encounterId));
  const sortedOrders = [...encounterOrders].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-white shadow-sm border border-gray-200 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
          <div>
            <h2 className="text-2xl font-black text-gray-800">TPN 處方紀錄</h2>
            <p className="text-sm font-bold text-gray-500 mt-1">{patient.name} ({patient.mrn}) | 就醫: {admission.encounterId} | 床號: <span className="text-blue-600">{admission.bed}</span></p>
          </div>
        </div>
        <button onClick={() => ['doctor','np'].includes(user.role) ? onEdit(null) : showAlert('僅醫師或專師可開立新處方')} className="bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-blue-800 font-bold shadow-lg transition">
          <FileText size={18} /> 新開處方單
        </button>
      </div>
      <OrderTable orders={sortedOrders} patientName={patient.name} onEdit={onEdit} />
    </div>
  );
}

function GlobalOrdersView({ db, user, onEdit }) {
  const sortedOrders = db.orders.map(o => {
    const admission = db.admissions.find(a => String(a.encounterId) === String(o.encounterId));
    const patient = admission ? db.patients.find(p => String(p.mrn) === String(admission.mrn)) : { name: '未知' };
    return { ...o, patient, admission };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-blue-900 flex items-center gap-3">
          <Beaker size={28} /> 全院 TPN 處方調配清單
        </h2>
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
            <th className="p-4 font-bold text-right">給藥體積</th>
            <th className="p-4 font-bold">開立者</th>
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
              <td className="p-4 text-right font-black text-blue-900">{Number(o.calcAdminVol).toFixed(0)} <span className="text-xs font-normal text-gray-500">mL</span></td>
              <td className="p-4 text-gray-600 font-bold text-xs">{o.authorName}</td>
              <td className="p-4 text-center">
                <button onClick={() => onEdit(o)} className="text-white bg-indigo-600 px-4 py-1.5 rounded-lg shadow-sm hover:bg-indigo-700 font-bold text-xs transition transform group-hover:scale-105">
                  檢視/執行
                </button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan="8" className="p-10 text-center text-gray-400 font-bold text-lg">尚無紀錄</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================
// 6. 處方開立/編輯表單核心邏輯 (加入 Step 5 調配計算)
// ==========================================
function OrderFormView({ db, setDb, apiSync, patient, admission, user, order, onBack, showAlert }) {
  const [formData, setFormData] = useState(() => {
    if (order) {
      const parsed = JSON.parse(JSON.stringify(order));
      if (!parsed.otherAdditions) parsed.otherAdditions = { znso4: '', heparin: '', lyo: '', peditrace: '' };
      if (!parsed.startDate) parsed.startDate = getTodayLocal();
      if (!parsed.startTime) parsed.startTime = '17:00';
      if (!parsed.durationDays) parsed.durationDays = 1;
      return parsed;
    }
    return {
      orderId: generateId('TPN'), groupId: generateId('G'), version: 1, status: 'Draft',
      encounterId: admission.encounterId, date: new Date().toISOString(), authorId: user.id, authorName: user.name, parentOrderId: null,
      weight: '', height: '', startDate: getTodayLocal(), startTime: '17:00', durationDays: 1, packageCode: '', prepVol: '', rate: '', calcAdminVol: 0,
      elements: ELEMENTS.reduce((acc, el) => { acc[el.key] = { conc: 0, dose: 0, remark: '' }; return acc; }, {}),
      otherAdditions: { znso4: '', heparin: '', lyo: '', peditrace: '' }
    };
  });

  const isReadOnly = formData.status !== 'Draft';
  const [validationErrors, setValidationErrors] = useState({});
  const ageDays = getAgeInDays(patient.dob);

  // --- 計算邏輯區 ---
  useEffect(() => {
    const vol = parseFloat(formData.rate) * 24;
    setFormData(prev => ({ ...prev, calcAdminVol: isNaN(vol) ? 0 : vol }));
  }, [formData.rate]);

  useEffect(() => {
    if (!isReadOnly && formData.weight && formData.calcAdminVol) {
      setFormData(prev => {
        const volL = prev.calcAdminVol / 1000;
        const wt = parseFloat(prev.weight);
        const newElements = { ...prev.elements };
        let hasChanges = false;

        ELEMENTS.forEach(el => {
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
        if(!pkg) return newState;
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
    if (key === 'kcal') return;
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
      const newElements = { ...prev.elements, [key]: { ...prev.elements[key], dose: newDose, conc: newConc } };
      if (key === 'cho' || key === 'aa') {
        const choConc = key === 'cho' ? newConc : prev.elements.cho.conc;
        const aaConc = key === 'aa' ? newConc : prev.elements.aa.conc;
        const newKcalConc = (choConc * 3.4) + (aaConc * 4);
        const newKcalDose = (newKcalConc * volL) / wt;
        newElements.kcal = { ...newElements.kcal, conc: newKcalConc, dose: newKcalDose };
      }
      return { ...prev, packageCode: 'C01', elements: newElements };
    });
  };

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
      const dose = formData.elements[el.key].dose;
      const limit = db.limits[el.key];
      if (limit && (dose < limit.min || dose > limit.max)) {
        errors[el.key] = `超出範圍 (${limit.min}~${limit.max})`;
      }
    });
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) { showAlert('部分劑量超出安全範圍，請修正後再提交'); return false; }
    return true;
  };

  const saveOrder = (newStatus) => {
    if (newStatus === 'Submitted' && !validateOrder()) return;
    let finalOrder = { ...formData, status: newStatus, date: new Date().toISOString() };

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
      ...prev, orderId: generateId('TPN'), version: prev.version + 1, status: 'Draft', parentOrderId: prev.orderId, date: new Date().toISOString()
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

  // --- Step 5 調配計算渲染邏輯 ---
  const renderDispensingSimulation = () => {
    let totalMedsVol = 0;
    const targetVol = parseFloat(formData.prepVol) || 0;
    
    // 計算每項藥品
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
        {/* 背景裝飾 */}
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
              
              {/* 加水補足與總計列 */}
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

        {/* 超量警告 Banner */}
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

  // --- UI 渲染 ---
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 標頭狀態列 */}
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
        {/* 左側：Step 1 & 2 */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-blue-900 border-b-2 border-gray-100 pb-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm shadow">1</span> 基本資料
            </h3>
            <div className="grid grid-cols-2 gap-y-4 text-sm bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4">
              <div className="text-gray-500 font-bold">病歷號</div><div className="font-black text-gray-800 text-right">{patient.mrn}</div>
              <div className="text-gray-500 font-bold">姓名/性別</div><div className="font-black text-gray-800 text-right">{patient.name} / {patient.gender}</div>
              <div className="text-gray-500 font-bold">日齡</div><div className="font-black text-blue-700 text-right">{ageDays} 天</div>
              <div className="text-gray-500 font-bold">就醫/床號</div><div className="font-black text-gray-800 text-right">{admission.encounterId} / {admission.bed}</div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">體重 (kg) <span className="text-red-500">*</span></label>
                <input type="number" step="0.001" value={formData.weight} onChange={e=>setFormData({...formData, weight: e.target.value})} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-lg disabled:bg-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">身高 (cm) <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" value={formData.height} onChange={e=>setFormData({...formData, height: e.target.value})} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-lg disabled:bg-gray-100" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-blue-900 border-b-2 border-gray-100 pb-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm shadow">2</span> 處方設定
            </h3>
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1">處方開始時間 <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <input type="date" value={formData.startDate} onChange={e=>setFormData({...formData, startDate: e.target.value})} disabled={isReadOnly} className="w-full border-2 border-blue-200 p-2 rounded-lg font-bold disabled:bg-transparent" />
                    <input type="text" maxLength="5" placeholder="HH:mm" value={formData.startTime} onChange={e => { let val = e.target.value.replace(/[^\d:]/g, ''); if (val.length === 2 && !val.includes(':') && formData.startTime.length < val.length) val += ':'; setFormData({...formData, startTime: val}); }} disabled={isReadOnly} className="w-20 shrink-0 border-2 border-blue-200 p-2 rounded-lg font-bold text-center disabled:bg-transparent" />
                  </div>
                </div>
                <div className="flex gap-4 items-center">
                  <span className="text-xs font-bold text-blue-800">天數 <span className="text-red-500">*</span></span>
                  <label className="flex items-center gap-1 cursor-pointer font-bold"><input type="checkbox" checked={formData.durationDays===1} onChange={()=>setFormData({...formData, durationDays: 1})} disabled={isReadOnly} className="w-4 h-4 rounded text-blue-600"/> 1 天</label>
                  <label className="flex items-center gap-1 cursor-pointer font-bold"><input type="checkbox" checked={formData.durationDays===2} onChange={()=>setFormData({...formData, durationDays: 2})} disabled={isReadOnly} className="w-4 h-4 rounded text-blue-600"/> 2 天</label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">標準處方套餐 <span className="text-red-500">*</span></label>
                <select value={formData.packageCode} onChange={handlePackageChange} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-bold disabled:bg-gray-100 text-blue-900 bg-gray-50">
                  <option value="">-- 請選擇 --</option>
                  {db.packages.map(p => <option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-700 mb-1">調配體積 (mL) <span className="text-red-500">*</span></label>
                  <input type="number" value={formData.prepVol} onChange={e=>setFormData({...formData, prepVol: e.target.value})} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-black text-lg text-indigo-700 disabled:bg-gray-100" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Rate (mL/hr) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.1" value={formData.rate} onChange={e=>setFormData({...formData, rate: e.target.value})} disabled={isReadOnly} className="w-full border-2 p-3 rounded-xl focus:border-blue-500 outline-none font-black text-lg text-blue-700 disabled:bg-gray-100" />
                </div>
              </div>
              <div className="bg-gray-800 text-white p-4 rounded-xl shadow-inner flex justify-between items-center">
                <span className="font-bold text-gray-300 text-sm">系統計算 給藥體積</span>
                <span className="text-2xl font-black text-green-400">{formData.calcAdminVol.toFixed(1)} <span className="text-sm font-bold">mL/d</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* 右側：Step 3 & 4 */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex-1">
            <div className="flex justify-between items-center mb-6 border-b-2 border-gray-100 pb-2">
              <h3 className="text-lg font-black flex items-center gap-2 text-blue-900">
                <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm shadow">3</span> 成分與劑量調整
              </h3>
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
                    return (
                      <tr key={el.key} className={hasError ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                        <td className="p-3 font-bold text-gray-700 align-middle">{el.label}</td>
                        <td className="p-3 text-right align-middle">
                          <span className="font-mono font-bold text-gray-800 text-lg mr-1">{Number(data.conc).toFixed(1)}</span>
                          <span className="text-xs text-gray-400">{el.unit1}</span>
                        </td>
                        <td className="p-3 text-right bg-yellow-50/30 border-x border-yellow-100 align-middle relative">
                          <div className="flex items-center justify-end gap-2">
                            <input 
                              type="number" step="0.1" 
                              value={data.dose === 0 ? '' : Number(data.dose).toFixed(1).replace(/\.?0+$/, '')} 
                              onChange={(e) => handleDoseChange(el.key, e.target.value)}
                              disabled={isReadOnly || el.key === 'kcal'}
                              className={`w-20 text-right p-2 border-2 rounded-lg font-black text-lg focus:outline-none transition-colors
                                ${hasError ? 'border-red-400 focus:border-red-600 bg-red-50 text-red-700' : 
                                 'border-yellow-300 focus:border-yellow-600 bg-white text-gray-800'} 
                                disabled:bg-transparent disabled:border-transparent ${el.key === 'kcal' ? 'text-blue-800' : ''}`}
                            />
                            <span className="text-xs font-bold text-gray-500 w-16 text-left">{el.unit2}</span>
                          </div>
                          {hasError && <div className="text-[10px] text-red-600 font-black absolute right-20 bottom-0 translate-y-full pt-1">{hasError}</div>}
                        </td>
                        <td className="p-3 align-middle">
                          <input type="text" value={data.remark} onChange={e => setFormData(p => ({...p, elements: {...p.elements, [el.key]: {...p.elements[el.key], remark: e.target.value}}}))} disabled={isReadOnly} className="w-full p-2 border border-gray-200 rounded-lg text-xs disabled:bg-transparent disabled:border-transparent focus:border-blue-400 outline-none" placeholder={isReadOnly ? '' : "備註"} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-blue-900 border-b-2 border-gray-100 pb-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm shadow">4</span> 其他添加 (Additions)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {OTHER_ADDITIONS.map(item => {
                const val = formData.otherAdditions[item.key];
                return (
                  <div key={item.key} className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col justify-center">
                    <label className="block text-sm font-bold text-gray-600 mb-2">{item.label}</label>
                    <div className="flex items-center gap-2 border-b-2 border-gray-300 pb-1 focus-within:border-blue-500 transition-colors">
                      <input type="number" step="0.1" value={val !== '' ? Number(val).toString() : ''} onChange={e => setFormData(p => ({...p, otherAdditions: { ...p.otherAdditions, [item.key]: e.target.value }}))} disabled={isReadOnly} className="w-full bg-transparent focus:outline-none text-right font-black text-lg disabled:text-blue-900" placeholder="0" />
                      <span className="text-xs font-bold text-gray-400 w-6">{item.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 【新增 Step 5】動態調配計算區塊 (僅限藥師檢視) */}
      {user.role === 'pharmacist' && renderDispensingSimulation()}

      {/* 動作按鈕區 */}
      <div className="bg-gray-900 p-5 rounded-2xl shadow-xl flex justify-between items-center mt-8 border-t-4 border-gray-700 sticky bottom-4 z-50">
        <div>
          {!isReadOnly && formData.orderId && (
            <button onClick={handleDelete} className="text-gray-400 hover:text-red-400 flex items-center gap-2 text-sm font-bold px-4 py-2 rounded hover:bg-gray-800 transition">
              <Trash2 size={18}/> 刪除草稿
            </button>
          )}
        </div>
        <div className="flex gap-4">
          {!isReadOnly && (
            <>
              <button onClick={() => saveOrder('Draft')} className="bg-gray-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-600 transition shadow">
                儲存暫存
              </button>
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