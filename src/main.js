// State Variables
let appData = {
  revenue: [],
  expenditure: [],
  history: []
};

// Default config constants
const DEFAULT_REVENUE_MERGES = {};
const DEFAULT_LINKAGE_MAPPINGS = [
  {
    name: '(보)친환경 쌀 차액 지원금',
    revenueNames: ['(보)친환경 쌀 차액 지원금'],
    expenditureNames: ['친환경쌀지원금']
  },
  {
    name: '(목)친환경급식식품관리비',
    revenueNames: ['(목)친환경급식식품관리비'],
    expenditureNames: ['(목)학생무상급식관리비']
  },
  {
    name: '(목)학교급식인건비 3~8월',
    revenueNames: ['(목)학교급식인건비 3~8월'],
    expenditureNames: ['(목)급식보조인력인건비']
  },
  {
    name: '(목적)식기류렌탈세척운영비지원',
    revenueNames: ['(목적)식기류렌탈세척운영비지원'],
    expenditureNames: ['식기류렌탈세척비']
  },
  {
    name: '(목적)친환경무상급식비 3~8월 2차',
    revenueNames: ['(목적)친환경무상급식비 3~8월 2차'],
    expenditureNames: ['(목)학생무상급식식품비', '(목)학생무상급식식품비(Non-GMO)']
  },
  {
    name: '유치원급식비',
    revenueNames: ['유치원급식비'],
    expenditureNames: ['(유)유치원관리비', '(유)유치원식품비']
  },
  {
    name: '(수)교직원급식비',
    revenueNames: ['(수)교직원급식비'],
    expenditureNames: ['(수)교직원관리비', '(수)교직원식품비', '(수)교직원급식보조인력인건비']
  }
];

let appState = {
  activeProfile: '학교급식운영',
  profiles: {
    '학교급식운영': {
      mergedRevenues: JSON.parse(JSON.stringify(DEFAULT_REVENUE_MERGES)),
      linkageMappings: JSON.parse(JSON.stringify(DEFAULT_LINKAGE_MAPPINGS)),
      uploadedData: { revenue: [], expenditure: [], history: [] }
    }
  },
  mergedRevenues: {},
  linkageMappings: []
};

// 월별/산출내역별 조회 전역 필터 상태
let analysisState = {
  selectedMonth: 'all',
  selectedCat: 'all'
};

function syncCurrentProfileRefs() {
  const profile = appState.profiles[appState.activeProfile];
  if (profile) {
    appState.linkageMappings = profile.linkageMappings || [];
    appState.mergedRevenues = profile.mergedRevenues || {};
  }
}

function loadState() {
  try {
    const savedStateStr = localStorage.getItem('k_budget_state');
    if (savedStateStr) {
      const state = JSON.parse(savedStateStr);
      if (state && state.profiles) {
        appState = state;
        syncCurrentProfileRefs();
        return;
      }
    }
    
    // Fallback: Check old individual localStorage keys for migration
    const savedMerges = localStorage.getItem('k_budget_merged_revenues');
    const savedMappings = localStorage.getItem('k_budget_linkage_mappings');
    const savedUploadedData = localStorage.getItem('k_budget_uploaded_data');
    
    if (savedMerges || savedMappings || savedUploadedData) {
      appState.activeProfile = '학교급식운영';
      appState.profiles = {
        '학교급식운영': {
          mergedRevenues: savedMerges ? JSON.parse(savedMerges) : JSON.parse(JSON.stringify(DEFAULT_REVENUE_MERGES)),
          linkageMappings: savedMappings ? JSON.parse(savedMappings) : JSON.parse(JSON.stringify(DEFAULT_LINKAGE_MAPPINGS)),
          uploadedData: savedUploadedData ? JSON.parse(savedUploadedData) : { revenue: [], expenditure: [], history: [] }
        }
      };
      syncCurrentProfileRefs();
      console.log('Migrated old individual state key configs to new profiles structure');
      return;
    }
    
    // Default initialization
    appState.activeProfile = '학교급식운영';
    appState.profiles = {
      '학교급식운영': {
        mergedRevenues: JSON.parse(JSON.stringify(DEFAULT_REVENUE_MERGES)),
        linkageMappings: JSON.parse(JSON.stringify(DEFAULT_LINKAGE_MAPPINGS)),
        uploadedData: { revenue: [], expenditure: [], history: [] }
      }
    };
    syncCurrentProfileRefs();
  } catch (e) {
    console.error('Failed to load state from localStorage:', e);
    syncCurrentProfileRefs();
  }
}

function saveState() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  
  // Ensure the active profile is fully updated before saving
  if (appState.profiles[appState.activeProfile]) {
    appState.profiles[appState.activeProfile].uploadedData = {
      revenue: appData.revenue,
      expenditure: appData.expenditure,
      history: appData.history
    };
    appState.profiles[appState.activeProfile].linkageMappings = appState.linkageMappings;
    appState.profiles[appState.activeProfile].mergedRevenues = appState.mergedRevenues;
  }

  const stateToSave = {
    activeProfile: appState.activeProfile,
    profiles: appState.profiles,
    theme: theme
  };

  try {
    localStorage.setItem('k_budget_state', JSON.stringify(stateToSave));
    localStorage.setItem('k_budget_theme', theme);
  } catch (e) {
    console.error('Failed to save configs to localStorage:', e);
  }

  // Also save to server-side JSON file
  fetch('/api/save_state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(stateToSave)
  }).then(res => {
    if (!res.ok) console.error('Failed to save state to server');
  }).catch(e => {
    console.error('Error saving state to server:', e);
  });
}

let chartInstance = null;

// Helper: Format numbers as currency
function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '0원';
  return new Intl.NumberFormat('ko-KR').format(Math.round(val)) + '원';
}

// Helper: Format percentage
function formatPercent(num, den) {
  if (!den) return '0%';
  return ((num / den) * 100).toFixed(1) + '%';
}

let isInitialized = false;

// Initial Data Loading
async function init() {
  try {
    let isStateLoadedFromServer = false;
    let isUploadedDataUsed = false;
    
    // 1. Try to load state from server API
    try {
      const response = await fetch('/api/load_state');
      if (response.ok) {
        const state = await response.json();
        if (state && Object.keys(state).length > 0) {
          isStateLoadedFromServer = true;
          console.log('Successfully loaded state from server API');
          
          if (state.profiles) {
            appState = state;
          } else {
            // Server has old individual key configs
            appState.activeProfile = '학교급식운영';
            appState.profiles = {
              '학교급식운영': {
                mergedRevenues: state.mergedRevenues || JSON.parse(JSON.stringify(DEFAULT_REVENUE_MERGES)),
                linkageMappings: state.linkageMappings || JSON.parse(JSON.stringify(DEFAULT_LINKAGE_MAPPINGS)),
                uploadedData: state.uploadedData || { revenue: [], expenditure: [], history: [] }
              }
            };
          }
          syncCurrentProfileRefs();
          
          if (state.theme) {
            document.documentElement.setAttribute('data-theme', state.theme);
            const btnTheme = document.getElementById('btn-theme-toggle');
            if (btnTheme) {
              if (state.theme === 'light') {
                btnTheme.innerHTML = '<i class="fa-solid fa-moon"></i> <span>다크 모드</span>';
              } else {
                btnTheme.innerHTML = '<i class="fa-solid fa-sun"></i> <span>라이트 모드</span>';
              }
            }
          }
          
          const currentProfile = appState.profiles[appState.activeProfile];
          if (currentProfile && currentProfile.uploadedData && currentProfile.uploadedData.revenue && currentProfile.uploadedData.revenue.length > 0) {
            appData.revenue = currentProfile.uploadedData.revenue;
            appData.expenditure = currentProfile.uploadedData.expenditure;
            appData.history = currentProfile.uploadedData.history;
            isUploadedDataUsed = true;
            console.log('Loaded active profile uploaded data from server API:', appState.activeProfile, {
              revenue: appData.revenue.length,
              expenditure: appData.expenditure.length,
              history: appData.history.length
            });
          }
        }
      }
    } catch (serverLoadError) {
      console.error('Failed to load state from server API:', serverLoadError);
    }
    
    // 2. Fallback to localStorage if server state could not be loaded
    if (!isStateLoadedFromServer) {
      loadState();
      
      const currentProfile = appState.profiles[appState.activeProfile];
      if (currentProfile && currentProfile.uploadedData && currentProfile.uploadedData.revenue && currentProfile.uploadedData.revenue.length > 0) {
        appData.revenue = currentProfile.uploadedData.revenue;
        appData.expenditure = currentProfile.uploadedData.expenditure;
        appData.history = currentProfile.uploadedData.history;
        isUploadedDataUsed = true;
        console.log('Loaded active profile uploaded data from localStorage:', appState.activeProfile, {
          revenue: appData.revenue.length,
          expenditure: appData.expenditure.length,
          history: appData.history.length
        });
      }
    }
    
    // 3. Fallback to data.json if no uploaded data is loaded (default school meal sample)
    if (!isUploadedDataUsed) {
      try {
        const response = await fetch('./data.json');
        if (response.ok) {
          const data = await response.json();
          appData.revenue = data.revenue ? data.revenue.slice(1) : [];
          appData.expenditure = data.expenditure ? data.expenditure.slice(1) : [];
          appData.history = data.history ? data.history.slice(1) : [];
          
          if (appState.profiles['학교급식운영']) {
            appState.profiles['학교급식운영'].uploadedData = {
              revenue: appData.revenue,
              expenditure: appData.expenditure,
              history: appData.history
            };
          }
          console.log('Loaded default records from data.json');
        }
      } catch (err) {
        console.warn('Fallback: data.json could not be loaded', err);
      }
    }
    
    // Sort transactions by date descending
    appData.history.sort((a, b) => {
      return (b.일자 || '').localeCompare(a.일자 || '');
    });

    if (!isInitialized) {
      setupTabs();
      setupFilters();
      setupRevenueTableInteractive();
      setupExpenditureTableInteractive();
      setupTransactionsTableInteractive();
      setupBudgetFilter();
      setupColumnToggles();
      setupMappingSettings();
      setupExcelUpload();
      setupTheme();
      setupProfileManagement(); // New function for profile selectors
      
      // Setup reload handler
      document.getElementById('btn-reload-data').addEventListener('click', async () => {
        const btn = document.getElementById('btn-reload-data');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 동기화 중...';
        
        // Reset local storage configs for active profile
        if (appState.profiles[appState.activeProfile]) {
          appState.profiles[appState.activeProfile].uploadedData = { revenue: [], expenditure: [], history: [] };
          if (appState.activeProfile === '학교급식운영') {
            appState.profiles['학교급식운영'].linkageMappings = JSON.parse(JSON.stringify(DEFAULT_LINKAGE_MAPPINGS));
            appState.profiles['학교급식운영'].mergedRevenues = JSON.parse(JSON.stringify(DEFAULT_REVENUE_MERGES));
          } else {
            appState.profiles[appState.activeProfile].linkageMappings = [];
            appState.profiles[appState.activeProfile].mergedRevenues = {};
          }
        }
        
        appData.revenue = [];
        appData.expenditure = [];
        appData.history = [];
        
        saveState();
        
        await init();
        btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 데이터 동기화';
        alert('현재 프로필 데이터가 초기화되었거나 샘플 데이터로 동기화되었습니다.');
      });
      
      setupHeartbeat();
      
      isInitialized = true;
    }

    updateDynamicTexts();
    renderBudgetFilterDropdown();
    renderAll();
    
    // Update indicator in Sidebar
    const statusText = document.querySelector('.status-indicator span:last-child');
    if (statusText) {
      statusText.innerText = (appData.revenue.length > 0) ? '업로드 데이터 연동 완료' : '샘플 데이터 연동 완료';
    }

  } catch (error) {
    console.error('Initialization error:', error);
    alert('데이터를 로드하는 중 오류가 발생했습니다. ' + error.message);
  }
}

function setupHeartbeat() {
  // 3초마다 백엔드 서버에 핑 전송 (자가 종료 확인용)
  setInterval(() => {
    fetch('/api/heartbeat').catch(() => {});
  }, 3000);
}

// Setup Tab Navigation
function setupTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove active class from all
      navItems.forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      
      // Add active class to current
      item.classList.add('active');
      const tabId = `tab-${item.dataset.tab}`;
      const tabElement = document.getElementById(tabId);
      if (tabElement) {
        tabElement.classList.add('active');
      }

      // Update titles
      const pageTitle = document.getElementById('page-title');
      const pageDesc = document.getElementById('page-description');
      
      switch(item.dataset.tab) {
        case 'dashboard':
          pageTitle.innerText = '정산 대시보드';
          pageDesc.innerText = '2026학년도 세입 대비 세출 현황 및 정산 재원 실시간 분석';
          if (chartInstance) chartInstance.destroy();
          renderDashboardChart();
          break;
        case 'revenue':
          pageTitle.innerText = '세입 산출내역';
          pageDesc.innerText = '세부사업별 세입 예산현액 및 수납/징수 내역 원본 데이터';
          break;
        case 'expenditure':
          pageTitle.innerText = '세출 산출내역';
          pageDesc.innerText = '세부사업별 세출 예산현액 및 집행 잔액 원본 데이터';
          break;
        case 'monthly':
          pageTitle.innerText = '월별/산출내역별 조회';
          pageDesc.innerText = '세출 산출내역별 월별 지출 추이 및 상세 거래 확인';
          renderMonthlyMatrix();
          break;
        case 'transactions':
          pageTitle.innerText = '상세 지출실적';
          pageDesc.innerText = '지출실적조회 거래 로그 및 건별 결의 내용';
          break;
      }
    });
  });
}

// Setup Event Listeners for Filters
function setupFilters() {
  // Revenue search
  document.getElementById('revenue-search').addEventListener('input', renderRevenueTable);
  
  // Expenditure search
  document.getElementById('expenditure-search').addEventListener('input', renderExpenditureTable);
  
  // Transactions search & filters
  document.getElementById('transactions-search').addEventListener('input', renderTransactionsTable);
  document.getElementById('transactions-filter-month').addEventListener('change', renderTransactionsTable);
  document.getElementById('transactions-filter-category').addEventListener('change', renderTransactionsTable);

  // Analysis filters: '전체 보기' 리셋 버튼 이벤트 추가
  const resetBtn = document.getElementById('btn-reset-analysis-filter');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      analysisState.selectedMonth = 'all';
      analysisState.selectedCat = 'all';
      updateMatrixHighlight();
      renderMonthlyAnalysis();
    });
  }
}

// Main Render Function
function renderAll() {
  calculateKPIs();
  renderSettlementTable();
  renderRevenueTable();
  renderExpenditureTable();
  populateDropdowns();
  renderMonthlyMatrix();
  renderMonthlyAnalysis();
  renderTransactionsTable();
  renderDashboardChart();
  updateReferenceDate();
}

function updateReferenceDate() {
  const currentDateEl = document.getElementById('current-date');
  if (!currentDateEl) return;

  let latestDate = '';
  if (appData.history && appData.history.length > 0) {
    // appData.history is sorted descending, so look for the first valid YYYY-MM-DD date
    for (let i = 0; i < appData.history.length; i++) {
      const d = appData.history[i].일자 || '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
        latestDate = d.trim();
        break;
      }
    }
  }

  if (latestDate) {
    currentDateEl.innerText = latestDate;
  } else {
    currentDateEl.innerText = '2026-05-19';
  }
}

function getFirstKey(row) {
  if (!row) return '';
  const keys = Object.keys(row);
  return keys[0] || '';
}

function getMok(row) {
  const k = getFirstKey(row);
  return k ? (row[k] || '') : '';
}

function isRevenueTotalOrSubtotal(row) {
  const col1 = row.Col_1 || '';
  const col2 = row.Col_2 || '';
  const mainCol = getMok(row);
  
  return /\[\s*소\s*계\s*\]/.test(col1) ||
         /\[\s*소\s*계\s*\]/.test(col2) ||
         /\[\s*총\s*계\s*\]/.test(mainCol) ||
         /\[\s*총\s*계\s*\]/.test(col1) ||
         col2 === '산출내역';
}

function isExpenditureTotalOrSubtotal(row) {
  const col1 = row.Col_1 || '';
  const col2 = row.Col_2 || '';
  const col3 = row.Col_3 || '';
  const mainCol = getMok(row);
  
  return /\[\s*소\s*계\s*\]/.test(col1) ||
         /\[\s*소\s*계\s*\]/.test(col2) ||
         /\[\s*총\s*계\s*\]/.test(mainCol) ||
         /\[\s*총\s*계\s*\]/.test(col1) ||
         col3 === '산출내역';
}

