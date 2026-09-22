/**
 * Neo_TPN_Order 系統後端 API (Google Apps Script)
 * 佈署為「網頁應用程式 (Web App)」，執行身分：我；存取權限：所有人 (Anyone)
 *
 * 本檔為 repo 內的版控來源，修改後請手動貼回 Apps Script 編輯器並「管理部署 → 編輯 → 新版本」。
 *
 * 安全模型：
 *  - 除了 login，所有 action 都需要帶 token（登入後由後端發給，存在 CacheService）。
 *  - 密碼以 salt + SHA-256 雜湊存於 users 表的 passwordHash / salt 欄位，password 欄位清空。
 *    舊的明碼帳號在第一次登入成功時自動升級；也可在編輯器手動執行 migratePasswords() 一次全部轉換。
 */

// 綁定腳本的「資料庫」試算表 ID
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// 標籤專用試算表 ID
const LABEL_SPREADSHEET_ID = '1WyaRhjmckm4MDxDFDXucumvuTZWMRygQFmqc8H7NGnU';

const TIME_ZONE = 'Asia/Taipei';
const SESSION_TTL_SECONDS = 21600; // 6 小時（CacheService 上限），每次請求會自動延長
const HASH_ROUNDS = 1000;

const PUBLIC_ACTIONS = ['login'];
const WRITE_ACTIONS = ['saveRecord', 'deleteRecord', 'saveOrder', 'changePassword', 'exportLabel'];
const ADMIN_TABLES = ['users', 'limits', 'packages', 'medications', 'auditRules'];
const CLINICAL_TABLES = ['patients', 'admissions'];
const USER_SECRET_FIELDS = ['password', 'passwordHash', 'salt'];

// 處理 CORS 預檢請求
function doOptions(e) {
  return HtmlService.createHtmlOutput("")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 接收前端的 POST 請求
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;

    const session = PUBLIC_ACTIONS.includes(action) ? null : requireSession(params.token);

    let result;
    if (WRITE_ACTIONS.includes(action)) {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        result = handleAction(action, params, session);
      } finally {
        lock.releaseLock();
      }
    } else {
      result = handleAction(action, params, session);
    }

    return jsonResponse({ success: true, data: result });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message });
  }
}

