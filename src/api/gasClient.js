// 與 Google Apps Script 後端溝通的唯一出口
// 後端網址來自環境變數：正式版在 .env.production，開發時請在 .env.development.local 指向測試用 GAS
export const GAS_URL = import.meta.env.VITE_GAS_URL || '';

const SESSION_KEY = 'neo_tpn_session';

export class AuthError extends Error {}

export const loadSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveSession = (session) => {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 無法使用 sessionStorage 時，重新整理後需重新登入
  }
};

// 回傳後端的 data；失敗時丟出 Error（登入逾時丟出 AuthError）
export const callGas = async (action, payload = {}, token) => {
  if (!GAS_URL) throw new Error('尚未設定後端網址 (VITE_GAS_URL)');
  const response = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify({ action, token, ...payload })
  });
  const result = await response.json();
  if (!result.success) {
    if (result.error === 'AUTH_REQUIRED') throw new AuthError('登入已逾時，請重新登入');
    throw new Error(result.error || '後端回應錯誤');
  }
  return result.data;
};