// KPI Calculation
let kpiCached = {};
function calculateKPIs() {
  const deactivatedRevenues = new Set();
  const deactivatedExpenditures = new Set();
  
  appState.linkageMappings.forEach(mapDef => {
    if (mapDef.isActive === false) {
      const resolvedRevNames = resolveRevenueNames(mapDef.revenueNames || []);
      resolvedRevNames.forEach(name => deactivatedRevenues.add(name));
      (mapDef.expenditureNames || []).forEach(name => deactivatedExpenditures.add(name));
    }
  });

  // 1. Revenue
  let totalRevenueBudget = 0;
  let totalRevenueDecided = 0;
  
  appData.revenue.forEach(row => {
    const isTotalOrSubtotal = isRevenueTotalOrSubtotal(row);
    if (!isTotalOrSubtotal && row.Col_3) {
      if (row.Col_2 && deactivatedRevenues.has(row.Col_2)) return;
      totalRevenueBudget += parseFloat(row.Col_3) || 0;
      totalRevenueDecided += parseFloat(row.Col_4) || 0;
    }
  });

  // 2. Expenditure
  let totalExpenditureBudget = 0;
  let totalExpenditureExecuted = 0;

  const mappedExpNames = [];
  appState.linkageMappings.forEach(m => {
    (m.expenditureNames || []).forEach(name => {
      if (!mappedExpNames.includes(name)) {
        mappedExpNames.push(name);
      }
    });
  });
  
  appData.expenditure.forEach(row => {
    const isTotalOrSubtotal = isExpenditureTotalOrSubtotal(row);
    if (!isTotalOrSubtotal && row.Col_6) {
      if (row.Col_3 && deactivatedExpenditures.has(row.Col_3.trim())) return;
      if (row.Col_3 && !mappedExpNames.includes(row.Col_3.trim())) return;
      totalExpenditureBudget += parseFloat(row.Col_6) || 0;
      totalExpenditureExecuted += parseFloat(row.Col_8) || 0;
    }
  });

  // Actual Balance (Revenue Decided - Expenditure Executed)
  const actualBalance = totalRevenueDecided - totalExpenditureExecuted;
  const budgetBalance = totalRevenueBudget - totalExpenditureExecuted;
  
  kpiCached = {
    totalRevenueBudget,
    totalRevenueDecided,
    totalExpenditureBudget,
    totalExpenditureExecuted,
    actualBalance,
    budgetBalance
  };

  // Render to UI
  document.getElementById('kpi-total-revenue').innerText = formatCurrency(totalRevenueDecided);
  document.getElementById('kpi-revenue-budget').innerText = formatCurrency(totalRevenueBudget);
  document.getElementById('kpi-revenue-rate').innerText = formatPercent(totalRevenueDecided, totalRevenueBudget);

  document.getElementById('kpi-total-expenditure').innerText = formatCurrency(totalExpenditureExecuted);
  document.getElementById('kpi-expenditure-budget').innerText = formatCurrency(totalExpenditureBudget);
  document.getElementById('kpi-expenditure-rate').innerText = formatPercent(totalExpenditureExecuted, totalExpenditureBudget);

  document.getElementById('kpi-net-balance').innerText = formatCurrency(actualBalance);
  document.getElementById('kpi-budget-balance').innerText = formatCurrency(budgetBalance);
  
  // Since the main value is now budget balance, we calculate the remaining budget percentage
  const balancePercent = totalRevenueBudget ? ((budgetBalance / totalRevenueBudget) * 100).toFixed(1) : 0;
  document.getElementById('kpi-balance-percent').innerText = `${balancePercent}% 잔여`;
}

// Populate Category Filter Dropdowns
function populateDropdowns() {
  const deactivatedExpenditures = new Set();
  appState.linkageMappings.forEach(mapDef => {
    if (mapDef.isActive === false) {
      (mapDef.expenditureNames || []).forEach(name => deactivatedExpenditures.add(name));
    }
  });

  const catSet = new Set();
  appData.expenditure.forEach(row => {
    const detail = row.Col_3;
    const isTotalOrSubtotal = isExpenditureTotalOrSubtotal(row);
    if (detail && !isTotalOrSubtotal && typeof detail === 'string') {
      const trimmed = detail.trim();
      if (!deactivatedExpenditures.has(trimmed)) {
        catSet.add(trimmed);
      }
    }
  });

  const sortedCategories = Array.from(catSet).sort();

  // Populate transactions dropdown
  const selectTrans = document.getElementById('transactions-filter-category');
  if (selectTrans) {
    selectTrans.innerHTML = '<option value="all">전체 산출내역</option>';
    sortedCategories.forEach(cat => {
      const opt2 = document.createElement('option');
      opt2.value = cat;
      opt2.textContent = cat;
      selectTrans.appendChild(opt2);
    });
  }
}

// -------------------------------------------------------------
// DASHBOARD: SETTLEMENT TABLE & MAPPING
// -------------------------------------------------------------
let dashboardMappedData = [];

function resolveRevenueNames(names) {
  let resolved = [];
  (names || []).forEach(name => {
    if (appState.mergedRevenues && appState.mergedRevenues[name]) {
      resolved = resolved.concat(appState.mergedRevenues[name]);
    } else {
      resolved.push(name);
    }
  });
  return resolved;
}

function setupBudgetFilter() {
  const btn = document.getElementById('btn-budget-filter');
  const dropdown = document.getElementById('budget-filter-dropdown');
  if (!btn || !dropdown) return;
  
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.col-toggle-dropdown').forEach(d => {
      if (d !== dropdown) d.classList.remove('show');
    });
    dropdown.classList.toggle('show');
  });
  
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function renderBudgetFilterDropdown() {
  const dropdown = document.getElementById('budget-filter-dropdown');
  if (!dropdown) return;
  
  dropdown.innerHTML = '';
  
  appState.linkageMappings.forEach((mapDef, idx) => {
    const label = document.createElement('label');
    label.className = 'col-toggle-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = mapDef.isActive !== false;
    
    checkbox.addEventListener('change', (e) => {
      mapDef.isActive = e.target.checked;
      saveState();
      renderAll();
    });
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + mapDef.name));
    dropdown.appendChild(label);
  });
}

function renderSettlementTable() {
  const tbody = document.getElementById('settlement-table-body');
  tbody.innerHTML = '';

  dashboardMappedData = [];

  let sumRevBudget = 0;
  let sumRevDecided = 0;
  let sumExpBudget = 0;
  let sumExpExecuted = 0;
  let sumActualBalance = 0;

  // Process mapped items based on appState.linkageMappings
  appState.linkageMappings.forEach(mapDef => {
    if (mapDef.isActive === false) return;
    const resolvedRevNames = resolveRevenueNames(mapDef.revenueNames || []);
    
    // Revenue calculations
    const revRows = appData.revenue.filter(r => {
      const isTotalOrSubtotal = isRevenueTotalOrSubtotal(r);
      return !isTotalOrSubtotal && r.Col_2 && resolvedRevNames.includes(r.Col_2);
    });
    const revBudget = revRows.reduce((sum, r) => sum + (parseFloat(r.Col_3) || 0), 0);
    const revDecided = revRows.reduce((sum, r) => sum + (parseFloat(r.Col_4) || 0), 0);

    // Expenditure calculations
    const expRows = appData.expenditure.filter(e => {
      const isTotalOrSubtotal = isExpenditureTotalOrSubtotal(e);
      return !isTotalOrSubtotal && e.Col_3 && (mapDef.expenditureNames || []).includes(e.Col_3);
    });
    const expBudget = expRows.reduce((sum, e) => sum + (parseFloat(e.Col_6) || 0), 0);
    const expExecuted = expRows.reduce((sum, e) => sum + (parseFloat(e.Col_8) || 0), 0);

    const actualBal = revDecided - expExecuted;

    sumRevBudget += revBudget;
    sumRevDecided += revDecided;
    sumExpBudget += expBudget;
    sumExpExecuted += expExecuted;
    sumActualBalance += actualBal;

    dashboardMappedData.push({
      name: mapDef.name,
      revBudget,
      revDecided,
      expBudget,
      expExecuted,
      actualBal,
      isSelfFunded: false
    });
  });

  // Self-funded items (without reconciliation funding) are excluded as requested.

  // Render Table Rows
  dashboardMappedData.forEach(row => {
    const tr = document.createElement('tr');
    if (row.isSelfFunded) tr.classList.add('row-subtotal');
    
    const budgetBal = row.expBudget - row.expExecuted;
    
    tr.innerHTML = `
      <td><strong>${row.name}</strong></td>
      <td class="text-right">${row.revBudget ? formatCurrency(row.revBudget) : '-'}</td>
      <td class="text-right text-success-header">${row.revDecided ? formatCurrency(row.revDecided) : '-'}</td>
      <td class="text-right">${row.expBudget ? formatCurrency(row.expBudget) : '-'}</td>
      <td class="text-right text-danger-header">${row.expExecuted ? formatCurrency(row.expExecuted) : '-'}</td>
      <td class="text-right text-blue font-semibold">${formatCurrency(budgetBal)}</td>
      <td class="text-right font-bold ${row.actualBal >= 0 ? 'text-green' : 'text-orange'}">${formatCurrency(row.actualBal)}</td>
      <td class="text-center font-semibold">${row.expBudget ? formatPercent(row.expExecuted, row.expBudget) : '-'}</td>
    `;
    tbody.appendChild(tr);
  });

  // Render Grand Total Row
  const totalTr = document.createElement('tr');
  totalTr.classList.add('row-total');
  
  const sumBudgetBalance = sumExpBudget - sumExpExecuted;
  
  totalTr.innerHTML = `
    <td>합계 (총계)</td>
    <td class="text-right">${formatCurrency(sumRevBudget)}</td>
    <td class="text-right">${formatCurrency(sumRevDecided)}</td>
    <td class="text-right">${formatCurrency(sumExpBudget)}</td>
    <td class="text-right">${formatCurrency(sumExpExecuted)}</td>
    <td class="text-right text-blue font-bold">${formatCurrency(sumBudgetBalance)}</td>
    <td class="text-right">${formatCurrency(sumActualBalance)}</td>
    <td class="text-center">${formatPercent(sumExpExecuted, sumExpBudget)}</td>
  `;
  tbody.appendChild(totalTr);

  // Render Progress Bars in Right Card
  const progressList = document.getElementById('dashboard-progress-list');
  progressList.innerHTML = '';

  dashboardMappedData.forEach(row => {
    if (!row.expBudget) return;
    
    const rate = (row.expExecuted / row.expBudget) * 100;
    const progressItem = document.createElement('div');
    progressItem.classList.add('status-progress-item');
    
    let color = 'var(--primary-color)';
    if (row.isSelfFunded) color = '#94a3b8';
    else if (rate > 90) color = 'var(--color-expenditure)';
    else if (rate > 50) color = 'var(--color-balance)';
    else color = 'var(--color-revenue)';

    progressItem.innerHTML = `
      <div class="status-label-row">
        <span class="status-title">${row.name}</span>
        <span class="status-percentage" style="color: ${color}">${rate.toFixed(1)}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-bar" style="width: ${rate}%; background-color: ${color}"></div>
      </div>
      <div class="status-values">
        <span>집행: ${formatCurrency(row.expExecuted)}</span>
        <span>예산: ${formatCurrency(row.expBudget)}</span>
      </div>
    `;
    progressList.appendChild(progressItem);
  });
}

// -------------------------------------------------------------
// TAB: REVENUE DETAILS TABLE (INTERACTIVE SORTING & FILTERING)
// -------------------------------------------------------------
let revenueSortCol = null;
let revenueSortDir = 'none';
let revenueFilters = {
  mok: [],
  accounts: [],
  desc: [],
  budget: [],
  decided: [],
  received: []
};

function setupRevenueTableInteractive() {
  const headers = document.querySelectorAll('#revenue-table th.th-interactive');
  
  headers.forEach(th => {
    const col = th.getAttribute('data-col');
    const filterBtn = th.querySelector('.header-filter-btn');
    const sortBtn = th.querySelector('.header-sort-btn');
    
    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllRevenueFilterDropdowns(col);
        toggleRevenueFilterDropdown(col);
      });
    }
    
    if (sortBtn) {
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleRevenueSort(col);
      });
    }
  });
  
  document.addEventListener('click', () => {
    closeAllRevenueFilterDropdowns();
  });
}

function toggleRevenueFilterDropdown(col) {
  const dropdown = document.getElementById(`filter-dropdown-${col}`);
  if (!dropdown) return;
  
  const isShown = dropdown.classList.contains('show');
  if (isShown) {
    dropdown.classList.remove('show');
  } else {
    renderRevenueFilterDropdownContent(col, dropdown);
    dropdown.classList.add('show');
  }
}

function closeAllRevenueFilterDropdowns(exceptCol = null) {
  const dropdowns = document.querySelectorAll('#revenue-table .header-filter-dropdown');
  dropdowns.forEach(dropdown => {
    const dropdownCol = dropdown.id.replace('filter-dropdown-', '');
    if (dropdownCol !== exceptCol) {
      dropdown.classList.remove('show');
    }
  });
}

function renderRevenueFilterDropdownContent(col, dropdown) {
  const uniqueValues = new Set();
  appData.revenue.forEach(row => {
    const mok = getMok(row);
    const accounts = row.Col_1 || '';
    const isTotal = mok === '[ 총   계  ]';
    const isSubtotal = accounts === '[ 소   계 ]';
    if (isTotal || isSubtotal) return;

    let val = '';
    if (col === 'mok') val = getMok(row) || '(공백)';
    else if (col === 'accounts') val = row.Col_1 || '(공백)';
    else if (col === 'desc') val = row.Col_2 || '(공백)';
    else if (col === 'budget') val = row.Col_3 ? formatCurrency(row.Col_3) : '0원';
    else if (col === 'decided') val = row.Col_4 ? formatCurrency(row.Col_4) : '0원';
    else if (col === 'received') val = row.Col_5 ? formatCurrency(row.Col_5) : '0원';

    uniqueValues.add(val.toString().trim());
  });

  const sortedValues = Array.from(uniqueValues).sort((a, b) => {
    if (a.endsWith('원') && b.endsWith('원')) {
      const numA = parseInt(a.replace(/,/g, '').replace('원', '')) || 0;
      const numB = parseInt(b.replace(/,/g, '').replace('원', '')) || 0;
      return numA - numB;
    }
    return a.localeCompare(b, 'ko');
  });

  dropdown.innerHTML = `
    <input type="text" class="filter-search" placeholder="검색..." onclick="event.stopPropagation()">
    <div class="filter-options-list">
      ${sortedValues.map(val => {
        const isChecked = revenueFilters[col].includes(val);
        return `
          <label class="filter-option-item" onclick="event.stopPropagation()">
            <input type="checkbox" data-val="${val}" ${isChecked ? 'checked' : ''}>
            <span>${val}</span>
          </label>
        `;
      }).join('')}
    </div>
    <div class="filter-actions" onclick="event.stopPropagation()">
      <button class="filter-btn-sub" onclick="applyRevenueFilter('${col}', true)">전체</button>
      <button class="filter-btn-sub clear" onclick="applyRevenueFilter('${col}', false)">해제</button>
    </div>
  `;

  const searchInput = dropdown.querySelector('.filter-search');
  searchInput.focus();
  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = dropdown.querySelectorAll('.filter-option-item');
    items.forEach(item => {
      const text = item.querySelector('span').innerText.toLowerCase();
      if (text.includes(term)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  });

  const checkboxes = dropdown.querySelectorAll('.filter-option-item input');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      updateRevenueFilterState(col, dropdown);
    });
  });
}

function updateRevenueFilterState(col, dropdown) {
  const checkboxes = dropdown.querySelectorAll('.filter-option-item input');
  const activeVals = [];
  checkboxes.forEach(cb => {
    if (cb.checked) {
      activeVals.push(cb.getAttribute('data-val'));
    }
  });

  const totalCheckboxes = checkboxes.length;
  if (activeVals.length === totalCheckboxes || activeVals.length === 0) {
    revenueFilters[col] = [];
  } else {
    revenueFilters[col] = activeVals;
  }

  updateFilterIconState(col);
  renderRevenueTable();
}

function updateFilterIconState(col) {
  const th = document.querySelector(`#revenue-table th[data-col="${col}"]`);
  if (!th) return;
  const filterBtn = th.querySelector('.header-filter-btn');
  if (!filterBtn) return;
  if (revenueFilters[col].length > 0) {
    filterBtn.classList.add('active');
  } else {
    filterBtn.classList.remove('active');
  }
}

function applyRevenueFilter(col, selectAll) {
  const dropdown = document.getElementById(`filter-dropdown-${col}`);
  if (!dropdown) return;

  const checkboxes = dropdown.querySelectorAll('.filter-option-item input');
  checkboxes.forEach(cb => {
    cb.checked = selectAll;
  });

  updateRevenueFilterState(col, dropdown);
}

window.applyRevenueFilter = applyRevenueFilter; // Make accessible globally for onclick in HTML template