function handleAction(action, params, session) {
  switch (action) {
    case 'login':
      return login(params.username, params.password);

    case 'getAllData':
      return {
        users: session.role === 'admin' ? getSheetData('users').map(sanitizeUser) : [],
        packages: getSheetData('packages'),
        patients: getSheetData('patients'),
        admissions: getSheetData('admissions', ['isClosed', 'IsClosed']),
        orders: getOrdersData(),
        limits: getLimitsData(),
        medications: getSheetData('medications', ['isActive', 'IsActive']),
        auditRules: getSheetData('auditRules', ['isActive', 'IsActive'])
      };

    case 'saveRecord':
      assertCanWriteTable(params.table, session);
      if (params.table === 'users') return { user: saveUser(params.data) };
      saveRecord(params.table, params.data, params.pk);
      return { message: '儲存成功' };

    case 'deleteRecord': {
      assertCanWriteTable(params.table, session);
      const idToDelete = params.data[params.pk] || params.data.id;
      if (params.table === 'users') assertUserDeletable(idToDelete, session);
      deleteRecord(params.table, params.pk, idToDelete);
      return { message: '刪除成功' };
    }

    case 'saveOrder':
      return saveOrder(params.order, params.isNew === true, session);

    case 'changePassword':
      if (!params.newPassword || !String(params.newPassword).trim()) throw new Error('密碼不能為空白');
      setUserPassword(session.id, String(params.newPassword).trim());
      return { message: '密碼已更新' };

    case 'exportLabel':
      exportLabel(params.data);
      return { message: '標籤匯出成功' };

    default:
      throw new Error('未知的 Action 請求');
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 登入與權限
// ==========================================
function login(username, password) {
  if (!username || !password) throw new Error('請輸入帳號與密碼');
  const sheet = getSheet('users');
  ensureColumns(sheet, ['passwordHash', 'salt']);
  const table = readTable(sheet);
  const row = table.rows.find(r => String(r.record.username) === String(username));
  if (!row || !verifyPassword(row.record, String(password))) throw new Error('帳號或密碼錯誤');

  // 舊的明碼帳號：登入成功後立即升級為雜湊
  if (!row.record.passwordHash) setUserPassword(row.record.id, String(password));

  const user = { id: row.record.id, username: row.record.username, name: row.record.name, role: row.record.role };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(user), SESSION_TTL_SECONDS);
  return { token: token, user: user };
}

function requireSession(token) {
  if (!token) throw new Error('AUTH_REQUIRED');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('sess_' + token);
  if (!raw) throw new Error('AUTH_REQUIRED');
  cache.put('sess_' + token, raw, SESSION_TTL_SECONDS);
  return JSON.parse(raw);
}

function assertCanWriteTable(table, session) {
  if (ADMIN_TABLES.includes(table)) {
    if (session.role !== 'admin') throw new Error('權限不足：僅管理員可修改此資料');
    return;
  }
  if (CLINICAL_TABLES.includes(table)) return;
  throw new Error(`不允許直接寫入資料表: ${table}`);
}

function assertUserDeletable(userId, session) {
  const row = readTable(getSheet('users')).rows.find(r => String(r.record.id) === String(userId));
  if (row && row.record.username === 'admin') throw new Error('無法刪除預設管理員帳號');
  if (String(userId) === String(session.id)) throw new Error('無法刪除自己的帳號');
}

function sanitizeUser(user) {
  const clean = { ...user };
  USER_SECRET_FIELDS.forEach(f => delete clean[f]);
  return clean;
}

// ==========================================
// 密碼雜湊
// ==========================================
function hashPassword(password, salt) {
  let digest = salt + password;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    digest = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digest, Utilities.Charset.UTF_8)
    );
  }
  return digest;
}

function verifyPassword(record, password) {
  if (record.passwordHash) return hashPassword(password, String(record.salt)) === String(record.passwordHash);
  return record.password !== '' && String(record.password) === password; // 尚未升級的舊帳號
}

function setUserPassword(userId, newPassword) {
  const sheet = getSheet('users');
  ensureColumns(sheet, ['passwordHash', 'salt']);
  const table = readTable(sheet);
  const row = table.rows.find(r => String(r.record.id) === String(userId));
  if (!row) throw new Error('找不到使用者');
  const salt = Utilities.getUuid();
  writeFields(sheet, table.headers, row.rowNumber, {
    passwordHash: hashPassword(newPassword, salt),
    salt: salt,
    password: ''
  });
}

// 新增或更新使用者；只有帶 password 時才更換密碼，否則保留原本的雜湊
function saveUser(data) {
  const sheet = getSheet('users');
  ensureColumns(sheet, ['passwordHash', 'salt']);
  const table = readTable(sheet);
  const existing = table.rows.find(r => String(r.record.id) === String(data.id));
  const duplicate = table.rows.find(r => String(r.record.username) === String(data.username) && String(r.record.id) !== String(data.id));
  if (duplicate) throw new Error('此帳號已存在');

  const record = { ...(existing ? existing.record : {}), id: data.id, username: data.username, name: data.name, role: data.role };
  if (data.password) {
    record.salt = Utilities.getUuid();
    record.passwordHash = hashPassword(String(data.password), record.salt);
  } else if (!existing) {
    throw new Error('新帳號必須設定密碼');
  }
  record.password = '';
  upsertRow(sheet, table, 'id', record);
  return sanitizeUser(record);
}