function handleRevenueSort(col) {
  if (revenueSortCol === col) {
    if (revenueSortDir === 'none') {
      revenueSortDir = 'asc';
    } else if (revenueSortDir === 'asc') {
      revenueSortDir = 'desc';
    } else {
      revenueSortDir = 'none';
      revenueSortCol = null;
    }
  } else {
    revenueSortCol = col;
    revenueSortDir = 'asc';
  }

  const headers = document.querySelectorAll('#revenue-table th.th-interactive');
  headers.forEach(th => {
    const curCol = th.getAttribute('data-col');
    const sortBtn = th.querySelector('.header-sort-btn');
    if (!sortBtn) return;
    const icon = sortBtn.querySelector('i');
    
    sortBtn.classList.remove('active');
    icon.className = 'fa-solid fa-sort';
    
    if (curCol === revenueSortCol && revenueSortDir !== 'none') {
      sortBtn.classList.add('active');
      if (revenueSortDir === 'asc') {
        icon.className = 'fa-solid fa-sort-up';
      } else {
        icon.className = 'fa-solid fa-sort-down';
      }
    }
  });

  renderRevenueTable();
}

function renderRevenueTable() {
  const tbody = document.getElementById('revenue-table-body');
  const searchVal = document.getElementById('revenue-search').value.toLowerCase().trim();
  
  tbody.innerHTML = '';
  let count = 0;

  const deactivatedRevenues = new Set();
  appState.linkageMappings.forEach(mapDef => {
    if (mapDef.isActive === false) {
      const resolvedRevNames = resolveRevenueNames(mapDef.revenueNames || []);
      resolvedRevNames.forEach(name => deactivatedRevenues.add(name));
    }
  });
  const hasDeactivatedRevenues = deactivatedRevenues.size > 0;

  const individualRows = [];
  let originalRows = [];
  
  appData.revenue.forEach(row => {
    const mok = getMok(row);
    const accounts = row.Col_1 || '';
    const isTotal = mok === '[ 총   계  ]';
    const isSubtotal = accounts === '[ 소   계 ]';
    
    if (row.Col_2 && deactivatedRevenues.has(row.Col_2.trim())) {
      return;
    }
    
    if (isTotal || isSubtotal) {
      // Subtotal/total row
    } else {
      individualRows.push(row);
    }
    originalRows.push(row);
  });

  const isFilterActive = !!searchVal || 
    revenueFilters.mok.length > 0 ||
    revenueFilters.accounts.length > 0 ||
    revenueFilters.desc.length > 0 ||
    revenueFilters.budget.length > 0 ||
    revenueFilters.decided.length > 0 ||
    revenueFilters.received.length > 0 ||
    hasDeactivatedRevenues;
    
  const isSortActive = revenueSortCol !== null && revenueSortDir !== 'none';

  if (!isFilterActive && !isSortActive) {
    // Precalculate rowspans for mok AND accounts in originalRows
    const rowSpans = [];
    let i = 0;
    while (i < originalRows.length) {
      const mok = getMok(originalRows[i]);
      const accounts = originalRows[i].Col_1 || '';
      const isTotal = mok === '[ 총   계  ]';
      const isSubtotal = accounts === '[ 소   계 ]';

      if (isTotal || isSubtotal) {
        rowSpans[i] = { mok: 1, accounts: 1 };
        i++;
        continue;
      }

      // Find consecutive rows with same mok
      let mokCount = 0;
      let j = i;
      while (j < originalRows.length) {
        const jMok = getMok(originalRows[j]);
        const jAccounts = originalRows[j].Col_1 || '';
        const jIsTotal = jMok === '[ 총   계  ]';
        const jIsSubtotal = jAccounts === '[ 소   계 ]';
        if (jIsTotal || jIsSubtotal || jMok !== mok) break;
        mokCount++;
        j++;
      }
      rowSpans[i] = { mok: mokCount, accounts: 0 }; // accounts calculated below
      for (let k = i + 1; k < j; k++) {
        rowSpans[k] = { mok: 0, accounts: 0 };
      }

      // Within the mok group, find consecutive runs with same accounts
      let ai = i;
      while (ai < j) {
        const curAcc = originalRows[ai].Col_1 || '';
        let accCount = 0;
        let aj = ai;
        while (aj < j && (originalRows[aj].Col_1 || '') === curAcc) {
          accCount++;
          aj++;
        }
        rowSpans[ai].accounts = accCount;
        for (let k = ai + 1; k < aj; k++) {
          rowSpans[k].accounts = 0;
        }
        ai = aj;
      }

      i = j;
    }

    originalRows.forEach((row, index) => {
      const mok = getMok(row);
      const accounts = row.Col_1 || '';
      const desc = row.Col_2 || '';
      const isTotal = mok === '[ 총   계  ]';
      const isSubtotal = accounts === '[ 소   계 ]';

      const tr = document.createElement('tr');
      if (isTotal) tr.classList.add('row-total');
      else if (isSubtotal) tr.classList.add('row-subtotal');

      let mokTd = '';
      let accountsTd = '';
      if (isTotal) {
        mokTd = `<td><strong>총 합계</strong></td>`;
        accountsTd = `<td></td>`;
      } else if (isSubtotal) {
        mokTd = `<td><strong>${mok || ''}</strong></td>`;
        accountsTd = `<td><strong>${accounts}</strong></td>`;
      } else {
        const spanInfo = rowSpans[index];
        if (spanInfo.mok > 0) {
          mokTd = `<td rowspan="${spanInfo.mok}" class="cell-merged" style="vertical-align:middle;text-align:left;">${mok}</td>`;
        }
        if (spanInfo.accounts > 0) {
          accountsTd = `<td rowspan="${spanInfo.accounts}" class="cell-merged" style="vertical-align:middle;text-align:left;">${accounts}</td>`;
        }
      }

      tr.innerHTML = `
        ${mokTd}
        ${accountsTd}
        <td>${desc || ''}</td>
        <td class="text-right">${row.Col_3 ? formatCurrency(row.Col_3) : '-'}</td>
        <td class="text-right text-success-header">${row.Col_4 ? formatCurrency(row.Col_4) : '-'}</td>
        <td class="text-right">${row.Col_5 ? formatCurrency(row.Col_5) : '-'}</td>
      `;
      tbody.appendChild(tr);
      
      if (!isTotal && !isSubtotal) {
        count++;
      }
    });
    
    document.getElementById('revenue-count').innerText = count;
    return;
  }

  let filteredRows = individualRows.filter(row => {
    const mok = getMok(row);
    const accounts = row.Col_1 || '';
    const desc = row.Col_2 || '';
    const budgetVal = row.Col_3 ? formatCurrency(row.Col_3) : '0원';
    const decidedVal = row.Col_4 ? formatCurrency(row.Col_4) : '0원';
    const receivedVal = row.Col_5 ? formatCurrency(row.Col_5) : '0원';

    const matchSearch = !searchVal || 
      mok.toString().toLowerCase().includes(searchVal) ||
      accounts.toString().toLowerCase().includes(searchVal) ||
      desc.toString().toLowerCase().includes(searchVal);

    if (!matchSearch) return false;

    if (revenueFilters.mok.length > 0 && !revenueFilters.mok.includes(mok.toString().trim())) return false;
    if (revenueFilters.accounts.length > 0 && !revenueFilters.accounts.includes(accounts.toString().trim())) return false;
    if (revenueFilters.desc.length > 0 && !revenueFilters.desc.includes(desc.toString().trim())) return false;
    if (revenueFilters.budget.length > 0 && !revenueFilters.budget.includes(budgetVal.trim())) return false;
    if (revenueFilters.decided.length > 0 && !revenueFilters.decided.includes(decidedVal.trim())) return false;
    if (revenueFilters.received.length > 0 && !revenueFilters.received.includes(receivedVal.trim())) return false;

    return true;
  });

  if (isSortActive) {
    filteredRows.sort((a, b) => {
      let valA, valB;
      if (revenueSortCol === 'mok') {
        valA = getMok(a);
        valB = getMok(b);
      } else if (revenueSortCol === 'accounts') {
        valA = a.Col_1 || '';
        valB = b.Col_1 || '';
      } else if (revenueSortCol === 'desc') {
        valA = a.Col_2 || '';
        valB = b.Col_2 || '';
      } else if (revenueSortCol === 'budget') {
        valA = parseFloat(a.Col_3) || 0;
        valB = parseFloat(b.Col_3) || 0;
      } else if (revenueSortCol === 'decided') {
        valA = parseFloat(a.Col_4) || 0;
        valB = parseFloat(b.Col_4) || 0;
      } else if (revenueSortCol === 'received') {
        valA = parseFloat(a.Col_5) || 0;
        valB = parseFloat(b.Col_5) || 0;
      }

      if (typeof valA === 'string') {
        return revenueSortDir === 'asc' ? valA.localeCompare(valB, 'ko') : valB.localeCompare(valA, 'ko');
      } else {
        return revenueSortDir === 'asc' ? valA - valB : valB - valA;
      }
    });
  }

  // Precalculate rowspans for mok AND accounts in filteredRows
  const filteredRowSpans = [];
  let idx = 0;
  while (idx < filteredRows.length) {
    const currentMok = getMok(filteredRows[idx]);
    let mokCount = 0;
    let j = idx;
    while (j < filteredRows.length && getMok(filteredRows[j]) === currentMok) {
      mokCount++;
      j++;
    }
    filteredRowSpans[idx] = { mok: mokCount, accounts: 0 };
    for (let k = idx + 1; k < j; k++) {
      filteredRowSpans[k] = { mok: 0, accounts: 0 };
    }
    // Within mok group, calculate accounts rowspans
    let ai = idx;
    while (ai < j) {
      const curAcc = filteredRows[ai].Col_1 || '';
      let accCount = 0;
      let aj = ai;
      while (aj < j && (filteredRows[aj].Col_1 || '') === curAcc) {
        accCount++;
        aj++;
      }
      filteredRowSpans[ai].accounts = accCount;
      for (let k = ai + 1; k < aj; k++) {
        filteredRowSpans[k].accounts = 0;
      }
      ai = aj;
    }
    idx = j;
  }

  let sumBudget = 0;
  let sumDecided = 0;
  let sumReceived = 0;

  filteredRows.forEach((row, index) => {
    const mok = getMok(row);
    const accounts = row.Col_1 || '';
    const desc = row.Col_2 || '';

    sumBudget += parseFloat(row.Col_3) || 0;
    sumDecided += parseFloat(row.Col_4) || 0;
    sumReceived += parseFloat(row.Col_5) || 0;

    const tr = document.createElement('tr');
    const spanInfo = filteredRowSpans[index];

    let mokTd = '';
    if (spanInfo.mok > 0) {
      mokTd = `<td rowspan="${spanInfo.mok}" class="cell-merged" style="vertical-align:middle;text-align:left;">${mok}</td>`;
    }

    let accountsTd = '';
    if (spanInfo.accounts > 0) {
      accountsTd = `<td rowspan="${spanInfo.accounts}" class="cell-merged" style="vertical-align:middle;text-align:left;">${accounts}</td>`;
    }

    tr.innerHTML = `
      ${mokTd}
      ${accountsTd}
      <td class="col-desc">${desc}</td>
      <td class="text-right">${row.Col_3 ? formatCurrency(row.Col_3) : '-'}</td>
      <td class="text-right text-success-header">${row.Col_4 ? formatCurrency(row.Col_4) : '-'}</td>
      <td class="text-right">${row.Col_5 ? formatCurrency(row.Col_5) : '-'}</td>
    `;
    tbody.appendChild(tr);
    count++;
  });

  if (count > 0) {
    const totalTr = document.createElement('tr');
    totalTr.classList.add('row-total');
    totalTr.innerHTML = `
      <td colspan="3"><strong>합계 (필터 결과)</strong></td>
      <td class="text-right"><strong>${formatCurrency(sumBudget)}</strong></td>
      <td class="text-right text-success-header"><strong>${formatCurrency(sumDecided)}</strong></td>
      <td class="text-right"><strong>${formatCurrency(sumReceived)}</strong></td>
    `;
    tbody.appendChild(totalTr);
  }

  document.getElementById('revenue-count').innerText = count;
}

// -------------------------------------------------------------
// TAB: EXPENDITURE DETAILS TABLE (INTERACTIVE SORTING & FILTERING)
// -------------------------------------------------------------
let expenditureSortCol = null;
let expenditureSortDir = 'none';
let expenditureFilters = {
  subitem: [],
  account: [],
  desc: [],
  budget: [],
  proposed: [],
  executed: [],
  balance: [],
  paid: [],
  paid_balance: [],
  funding: []
};

function setupExpenditureTableInteractive() {
  const headers = document.querySelectorAll('#expenditure-table th.th-interactive');
  
  headers.forEach(th => {
    const col = th.getAttribute('data-col');
    const filterBtn = th.querySelector('.header-filter-btn');
    const sortBtn = th.querySelector('.header-sort-btn');
    
    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllExpenditureFilterDropdowns(col);
        toggleExpenditureFilterDropdown(col);
      });
    }
    
    if (sortBtn) {
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleExpenditureSort(col);
      });
    }
  });
  
  document.addEventListener('click', () => {
    closeAllExpenditureFilterDropdowns();
  });
}

function toggleExpenditureFilterDropdown(col) {
  const dropdown = document.getElementById(`filter-dropdown-exp-${col}`);
  if (!dropdown) return;
  
  const isShown = dropdown.classList.contains('show');
  if (isShown) {
    dropdown.classList.remove('show');
  } else {
    renderExpenditureFilterDropdownContent(col, dropdown);
    dropdown.classList.add('show');
  }
}

function closeAllExpenditureFilterDropdowns(exceptCol = null) {
  const dropdowns = document.querySelectorAll('#expenditure-table .header-filter-dropdown');
  dropdowns.forEach(dropdown => {
    const dropdownCol = dropdown.id.replace('filter-dropdown-exp-', '');
    if (dropdownCol !== exceptCol) {
      dropdown.classList.remove('show');
    }
  });
}

function renderExpenditureFilterDropdownContent(col, dropdown) {
  const mappedExpNames = [];
  appState.linkageMappings.forEach(m => {
    (m.expenditureNames || []).forEach(name => {
      if (!mappedExpNames.includes(name)) mappedExpNames.push(name);
    });
  });

  const uniqueValues = new Set();
  appData.expenditure.forEach(row => {
    const businessName = getMok(row);
    const subitemName = row.Col_1 || '';
    const accountName = row.Col_2 || '';
    const desc = row.Col_3 || '';
    
    const isTotal = /\[\s*총\s*계\s*\]/.test(businessName) || /\[\s*총\s*계\s*\]/.test(subitemName) || /\[\s*총\s*계\s*\]/.test(accountName);
    const isSubtotal = /\[\s*소\s*계\s*\]/.test(subitemName) || /\[\s*소\s*계\s*\]/.test(accountName);

    if (isTotal || isSubtotal) return;
    if (desc && !mappedExpNames.includes(desc)) return;

    let val = '';
    if (col === 'subitem') val = row.Col_1 || '(공백)';
    else if (col === 'account') val = row.Col_2 || '(공백)';
    else if (col === 'desc') val = row.Col_3 || '(공백)';
    else if (col === 'budget') val = row.Col_6 ? formatCurrency(row.Col_6) : '0원';
    else if (col === 'proposed') val = row.Col_7 ? formatCurrency(row.Col_7) : '0원';
    else if (col === 'executed') val = row.Col_8 ? formatCurrency(row.Col_8) : '0원';
    else if (col === 'balance') val = row.Col_9 ? formatCurrency(row.Col_9) : '0원';
    else if (col === 'paid') val = row.Col_11 ? formatCurrency(row.Col_11) : '0원';
    else if (col === 'paid_balance') val = row.Col_12 ? formatCurrency(row.Col_12) : '0원';
    else if (col === 'funding') val = row.Col_13 ? formatCurrency(row.Col_13) : '0원';

    uniqueValues.add(val.toString().trim());
  });

  const sortedValues = Array.from(uniqueValues).sort((a, b) => {
    if (a.endsWith('원') && b.endsWith('원')) {
      const numA = parseInt(a.replace(/,/g, '').replace('원', '')) || 0;
      const numB = parseInt(b.replace(/,/g, '').replace('원', '')) || 0;
      return numA - numB;
    }
    return a.localeCompare(b, 'ko');
  });

  dropdown.innerHTML = `
    <input type="text" class="filter-search" placeholder="검색..." onclick="event.stopPropagation()">
    <div class="filter-options-list">
      ${sortedValues.map(val => {
        const isChecked = expenditureFilters[col].includes(val);
        return `
          <label class="filter-option-item" onclick="event.stopPropagation()">
            <input type="checkbox" data-val="${val}" ${isChecked ? 'checked' : ''}>
            <span>${val}</span>
          </label>
        `;
      }).join('')}
    </div>
    <div class="filter-actions" onclick="event.stopPropagation()">
      <button class="filter-btn-sub" onclick="applyExpenditureFilter('${col}', true)">전체</button>
      <button class="filter-btn-sub clear" onclick="applyExpenditureFilter('${col}', false)">해제</button>
    </div>
  `;

  const searchInput = dropdown.querySelector('.filter-search');
  searchInput.focus();
  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = dropdown.querySelectorAll('.filter-option-item');
    items.forEach(item => {
      const text = item.querySelector('span').innerText.toLowerCase();
      if (text.includes(term)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  });

  const checkboxes = dropdown.querySelectorAll('.filter-option-item input');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      updateExpenditureFilterState(col, dropdown);
    });
  });
}