// ==========================================
// 處方：單號產生 + 新版送出時作廢舊版，在同一個 lock 內完成
// ==========================================
function saveOrder(order, isNew, session) {
  if (!order) throw new Error('缺少處方資料');
  const sheet = getSheet('orders');
  let table = readTable(sheet);

  if (isNew) {
    order.orderId = nextOrderId(table, order.encounterId);
    order.authorId = session.id;
    order.authorName = session.name;
  }
  if (order.status === 'Dispensed') {
    if (session.role !== 'pharmacist') throw new Error('權限不足：僅藥師可確認調配');
    order.dispenserId = session.id;
    order.dispenserName = session.name;
  }

  upsertRow(sheet, table, 'orderId', serializeOrder(order));

  let voidedParentId = null;
  if (order.status === 'Submitted' && order.parentOrderId) {
    table = readTable(sheet);
    const parent = table.rows.find(r => String(r.record.orderId) === String(order.parentOrderId));
    if (parent && parent.record.status !== 'Void') {
      writeFields(sheet, table.headers, parent.rowNumber, { status: 'Void' });
      voidedParentId = parent.record.orderId;
    }
  }
  return { order: order, voidedParentId: voidedParentId };
}

// 單號格式：TPN-就醫序號-YYYYMMDD-流水號
function nextOrderId(table, encounterId) {
  const dateStr = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyyMMdd');
  const prefix = `TPN-${encounterId || 'UNKNOWN'}-${dateStr}-`;
  let maxSeq = 0;
  table.rows.forEach(r => {
    const id = String(r.record.orderId || '');
    if (id.startsWith(prefix)) {
      const seq = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });
  return prefix + String(maxSeq + 1).padStart(2, '0');
}

function serializeOrder(order) {
  const record = { ...order };
  record.elements_json = JSON.stringify(record.elements || {});
  record.otherAdditions_json = JSON.stringify(record.otherAdditions || {});
  delete record.elements;
  delete record.otherAdditions;
  return record;
}

// ==========================================
// 標籤匯出
// ==========================================
function exportLabel(payload) {
  const labelSheet = SpreadsheetApp.openById(LABEL_SPREADSHEET_ID).getSheetByName("Label_Data");
  if (!labelSheet) throw new Error("在指定的試算表中找不到 Label_Data 工作表，請先建立");

  const lastCol = labelSheet.getLastColumn();
  let rowData;
  if (lastCol > 0) {
    // 若工作表已有表頭，根據表頭去物件中抓取對應的值
    const headers = labelSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    rowData = headers.map(header => payload[header] !== undefined ? payload[header] : "");
  } else {
    // 若工作表為全空，自動把物件的 Key 變成表頭並寫入第一行
    const newHeaders = Object.keys(payload);
    labelSheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    rowData = newHeaders.map(key => payload[key]);
  }
  labelSheet.appendRow(rowData);
}

// ==========================================
// 讀取資料輔助函數
// ==========================================
function getSheet(sheetName) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) throw new Error(`找不到工作表: ${sheetName}`);
  return sheet;
}

// 回傳 { headers, rows: [{ rowNumber, record }] }，rowNumber 為試算表中的實際列號
function readTable(sheet) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const rows = data.slice(1).map((row, i) => {
    const record = {};
    headers.forEach((h, idx) => { record[h] = row[idx]; });
    return { rowNumber: i + 2, record: record };
  });
  return { headers: headers, rows: rows };
}

function getSheetData(sheetName, booleanFields = []) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const rows = data.slice(1);

  return rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      let val = row[index];
      if (booleanFields.includes(header)) {
        val = (val === true || String(val).toLowerCase() === 'true');
      }
      obj[header] = val;
    });
    return obj;
  });
}

function getLimitsData() {
  const rawLimits = getSheetData('limits');
  let limitsObj = {};
  rawLimits.forEach(item => {
    if (item.element) {
      limitsObj[item.element] = {
        min: Number(item.min),
        max: Number(item.max),
        unit: item.unit
      };
    }
  });
  return limitsObj;
}