function updateExpenditureFilterState(col, dropdown) {
  const checkboxes = dropdown.querySelectorAll('.filter-option-item input');
  const activeVals = [];
  checkboxes.forEach(cb => {
    if (cb.checked) {
      activeVals.push(cb.getAttribute('data-val'));
    }
  });

  const totalCheckboxes = checkboxes.length;
  if (activeVals.length === totalCheckboxes || activeVals.length === 0) {
    expenditureFilters[col] = [];
  } else {
    expenditureFilters[col] = activeVals;
  }

  updateExpenditureFilterIconState(col);
  renderExpenditureTable();
}

function updateExpenditureFilterIconState(col) {
  const th = document.querySelector(`#expenditure-table th[data-col="${col}"]`);
  if (!th) return;
  const filterBtn = th.querySelector('.header-filter-btn');
  if (!filterBtn) return;
  if (expenditureFilters[col].length > 0) {
    filterBtn.classList.add('active');
  } else {
    filterBtn.classList.remove('active');
  }
}

function applyExpenditureFilter(col, selectAll) {
  const dropdown = document.getElementById(`filter-dropdown-exp-${col}`);
  if (!dropdown) return;

  const checkboxes = dropdown.querySelectorAll('.filter-option-item input');
  checkboxes.forEach(cb => {
    cb.checked = selectAll;
  });

  updateExpenditureFilterState(col, dropdown);
}

window.applyExpenditureFilter = applyExpenditureFilter;

function handleExpenditureSort(col) {
  if (expenditureSortCol === col) {
    if (expenditureSortDir === 'none') expenditureSortDir = 'asc';
    else if (expenditureSortDir === 'asc') expenditureSortDir = 'desc';
    else {
      expenditureSortDir = 'none';
      expenditureSortCol = null;
    }
  } else {
    expenditureSortCol = col;
    expenditureSortDir = 'asc';
  }

  const headers = document.querySelectorAll('#expenditure-table th.th-interactive');
  headers.forEach(th => {
    const curCol = th.getAttribute('data-col');
    const sortBtn = th.querySelector('.header-sort-btn');
    if (!sortBtn) return;
    const icon = sortBtn.querySelector('i');
    sortBtn.classList.remove('active');
    icon.className = 'fa-solid fa-sort';
    
    if (curCol === expenditureSortCol && expenditureSortDir !== 'none') {
      sortBtn.classList.add('active');
      if (expenditureSortDir === 'asc') icon.className = 'fa-solid fa-sort-up';
      else icon.className = 'fa-solid fa-sort-down';
    }
  });

  renderExpenditureTable();
}

function renderExpenditureTable() {
  const tbody = document.getElementById('expenditure-table-body');
  const searchVal = document.getElementById('expenditure-search').value.toLowerCase().trim();
  
  tbody.innerHTML = '';
  let count = 0;

  const deactivatedExpenditures = new Set();
  appState.linkageMappings.forEach(mapDef => {
    if (mapDef.isActive === false) {
      (mapDef.expenditureNames || []).forEach(name => deactivatedExpenditures.add(name));
    }
  });
  const hasDeactivatedExpenditures = deactivatedExpenditures.size > 0;

  const mappedExpNames = [];
  appState.linkageMappings.forEach(m => {
    (m.expenditureNames || []).forEach(name => {
      if (!mappedExpNames.includes(name)) {
        mappedExpNames.push(name);
      }
    });
  });

  const isFilterActive = !!searchVal || 
    expenditureFilters.subitem.length > 0 ||
    expenditureFilters.account.length > 0 ||
    expenditureFilters.desc.length > 0 ||
    expenditureFilters.budget.length > 0 ||
    expenditureFilters.proposed.length > 0 ||
    expenditureFilters.executed.length > 0 ||
    expenditureFilters.balance.length > 0 ||
    expenditureFilters.paid.length > 0 ||
    expenditureFilters.paid_balance.length > 0 ||
    expenditureFilters.funding.length > 0 ||
    hasDeactivatedExpenditures;
    
  const isSortActive = expenditureSortCol !== null && expenditureSortDir !== 'none';

  const individualRows = [];
  const originalRows = [];

  appData.expenditure.forEach(row => {
    const businessName = getMok(row);
    const subitemName = row.Col_1 || '';
    const accountName = row.Col_2 || '';
    const desc = row.Col_3 || '';

    const isTotal = /\[\s*총\s*계\s*\]/.test(businessName) || /\[\s*총\s*계\s*\]/.test(subitemName) || /\[\s*총\s*계\s*\]/.test(accountName);
    const isSubtotal = /\[\s*소\s*계\s*\]/.test(subitemName) || /\[\s*소\s*계\s*\]/.test(accountName);

    if (isTotal) return;

    if (isSubtotal) {
      originalRows.push({ isSubtotal: true, row });
      return;
    }

    if (desc && deactivatedExpenditures.has(desc.trim())) return;
    if (desc && !mappedExpNames.includes(desc)) return;

    individualRows.push(row);
    originalRows.push({ isSubtotal: false, row });
  });

  if (!isFilterActive && !isSortActive) {
    let subCol6 = 0, subCol7 = 0, subCol8 = 0, subCol9 = 0, subCol11 = 0, subCol12 = 0, subCol13 = 0;
    let hasMappedInSub = false;

    let totalCol6 = 0, totalCol7 = 0, totalCol8 = 0, totalCol9 = 0, totalCol11 = 0, totalCol12 = 0, totalCol13 = 0;

    // Precalculate rowspans for subitem and funding source
    const rowSpans = [];
    let i = 0;
    while (i < originalRows.length) {
      if (originalRows[i].isSubtotal) {
        rowSpans[i] = { subitem: 1, funding: 1 };
        i++;
        continue;
      }
      const currentSubitem = originalRows[i].row.Col_1 || '';
      let countVal = 0;
      let j = i;
      while (j < originalRows.length && !originalRows[j].isSubtotal && (originalRows[j].row.Col_1 || '') === currentSubitem) {
        countVal++;
        j++;
      }
      rowSpans[i] = { subitem: countVal, funding: countVal };
      for (let k = i + 1; k < j; k++) {
        rowSpans[k] = { subitem: 0, funding: 0 };
      }
      i = j;
    }

    originalRows.forEach((item, index) => {
      if (item.isSubtotal) {
        if (hasMappedInSub) {
          const tr = document.createElement('tr');
          tr.classList.add('row-subtotal');
          tr.innerHTML = `
            <td><strong>${item.row.Col_1 || ''}</strong></td>
            <td><strong>${item.row.Col_2 || ''}</strong></td>
            <td>-</td>
            <td class="text-right">${formatCurrency(subCol6)}</td>
            <td class="text-right text-warning-header">${formatCurrency(subCol7)}</td>
            <td class="text-right text-danger-header">${formatCurrency(subCol8)}</td>
            <td class="text-right font-semibold">${formatCurrency(subCol9)}</td>
            <td class="text-right">${formatCurrency(subCol11)}</td>
            <td class="text-right">${formatCurrency(subCol12)}</td>
            <td class="text-right">-</td>
          `;
          tbody.appendChild(tr);
          
          subCol6 = 0; subCol7 = 0; subCol8 = 0; subCol9 = 0; subCol11 = 0; subCol12 = 0; subCol13 = 0;
          hasMappedInSub = false;
        }
        return;
      }

      const r = item.row;
      const subitemName = r.Col_1 || '';
      const accountName = r.Col_2 || '';
      const desc = r.Col_3 || '';

      const tr = document.createElement('tr');
      const spanInfo = rowSpans[index];

      let subitemTd = '';
      if (spanInfo.subitem > 0) {
        subitemTd = `<td rowspan="${spanInfo.subitem}" class="cell-merged" style="vertical-align:middle;text-align:left;">${subitemName}</td>`;
      }

      const fundingValStr = r.Col_13 ? formatCurrency(r.Col_13) : '-';
      let fundingTd = '';
      if (spanInfo.funding > 0) {
        fundingTd = `<td rowspan="${spanInfo.funding}" class="cell-merged text-right" style="vertical-align:middle;text-align:right;">${fundingValStr}</td>`;
      }

      tr.innerHTML = `
        ${subitemTd}
        <td>${accountName || ''}</td>
        <td class="col-desc">${desc || ''}</td>
        <td class="text-right">${r.Col_6 ? formatCurrency(r.Col_6) : '-'}</td>
        <td class="text-right text-warning-header">${r.Col_7 ? formatCurrency(r.Col_7) : '-'}</td>
        <td class="text-right text-danger-header">${r.Col_8 ? formatCurrency(r.Col_8) : '-'}</td>
        <td class="text-right font-semibold">${r.Col_9 ? formatCurrency(r.Col_9) : '-'}</td>
        <td class="text-right">${r.Col_11 ? formatCurrency(r.Col_11) : '-'}</td>
        <td class="text-right">${r.Col_12 ? formatCurrency(r.Col_12) : '-'}</td>
        ${fundingTd}
      `;
      tbody.appendChild(tr);

      const val6 = parseFloat(r.Col_6) || 0;
      const val7 = parseFloat(r.Col_7) || 0;
      const val8 = parseFloat(r.Col_8) || 0;
      const val9 = parseFloat(r.Col_9) || 0;
      const val11 = parseFloat(r.Col_11) || 0;
      const val12 = parseFloat(r.Col_12) || 0;
      const val13 = parseFloat(r.Col_13) || 0;

      subCol6 += val6; subCol7 += val7; subCol8 += val8; subCol9 += val9; subCol11 += val11; subCol12 += val12; subCol13 += val13;
      totalCol6 += val6; totalCol7 += val7; totalCol8 += val8; totalCol9 += val9; totalCol11 += val11; totalCol12 += val12; totalCol13 += val13;
      hasMappedInSub = true;
      count++;
    });

    if (count > 0) {
      const totalTr = document.createElement('tr');
      totalTr.className = 'row-total';
      totalTr.innerHTML = `
        <td><strong>합계 (정산 대상)</strong></td>
        <td>-</td>
        <td>-</td>
        <td class="text-right"><strong>${formatCurrency(totalCol6)}</strong></td>
        <td class="text-right text-warning-header"><strong>${formatCurrency(totalCol7)}</strong></td>
        <td class="text-right text-danger-header"><strong>${formatCurrency(totalCol8)}</strong></td>
        <td class="text-right font-semibold"><strong>${formatCurrency(totalCol9)}</strong></td>
        <td class="text-right"><strong>${formatCurrency(totalCol11)}</strong></td>
        <td class="text-right"><strong>${formatCurrency(totalCol12)}</strong></td>
        <td class="text-right"><strong>${formatCurrency(totalCol13)}</strong></td>
      `;
      tbody.appendChild(totalTr);
    }

    document.getElementById('expenditure-count').innerText = count;
    return;
  }

  let filteredRows = individualRows.filter(row => {
    const subitemName = row.Col_1 || '';
    const accountName = row.Col_2 || '';
    const desc = row.Col_3 || '';
    const budgetVal = row.Col_6 ? formatCurrency(row.Col_6) : '0원';
    const proposedVal = row.Col_7 ? formatCurrency(row.Col_7) : '0원';
    const executedVal = row.Col_8 ? formatCurrency(row.Col_8) : '0원';
    const balanceVal = row.Col_9 ? formatCurrency(row.Col_9) : '0원';
    const paidVal = row.Col_11 ? formatCurrency(row.Col_11) : '0원';
    const paidBalanceVal = row.Col_12 ? formatCurrency(row.Col_12) : '0원';
    const fundingVal = row.Col_13 ? formatCurrency(row.Col_13) : '0원';

    const matchSearch = !searchVal || 
      subitemName.toString().toLowerCase().includes(searchVal) ||
      accountName.toString().toLowerCase().includes(searchVal) ||
      desc.toString().toLowerCase().includes(searchVal);

    if (!matchSearch) return false;

    if (expenditureFilters.subitem.length > 0 && !expenditureFilters.subitem.includes(subitemName.toString().trim())) return false;
    if (expenditureFilters.account.length > 0 && !expenditureFilters.account.includes(accountName.toString().trim())) return false;
    if (expenditureFilters.desc.length > 0 && !expenditureFilters.desc.includes(desc.toString().trim())) return false;
    if (expenditureFilters.budget.length > 0 && !expenditureFilters.budget.includes(budgetVal.trim())) return false;
    if (expenditureFilters.proposed.length > 0 && !expenditureFilters.proposed.includes(proposedVal.trim())) return false;
    if (expenditureFilters.executed.length > 0 && !expenditureFilters.executed.includes(executedVal.trim())) return false;
    if (expenditureFilters.balance.length > 0 && !expenditureFilters.balance.includes(balanceVal.trim())) return false;
    if (expenditureFilters.paid.length > 0 && !expenditureFilters.paid.includes(paidVal.trim())) return false;
    if (expenditureFilters.paid_balance.length > 0 && !expenditureFilters.paid_balance.includes(paidBalanceVal.trim())) return false;
    if (expenditureFilters.funding.length > 0 && !expenditureFilters.funding.includes(fundingVal.trim())) return false;

    return true;
  });

  if (isSortActive) {
    filteredRows.sort((a, b) => {
      let valA, valB;
      if (expenditureSortCol === 'subitem') {
        valA = a.Col_1 || '';
        valB = b.Col_1 || '';
      } else if (expenditureSortCol === 'account') {
        valA = a.Col_2 || '';
        valB = b.Col_2 || '';
      } else if (expenditureSortCol === 'desc') {
        valA = a.Col_3 || '';
        valB = b.Col_3 || '';
      } else if (expenditureSortCol === 'budget') {
        valA = parseFloat(a.Col_6) || 0;
        valB = parseFloat(b.Col_6) || 0;
      } else if (expenditureSortCol === 'proposed') {
        valA = parseFloat(a.Col_7) || 0;
        valB = parseFloat(b.Col_7) || 0;
      } else if (expenditureSortCol === 'executed') {
        valA = parseFloat(a.Col_8) || 0;
        valB = parseFloat(b.Col_8) || 0;
      } else if (expenditureSortCol === 'balance') {
        valA = parseFloat(a.Col_9) || 0;
        valB = parseFloat(b.Col_9) || 0;
      } else if (expenditureSortCol === 'paid') {
        valA = parseFloat(a.Col_11) || 0;
        valB = parseFloat(b.Col_11) || 0;
      } else if (expenditureSortCol === 'paid_balance') {
        valA = parseFloat(a.Col_12) || 0;
        valB = parseFloat(b.Col_12) || 0;
      } else if (expenditureSortCol === 'funding') {
        valA = parseFloat(a.Col_13) || 0;
        valB = parseFloat(b.Col_13) || 0;
      }

      if (typeof valA === 'string') {
        return expenditureSortDir === 'asc' ? valA.localeCompare(valB, 'ko') : valB.localeCompare(valA, 'ko');
      } else {
        return expenditureSortDir === 'asc' ? valA - valB : valB - valA;
      }
    });
  }

  // Precalculate rowspans for subitem and funding source in filtered rows
  const filteredRowSpans = [];
  let idx = 0;
  while (idx < filteredRows.length) {
    const currentSubitem = filteredRows[idx].Col_1 || '';
    let countVal = 0;
    let j = idx;
    while (j < filteredRows.length && (filteredRows[j].Col_1 || '') === currentSubitem) {
      countVal++;
      j++;
    }
    filteredRowSpans[idx] = { subitem: countVal, funding: countVal };
    for (let k = idx + 1; k < j; k++) {
      filteredRowSpans[k] = { subitem: 0, funding: 0 };
    }
    idx = j;
  }

  let totalCol6 = 0, totalCol7 = 0, totalCol8 = 0, totalCol9 = 0, totalCol11 = 0, totalCol12 = 0, totalCol13 = 0;

  filteredRows.forEach((r, index) => {
    const subitemName = r.Col_1 || '';
    const accountName = r.Col_2 || '';
    const desc = r.Col_3 || '';
    const fundingValStr = r.Col_13 ? formatCurrency(r.Col_13) : '-';

    const tr = document.createElement('tr');
    const spanInfo = filteredRowSpans[index];

    let subitemTd = '';
    if (spanInfo.subitem > 0) {
      subitemTd = `<td rowspan="${spanInfo.subitem}" class="cell-merged" style="vertical-align:middle;text-align:left;">${subitemName}</td>`;
    }

    let fundingTd = '';
    if (spanInfo.funding > 0) {
      fundingTd = `<td rowspan="${spanInfo.funding}" class="cell-merged text-right" style="vertical-align:middle;text-align:right;">${fundingValStr}</td>`;
    }

    tr.innerHTML = `
      ${subitemTd}
      <td>${accountName || ''}</td>
      <td class="col-desc">${desc || ''}</td>
      <td class="text-right">${r.Col_6 ? formatCurrency(r.Col_6) : '-'}</td>
      <td class="text-right text-warning-header">${r.Col_7 ? formatCurrency(r.Col_7) : '-'}</td>
      <td class="text-right text-danger-header">${r.Col_8 ? formatCurrency(r.Col_8) : '-'}</td>
      <td class="text-right font-semibold">${r.Col_9 ? formatCurrency(r.Col_9) : '-'}</td>
      <td class="text-right">${r.Col_11 ? formatCurrency(r.Col_11) : '-'}</td>
      <td class="text-right">${r.Col_12 ? formatCurrency(r.Col_12) : '-'}</td>
      ${fundingTd}
    `;
    tbody.appendChild(tr);

    totalCol6 += parseFloat(r.Col_6) || 0;
    totalCol7 += parseFloat(r.Col_7) || 0;
    totalCol8 += parseFloat(r.Col_8) || 0;
    totalCol9 += parseFloat(r.Col_9) || 0;
    totalCol11 += parseFloat(r.Col_11) || 0;
    totalCol12 += parseFloat(r.Col_12) || 0;
    totalCol13 += parseFloat(r.Col_13) || 0;
    count++;
  });

  if (count > 0) {
    const totalTr = document.createElement('tr');
    totalTr.className = 'row-total';
    totalTr.innerHTML = `
      <td colspan="3"><strong>합계 (필터 결과)</strong></td>
      <td class="text-right"><strong>${formatCurrency(totalCol6)}</strong></td>
      <td class="text-right text-warning-header"><strong>${formatCurrency(totalCol7)}</strong></td>
      <td class="text-right text-danger-header"><strong>${formatCurrency(totalCol8)}</strong></td>
      <td class="text-right font-semibold"><strong>${formatCurrency(totalCol9)}</strong></td>
      <td class="text-right"><strong>${formatCurrency(totalCol11)}</strong></td>
      <td class="text-right"><strong>${formatCurrency(totalCol12)}</strong></td>
      <td class="text-right"><strong>${formatCurrency(totalCol13)}</strong></td>
    `;
    tbody.appendChild(totalTr);
  }

  document.getElementById('expenditure-count').innerText = count;
}

// -------------------------------------------------------------
// TAB: MONTHLY MATRIX TABLE
// -------------------------------------------------------------
// Helper: 세출산출내역에 존재하는 세부항목명 Set을 반환
function getValidSubitems() {
  const validSet = new Set();
  appData.expenditure.forEach(row => {
    const subitem = row.Col_1 || '';
    const isTotalOrSubtotal = isExpenditureTotalOrSubtotal(row);
    if (!isTotalOrSubtotal && subitem.trim()) {
      validSet.add(subitem.trim());
    }
  });
  return validSet;
}

// Helper: 매트릭스 표 클릭 시 시각적 하이라이트 부여
function updateMatrixHighlight() {
  const table = document.getElementById('monthly-matrix-table');
  if (!table) return;
  
  // 모든 active 관련 클래스 제거
  table.querySelectorAll('th, td').forEach(cell => {
    cell.classList.remove('active-cell', 'active-row', 'active-col');
  });

  const { selectedMonth, selectedCat } = analysisState;

  table.querySelectorAll('th, td').forEach(cell => {
    const month = cell.dataset.month;
    const cat = cell.dataset.cat;
    
    const isHeaderCat = cell.tagName === 'TH' && cell.dataset.cat;
    const isHeaderMonth = cell.tagName === 'TD' && cell.dataset.month && cell.classList.contains('row-label'); 
    
    // 정확히 매칭되는 단일 셀/헤더인 경우 active-cell 적용
    if (month === selectedMonth && cat === selectedCat) {
      cell.classList.add('active-cell');
    } else if (selectedMonth === 'all' && cat === selectedCat && (isHeaderCat || cell.dataset.isTotalSpentCell)) {
      cell.classList.add('active-cell');
    } else if (selectedCat === 'all' && month === selectedMonth && (isHeaderMonth || cell.dataset.isTotalMonthCell)) {
      cell.classList.add('active-cell');
    }
    
    // 열 하이라이트 (동일 카테고리)
    if (selectedCat !== 'all' && cat === selectedCat) {
      cell.classList.add('active-col');
    }
    // 행 하이라이트 (동일 월)
    if (selectedMonth !== 'all' && month === selectedMonth) {
      cell.classList.add('active-row');
    }
  });
}

function renderMonthlyMatrix() {
  const tbody = document.getElementById('monthly-matrix-body');
  const thead = document.querySelector('#monthly-matrix-table thead');
  tbody.innerHTML = '';
  thead.innerHTML = '';

  const deactivatedExpenditures = new Set();
  appState.linkageMappings.forEach(mapDef => {
    if (mapDef.isActive === false) {
      (mapDef.expenditureNames || []).forEach(name => deactivatedExpenditures.add(name));
    }
  });

  const validSubitems = getValidSubitems();

  const mappedExpNames = [];
  appState.linkageMappings.forEach(m => {
    (m.expenditureNames || []).forEach(name => {
      if (!mappedExpNames.includes(name)) mappedExpNames.push(name);
    });
  });

  const items = appData.expenditure.filter(e => {
    const isTotalOrSubtotal = isExpenditureTotalOrSubtotal(e);
    if (isTotalOrSubtotal || !e.Col_3) return false;
    if (deactivatedExpenditures.has(e.Col_3.trim())) return false;
    // 매핑된 산출내역만 표시 (미매핑 항목 제외)
    if (!mappedExpNames.includes(e.Col_3.trim())) return false;
    return true;
  });

  // 각 산출내역별 월 지출 계산
  const colData = items.map(item => {
    const cat = item.Col_3;
    const subitem = item.Col_1 || '';
    const budget = parseFloat(item.Col_6) || 0;

    const transactions = appData.history.filter(h => {
      if (!h.세부항목 || !validSubitems.has(h.세부항목.trim())) return false;
      const hCat = h.산출내역;
      return hCat && hCat.trim() === cat.trim();
    });

    let m3 = 0, m4 = 0, m5 = 0;
    transactions.forEach(t => {
      const date = t.일자;
      const amt = parseFloat(t.원인행위액) || 0;
      if (date && date.includes('-')) {
        const month = date.split('-')[1];
        if (month === '03') m3 += amt;
        else if (month === '04') m4 += amt;
        else if (month === '05') m5 += amt;
      }
    });

    const sumSpent = m3 + m4 + m5;
    const remaining = budget - sumSpent;
    return { cat, subitem, budget, m3, m4, m5, sumSpent, remaining };
  });

  // ── 헤더 동적 생성 ──────────────────────────────
  const headerTr = document.createElement('tr');
  const thLabel = document.createElement('th');
  thLabel.textContent = '구분';
  thLabel.style.minWidth = '80px';
  thLabel.style.cursor = 'pointer';
  thLabel.addEventListener('click', () => {
    analysisState.selectedCat = 'all';
    analysisState.selectedMonth = 'all';
    updateMatrixHighlight();
    renderMonthlyAnalysis();
    document.getElementById('analysis-transactions-card').scrollIntoView({ behavior: 'smooth' });
  });
  headerTr.appendChild(thLabel);

  colData.forEach(d => {
    const th = document.createElement('th');
    th.className = 'text-right interactive-cell';
    th.style.cursor = 'pointer';
    th.title = d.subitem + ' / ' + d.cat;
    th.innerHTML = `<span style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:2px;">${d.subitem}</span><strong style="font-size:0.8rem;">${d.cat}</strong>`;
    
    th.dataset.month = 'all';
    th.dataset.cat = d.cat;

    th.addEventListener('click', () => {
      analysisState.selectedCat = d.cat;
      analysisState.selectedMonth = 'all';
      updateMatrixHighlight();
      renderMonthlyAnalysis();
      document.getElementById('analysis-transactions-card').scrollIntoView({ behavior: 'smooth' });
    });
    headerTr.appendChild(th);
  });

  const thTotal = document.createElement('th');
  thTotal.className = 'text-right interactive-cell';
  thTotal.style.cursor = 'pointer';
  thTotal.innerHTML = '<strong>합계</strong>';
  
  thTotal.dataset.month = 'all';
  thTotal.dataset.cat = 'all';

  thTotal.addEventListener('click', () => {
    analysisState.selectedCat = 'all';
    analysisState.selectedMonth = 'all';
    updateMatrixHighlight();
    renderMonthlyAnalysis();
    document.getElementById('analysis-transactions-card').scrollIntoView({ behavior: 'smooth' });
  });

  headerTr.appendChild(thTotal);
  thead.appendChild(headerTr);

  // ── 행 데이터 정의 ─────────────────────────────
  const rowDefs = [
    { label: '예산현액',  cls: 'text-primary-header', getValue: d => d.budget,   fmt: v => formatCurrency(v), sub: false, filterMonth: null },
    { label: '3월 지출',  cls: 'text-orange',          getValue: d => d.m3,      fmt: v => v ? formatCurrency(v) : '-', sub: false, filterMonth: '03' },
    { label: '4월 지출',  cls: 'text-orange',          getValue: d => d.m4,      fmt: v => v ? formatCurrency(v) : '-', sub: false, filterMonth: '04' },
    { label: '5월 지출',  cls: 'text-orange',          getValue: d => d.m5,      fmt: v => v ? formatCurrency(v) : '-', sub: false, filterMonth: '05' },
    { label: '지출 합계', cls: 'text-danger-header',   getValue: d => d.sumSpent, fmt: v => v ? formatCurrency(v) : '-', sub: true, filterMonth: 'all' },
    { label: '예산 잔액', cls: 'text-blue',            getValue: d => d.remaining, fmt: v => formatCurrency(v), sub: true, filterMonth: null }
  ];

  rowDefs.forEach(rowDef => {
    const tr = document.createElement('tr');
    if (rowDef.sub) tr.classList.add('row-subtotal');

    const tdLabel = document.createElement('td');
    tdLabel.innerHTML = `<strong>${rowDef.label}</strong>`;
    
    if (rowDef.filterMonth !== null) {
      tdLabel.style.cursor = 'pointer';
      tdLabel.dataset.month = rowDef.filterMonth;
      tdLabel.dataset.cat = 'all';
      tdLabel.classList.add('interactive-cell', 'row-label');
      
      tdLabel.addEventListener('click', () => {
        analysisState.selectedMonth = rowDef.filterMonth;
        analysisState.selectedCat = 'all';
        updateMatrixHighlight();
        renderMonthlyAnalysis();
        document.getElementById('analysis-transactions-card').scrollIntoView({ behavior: 'smooth' });
      });
    }

    tr.appendChild(tdLabel);

    let rowSum = 0;
    colData.forEach(d => {
      const val = rowDef.getValue(d);
      rowSum += val;
      const td = document.createElement('td');
      td.className = `text-right ${rowDef.cls}`;
      td.textContent = rowDef.fmt(val);
      
      if (rowDef.filterMonth !== null) {
        td.style.cursor = 'pointer';
        td.dataset.month = rowDef.filterMonth;
        td.dataset.cat = d.cat;
        td.classList.add('interactive-cell');
        
        if (rowDef.filterMonth === 'all') {
          td.dataset.isTotalSpentCell = 'true';
        }
        
        td.addEventListener('click', () => {
          analysisState.selectedMonth = rowDef.filterMonth;
          analysisState.selectedCat = d.cat;
          updateMatrixHighlight();
          renderMonthlyAnalysis();
          document.getElementById('analysis-transactions-card').scrollIntoView({ behavior: 'smooth' });
        });
      }

      tr.appendChild(td);
    });

    const tdTotal = document.createElement('td');
    tdTotal.className = `text-right ${rowDef.cls}`;
    tdTotal.innerHTML = `<strong>${rowDef.fmt(rowSum)}</strong>`;
    
    if (rowDef.filterMonth !== null) {
      tdTotal.style.cursor = 'pointer';
      tdTotal.dataset.month = rowDef.filterMonth;
      tdTotal.dataset.cat = 'all';
      tdTotal.classList.add('interactive-cell');
      
      if (rowDef.filterMonth !== 'all') {
        tdTotal.dataset.isTotalMonthCell = 'true';
      }
      
      tdTotal.addEventListener('click', () => {
        analysisState.selectedMonth = rowDef.filterMonth;
        analysisState.selectedCat = 'all';
        updateMatrixHighlight();
        renderMonthlyAnalysis();
        document.getElementById('analysis-transactions-card').scrollIntoView({ behavior: 'smooth' });
      });
    }

    tr.appendChild(tdTotal);
    tbody.appendChild(tr);
  });
  
  updateMatrixHighlight();
}