function getOrdersData() {
  const rawOrders = getSheetData('orders');
  return rawOrders.map(order => {
    try {
      order.elements = order.elements_json ? JSON.parse(order.elements_json) : {};
    } catch (e) {
      order.elements = {};
    }
    delete order.elements_json;

    try {
      order.otherAdditions = order.otherAdditions_json ? JSON.parse(order.otherAdditions_json) : {};
    } catch (e) {
      order.otherAdditions = {};
    }
    delete order.otherAdditions_json;

    order.version = Number(order.version);
    order.weight = String(order.weight);
    order.durationDays = Number(order.durationDays);
    order.calcAdminVol = Number(order.calcAdminVol);

    return order;
  });
}

// ==========================================
// 寫入/更新資料輔助函數
// ==========================================
function saveRecord(sheetName, recordData, primaryKeyField) {
  const sheet = getSheet(sheetName);

  if (sheetName === 'limits') {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }
    const newRows = Object.keys(recordData).map(key => [
      key,
      recordData[key].min,
      recordData[key].max,
      recordData[key].unit
    ]);
    if (newRows.length > 0) {
      sheet.getRange(2, 1, newRows.length, headers.length).setValues(newRows);
    }
    return;
  }

  upsertRow(sheet, readTable(sheet), primaryKeyField, recordData);
}

// 依主鍵更新整列；找不到就新增一列。只寫入試算表已有的欄位。
function upsertRow(sheet, table, primaryKeyField, record) {
  if (!table.headers.includes(primaryKeyField)) throw new Error(`找不到主鍵欄位: ${primaryKeyField}`);
  const pkValue = record[primaryKeyField];
  const existing = table.rows.find(r => String(r.record[primaryKeyField]) === String(pkValue));
  const rowData = table.headers.map(h => (record[h] !== undefined && record[h] !== null ? record[h] : ''));
  if (existing) {
    sheet.getRange(existing.rowNumber, 1, 1, table.headers.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

// 只更新指定欄位，不動同列其他欄位
function writeFields(sheet, headers, rowNumber, fields) {
  Object.keys(fields).forEach(key => {
    const col = headers.indexOf(key);
    if (col > -1) sheet.getRange(rowNumber, col + 1).setValue(fields[key]);
  });
}

// 若缺少欄位，加在表頭最右邊
function ensureColumns(sheet, columns) {
  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const missing = columns.filter(c => !headers.includes(c));
  if (missing.length > 0) sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
}

function deleteRecord(sheetName, primaryKeyField, idValue) {
  const sheet = getSheet(sheetName);
  const row = readTable(sheet).rows.find(r => String(r.record[primaryKeyField]) === String(idValue));
  if (row) sheet.deleteRow(row.rowNumber);
}

// ==========================================
// 維運工具：在 Apps Script 編輯器中手動執行
// ==========================================

// 部署新版後執行一次：把所有仍為明碼的密碼轉成雜湊並清空 password 欄位
function migratePasswords() {
  const sheet = getSheet('users');
  ensureColumns(sheet, ['passwordHash', 'salt']);
  const table = readTable(sheet);
  let count = 0;
  table.rows.forEach(r => {
    if (!r.record.passwordHash && r.record.password !== '') {
      setUserPassword(r.record.id, String(r.record.password));
      count++;
    }
  });
  Logger.log(`已轉換 ${count} 個帳號的密碼`);
}

// 忘記密碼時使用：修改下面兩個值後執行，執行完請把密碼改回空字串
function resetPasswordManually() {
  const USERNAME = '';
  const NEW_PASSWORD = '';
  if (!USERNAME || !NEW_PASSWORD) throw new Error('請先在程式中填入 USERNAME 與 NEW_PASSWORD');
  const row = readTable(getSheet('users')).rows.find(r => String(r.record.username) === USERNAME);
  if (!row) throw new Error('找不到帳號: ' + USERNAME);
  setUserPassword(row.record.id, NEW_PASSWORD);
  Logger.log('已重設 ' + USERNAME + ' 的密碼');
}