// -------------------------------------------------------------
// TAB: MONTHLY ANALYSIS DETAILS (LEFT PANEL AND LIST)
// -------------------------------------------------------------
function renderMonthlyAnalysis() {
  const selectedMonth = analysisState.selectedMonth; // 'all', '03', '04', '05'
  const selectedCat = analysisState.selectedCat;   // 'all' or specific name

  const summaryCard = document.getElementById('category-summary-card');
  const tbody = document.getElementById('analysis-transactions-body');
  if (tbody) tbody.innerHTML = '';

  // 1. Render Left Panel Summary Card if category selected
  if (summaryCard && selectedCat !== 'all') {
    summaryCard.style.display = 'block';
    
    // Find matching expenditure item
    const budgetItem = appData.expenditure.find(e => e.Col_3 && e.Col_3.trim() === selectedCat.trim());
    if (budgetItem) {
      document.getElementById('cat-summary-title').innerText = selectedCat;
      document.getElementById('cat-summary-subitem').innerText = budgetItem.Col_1 || '-';
      document.getElementById('cat-summary-account').innerText = budgetItem.Col_2 || '-';
      
      const budget = parseFloat(budgetItem.Col_6) || 0;
      document.getElementById('cat-summary-budget').innerText = formatCurrency(budget);

      // Calculate transaction totals for this category
      const catTrans = appData.history.filter(h => h.산출내역 && h.산출내역.trim() === selectedCat.trim());
      
      let totalSpent = 0;
      let monthSpent = 0;

      catTrans.forEach(t => {
        const amt = parseFloat(t.원인행위액) || 0;
        const date = t.일자 || '';
        
        totalSpent += amt;
        
        if (selectedMonth !== 'all' && date.includes('-')) {
          const m = date.split('-')[1];
          if (m === selectedMonth) {
            monthSpent += amt;
          }
        } else {
          monthSpent = totalSpent; // If "all" selected, monthSpent = cumulative
        }
      });

      document.getElementById('cat-summary-total-spent').innerText = formatCurrency(totalSpent);
      document.getElementById('cat-summary-month-spent').innerText = formatCurrency(monthSpent);
      document.getElementById('cat-summary-balance').innerText = formatCurrency(budget - totalSpent);
      
      // Update Monthly label
      const monthLabel = selectedMonth === 'all' ? '누적 지출액' : `${parseInt(selectedMonth)}월 지출액`;
      document.getElementById('cat-summary-month-spent').previousElementSibling.innerText = monthLabel + ':';
    }
  } else if (summaryCard) {
    summaryCard.style.display = 'none';
  }

  // 2. Filter Transactions List
  const deactivatedExpenditures = new Set();
  appState.linkageMappings.forEach(mapDef => {
    if (mapDef.isActive === false) {
      (mapDef.expenditureNames || []).forEach(name => deactivatedExpenditures.add(name));
    }
  });

  const validSubitems = getValidSubitems();

  let filteredList = appData.history.filter(t =>
    (!t.산출내역 || !deactivatedExpenditures.has(t.산출내역.trim())) &&
    (t.세부항목 && validSubitems.has(t.세부항목.trim()))
  );

  // Filter by category
  if (selectedCat !== 'all') {
    filteredList = filteredList.filter(t => t.산출내역 && t.산출내역.trim() === selectedCat.trim());
  }

  // Filter by month
  if (selectedMonth !== 'all') {
    filteredList = filteredList.filter(t => {
      const date = t.일자;
      if (date && date.includes('-')) {
        return date.split('-')[1] === selectedMonth;
      }
      return false;
    });
  }

  // Header description text
  const listTitle = document.getElementById('analysis-transactions-title');
  if (listTitle) {
    const catText = selectedCat === 'all' ? '전체 산출내역' : `[${selectedCat}]`;
    const monthText = selectedMonth === 'all' ? '전체 월' : `[${parseInt(selectedMonth)}월]`;
    listTitle.innerText = `${monthText} ${catText} 상세 지출 거래 내역 (${filteredList.length}건)`;
  }

  // Populate transaction table
  if (tbody) {
    if (filteredList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted">선택하신 조건에 해당하는 지출 내역이 없습니다.</td>
        </tr>
      `;
      return;
    }

    filteredList.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.일자 || ''}</td>
        <td>${t.결재일자 || ''}</td>
        <td>${t.번호 || ''}</td>
        <td><strong>${t.제목 || ''}</strong></td>
        <td>${t.세부항목 || ''}</td>
        <td>${t.산출내역 || ''}</td>
        <td class="text-right text-danger-header">${formatCurrency(t.원인행위액)}</td>
        <td><span class="rate-badge bg-green-light text-green">${t.진행상태 || '결재완료'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// -------------------------------------------------------------
// TAB: FULL TRANSACTION LOGS (INTERACTIVE SORTING & FILTERING)
// -------------------------------------------------------------
let transactionsSortCol = null;
let transactionsSortDir = 'none';
let transactionsFilters = {
  date: [],
  payDate: [],
  num: [],
  title: [],
  type: [],
  status: [],
  subitem: [],
  detail: [],
  account: [],
  amt: []
};

function setupTransactionsTableInteractive() {
  const headers = document.querySelectorAll('#transactions-table th.th-interactive');
  
  headers.forEach(th => {
    const col = th.getAttribute('data-col');
    const filterBtn = th.querySelector('.header-filter-btn');
    const sortBtn = th.querySelector('.header-sort-btn');
    
    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllTransactionsFilterDropdowns(col);
        toggleTransactionsFilterDropdown(col);
      });
    }
    
    if (sortBtn) {
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleTransactionsSort(col);
      });
    }
  });
  
  document.addEventListener('click', () => {
    closeAllTransactionsFilterDropdowns();
  });
}

function toggleTransactionsFilterDropdown(col) {
  const dropdown = document.getElementById(`filter-dropdown-tx-${col}`);
  if (!dropdown) return;
  
  const isShown = dropdown.classList.contains('show');
  if (isShown) {
    dropdown.classList.remove('show');
  } else {
    renderTransactionsFilterDropdownContent(col, dropdown);
    dropdown.classList.add('show');
  }
}

function closeAllTransactionsFilterDropdowns(exceptCol = null) {
  const dropdowns = document.querySelectorAll('#transactions-table .header-filter-dropdown');
  dropdowns.forEach(dropdown => {
    const dropdownCol = dropdown.id.replace('filter-dropdown-tx-', '');
    if (dropdownCol !== exceptCol) {
      dropdown.classList.remove('show');
    }
  });
}

function renderTransactionsFilterDropdownContent(col, dropdown) {
  const uniqueValues = new Set();
  appData.history.forEach(row => {
    let val = '';
    if (col === 'date') val = row.일자 || '(공백)';
    else if (col === 'payDate') val = row.결재일자 || '(공백)';
    else if (col === 'num') val = row.번호 || '(공백)';
    else if (col === 'title') val = row.제목 || '(공백)';
    else if (col === 'type') val = row.업무유형 || '(공백)';
    else if (col === 'status') val = row.진행상태 || '(공백)';
    else if (col === 'subitem') val = row.세부항목 || '(공백)';
    else if (col === 'detail') val = row.산출내역 || '(공백)';
    else if (col === 'account') val = row.원가통계비목 || '(공백)';
    else if (col === 'amt') val = row.원인행위액 ? formatCurrency(row.원인행위액) : '0원';

    uniqueValues.add(val.toString().trim());
  });

  const sortedValues = Array.from(uniqueValues).sort((a, b) => {
    if (a.endsWith('원') && b.endsWith('원')) {
      const numA = parseInt(a.replace(/,/g, '').replace('원', '')) || 0;
      const numB = parseInt(b.replace(/,/g, '').replace('원', '')) || 0;
      return numA - numB;
    }
    return a.localeCompare(b, 'ko');
  });

  dropdown.innerHTML = `
    <input type="text" class="filter-search" placeholder="검색..." onclick="event.stopPropagation()">
    <div class="filter-options-list">
      ${sortedValues.map(val => {
        const isChecked = transactionsFilters[col].includes(val);
        return `
          <label class="filter-option-item" onclick="event.stopPropagation()">
            <input type="checkbox" data-val="${val}" ${isChecked ? 'checked' : ''}>
            <span>${val}</span>
          </label>
        `;
      }).join('')}
    </div>
    <div class="filter-actions" onclick="event.stopPropagation()">
      <button class="filter-btn-sub" onclick="applyTransactionsFilter('${col}', true)">전체</button>
      <button class="filter-btn-sub clear" onclick="applyTransactionsFilter('${col}', false)">해제</button>
    </div>
  `;

  const searchInput = dropdown.querySelector('.filter-search');
  searchInput.focus();
  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = dropdown.querySelectorAll('.filter-option-item');
    items.forEach(item => {
      const text = item.querySelector('span').innerText.toLowerCase();
      if (text.includes(term)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  });

  const checkboxes = dropdown.querySelectorAll('.filter-option-item input');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      updateTransactionsFilterState(col, dropdown);
    });
  });
}

function updateTransactionsFilterState(col, dropdown) {
  const checkboxes = dropdown.querySelectorAll('.filter-option-item input');
  const activeVals = [];
  checkboxes.forEach(cb => {
    if (cb.checked) {
      activeVals.push(cb.getAttribute('data-val'));
    }
  });

  const totalCheckboxes = checkboxes.length;
  if (activeVals.length === totalCheckboxes || activeVals.length === 0) {
    transactionsFilters[col] = [];
  } else {
    transactionsFilters[col] = activeVals;
  }

  updateTransactionsFilterIconState(col);
  renderTransactionsTable();
}

function updateTransactionsFilterIconState(col) {
  const th = document.querySelector(`#transactions-table th[data-col="${col}"]`);
  if (!th) return;
  const filterBtn = th.querySelector('.header-filter-btn');
  if (!filterBtn) return;
  if (transactionsFilters[col].length > 0) {
    filterBtn.classList.add('active');
  } else {
    filterBtn.classList.remove('active');
  }
}

function applyTransactionsFilter(col, selectAll) {
  const dropdown = document.getElementById(`filter-dropdown-tx-${col}`);
  if (!dropdown) return;

  const checkboxes = dropdown.querySelectorAll('.filter-option-item input');
  checkboxes.forEach(cb => {
    cb.checked = selectAll;
  });

  updateTransactionsFilterState(col, dropdown);
}

window.applyTransactionsFilter = applyTransactionsFilter;

function handleTransactionsSort(col) {
  if (transactionsSortCol === col) {
    if (transactionsSortDir === 'none') transactionsSortDir = 'asc';
    else if (transactionsSortDir === 'asc') transactionsSortDir = 'desc';
    else {
      transactionsSortDir = 'none';
      transactionsSortCol = null;
    }
  } else {
    transactionsSortCol = col;
    transactionsSortDir = 'asc';
  }

  const headers = document.querySelectorAll('#transactions-table th.th-interactive');
  headers.forEach(th => {
    const curCol = th.getAttribute('data-col');
    const sortBtn = th.querySelector('.header-sort-btn');
    if (!sortBtn) return;
    const icon = sortBtn.querySelector('i');
    sortBtn.classList.remove('active');
    icon.className = 'fa-solid fa-sort';
    
    if (curCol === transactionsSortCol && transactionsSortDir !== 'none') {
      sortBtn.classList.add('active');
      if (transactionsSortDir === 'asc') icon.className = 'fa-solid fa-sort-up';
      else icon.className = 'fa-solid fa-sort-down';
    }
  });

  renderTransactionsTable();
}

function renderTransactionsTable() {
  const tbody = document.getElementById('transactions-table-body');
  const searchVal = document.getElementById('transactions-search').value.toLowerCase().trim();
  const selectedMonth = document.getElementById('transactions-filter-month').value;
  const selectedCat = document.getElementById('transactions-filter-category').value;
  
  tbody.innerHTML = '';
  let count = 0;

  const deactivatedExpenditures = new Set();
  appState.linkageMappings.forEach(mapDef => {
    if (mapDef.isActive === false) {
      (mapDef.expenditureNames || []).forEach(name => deactivatedExpenditures.add(name));
    }
  });

  const validSubitems = getValidSubitems();

  let filteredRows = appData.history.filter(t => {
    if (t.산출내역 && deactivatedExpenditures.has(t.산출내역.trim())) return false;
    // 세출산출내역에 없는 세부항목 제외
    if (!t.세부항목 || !validSubitems.has(t.세부항목.trim())) return false;
    const date = t.일자 || '';
    const payDate = t.결재일자 || '';
    const num = t.번호 || '';
    const title = t.제목 || '';
    const type = t.업무유형 || '';
    const status = t.진행상태 || '';
    const subitem = t.세부항목 || '';
    const detail = t.산출내역 || '';
    const account = t.원가통계비목 || '';
    const amtVal = t.원인행위액 ? formatCurrency(t.원인행위액) : '0원';

    const matchSearch = !searchVal || 
      title.toLowerCase().includes(searchVal) ||
      subitem.toLowerCase().includes(searchVal) ||
      detail.toLowerCase().includes(searchVal) ||
      num.toLowerCase().includes(searchVal);
      
    if (!matchSearch) return false;

    const matchMonth = selectedMonth === 'all' || (date.includes('-') && date.split('-')[1] === selectedMonth);
    if (!matchMonth) return false;

    const matchCat = selectedCat === 'all' || (detail && detail.trim() === selectedCat.trim());
    if (!matchCat) return false;

    if (transactionsFilters.date.length > 0 && !transactionsFilters.date.includes(date.trim())) return false;
    if (transactionsFilters.payDate.length > 0 && !transactionsFilters.payDate.includes(payDate.trim())) return false;
    if (transactionsFilters.num.length > 0 && !transactionsFilters.num.includes(num.trim())) return false;
    if (transactionsFilters.title.length > 0 && !transactionsFilters.title.includes(title.trim())) return false;
    if (transactionsFilters.type.length > 0 && !transactionsFilters.type.includes(type.trim())) return false;
    if (transactionsFilters.status.length > 0 && !transactionsFilters.status.includes(status.trim())) return false;
    if (transactionsFilters.subitem.length > 0 && !transactionsFilters.subitem.includes(subitem.trim())) return false;
    if (transactionsFilters.detail.length > 0 && !transactionsFilters.detail.includes(detail.trim())) return false;
    if (transactionsFilters.account.length > 0 && !transactionsFilters.account.includes(account.trim())) return false;
    if (transactionsFilters.amt.length > 0 && !transactionsFilters.amt.includes(amtVal.trim())) return false;

    return true;
  });

  const isSortActive = transactionsSortCol !== null && transactionsSortDir !== 'none';
  if (isSortActive) {
    filteredRows.sort((a, b) => {
      let valA, valB;
      if (transactionsSortCol === 'date') {
        valA = a.일자 || '';
        valB = b.일자 || '';
      } else if (transactionsSortCol === 'payDate') {
        valA = a.결재일자 || '';
        valB = b.결재일자 || '';
      } else if (transactionsSortCol === 'num') {
        valA = a.번호 || '';
        valB = b.번호 || '';
      } else if (transactionsSortCol === 'title') {
        valA = a.제목 || '';
        valB = b.제목 || '';
      } else if (transactionsSortCol === 'type') {
        valA = a.업무유형 || '';
        valB = b.업무유형 || '';
      } else if (transactionsSortCol === 'status') {
        valA = a.진행상태 || '';
        valB = b.진행상태 || '';
      } else if (transactionsSortCol === 'subitem') {
        valA = a.세부항목 || '';
        valB = b.세부항목 || '';
      } else if (transactionsSortCol === 'detail') {
        valA = a.산출내역 || '';
        valB = b.산출내역 || '';
      } else if (transactionsSortCol === 'account') {
        valA = a.원가통계비목 || '';
        valB = b.원가통계비목 || '';
      } else if (transactionsSortCol === 'amt') {
        valA = parseFloat(a.원인행위액) || 0;
        valB = parseFloat(b.원인행위액) || 0;
      }

      if (typeof valA === 'string') {
        return transactionsSortDir === 'asc' ? valA.localeCompare(valB, 'ko') : valB.localeCompare(valA, 'ko');
      } else {
        return transactionsSortDir === 'asc' ? valA - valB : valB - valA;
      }
    });
  }

  let totalAmt = 0;

  filteredRows.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.결재일자 || ''}</td>
      <td><strong>${t.제목 || ''}</strong></td>
      <td>${t.세부항목 || ''}</td>
      <td>${t.산출내역 || ''}</td>
      <td>${t.원가통계비목 || ''}</td>
      <td class="text-right text-danger-header">${formatCurrency(t.원인행위액 || 0)}</td>
    `;
    tbody.appendChild(tr);
    totalAmt += parseFloat(t.원인행위액) || 0;
    count++;
  });

  if (count > 0) {
    const totalTr = document.createElement('tr');
    totalTr.className = 'row-total';
    totalTr.innerHTML = `
      <td colspan="5"><strong>합계 (필터 결과)</strong></td>
      <td class="text-right text-danger-header"><strong>${formatCurrency(totalAmt)}</strong></td>
    `;
    tbody.appendChild(totalTr);
  }

  document.getElementById('transactions-count').innerText = count;
}

// -------------------------------------------------------------
// CHARTS: COMPARISON CHART (CHART.JS)
// -------------------------------------------------------------
function renderDashboardChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  const ctx = document.getElementById('chart-comparison').getContext('2d');
  
  // Filter out self-funded for the main chart, or include it
  const chartLabels = dashboardMappedData.map(d => d.name);
  const revenueData = dashboardMappedData.map(d => d.revDecided);
  const expenditureData = dashboardMappedData.map(d => d.expExecuted);

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const isLight = currentTheme === 'light';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.05)';
  const textColor = isLight ? '#475569' : '#9ca3af';
  const legendColor = isLight ? '#1e293b' : '#f3f4f6';
  const tooltipBg = isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(17, 24, 39, 0.95)';
  const tooltipBorder = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: '세입 실적 (징수결정액)',
          data: revenueData,
          backgroundColor: 'rgba(16, 185, 129, 0.65)',
          borderColor: '#10b981',
          borderWidth: 2,
          borderRadius: 6,
        },
        {
          label: '세출 실적 (원인행위액)',
          data: expenditureData,
          backgroundColor: 'rgba(244, 63, 94, 0.65)',
          borderColor: '#f43f5e',
          borderWidth: 2,
          borderRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            font: {
              family: "'Outfit', 'Noto Sans KR', sans-serif",
              size: 11
            }
          }
        },
        y: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            callback: function(value) {
              return value >= 1000000 ? (value / 1000000) + '백만' : value;
            },
            font: {
              family: "'Outfit', 'Noto Sans KR', sans-serif"
            }
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: legendColor,
            font: {
              family: "'Outfit', 'Noto Sans KR', sans-serif",
              weight: 'bold'
            }
          }
        },
        tooltip: {
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          titleColor: isLight ? '#1e293b' : '#f3f4f6',
          bodyColor: isLight ? '#475569' : '#9ca3af',
          titleFont: {
            family: "'Outfit', 'Noto Sans KR', sans-serif",
            weight: 'bold'
          },
          bodyFont: {
            family: "'Outfit', 'Noto Sans KR', sans-serif"
          },
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += new Intl.NumberFormat('ko-KR').format(context.parsed.y) + '원';
              }
              return label;
            }
          }
        }
      }
    }
  });
}

// -------------------------------------------------------------
// COLUMN VISIBILITY TOGGLERS (DYNAMIC)
// -------------------------------------------------------------
function setupColumnToggles() {
  initColumnToggler('revenue-table', 'revenue-col-toggle-anchor');
  initColumnToggler('expenditure-table', 'expenditure-col-toggle-anchor');
  initColumnToggler('monthly-matrix-table', 'monthly-matrix-col-toggle-anchor');
  initColumnToggler('analysis-transactions-table', 'analysis-transactions-col-toggle-anchor');
  initColumnToggler('transactions-table', 'transactions-col-toggle-anchor');
}

function registerTableStyle(tableId, maxCols = 15) {
  let styleEl = document.getElementById(`style-${tableId}`);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = `style-${tableId}`;
    let cssText = '';
    for (let i = 1; i <= maxCols; i++) {
      cssText += `#${tableId}.hide-col-${i} th:nth-child(${i}), #${tableId}.hide-col-${i} td:nth-child(${i}) { display: none !important; }\n`;
    }
    styleEl.textContent = cssText;
    document.head.appendChild(styleEl);
  }
}

function initColumnToggler(tableId, anchorId) {
  const table = document.getElementById(tableId);
  const anchor = document.getElementById(anchorId);
  if (!table || !anchor) return;

  // Clear previous toggler to avoid duplicates on re-init
  anchor.innerHTML = '';

  const ths = table.querySelectorAll('thead tr th');
  registerTableStyle(tableId, ths.length + 2);

  // Create toggler container
  const container = document.createElement('div');
  container.className = 'col-toggle-container';

  const btn = document.createElement('button');
  btn.className = 'btn-col-toggle';
  btn.innerHTML = '<i class="fa-solid fa-table-columns"></i> 열 선택';

  const dropdown = document.createElement('div');
  dropdown.className = 'col-toggle-dropdown';

  ths.forEach((th, idx) => {
    let labelText = '';
    const titleEl = th.querySelector('.header-title');
    if (titleEl) {
      labelText = titleEl.innerText.trim();
    } else {
      labelText = th.innerText.trim().replace(/\n/g, ' ');
    }
    if (!labelText) return;

    const label = document.createElement('label');
    label.className = 'col-toggle-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !table.classList.contains(`hide-col-${idx + 1}`);
    checkbox.dataset.colIdx = idx + 1;

    checkbox.addEventListener('change', (e) => {
      toggleColumn(tableId, idx + 1, e.target.checked);
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + labelText));
    dropdown.appendChild(label);
  });

  container.appendChild(btn);
  container.appendChild(dropdown);
  anchor.appendChild(container);

  // Toggle dropdown on button click
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.col-toggle-dropdown').forEach(d => {
      if (d !== dropdown) d.classList.remove('show');
    });
    dropdown.classList.toggle('show');
  });

  // Prevent closing when clicking inside the dropdown
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function toggleColumn(tableId, colIdx, show) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const className = `hide-col-${colIdx}`;
  if (show) {
    table.classList.remove(className);
  } else {
    table.classList.add(className);
  }
}

// Global click handler to close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  document.querySelectorAll('.col-toggle-dropdown').forEach(d => d.classList.remove('show'));
  if (!e.target.closest('.custom-select-wrapper')) {
    document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
  }
});

// -------------------------------------------------------------
// MAPPING & REVENUE MERGE MANAGEMENT
// -------------------------------------------------------------

function getUniqueRevenues() {
  const names = [];
  appData.revenue.forEach(r => {
    const name = r.Col_2;
    const isTotalOrSubtotal = isRevenueTotalOrSubtotal(r);
    if (name && !isTotalOrSubtotal && !names.includes(name)) {
      names.push(name);
    }
  });
  return names;
}

function getUnmergedRevenues() {
  const allRevs = getUniqueRevenues();
  const mergedList = Object.values(appState.mergedRevenues || {}).flat();
  return allRevs.filter(r => !mergedList.includes(r));
}

function getRevenueRootEntities() {
  const allRevs = getUniqueRevenues();
  const mergedList = Object.values(appState.mergedRevenues || {}).flat();
  const standaloneRevs = allRevs.filter(r => !mergedList.includes(r));
  return standaloneRevs.concat(Object.keys(appState.mergedRevenues || {}));
}

function getUniqueExpenditures() {
  const names = [];
  appData.expenditure.forEach(e => {
    const name = e.Col_3;
    const isTotalOrSubtotal = isExpenditureTotalOrSubtotal(e);
    if (name && !isTotalOrSubtotal && !names.includes(name)) {
      names.push(name);
    }
  });
  return names.sort();
}

function renderUnmergedRevenuesList() {
  const container = document.getElementById('unmerged-revenues-list');
  if (!container) return;
  container.innerHTML = '';
  const unmerged = getUnmergedRevenues();
  
  if (unmerged.length === 0) {
    container.innerHTML = '<div style="color: #9ca3af; font-size: 0.8rem; padding: 10px; text-align: center;">모든 세입 항목이 병합되었습니다.</div>';
    return;
  }
  
  unmerged.forEach(name => {
    const div = document.createElement('label');
    div.className = 'checkbox-item';
    div.innerHTML = `
      <input type="checkbox" value="${name}">
      <span>${name}</span>
    `;
    container.appendChild(div);
  });
}

function renderCurrentMergeGroupsList() {
  const container = document.getElementById('current-merge-groups-list');
  if (!container) return;
  container.innerHTML = '';
  const groupNames = Object.keys(appState.mergedRevenues || {});
  
  if (groupNames.length === 0) {
    container.innerHTML = '<div style="color: #9ca3af; font-size: 0.82rem; padding: 20px; text-align: center;">구성된 세입 병합 그룹이 없습니다.</div>';
    return;
  }
  
  groupNames.forEach(groupName => {
    const members = appState.mergedRevenues[groupName];
    const div = document.createElement('div');
    div.className = 'group-item';
    div.innerHTML = `
      <div class="group-info">
        <div class="group-name">${groupName}</div>
        <div class="group-members">${members.join(', ')}</div>
      </div>
      <button class="btn-icon-danger btn-delete-group" data-group="${groupName}">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    container.appendChild(div);
  });
  
  // Attach delete handlers
  container.querySelectorAll('.btn-delete-group').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupName = btn.getAttribute('data-group');
      deleteMergeGroup(groupName);
    });
  });
}

function deleteMergeGroup(groupName) {
  const members = appState.mergedRevenues[groupName];
  delete appState.mergedRevenues[groupName];
  
  // Update linkage mappings
  appState.linkageMappings.forEach(mapping => {
    const idx = mapping.revenueNames ? mapping.revenueNames.indexOf(groupName) : -1;
    if (idx !== -1) {
      mapping.revenueNames.splice(idx, 1);
      members.forEach(member => {
        if (!mapping.revenueNames.includes(member)) {
          mapping.revenueNames.push(member);
        }
      });
    }
    if (mapping.name === groupName) {
      mapping.name = members.length > 0 ? members[0] : '미지정';
    }
  });
  
  renderUnmergedRevenuesList();
  renderCurrentMergeGroupsList();
  renderMappingTable();
}

function createMergeGroup() {
  const nameInput = document.getElementById('new-merge-group-name');
  const groupName = nameInput.value.trim();
  if (!groupName) {
    alert('병합 그룹 이름을 입력해주세요.');
    return;
  }
  
  const allRoots = getUniqueRevenues();
  if (appState.mergedRevenues[groupName] || allRoots.includes(groupName)) {
    alert('이미 존재하는 항목 또는 그룹 이름입니다.');
    return;
  }
  
  const checkboxes = document.querySelectorAll('#unmerged-revenues-list input[type="checkbox"]:checked');
  const selectedRevenues = Array.from(checkboxes).map(cb => cb.value);
  
  if (selectedRevenues.length < 2) {
    alert('병합하려면 최소 2개 이상의 세입 항목을 선택해야 합니다.');
    return;
  }
  
  appState.mergedRevenues[groupName] = selectedRevenues;
  
  // Update linkage mappings: combine matched mappings
  const itemsToMerge = [];
  appState.linkageMappings.forEach(m => {
    const hasMatch = (m.revenueNames || []).some(name => selectedRevenues.includes(name));
    if (hasMatch) {
      itemsToMerge.push(m);
    }
  });
  
  if (itemsToMerge.length > 0) {
    const targetMapping = itemsToMerge[0];
    targetMapping.revenueNames = (targetMapping.revenueNames || []).filter(name => !selectedRevenues.includes(name));
    if (!targetMapping.revenueNames.includes(groupName)) {
      targetMapping.revenueNames.push(groupName);
    }
    targetMapping.name = groupName;
    
    for (let i = 1; i < itemsToMerge.length; i++) {
      const other = itemsToMerge[i];
      (other.expenditureNames || []).forEach(exp => {
        if (!targetMapping.expenditureNames.includes(exp)) {
          targetMapping.expenditureNames.push(exp);
        }
      });
      const idx = appState.linkageMappings.indexOf(other);
      if (idx !== -1) {
        appState.linkageMappings.splice(idx, 1);
      }
    }
  } else {
    appState.linkageMappings.push({
      name: groupName,
      revenueNames: [groupName],
      expenditureNames: []
    });
  }
  
  nameInput.value = '';
  renderUnmergedRevenuesList();
  renderCurrentMergeGroupsList();
  renderMappingTable();
}

function syncLinkageMappings() {
  const roots = getRevenueRootEntities();
  const newMappings = [];
  
  roots.forEach(root => {
    let existing = appState.linkageMappings.find(m => m.name === root || (m.revenueNames || []).includes(root));
    if (existing) {
      newMappings.push({
        name: root,
        revenueNames: [root],
        expenditureNames: existing.expenditureNames || [],
        isActive: existing.isActive !== false
      });
    } else {
      newMappings.push({
        name: root,
        revenueNames: [root],
        expenditureNames: [],
        isActive: true
      });
    }
  });
  
  appState.linkageMappings = newMappings;
}

function renderMappingTable() {
  syncLinkageMappings();
  const tbody = document.getElementById('mapping-settings-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const exps = getUniqueExpenditures();
  
  appState.linkageMappings.forEach((mapping, idx) => {
    const tr = document.createElement('tr');
    
    let optionsHTML = '';
    exps.forEach(expName => {
      const isChecked = (mapping.expenditureNames || []).includes(expName) ? 'checked' : '';
      optionsHTML += `
        <label class="custom-select-option">
          <input type="checkbox" value="${expName}" ${isChecked} data-mapping-idx="${idx}">
          <span>${expName}</span>
        </label>
      `;
    });
    
    const selectedCount = (mapping.expenditureNames || []).length;
    const triggerText = selectedCount > 0 ? `${selectedCount}개 선택됨` : '선택된 세출 항목 없음';
    
    tr.innerHTML = `
      <td><strong>${mapping.name}</strong></td>
      <td>
        <div class="custom-select-wrapper" id="select-wrapper-${idx}">
          <div class="custom-select-trigger" onclick="toggleCustomDropdown(${idx})">
            <span id="select-trigger-text-${idx}">${triggerText}</span>
            <i class="fa-solid fa-chevron-down"></i>
          </div>
          <div class="custom-select-options">
            ${optionsHTML}
          </div>
        </div>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  tbody.querySelectorAll('.custom-select-option input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const idx = parseInt(checkbox.getAttribute('data-mapping-idx'));
      const val = checkbox.value;
      const mapping = appState.linkageMappings[idx];
      
      if (checkbox.checked) {
        if (!mapping.expenditureNames.includes(val)) {
          mapping.expenditureNames.push(val);
        }
      } else {
        mapping.expenditureNames = mapping.expenditureNames.filter(x => x !== val);
      }
      
      const count = mapping.expenditureNames.length;
      document.getElementById(`select-trigger-text-${idx}`).innerText = count > 0 ? `${count}개 선택됨` : '선택된 세출 항목 없음';
    });
  });
}

window.toggleCustomDropdown = function(idx) {
  const wrapper = document.getElementById(`select-wrapper-${idx}`);
  const isOpen = wrapper.classList.contains('open');
  
  document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
  
  if (!isOpen) {
    wrapper.classList.add('open');
  }
};

function setupMappingSettings() {
  const modal = document.getElementById('mapping-settings-modal');
  const btnOpen = document.getElementById('btn-open-mapping-settings');
  const btnClose = document.getElementById('btn-close-mapping-settings');
  const btnCancel = document.getElementById('btn-cancel-mappings');
  const btnSave = document.getElementById('btn-save-mappings');
  const btnReset = document.getElementById('btn-reset-mappings');
  const overlay = document.getElementById('modal-overlay');
  
  if (!modal || !btnOpen) return;

  const tabBtns = document.querySelectorAll('.modal-tab-btn');
  const tabContents = document.querySelectorAll('.modal-tab-content');
  const btnCreateGroup = document.getElementById('btn-create-merge-group');
  
  let tempAppState = null;
  
  btnOpen.addEventListener('click', () => {
    tempAppState = JSON.parse(JSON.stringify(appState));
    
    renderUnmergedRevenuesList();
    renderCurrentMergeGroupsList();
    renderMappingTable();
    
    modal.classList.add('active');
  });
  
  const closeModal = () => {
    modal.classList.remove('active');
  };
  
  btnClose.addEventListener('click', () => {
    appState = tempAppState;
    closeModal();
  });
  
  btnCancel.addEventListener('click', () => {
    appState = tempAppState;
    closeModal();
  });
  
  overlay.addEventListener('click', () => {
    appState = tempAppState;
    closeModal();
  });
  
  btnSave.addEventListener('click', () => {
    saveState();
    closeModal();
    
    renderBudgetFilterDropdown();
    renderAll();
  });
  
  btnReset.addEventListener('click', () => {
    if (confirm('모든 매핑 및 세입 통합 설정을 기본값으로 복원하시겠습니까?')) {
      appState.mergedRevenues = JSON.parse(JSON.stringify(DEFAULT_REVENUE_MERGES));
      appState.linkageMappings = JSON.parse(JSON.stringify(DEFAULT_LINKAGE_MAPPINGS));
      
      renderUnmergedRevenuesList();
      renderCurrentMergeGroupsList();
      renderMappingTable();
    }
  });
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-modal-tab');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      if (tabId === 'revenue-merge') {
        document.getElementById('modal-tab-revenue-merge').classList.add('active');
      } else {
        document.getElementById('modal-tab-expenditure-linkage').classList.add('active');
      }
    });
  });
  
  btnCreateGroup.addEventListener('click', () => {
    createMergeGroup();
  });
}

// -------------------------------------------------------------
// EXCEL DATA FILE UPLOAD & PARSING
// -------------------------------------------------------------
let uploadedData = {
  revenue: null,
  expenditure: null,
  history: null
};

function setupExcelUpload() {
  const modal = document.getElementById('excel-upload-modal');
  const btnOpen = document.getElementById('btn-open-upload-modal');
  const btnClose = document.getElementById('btn-close-upload-modal');
  const btnCancel = document.getElementById('btn-cancel-upload');
  const btnApply = document.getElementById('btn-apply-uploaded-data');
  const overlay = document.getElementById('upload-modal-overlay');

  if (!modal || !btnOpen) return;

  // Open Upload Modal
  btnOpen.addEventListener('click', () => {
    resetUploadState();
    modal.classList.add('active');
  });

  // Close Modal Handlers
  const closeModal = () => {
    modal.classList.remove('active');
  };

  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  // Setup dropzones
  setupDropzone('revenue', 'file-revenue', 'dropzone-revenue', 'status-revenue');
  setupDropzone('expenditure', 'file-expenditure', 'dropzone-expenditure', 'status-expenditure');
  setupDropzone('history', 'file-history', 'dropzone-history', 'status-history');

  // Apply Action
  btnApply.addEventListener('click', () => {
    if (!uploadedData.revenue || !uploadedData.expenditure || !uploadedData.history) {
      alert('세 개의 파일이 모두 파싱 완료되어야 적용할 수 있습니다.');
      return;
    }

    try {
      // 1. Skip header row if it is header description
      let newRevenue = uploadedData.revenue;
      if (newRevenue.length > 0 && (newRevenue[0].Col_2 === '산출내역' || newRevenue[0].Col_1 === '원가통계비목')) {
        newRevenue = newRevenue.slice(1);
      }
      let newExpenditure = uploadedData.expenditure;
      if (newExpenditure.length > 0 && (newExpenditure[0].Col_3 === '산출내역' || newExpenditure[0].Col_2 === '원가통계비목명')) {
        newExpenditure = newExpenditure.slice(1);
      }
      let newHistory = uploadedData.history;
      if (newHistory.length > 0 && (newHistory[0].세부항목 === '세부항목' || newHistory[0].원인행위액 === '원인행위액')) {
        newHistory = newHistory.slice(1);
      }

      // 2. Perform Dynamic Filtering for history based on linkage mappings
      const activeMappings = appState.linkageMappings.filter(m => m.isActive !== false);
      const mappedExpNames = new Set();
      activeMappings.forEach(m => {
        (m.expenditureNames || []).forEach(name => {
          if (name) mappedExpNames.add(name.trim());
        });
      });

      // Extract all valid subitems (Col_1) from expenditure sheet (except totals/subtotals)
      const validSubitems = new Set();
      newExpenditure.forEach(row => {
        const isTotalOrSubtotal = isExpenditureTotalOrSubtotal(row);
        const col1 = row.Col_1;
        if (!isTotalOrSubtotal && col1 && String(col1).trim()) {
          validSubitems.add(String(col1).trim());
        }
      });

      // Filter history based on valid subitems
      const filteredHistory = newHistory.filter(row => {
        const subitem = row.세부항목;
        if (subitem) {
          return validSubitems.has(String(subitem).trim());
        }
        return false;
      });

      // 3. Update global application state
      appData.revenue = newRevenue;
      appData.expenditure = newExpenditure;
      appData.history = filteredHistory;

      // 4. Sort history by date descending
      appData.history.sort((a, b) => {
        return (b.일자 || '').localeCompare(a.일자 || '');
      });

      // Save to localStorage and server disk
      saveState();

      console.log('Successfully updated uploaded data:', {
        revenue: appData.revenue.length,
        expenditure: appData.expenditure.length,
        history: appData.history.length
      });

      // 5. Reinitialize filters, dropdowns and redraw views
      setupFilters();
      populateDropdowns();
      renderBudgetFilterDropdown();
      renderAll();

      // 6. Update indicator in Sidebar
      const statusText = document.querySelector('.status-indicator span:last-child');
      if (statusText) {
        statusText.innerText = '업로드 데이터 연동 완료';
      }

      closeModal();
      alert('정산 대시보드 데이터가 성공적으로 갱신되었습니다!');
    } catch (err) {
      console.error('Error applying uploaded excel data:', err);
      alert('데이터 적용 중 오류가 발생했습니다: ' + err.message);
    }
  });
}

function resetUploadState() {
  uploadedData = {
    revenue: null,
    expenditure: null,
    history: null
  };

  const zones = ['revenue', 'expenditure', 'history'];
  zones.forEach(key => {
    const statusEl = document.getElementById(`status-${key}`);
    const inputEl = document.getElementById(`file-${key}`);
    if (statusEl) {
      statusEl.className = 'file-status';
      statusEl.innerText = '대기 중';
    }
    if (inputEl) {
      inputEl.value = '';
    }
  });

  updateApplyButtonState();
}

function setupDropzone(key, inputId, zoneId, statusId) {
  const input = document.getElementById(inputId);
  const zone = document.getElementById(zoneId);
  const status = document.getElementById(statusId);

  if (!input || !zone || !status) return;

  // Click on zone triggers file dialog
  zone.addEventListener('click', () => {
    input.click();
  });

  // Handle Drag & Drop events
  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('dragover');
    }, false);
  });

  zone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      processSelectedFile(key, files[0], status);
    }
  }, false);

  input.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      processSelectedFile(key, files[0], status);
    }
  });
}

function detectExcelType(records) {
  if (!records || records.length === 0) return null;
  const first = records[0];
  const keys = Object.keys(first);
  
  // 1. 지출실적조회 감지 (헤더 컬럼명에 결재일자, 지출 적요, 결의번호 등이 있는 경우)
  const hasHistoryKeywords = keys.some(k => 
    k.includes('결재일자') || k.includes('지출 적요') || k.includes('지출적요') || k.includes('결의번호') || k === '적요'
  );
  if (hasHistoryKeywords) return 'history';

  // 2. 세입 감지 (헤더 컬럼명에 징수결정액, 수납액 등이 있는 경우)
  const hasRevenueKeywords = keys.some(k => 
    k.includes('징수결정액') || k.includes('수납액') || k.includes('미수납액')
  );
  if (hasRevenueKeywords) return 'revenue';

  // 3. 세출 감지 (헤더 컬럼명에 원인행위액, 지출품의액, 지급액 등이 있는 경우)
  const hasExpenditureKeywords = keys.some(k => 
    k.includes('원인행위액') || k.includes('지출품의액') || k.includes('지급액') || k.includes('예산잔액')
  );
  if (hasExpenditureKeywords) return 'expenditure';

  // Fallback: 열 개수로 판단
  const colCount = keys.length;
  if (colCount >= 12) return 'expenditure';
  if (colCount >= 5 && colCount <= 7) return 'revenue';
  
  return null;
}

function processSelectedFile(key, file, statusEl) {
  if (!file) return;

  statusEl.className = 'file-status parsing';
  statusEl.innerText = '분석 중...';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const arrayBuffer = e.target.result;
      const records = cleanExcel(arrayBuffer);
      const sanitized = sanitizeRecords(records);

      // Detect Excel Type
      const detectedKey = detectExcelType(sanitized) || key;
      
      uploadedData[detectedKey] = sanitized;

      // Update status for the detected slot
      const targetStatusId = `status-${detectedKey}`;
      const targetStatusEl = document.getElementById(targetStatusId) || statusEl;
      
      targetStatusEl.className = 'file-status ready';
      targetStatusEl.innerText = `완료: ${sanitized.length}행`;

      if (detectedKey !== key) {
        // Reset the dropped slot if it is still empty
        if (!uploadedData[key]) {
          statusEl.className = 'file-status';
          statusEl.innerText = '대기 중';
        }
        
        const typeNames = { revenue: '세입 산출내역', expenditure: '세출 산출내역', history: '지출실적조회' };
        alert(`알림: 업로드하신 파일이 '${typeNames[detectedKey]}'으로 감지되어 해당 영역에 자동으로 배치되었습니다.`);
      }

      updateApplyButtonState();
    } catch (err) {
      console.error(`Error processing file for ${key}:`, err);
      statusEl.className = 'file-status error';
      statusEl.innerText = '오류: ' + err.message;
      uploadedData[key] = null;
      updateApplyButtonState();
    }
  };

  reader.onerror = function() {
    statusEl.className = 'file-status error';
    statusEl.innerText = '파일 읽기 실패';
    uploadedData[key] = null;
    updateApplyButtonState();
  };

  reader.readAsArrayBuffer(file);
}

function updateApplyButtonState() {
  const btnApply = document.getElementById('btn-apply-uploaded-data');
  const summaryText = document.getElementById('upload-summary-text');
  if (!btnApply) return;

  const isReady = uploadedData.revenue && uploadedData.expenditure && uploadedData.history;

  if (isReady) {
    btnApply.removeAttribute('disabled');
    btnApply.style.opacity = '1';
    btnApply.style.cursor = 'pointer';
    if (summaryText) {
      summaryText.innerHTML = '<i class="fa-solid fa-circle-check" style="color: var(--color-revenue);"></i> 모든 파일 준비 완료! 적용 버튼을 클릭하세요.';
    }
  } else {
    btnApply.setAttribute('disabled', 'true');
    btnApply.style.opacity = '0.5';
    btnApply.style.cursor = 'not-allowed';
    if (summaryText) {
      summaryText.innerHTML = '<i class="fa-solid fa-circle-info"></i> 세입, 세출, 지출실적 파일이 모두 업로드되어야 적용 가능합니다.';
    }
  }
}

function cleanExcel(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  // cellDates: true resolves Date formatting, raw: false outputs formatted string
  const workbook = XLSX.read(data, {type: 'array', cellDates: true});
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  // Convert sheet to nested array
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {header: 1, defval: null});

  let headerIdx = null;
  for (let idx = 0; idx < rawRows.length; idx++) {
    const row = rawRows[idx];
    if (!row) continue;
    const hasHeaderKeyword = row.some(val => {
      if (val === null || val === undefined) return false;
      const strVal = String(val);
      return strVal.includes('원가통계') || strVal.includes('산출내역') || strVal.includes('원인행위액');
    });
    if (hasHeaderKeyword) {
      headerIdx = idx;
      break;
    }
  }

  if (headerIdx !== null) {
    const rawColumns = rawRows[headerIdx];
    const columns = rawColumns.map((c, i) => {
      if (c !== null && c !== undefined && String(c).trim() !== '') {
        return String(c).trim().replace(/\n/g, '');
      } else {
        return `Col_${i}`;
      }
    });

    const records = [];
    for (let idx = headerIdx + 1; idx < rawRows.length; idx++) {
      const row = rawRows[idx];
      if (!row) continue;

      // Drop blank row equivalent to dropna(how='all')
      const isAllNull = row.every(val => val === null || val === undefined || String(val).trim() === '');
      if (isAllNull) continue;

      const record = {};
      columns.forEach((colName, colIdx) => {
        let val = colIdx < row.length ? row[colIdx] : null;
        record[colName] = val;
      });
      records.push(record);
    }
    return records;
  } else {
    // Fallback if no header found
    const records = [];
    rawRows.forEach((row) => {
      if (!row) return;
      const isAllNull = row.every(val => val === null || val === undefined || String(val).trim() === '');
      if (isAllNull) return;

      const record = {};
      row.forEach((val, i) => {
        record[`Col_${i}`] = val;
      });
      records.push(record);
    });
    return records;
  }
}

function sanitizeRecords(records) {
  return records.map(row => {
    const newRow = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined) {
        newRow[k] = null;
      } else if (v instanceof Date) {
        // Handle JS Date object parsing from sheet
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        newRow[k] = `${y}-${m}-${d}`;
      } else if (typeof v === 'number' && (k === '일자' || k === '결재일자')) {
        // Convert Excel serial numeric date
        newRow[k] = excelDateToJSDate(v);
      } else if (typeof v === 'string' && (k === '일자' || k === '결재일자') && /^\d{5}$/.test(v.trim())) {
        // Convert Excel serial date as string number
        newRow[k] = excelDateToJSDate(parseFloat(v));
      } else {
        newRow[k] = v;
      }
    }
    return newRow;
  });
}

function excelDateToJSDate(serial) {
  if (typeof serial !== 'number') return serial;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  const timezoneOffset = date_info.getTimezoneOffset() * 60 * 1000;
  const adjustedDate = new Date(date_info.getTime() + timezoneOffset);
  const y = adjustedDate.getFullYear();
  const m = String(adjustedDate.getMonth() + 1).padStart(2, '0');
  const d = String(adjustedDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Theme toggle controls
function setupTheme() {
  const btnTheme = document.getElementById('btn-theme-toggle');
  if (!btnTheme) return;

  function updateThemeButton(theme) {
    if (theme === 'light') {
      btnTheme.innerHTML = '<i class="fa-solid fa-moon"></i> <span>다크 모드</span>';
    } else {
      btnTheme.innerHTML = '<i class="fa-solid fa-sun"></i> <span>라이트 모드</span>';
    }
  }

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeButton(currentTheme);

  btnTheme.addEventListener('click', () => {
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = activeTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('k_budget_theme', newTheme);
    saveState();
    updateThemeButton(newTheme);
    
    // Re-render chart if dashboard tab is active to apply correct font/line colors
    const activeTab = document.querySelector('.nav-item.active');
    if (activeTab && activeTab.dataset.tab === 'dashboard') {
      renderDashboardChart();
    }
  });
}

// -------------------------------------------------------------
// PROFILE MANAGEMENT LOGIC
// -------------------------------------------------------------
function setupProfileManagement() {
  const profileSelect = document.getElementById('select-active-profile');
  const btnManage = document.getElementById('btn-manage-profiles');
  const modal = document.getElementById('profile-management-modal');
  const btnCloseModal = document.getElementById('btn-close-profile-modal');
  const btnCloseModalFooter = document.getElementById('btn-close-profile-modal-footer');
  const overlay = document.getElementById('profile-modal-overlay');
  
  const btnCreate = document.getElementById('btn-create-profile');
  const newProfileInput = document.getElementById('new-profile-name');

  if (!profileSelect || !btnManage || !modal) return;

  // Populate Select dropdown
  renderProfileSelectOptions();

  // Change Profile Event
  profileSelect.addEventListener('change', (e) => {
    selectProfile(e.target.value);
  });

  // Open Management Modal
  btnManage.addEventListener('click', () => {
    renderProfileList();
    modal.classList.add('active');
  });

  // Close Modal Handlers
  const closeProfileModal = () => {
    modal.classList.remove('active');
  };
  btnCloseModal.addEventListener('click', closeProfileModal);
  btnCloseModalFooter.addEventListener('click', closeProfileModal);
  overlay.addEventListener('click', closeProfileModal);

  // Create Profile Event
  btnCreate.addEventListener('click', () => {
    const name = newProfileInput.value.trim();
    if (!name) {
      alert('프로필 이름을 입력해 주세요.');
      return;
    }
    if (appState.profiles[name]) {
      alert('이미 존재하는 프로필 이름입니다.');
      return;
    }

    // Add new profile
    appState.profiles[name] = {
      mergedRevenues: {},
      linkageMappings: [],
      uploadedData: { revenue: [], expenditure: [], history: [] }
    };
    newProfileInput.value = '';

    saveState();
    renderProfileSelectOptions();
    renderProfileList();
    
    // Auto select newly created profile
    profileSelect.value = name;
    selectProfile(name);
    alert(`'${name}' 프로필이 생성되었습니다.`);
  });
}

function renderProfileSelectOptions() {
  const select = document.getElementById('select-active-profile');
  if (!select) return;
  
  select.innerHTML = '';
  Object.keys(appState.profiles).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === appState.activeProfile) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function renderProfileList() {
  const container = document.getElementById('profile-list-container');
  if (!container) return;

  container.innerHTML = '';
  Object.keys(appState.profiles).forEach(name => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '8px 12px';
    item.style.borderRadius = '6px';
    item.style.background = 'var(--bg-body)';
    item.style.border = '1px solid var(--border-color)';

    const label = document.createElement('span');
    label.style.fontWeight = '500';
    label.style.fontSize = '0.85rem';
    label.textContent = name;
    if (name === appState.activeProfile) {
      label.innerHTML += ' <span style="font-size:0.75rem; color:var(--primary-color); margin-left:6px;">(활성)</span>';
    }

    const actionGroup = document.createElement('div');
    actionGroup.style.display = 'flex';
    actionGroup.style.gap = '4px';

    const btnRename = document.createElement('button');
    btnRename.className = 'btn-refresh';
    btnRename.style.color = 'var(--primary-color)';
    btnRename.style.borderColor = 'transparent';
    btnRename.style.background = 'transparent';
    btnRename.style.padding = '4px 8px';
    btnRename.style.height = 'auto';
    btnRename.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
    btnRename.title = '프로필 이름 수정';
    btnRename.addEventListener('click', () => {
      renameProfile(name);
    });

    const btnDel = document.createElement('button');
    btnDel.className = 'btn-refresh';
    btnDel.style.color = 'var(--color-expenditure)';
    btnDel.style.borderColor = 'transparent';
    btnDel.style.background = 'transparent';
    btnDel.style.padding = '4px 8px';
    btnDel.style.height = 'auto';
    btnDel.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    btnDel.title = '프로필 삭제';
    
    // Prevent deleting the last profile
    if (Object.keys(appState.profiles).length <= 1) {
      btnDel.disabled = true;
      btnDel.style.opacity = '0.4';
    }

    btnDel.addEventListener('click', () => {
      if (confirm(`'${name}' 프로필과 모든 연동 데이터를 삭제하시겠습니까?`)) {
        delete appState.profiles[name];
        
        // If the deleted profile was active, switch to another one
        if (name === appState.activeProfile) {
          appState.activeProfile = Object.keys(appState.profiles)[0];
        }
        
        saveState();
        renderProfileSelectOptions();
        renderProfileList();
        selectProfile(appState.activeProfile);
      }
    });

    actionGroup.appendChild(btnRename);
    actionGroup.appendChild(btnDel);

    item.appendChild(label);
    item.appendChild(actionGroup);
    container.appendChild(item);
  });
}

function renameProfile(oldName) {
  const newName = prompt(`'${oldName}' 프로필의 새 이름을 입력해 주세요:`, oldName);
  if (newName === null) return; // Cancel
  const trimmed = newName.trim();
  if (!trimmed) {
    alert('프로필 이름은 빈칸일 수 없습니다.');
    return;
  }
  if (trimmed === oldName) return;
  if (appState.profiles[trimmed]) {
    alert('이미 존재하는 프로필 이름입니다.');
    return;
  }

  // 1. Copy structure
  appState.profiles[trimmed] = appState.profiles[oldName];
  // 2. Delete old profile
  delete appState.profiles[oldName];

  // 3. Update activeProfile selection if it was renamed
  if (appState.activeProfile === oldName) {
    appState.activeProfile = trimmed;
  }

  saveState();
  renderProfileSelectOptions();
  renderProfileList();
  updateDynamicTexts();

  alert(`프로필명이 '${oldName}'에서 '${trimmed}'(으)로 변경되었습니다.`);
}

function selectProfile(profileName) {
  if (!appState.profiles[profileName]) return;

  // 1. Save current active profile data into state memory
  if (appState.profiles[appState.activeProfile]) {
    appState.profiles[appState.activeProfile].uploadedData = {
      revenue: appData.revenue,
      expenditure: appData.expenditure,
      history: appData.history
    };
    appState.profiles[appState.activeProfile].linkageMappings = appState.linkageMappings;
    appState.profiles[appState.activeProfile].mergedRevenues = appState.mergedRevenues;
  }

  // 2. Switch active profile name
  appState.activeProfile = profileName;
  syncCurrentProfileRefs();

  // 3. Load next profile data into appData
  const currentProfile = appState.profiles[profileName];
  const pData = currentProfile.uploadedData || { revenue: [], expenditure: [], history: [] };
  appData.revenue = pData.revenue || [];
  appData.expenditure = pData.expenditure || [];
  appData.history = pData.history || [];

  // Sort history
  appData.history.sort((a, b) => {
    return (b.일자 || '').localeCompare(a.일자 || '');
  });

  // 4. Save state config (activeProfile selection) to storage
  saveState();

  // 5. Update UI
  updateDynamicTexts();
  renderBudgetFilterDropdown();
  renderAll();

  // Update status text in sidebar footer
  const statusText = document.querySelector('.status-indicator span:last-child');
  if (statusText) {
    statusText.innerText = (appData.revenue.length > 0) ? '업로드 데이터 연동 완료' : '샘플 데이터 연동 완료';
  }
}

function updateDynamicTexts() {
  const profileName = appState.activeProfile;
  
  // Update header text if we are on dashboard tab
  const activeTab = document.querySelector('.nav-item.active');
  const pageDesc = document.getElementById('page-description');
  if (pageDesc) {
    if (!activeTab || activeTab.dataset.tab === 'dashboard') {
      pageDesc.innerText = `2026학년도 [${profileName}] 세입 대비 세출 현황 및 정산 재원 실시간 분석`;
    }
  }

  // Update Excel Upload Help Placeholders
  const placeholders = document.querySelectorAll('.help-profile-name');
  placeholders.forEach(el => {
    el.innerText = profileName;
  });
}

// Start Program
window.addEventListener('DOMContentLoaded', init);
