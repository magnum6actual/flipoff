const loginShell = document.getElementById('login-shell');
const dashboardShell = document.getElementById('dashboard-shell');
const loginPanel = document.getElementById('login-panel');
const loginForm = document.getElementById('login-form');
const settingsForm = document.getElementById('settings-form');
const screensForm = document.getElementById('screens-form');
const messageForm = document.getElementById('message-form');
const logoutBtn = document.getElementById('logout-btn');
const clearMessageBtn = document.getElementById('clear-message-btn');
const statusMessage = document.getElementById('status-message');

const colsInput = document.getElementById('cols');
const rowsInput = document.getElementById('rows');
const messageDurationInput = document.getElementById('message-duration');
const durationInput = document.getElementById('api-duration');
const boardNameInput = document.getElementById('board-name');
const boardSlugInput = document.getElementById('board-slug');
const boardDefaultInput = document.getElementById('board-default');
const adminPasswordSettingInput = document.getElementById('admin-password-setting');
const adminPasswordConfirmSettingInput = document.getElementById('admin-password-confirm-setting');
const passwordInput = document.getElementById('password');
const remoteMessageInput = document.getElementById('remote-message');
const boardSelect = document.getElementById('board-select');
const addBoardBtn = document.getElementById('add-board-btn');
const deleteBoardBtn = document.getElementById('delete-board-btn');

const screensList = document.getElementById('screens-list');
const addScreenBtn = document.getElementById('add-screen-btn');
const screenModal = document.getElementById('screen-modal');
const screenModalForm = document.getElementById('screen-modal-form');
const screenModalTitle = document.getElementById('screen-modal-title');
const screenTypeSelect = document.getElementById('screen-type-select');
const screenTypeButtons = Array.from(document.querySelectorAll('[data-screen-type-value]'));
const screenNameInput = document.getElementById('screen-name-input');
const screenSlugInput = document.getElementById('screen-slug-input');
const manualScreenFields = document.getElementById('manual-screen-fields');
const pluginScreenFields = document.getElementById('plugin-screen-fields');
const screenLineFields = document.getElementById('screen-line-fields');
const pluginSelect = document.getElementById('plugin-select');
const pluginSelectTrigger = document.getElementById('plugin-select-trigger');
const pluginSelectMenu = document.getElementById('plugin-select-menu');
const pluginRefreshMinutesInput = document.getElementById('plugin-refresh-minutes');
const pluginSettingsFields = document.getElementById('plugin-settings-fields');
const pluginCommonSettingsSection = document.getElementById('plugin-common-settings-section');
const pluginCommonSettingsFields = document.getElementById('plugin-common-settings-fields');
const pluginDesignFields = document.getElementById('plugin-design-fields');
const closeScreenModalBtn = document.getElementById('close-screen-modal-btn');
const cancelScreenModalBtn = document.getElementById('cancel-screen-modal-btn');

const workspaceTitle = document.getElementById('workspace-title');
const workspaceHeaderActions = document.getElementById('workspace-header-actions');
const homeBoardGrid = document.getElementById('home-board-grid');
const headerBoardSize = document.getElementById('header-board-size');
const headerScreenCount = document.getElementById('header-screen-count');
const overviewBoardSize = document.getElementById('overview-board-size');
const overviewBoardMeta = document.getElementById('overview-board-meta');
const overviewRotation = document.getElementById('overview-rotation');
const overviewRotationMeta = document.getElementById('overview-rotation-meta');
const overviewScreenMix = document.getElementById('overview-screen-mix');
const overviewScreenMixMeta = document.getElementById('overview-screen-mix-meta');
const overviewOverride = document.getElementById('overview-override');
const overviewOverrideMeta = document.getElementById('overview-override-meta');
const rotationOverview = document.getElementById('rotation-overview');
const overridePanelState = document.getElementById('override-panel-state');
const overridePanelMeta = document.getElementById('override-panel-meta');
const overridePreview = document.getElementById('override-preview');
const pluginHealthList = document.getElementById('plugin-health-list');
const pluginHealthSection = pluginHealthList ? pluginHealthList.closest('.workspace-section') : null;
const messagePageStatus = document.getElementById('message-page-status');
const messagePageMeta = document.getElementById('message-page-meta');
const messagePagePreview = document.getElementById('message-page-preview');
const navButtons = Array.from(document.querySelectorAll('[data-page-target]'));
const jumpButtons = Array.from(document.querySelectorAll('[data-jump-page]'));
const pagePanels = Array.from(document.querySelectorAll('.workspace-page'));
const SELECTED_BOARD_STORAGE_KEY = 'flipoff.admin.selectedBoard';

let currentConfig = null;
let currentBoardSlug = null;
let availableBoards = [];
let currentMessageState = {
  hasOverride: false,
  lines: [],
  updatedAt: null,
};
let availablePlugins = [];
let pluginCommonSettings = {};
let screenDrafts = [];
let screensDirty = false;
let activePage = 'home';
let editingScreenIndex = null;
let draggedScreenIndex = null;

loginForm.addEventListener('submit', handleLogin);
settingsForm.addEventListener('submit', handleSaveSettings);
screensForm.addEventListener('submit', handleSaveScreens);
messageForm.addEventListener('submit', handleSendMessage);
logoutBtn.addEventListener('click', handleLogout);
clearMessageBtn.addEventListener('click', handleClearMessage);
addScreenBtn.addEventListener('click', () => openScreenModal());
boardSelect.addEventListener('change', handleBoardChange);
addBoardBtn.addEventListener('click', handleAddBoard);
deleteBoardBtn.addEventListener('click', handleDeleteBoard);
screensList.addEventListener('click', handleScreensListClick);
screensList.addEventListener('dragstart', handleScreenDragStart);
screensList.addEventListener('dragover', handleScreenDragOver);
screensList.addEventListener('drop', handleScreenDrop);
screensList.addEventListener('dragend', clearDragState);
screenModalForm.addEventListener('submit', handleSaveScreenModal);
pluginSelectTrigger.addEventListener('click', handlePluginPickerToggle);
pluginSelectMenu.addEventListener('click', handlePluginPickerSelect);
closeScreenModalBtn.addEventListener('click', closeScreenModal);
cancelScreenModalBtn.addEventListener('click', closeScreenModal);
screenModal.addEventListener('cancel', () => {
  editingScreenIndex = null;
});
document.addEventListener('click', handleDocumentClick);

for (const screenTypeButton of screenTypeButtons) {
  screenTypeButton.addEventListener('click', () => {
    screenTypeSelect.value = screenTypeButton.dataset.screenTypeValue;
    handleScreenTypeChange();
  });
}

for (const navButton of navButtons) {
  navButton.addEventListener('click', () => {
    switchPage(navButton.dataset.pageTarget);
  });
}

for (const jumpButton of jumpButtons) {
  jumpButton.addEventListener('click', () => {
    switchPage(jumpButton.dataset.jumpPage);
  });
}

void loadAdminState({ boardSlug: loadStoredBoardSlug() });

async function loadAdminState({ successMessage = '', showSuccessMessage = false, boardSlug = currentBoardSlug } = {}) {
  try {
    const boardsResponse = await fetch('/api/admin/boards', { credentials: 'same-origin' });

    if (boardsResponse.status === 401) {
      showLogin();
      return;
    }

    if (!boardsResponse.ok) {
      const error = await readError(boardsResponse, 'Unable to load boards.');
      showLogin();
      setStatus(error, 'error');
      return;
    }

    const boardsPayload = await boardsResponse.json();
    applyBoardsPayload(boardsPayload, boardSlug);

    if (!currentBoardSlug) {
      showLogin();
      setStatus('No boards are configured.', 'error');
      return;
    }

    const boardQuery = getBoardQuery(currentBoardSlug);
    const configResponse = await fetch(`/api/admin/config${boardQuery}`, { credentials: 'same-origin' });
    if (!configResponse.ok) {
      const error = await readError(configResponse, 'Unable to load admin configuration.');
      showLogin();
      setStatus(error, 'error');
      return;
    }

    const screensResponse = await fetch(`/api/admin/screens${boardQuery}`, { credentials: 'same-origin' });
    if (screensResponse.status === 401) {
      showLogin();
      return;
    }

    if (!screensResponse.ok) {
      const error = await readError(screensResponse, 'Unable to load screen definitions.');
      showLogin();
      setStatus(error, 'error');
      return;
    }

    const messageResponse = await fetch(`/api/message${boardQuery}`, { credentials: 'same-origin' });
    if (!messageResponse.ok) {
      showLogin();
      setStatus('Unable to load the current override state.', 'error');
      return;
    }

    const [config, screensPayload, messageState] = await Promise.all([
      configResponse.json(),
      screensResponse.json(),
      messageResponse.json(),
    ]);
    showDashboard(boardsPayload, config, screensPayload, messageState);

    if (showSuccessMessage) {
      setStatus(successMessage, 'success');
    }
  } catch {
    showLogin();
    setStatus('Unable to reach the admin API.', 'error');
  }
}

function applyBoardsPayload(payload, requestedBoardSlug = currentBoardSlug) {
  availableBoards = clone(payload?.boards || []);
  const fallbackSlug = payload?.defaultBoardSlug || availableBoards[0]?.slug || null;
  currentBoardSlug = availableBoards.some((board) => board.slug === requestedBoardSlug)
    ? requestedBoardSlug
    : fallbackSlug;
  persistBoardSlug(currentBoardSlug);
  renderBoardSelector();
  renderHomeBoardCards();
}

function renderBoardSelector() {
  if (!boardSelect) {
    return;
  }

  boardSelect.replaceChildren();

  for (const board of availableBoards) {
    const option = document.createElement('option');
    option.value = board.slug;
    option.textContent = board.isDefault ? `${board.name} (${board.slug}, default)` : `${board.name} (${board.slug})`;
    boardSelect.append(option);
  }

  boardSelect.value = currentBoardSlug || '';
  deleteBoardBtn.disabled = availableBoards.length <= 1 || !currentBoardSlug;
}

function getBoardQuery(boardSlug = currentBoardSlug) {
  return boardSlug ? `?board=${encodeURIComponent(boardSlug)}` : '';
}

function loadStoredBoardSlug() {
  try {
    return window.localStorage.getItem(SELECTED_BOARD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistBoardSlug(boardSlug) {
  try {
    if (boardSlug) {
      window.localStorage.setItem(SELECTED_BOARD_STORAGE_KEY, boardSlug);
      return;
    }

    window.localStorage.removeItem(SELECTED_BOARD_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the UI functional.
  }
}

async function handleBoardChange() {
  if (screensDirty) {
    setStatus('Save screens before switching boards.', 'error');
    boardSelect.value = currentBoardSlug || '';
    return;
  }

  await loadAdminState({ boardSlug: boardSelect.value });
}

async function handleAddBoard() {
  const name = window.prompt('Board name');
  if (!name) {
    return;
  }

  const suggestedSlug = slugify(name);
  const slugInput = window.prompt('Board slug', suggestedSlug);
  if (!slugInput) {
    return;
  }

  setStatus('Creating board...');

  try {
    const response = await fetch('/api/admin/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ name, slug: slugInput }),
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Unable to create the board.'), 'error');
      return;
    }

    await loadAdminState({
      boardSlug: slugify(slugInput),
      successMessage: 'Board created.',
      showSuccessMessage: true,
    });
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleDeleteBoard() {
  if (!currentBoardSlug) {
    return;
  }

  const board = availableBoards.find((entry) => entry.slug === currentBoardSlug);
  if (!board) {
    return;
  }

  if (!window.confirm(`Delete board "${board.name}"?`)) {
    return;
  }

  setStatus('Deleting board...');

  try {
    const response = await fetch(`/api/admin/boards/${encodeURIComponent(currentBoardSlug)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Unable to delete the board.'), 'error');
      return;
    }

    await loadAdminState({
      successMessage: 'Board deleted.',
      showSuccessMessage: true,
    });
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setStatus('Checking password...');

  try {
    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password: passwordInput.value }),
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Login failed.'), 'error');
      return;
    }

    passwordInput.value = '';
    await loadAdminState();
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleSaveSettings(event) {
  event.preventDefault();

  if (!currentConfig) {
    setStatus('Load the admin config before saving settings.', 'error');
    return;
  }

  if (screensDirty) {
    setStatus('Save screens before changing settings so the draft screen stack is not lost.', 'error');
    return;
  }

  setStatus('Saving settings...');

  const nextAdminPassword = adminPasswordSettingInput.value;
  const confirmAdminPassword = adminPasswordConfirmSettingInput.value;
  if (nextAdminPassword || confirmAdminPassword) {
    if (nextAdminPassword !== confirmAdminPassword) {
      setStatus('The new admin password confirmation does not match.', 'error');
      return;
    }
  }

  try {
    const payload = {
      name: boardNameInput.value.trim(),
      slug: boardSlugInput.value.trim(),
      isDefault: Boolean(boardDefaultInput.checked),
      cols: Number(colsInput.value),
      rows: Number(rowsInput.value),
      messageDurationSeconds: Number(messageDurationInput.value),
      apiMessageDurationSeconds: Number(durationInput.value),
    };

    if (nextAdminPassword) {
      payload.adminPassword = nextAdminPassword;
    }

    const response = await fetch(`/api/admin/config${getBoardQuery()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Save failed.'), 'error');
      return;
    }

    const savedConfig = await response.json();
    currentBoardSlug = savedConfig.slug;
    adminPasswordSettingInput.value = '';
    adminPasswordConfirmSettingInput.value = '';
    await loadAdminState({
      boardSlug: savedConfig.slug,
      successMessage: nextAdminPassword
        ? 'Settings and admin password saved. Display pages will refresh automatically.'
        : 'Settings saved. Display pages will refresh automatically.',
      showSuccessMessage: true,
    });
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleSaveScreens(event) {
  event.preventDefault();

  if (!currentConfig) {
    setStatus('Load the admin config before saving screens.', 'error');
    return;
  }

  setStatus('Saving screens...');

  try {
    const response = await fetch(`/api/admin/screens${getBoardQuery()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        pluginCommonSettings,
        screens: screenDrafts.map(serializeScreenForSave),
      }),
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Save failed.'), 'error');
      return;
    }

    await loadAdminState({
      successMessage: 'Screens saved. Display pages will refresh automatically.',
      showSuccessMessage: true,
    });
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/admin/session', {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch {
    // Clear local state even if the request fails.
  }

  currentConfig = null;
  currentBoardSlug = null;
  availableBoards = [];
  currentMessageState = {
    hasOverride: false,
    lines: [],
    updatedAt: null,
  };
  availablePlugins = [];
  pluginCommonSettings = {};
  screenDrafts = [];
  screensDirty = false;
  editingScreenIndex = null;
  remoteMessageInput.value = '';
  closeScreenModal();
  showLogin();
  setStatus('Logged out.');
}

async function handleSendMessage(event) {
  event.preventDefault();

  const message = remoteMessageInput.value.trim();
  if (!message) {
    setStatus('Enter a message before sending it.', 'error');
    return;
  }

  setStatus('Sending remote message...');

  try {
    const response = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ boardSlug: currentBoardSlug, message }),
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Unable to send the remote message.'), 'error');
      return;
    }

    applyMessageState(await response.json());
    setStatus('Remote message sent.', 'success');
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleClearMessage() {
  setStatus('Clearing active override...');

  try {
    const response = await fetch(`/api/message${getBoardQuery()}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Unable to clear the remote message.'), 'error');
      return;
    }

    applyMessageState(await response.json());
    setStatus('Remote override cleared.', 'success');
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

function handleScreensListClick(event) {
  const actionButton = event.target.closest('[data-screen-action]');
  if (!actionButton) {
    return;
  }

  const screenItem = actionButton.closest('.screen-item');
  if (!screenItem) {
    return;
  }

  const index = Number(screenItem.dataset.index);
  const action = actionButton.dataset.screenAction;

  if (action === 'edit') {
    openScreenModal(index);
    return;
  }

  if (action === 'delete') {
    if (screenDrafts.length <= 1) {
      setStatus('At least one screen is required.', 'error');
      return;
    }

    screenDrafts.splice(index, 1);
    markScreensDirty('Screen removed locally. Save screens to persist the new stack.');
    renderScreensList();
    return;
  }

  if (action === 'refresh') {
    void refreshPluginScreen(index);
  }
}

function handleScreenDragStart(event) {
  const screenItem = event.target.closest('.screen-item');
  if (!screenItem) {
    return;
  }

  draggedScreenIndex = Number(screenItem.dataset.index);
  screenItem.classList.add('dragging');

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', screenItem.dataset.index);
  }
}

function handleScreenDragOver(event) {
  if (draggedScreenIndex === null) {
    return;
  }

  const targetItem = event.target.closest('.screen-item');
  if (!targetItem) {
    return;
  }

  event.preventDefault();
  clearDragIndicators();

  const targetIndex = Number(targetItem.dataset.index);
  if (targetIndex !== draggedScreenIndex) {
    targetItem.classList.add('drag-over');
  }
}

function handleScreenDrop(event) {
  if (draggedScreenIndex === null) {
    return;
  }

  const targetItem = event.target.closest('.screen-item');
  if (!targetItem) {
    return;
  }

  event.preventDefault();

  const targetIndex = Number(targetItem.dataset.index);
  if (targetIndex === draggedScreenIndex) {
    clearDragState();
    return;
  }

  const targetBounds = targetItem.getBoundingClientRect();
  const placeAfter = event.clientY > targetBounds.top + targetBounds.height / 2;
  const movedScreen = screenDrafts.splice(draggedScreenIndex, 1)[0];
  let insertIndex = targetIndex;

  if (draggedScreenIndex < targetIndex) {
    insertIndex = placeAfter ? targetIndex : targetIndex - 1;
  } else if (placeAfter) {
    insertIndex = targetIndex + 1;
  }

  screenDrafts.splice(insertIndex, 0, movedScreen);
  markScreensDirty('Screen order changed locally. Save screens to persist the new rotation.');
  renderScreensList();
}

function handleSaveScreenModal(event) {
  event.preventDefault();

  if (!currentConfig) {
    setStatus('Load the admin config before editing screens.', 'error');
    return;
  }

  const type = screenTypeSelect.value;
  const name = screenNameInput.value.trim();
  const slug = slugify(screenSlugInput.value.trim() || name || `screen-${editingScreenIndex === null ? screenDrafts.length + 1 : editingScreenIndex + 1}`);
  const id = editingScreenIndex === null ? createLocalScreenId() : screenDrafts[editingScreenIndex].id;

  if (!slug) {
    setStatus('Enter a valid slug for the screen.', 'error');
    return;
  }

  if (screenDrafts.some((screen, index) => index !== editingScreenIndex && screen.slug === slug)) {
    setStatus('Screen slugs must be unique within a board.', 'error');
    return;
  }

  if (type === 'manual') {
    const lines = Array.from(screenLineFields.querySelectorAll('input')).map((input) => input.value.trim());
    const lastPopulatedIndex = findLastPopulatedIndex(lines);

    if (lastPopulatedIndex === -1) {
      setStatus('Enter at least one line for the manual screen.', 'error');
      return;
    }

    upsertScreenDraft(editingScreenIndex, {
      id,
      slug,
      type: 'manual',
      name,
      enabled: true,
      lines: lines.slice(0, lastPopulatedIndex + 1),
    });
    closeScreenModal();
    return;
  }

  const plugin = getPluginById(pluginSelect.value);
  if (!plugin) {
    setStatus('Select a plugin before saving the screen.', 'error');
    return;
  }

  const refreshMinutes = Number(pluginRefreshMinutesInput.value);
  if (!Number.isInteger(refreshMinutes) || refreshMinutes < 1) {
    setStatus('Refresh interval must be at least 1 minute.', 'error');
    return;
  }

  const settings = collectSchemaValues(plugin.settingsSchema, 'settings');
  const commonSettings = collectSchemaValues(plugin.commonSettingsSchema || [], 'common');
  const design = collectSchemaValues(plugin.designSchema, 'design');

  if (plugin.commonSettingsNamespace) {
    pluginCommonSettings[plugin.commonSettingsNamespace] = commonSettings;
  }

  upsertScreenDraft(editingScreenIndex, {
    id,
    slug,
    type: 'plugin',
    name,
    enabled: true,
    pluginId: plugin.id,
    pluginName: plugin.name,
    refreshIntervalSeconds: refreshMinutes * 60,
    settings,
    design,
    lastError: null,
    lastRefreshedAt: null,
  });
  closeScreenModal();
}

function handleScreenTypeChange() {
  updateScreenTypeButtons();
  syncModalSections();
}

function handlePluginSelectionChange() {
  renderPluginSchemaFields();
}

async function refreshPluginScreen(index) {
  const screen = screenDrafts[index];
  if (!screen || screen.type !== 'plugin') {
    return;
  }

  if (screensDirty) {
    setStatus('Save screens before refreshing a plugin screen so the server is using the same configuration.', 'error');
    return;
  }

  setStatus(`Refreshing ${getScreenTitle(screen, index)}...`);

  try {
    const response = await fetch(`/api/admin/screens/${encodeURIComponent(screen.id)}/refresh${getBoardQuery()}`, {
      method: 'POST',
      credentials: 'same-origin',
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Unable to refresh the plugin screen.'), 'error');
      return;
    }

    await loadAdminState({
      successMessage: `${getScreenTitle(screen, index)} refreshed.`,
      showSuccessMessage: true,
    });
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

function showLogin() {
  loginShell.classList.remove('hidden');
  dashboardShell.classList.add('hidden');
  loginPanel.classList.remove('hidden');
  switchPage('home');
  passwordInput.focus();
}

function showDashboard(boardsPayload, config, screensPayload, messageState) {
  loginShell.classList.add('hidden');
  dashboardShell.classList.remove('hidden');
  applyBoardsPayload(boardsPayload, config.slug);
  applyConfig(config);
  applyScreensPayload(screensPayload);
  applyMessageState(messageState);
  switchPage(activePage);
}

function applyConfig(config) {
  currentConfig = {
    slug: config.slug,
    name: config.name,
    isDefault: Boolean(config.isDefault),
    cols: config.cols,
    rows: config.rows,
    messageDurationSeconds: config.messageDurationSeconds,
    apiMessageDurationSeconds: config.apiMessageDurationSeconds,
  };
  currentBoardSlug = config.slug;

  boardNameInput.value = config.name || '';
  boardSlugInput.value = config.slug || '';
  boardDefaultInput.checked = Boolean(config.isDefault);
  colsInput.value = String(config.cols);
  rowsInput.value = String(config.rows);
  messageDurationInput.value = String(config.messageDurationSeconds);
  durationInput.value = String(config.apiMessageDurationSeconds);
  renderDashboardSummary();
}

function applyScreensPayload(payload) {
  availablePlugins = clone(payload.plugins || []);
  pluginCommonSettings = clone(payload.pluginCommonSettings || {});
  screenDrafts = clone(payload.screens || []);
  screensDirty = false;
  updateScreensDraftNote();
  updatePluginCatalogNote();
  renderScreensList();
  renderDashboardSummary();
}

function applyMessageState(messageState) {
  currentMessageState = clone(messageState || {
    hasOverride: false,
    lines: [],
    updatedAt: null,
  });
  renderDashboardSummary();
}

function renderDashboardSummary() {
  if (!currentConfig) {
    return;
  }

  const manualScreens = screenDrafts.filter((screen) => screen.type === 'manual');
  const pluginScreens = screenDrafts.filter((screen) => screen.type === 'plugin');
  const pluginIssues = pluginScreens.filter((screen) => screen.lastError).length;
  const totalCells = currentConfig.cols * currentConfig.rows;
  const hasOverride = Boolean(currentMessageState.hasOverride);

  if (headerBoardSize) {
    headerBoardSize.textContent = `${currentConfig.cols} x ${currentConfig.rows}`;
  }

  if (headerScreenCount) {
    headerScreenCount.textContent = String(screenDrafts.length);
  }

  if (overviewBoardSize) {
    overviewBoardSize.textContent = `${currentConfig.cols} x ${currentConfig.rows}`;
  }

  if (overviewBoardMeta) {
    overviewBoardMeta.textContent = `${totalCells} characters across ${currentConfig.rows} ${pluralize('row', currentConfig.rows)}.`;
  }

  if (overviewRotation) {
    overviewRotation.textContent = formatDuration(currentConfig.messageDurationSeconds);
  }

  if (overviewRotationMeta) {
    overviewRotationMeta.textContent = `Screens advance every ${formatDuration(currentConfig.messageDurationSeconds)}. API overrides expire after ${formatDuration(currentConfig.apiMessageDurationSeconds)}.`;
  }

  if (overviewScreenMix) {
    overviewScreenMix.textContent = `${screenDrafts.length} total`;
  }

  if (overviewScreenMixMeta) {
    overviewScreenMixMeta.textContent = `${manualScreens.length} manual · ${pluginScreens.length} plugin.`;
  }

  if (overviewOverride) {
    overviewOverride.textContent = hasOverride ? 'Live' : 'Clear';
  }

  if (overviewOverrideMeta) {
    overviewOverrideMeta.textContent = hasOverride
      ? `Override updated ${formatTimestamp(currentMessageState.updatedAt)}.`
      : 'Rotation is running without a temporary override.';
  }

  renderRotationOverview();
  renderOverridePanels();
  renderPluginHealth();
}

function renderRotationOverview() {
  if (!rotationOverview) {
    return;
  }

  rotationOverview.replaceChildren();

  if (screenDrafts.length === 0) {
    rotationOverview.append(buildEmptyState('No screens are configured yet.'));
    return;
  }

  const visibleScreens = screenDrafts.slice(0, 6);
  for (const [index, screen] of visibleScreens.entries()) {
    const item = document.createElement('article');
    item.className = 'rotation-item';

    const head = document.createElement('div');
    head.className = 'rotation-item-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'stack compact-stack';

    const titleRow = document.createElement('div');
    titleRow.className = 'rotation-item-head';

    const indexBadge = document.createElement('span');
    indexBadge.className = 'rotation-item-index';
    indexBadge.textContent = String(index + 1);

    const title = document.createElement('h3');
    title.className = 'rotation-item-title';
    title.textContent = getScreenTitle(screen, index);

    titleRow.append(indexBadge, title);

    const meta = document.createElement('div');
    meta.className = 'screen-item-meta';
    meta.append(buildScreenChip(screen.type === 'manual' ? 'Manual' : 'Plugin', screen.type === 'manual' ? '' : 'accent'));

    if (screen.type === 'plugin') {
      meta.append(buildScreenChip(`${Math.round(screen.refreshIntervalSeconds / 60)} min`));
      if (screen.lastError) {
        meta.append(buildScreenChip('Needs attention', 'error'));
      } else if (screen.lastRefreshedAt) {
        meta.append(buildScreenChip(`Updated ${formatTimestamp(screen.lastRefreshedAt)}`));
      }
    }

    const copy = document.createElement('p');
    copy.className = 'helper-copy';
    copy.textContent = getScreenSummary(screen);

    titleWrap.append(titleRow, meta, copy);
    head.append(titleWrap);
    item.append(head);
    rotationOverview.append(item);
  }

  if (screenDrafts.length > visibleScreens.length) {
    rotationOverview.append(buildEmptyState(`${screenDrafts.length - visibleScreens.length} more ${pluralize('screen', screenDrafts.length - visibleScreens.length)} in the saved rotation.`));
  }
}

function renderOverridePanels() {
  if (!overridePanelState || !overridePanelMeta || !overridePreview || !messagePageStatus || !messagePageMeta || !messagePagePreview) {
    return;
  }

  const hasOverride = Boolean(currentMessageState.hasOverride);
  const previewLines = buildOverridePreviewLines();
  const statusLabel = hasOverride ? 'Override live' : 'Rotation live';
  const statusTone = hasOverride ? 'warning' : 'success';
  const metaText = hasOverride
    ? `Updated ${formatTimestamp(currentMessageState.updatedAt)}. Clear it manually or wait for the API timer to expire.`
    : 'No temporary override is active. The screen rotation is running normally.';

  setStatusPill(overridePanelState, statusLabel, statusTone);
  overridePanelMeta.textContent = metaText;
  overridePreview.textContent = previewLines.join('\n');

  setStatusPill(messagePageStatus, statusLabel, statusTone);
  messagePageMeta.textContent = metaText;
  messagePagePreview.textContent = previewLines.join('\n');
}

function renderPluginHealth() {
  if (!pluginHealthList || !pluginHealthSection) {
    return;
  }

  pluginHealthList.replaceChildren();

  const pluginScreens = screenDrafts.filter((screen) => screen.type === 'plugin');
  if (pluginScreens.length === 0) {
    pluginHealthSection.classList.add('hidden');
    return;
  }

  pluginHealthSection.classList.remove('hidden');

  for (const [index, screen] of pluginScreens.entries()) {
    const item = document.createElement('article');
    item.className = 'health-item';

    const head = document.createElement('div');
    head.className = 'health-item-head';

    const title = document.createElement('h3');
    title.className = 'health-item-title';
    title.textContent = getScreenTitle(screen, index);

    const status = document.createElement('span');
    if (screen.lastError) {
      setStatusPill(status, 'Needs attention', 'error');
    } else if (screen.lastRefreshedAt) {
      setStatusPill(status, 'Healthy', 'success');
    } else {
      setStatusPill(status, 'Pending', 'neutral');
    }

    head.append(title, status);

    const meta = document.createElement('p');
    meta.className = 'helper-copy';
    meta.textContent = screen.lastError
      ? screen.lastError
      : screen.lastRefreshedAt
        ? `Last refresh ${formatTimestamp(screen.lastRefreshedAt)}.`
        : 'Awaiting first refresh.';

    item.append(head, meta);
    pluginHealthList.append(item);
  }
}

function buildOverridePreviewLines() {
  if (currentMessageState.hasOverride) {
    return padLocalLines(currentMessageState.lines || []);
  }

  const fallbackLine = screenDrafts[0]
    ? `Next: ${getScreenTitle(screenDrafts[0], 0)}`
    : 'Rotation idle';
  return padLocalLines(['', fallbackLine.slice(0, currentConfig.cols), '']);
}

function setStatusPill(element, label, tone = 'neutral') {
  element.textContent = label;
  element.className = 'status-pill';
  element.classList.add(tone);
}

function buildEmptyState(text) {
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.textContent = text;
  return emptyState;
}

function renderScreensList() {
  screensList.replaceChildren();

  if (screenDrafts.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'screen-empty';
    emptyState.textContent = 'No screens configured yet.';
    screensList.append(emptyState);
    renderDashboardSummary();
    return;
  }

  for (const [index, screen] of screenDrafts.entries()) {
    const screenItem = document.createElement('article');
    screenItem.className = 'screen-item';
    screenItem.draggable = true;
    screenItem.dataset.index = String(index);

    const handle = document.createElement('span');
    handle.className = 'screen-drag-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = getScreenActionIcon('drag');

    const title = document.createElement('h3');
    title.className = 'screen-item-title';
    title.textContent = getScreenTitle(screen, index);

    const actions = document.createElement('div');
    actions.className = 'screen-item-actions';

    if (screen.type === 'plugin') {
      actions.append(
        buildScreenIconButton('Refresh plugin screen', 'refresh', 'refresh'),
      );
    }

    actions.append(
      buildScreenIconButton('Edit screen', 'edit', 'edit'),
      buildScreenIconButton('Delete screen', 'delete', 'delete danger'),
    );

    screenItem.append(handle, title, actions);
    screensList.append(screenItem);
  }

  renderDashboardSummary();
}

function buildScreenChip(label, extraClassName = '') {
  const chip = document.createElement('span');
  chip.className = ['screen-chip', extraClassName].filter(Boolean).join(' ');
  chip.textContent = label;
  return chip;
}

function buildScreenActionButton(extraClassName, label, action = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['screen-action', extraClassName].filter(Boolean).join(' ');
  button.textContent = label;

  if (action) {
    button.dataset.screenAction = action;
  }

  return button;
}

function buildScreenIconButton(label, action, extraClassName = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['screen-icon-button', extraClassName].filter(Boolean).join(' ');
  button.dataset.screenAction = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = getScreenActionIcon(action);
  return button;
}

function getScreenActionIcon(action) {
  if (action === 'edit') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 20l4.2-1 9.4-9.4-3.2-3.2L5 15.8 4 20z" />
        <path d="M13.8 5.8l3.2 3.2" />
      </svg>
    `;
  }

  if (action === 'delete') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 7h14" />
        <path d="M9 7V5h6v2" />
        <path d="M8 10v7" />
        <path d="M12 10v7" />
        <path d="M16 10v7" />
        <path d="M7 7l1 12h8l1-12" />
      </svg>
    `;
  }

  if (action === 'refresh') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 11a8 8 0 1 0 2 5.5" />
        <path d="M20 4v7h-7" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="8" cy="6" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <circle cx="8" cy="18" r="1.5" />
      <circle cx="16" cy="6" r="1.5" />
      <circle cx="16" cy="12" r="1.5" />
      <circle cx="16" cy="18" r="1.5" />
    </svg>
  `;
}

function openScreenModal(index = null) {
  if (!currentConfig) {
    setStatus('Load the admin config before editing screens.', 'error');
    return;
  }

  editingScreenIndex = index;
  const draft = index === null ? buildDefaultManualDraft() : clone(screenDrafts[index]);

  screenModalTitle.textContent = index === null ? 'Add Screen' : `Edit ${getScreenTitle(draft, index)}`;
  screenTypeSelect.value = draft.type;
  screenNameInput.value = draft.name || '';
  screenSlugInput.value = draft.slug || slugify(draft.name || `screen-${index === null ? screenDrafts.length + 1 : index + 1}`);

  renderManualFields(draft.type === 'manual' ? draft.lines : []);
  populatePluginSelect(draft.pluginId);
  populatePluginEditor(draft);
  syncModalSections();

  if (typeof screenModal.showModal === 'function') {
    screenModal.showModal();
  } else {
    screenModal.setAttribute('open', 'open');
  }

  const firstInput = screenModal.querySelector('input, select, textarea');
  if (firstInput) {
    firstInput.focus();
  }
}

function closeScreenModal() {
  editingScreenIndex = null;
  closePluginPicker();

  if (typeof screenModal.close === 'function' && screenModal.open) {
    screenModal.close();
    return;
  }

  screenModal.removeAttribute('open');
}

function populatePluginSelect(selectedPluginId = '') {
  pluginSelectMenu.replaceChildren();

  for (const plugin of availablePlugins) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'custom-picker-option';
    option.dataset.pluginId = plugin.id;
    option.setAttribute('role', 'option');
    option.textContent = plugin.name;
    pluginSelectMenu.append(option);
  }

  const nextValue = selectedPluginId && getPluginById(selectedPluginId)
    ? selectedPluginId
    : availablePlugins[0]?.id || '';
  setPluginSelectValue(nextValue);
}

function populatePluginEditor(draft) {
  const plugin = getPluginById(draft.pluginId || pluginSelect.value);
  if (!plugin) {
    pluginRefreshMinutesInput.value = '60';
    pluginSettingsFields.replaceChildren();
    pluginCommonSettingsFields.replaceChildren();
    pluginDesignFields.replaceChildren();
    pluginCommonSettingsSection.classList.add('hidden');
    return;
  }

  setPluginSelectValue(plugin.id);
  pluginRefreshMinutesInput.value = String(Math.max(1, Math.round((draft.refreshIntervalSeconds || plugin.defaultRefreshIntervalSeconds) / 60)));
  renderPluginSchemaFields(draft.settings || {}, draft.design || {});
}

function renderPluginSchemaFields(settingsValues = null, designValues = null) {
  const plugin = getPluginById(pluginSelect.value);

  pluginSettingsFields.replaceChildren();
  pluginCommonSettingsFields.replaceChildren();
  pluginDesignFields.replaceChildren();

  if (!plugin) {
    pluginCommonSettingsSection.classList.add('hidden');
    return;
  }

  for (const field of plugin.settingsSchema) {
    pluginSettingsFields.append(buildSchemaField(field, 'settings', settingsValues));
  }

  const commonSettingsValues = plugin.commonSettingsNamespace
    ? pluginCommonSettings[plugin.commonSettingsNamespace] || {}
    : {};
  const commonSchema = plugin.commonSettingsSchema || [];
  pluginCommonSettingsSection.classList.toggle('hidden', commonSchema.length === 0);

  for (const field of commonSchema) {
    pluginCommonSettingsFields.append(buildSchemaField(field, 'common', commonSettingsValues));
  }

  for (const field of plugin.designSchema) {
    pluginDesignFields.append(buildSchemaField(field, 'design', designValues));
  }
}

function buildSchemaField(field, sectionName, values) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';

  const label = document.createElement('span');
  label.textContent = field.label;

  const value = values && field.name in values ? values[field.name] : field.default;
  let control;

  if (field.type === 'select') {
    control = document.createElement('select');
    for (const option of field.options || []) {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      control.append(optionEl);
    }
    control.value = value ?? '';
  } else if (field.type === 'checkbox') {
    control = document.createElement('input');
    control.type = 'checkbox';
    control.checked = Boolean(value);
  } else if (field.type === 'number') {
    control = document.createElement('input');
    control.type = 'number';
    control.value = value ?? '';
  } else {
    control = document.createElement('input');
    control.type = 'text';
    control.value = value ?? '';
    control.placeholder = field.placeholder || '';
  }

  control.dataset.schemaSection = sectionName;
  control.dataset.fieldName = field.name;
  wrapper.append(label, control);

  if (field.helpText) {
    const help = document.createElement('p');
    help.className = 'helper-copy';
    help.textContent = field.helpText;
    wrapper.append(help);
  }

  return wrapper;
}

function handlePluginPickerToggle(event) {
  event.stopPropagation();
  const shouldOpen = pluginSelectMenu.classList.contains('hidden');
  if (shouldOpen) {
    openPluginPicker();
    return;
  }
  closePluginPicker();
}

function handlePluginPickerSelect(event) {
  const option = event.target.closest('[data-plugin-id]');
  if (!option) {
    return;
  }

  setPluginSelectValue(option.dataset.pluginId);
  closePluginPicker();
  handlePluginSelectionChange();
}

function handleDocumentClick(event) {
  if (pluginSelectMenu.classList.contains('hidden')) {
    return;
  }

  if (
    event.target === pluginSelectTrigger
    || pluginSelectTrigger.contains(event.target)
    || pluginSelectMenu.contains(event.target)
  ) {
    return;
  }

  closePluginPicker();
}

function openPluginPicker() {
  pluginSelectMenu.classList.remove('hidden');
  pluginSelectTrigger.setAttribute('aria-expanded', 'true');
}

function closePluginPicker() {
  pluginSelectMenu.classList.add('hidden');
  pluginSelectTrigger.setAttribute('aria-expanded', 'false');
}

function setPluginSelectValue(pluginId) {
  pluginSelect.value = pluginId || '';
  const plugin = getPluginById(pluginSelect.value);
  pluginSelectTrigger.textContent = plugin ? plugin.name : 'Select plugin';

  for (const option of pluginSelectMenu.querySelectorAll('[data-plugin-id]')) {
    const isActive = option.dataset.pluginId === pluginSelect.value;
    option.classList.toggle('active', isActive);
    option.setAttribute('aria-selected', String(isActive));
  }
}

function syncModalSections() {
  const isPlugin = screenTypeSelect.value === 'plugin';
  manualScreenFields.classList.toggle('hidden', isPlugin);
  pluginScreenFields.classList.toggle('hidden', !isPlugin);
}

function updateScreenTypeButtons() {
  for (const button of screenTypeButtons) {
    const isActive = button.dataset.screenTypeValue === screenTypeSelect.value;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
}

function renderManualFields(lines = []) {
  screenLineFields.replaceChildren();

  for (let lineIndex = 0; lineIndex < currentConfig.rows; lineIndex += 1) {
    const field = document.createElement('label');
    field.className = 'field';

    const label = document.createElement('span');
    label.textContent = `Line ${lineIndex + 1}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = currentConfig.cols;
    input.value = lines[lineIndex] ?? '';
    input.placeholder = `Up to ${currentConfig.cols} characters`;

    field.append(label, input);
    screenLineFields.append(field);
  }
}

function collectSchemaValues(schema, sectionName) {
  const values = {};

  for (const field of schema) {
    const control = screenModal.querySelector(`[data-schema-section="${sectionName}"][data-field-name="${field.name}"]`);
    if (!control) {
      continue;
    }

    if (field.type === 'checkbox') {
      values[field.name] = Boolean(control.checked);
      continue;
    }

    if (field.type === 'number') {
      values[field.name] = Number(control.value);
      continue;
    }

    values[field.name] = String(control.value || '').trim();
  }

  return values;
}

function upsertScreenDraft(index, screen) {
  const nextScreen = {
    ...screen,
    previewLines: buildLocalPreviewLines(screen),
  };

  if (index === null) {
    screenDrafts.push(nextScreen);
    markScreensDirty(`${getScreenTitle(nextScreen, screenDrafts.length - 1)} added locally. Save screens to persist it.`);
  } else {
    screenDrafts[index] = nextScreen;
    markScreensDirty(`${getScreenTitle(nextScreen, index)} updated locally. Save screens to persist it.`);
  }

  renderScreensList();
}

function switchPage(pageId) {
  activePage = pageId;
  const hideBoardSelector = pageId === 'home';

  if (workspaceHeaderActions) {
    workspaceHeaderActions.classList.toggle('hidden', hideBoardSelector);
  }

  for (const navButton of navButtons) {
    const isActive = navButton.dataset.pageTarget === pageId;
    navButton.classList.toggle('active', isActive);

    if (isActive) {
      navButton.setAttribute('aria-current', 'page');
      const boardName = !hideBoardSelector && currentConfig?.name ? ` · ${currentConfig.name}` : '';
      workspaceTitle.textContent = `${navButton.dataset.pageTitle}${boardName}`;
    } else {
      navButton.removeAttribute('aria-current');
    }
  }

  for (const pagePanel of pagePanels) {
    pagePanel.classList.toggle('hidden', pagePanel.dataset.page !== pageId);
  }
}

function renderHomeBoardCards() {
  if (!homeBoardGrid) {
    return;
  }

  homeBoardGrid.replaceChildren();

  if (availableBoards.length === 0) {
    homeBoardGrid.append(buildEmptyState('No boards configured yet.'));
    return;
  }

  for (const board of availableBoards) {
    const card = document.createElement('article');
    card.className = 'board-overview-card';

    const header = document.createElement('div');
    header.className = 'board-overview-header';

    const actions = document.createElement('div');
    actions.className = 'board-overview-actions';

    const title = document.createElement('h3');
    title.className = 'board-overview-title';
    title.textContent = board.name;
    header.append(title);

    const count = document.createElement('p');
    count.className = 'board-overview-count';
    count.textContent = `${board.screenCount} ${pluralize('screen', board.screenCount)}`;

    if (board.isDefault) {
      const defaultIcon = document.createElement('span');
      defaultIcon.className = 'board-status-icon';
      defaultIcon.setAttribute('aria-label', 'Default board');
      defaultIcon.title = 'Default board';
      defaultIcon.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3z" />
        </svg>
      `;
      actions.append(defaultIcon);
    }

    const openLink = document.createElement('a');
    openLink.className = 'screen-icon-button';
    openLink.href = buildBoardDisplayUrl(board.slug);
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.setAttribute('aria-label', `Open ${board.name}`);
    openLink.title = `Open ${board.name}`;
    openLink.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M14 5h5v5" />
        <path d="M10 14L19 5" />
        <path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
      </svg>
    `;
    actions.append(openLink);

    header.append(actions);
    card.append(header, count);
    homeBoardGrid.append(card);
  }
}

function buildBoardDisplayUrl(boardSlug) {
  return `/${encodeURIComponent(boardSlug)}`;
}

function markScreensDirty(message) {
  screensDirty = true;
  updateScreensDraftNote();
  if (message) {
    setStatus(message);
  }
}

function updateScreensDraftNote() {
  return;
}

function updatePluginCatalogNote() {
  return;
}

function clearDragIndicators() {
  for (const item of screensList.querySelectorAll('.screen-item')) {
    item.classList.remove('drag-over');
  }
}

function clearDragState() {
  draggedScreenIndex = null;
  clearDragIndicators();

  for (const item of screensList.querySelectorAll('.screen-item')) {
    item.classList.remove('dragging');
  }
}

function getScreenTitle(screen, index) {
  return screen.name || screen.pluginName || `Screen ${index + 1}`;
}

function getScreenSummary(screen) {
  if (screen.type === 'manual') {
    return 'Manual split-flap message.';
  }

  const city = screen.settings?.city || 'Unconfigured city';
  const country = screen.settings?.country || 'country';
  return `${screen.pluginName || screen.pluginId} for ${city}, ${country}.`;
}

function getScreenPreviewLines(screen) {
  const lines = Array.isArray(screen.previewLines) && screen.previewLines.length > 0
    ? screen.previewLines
    : buildLocalPreviewLines(screen);
  return padLocalLines(lines);
}

function buildLocalPreviewLines(screen) {
  if (screen.type === 'manual') {
    return padLocalLines(screen.lines || []);
  }

  const title = (screen.design?.title || screen.settings?.city || screen.pluginName || 'PLUGIN').trim().toUpperCase();
  const detail = screen.lastError
    ? screen.lastError.toUpperCase()
    : 'PLUGIN SCREEN';
  return padLocalLines([
    '',
    title.slice(0, currentConfig.cols),
    detail.slice(0, currentConfig.cols),
  ]);
}

function padLocalLines(lines) {
  const normalized = Array.isArray(lines) ? [...lines] : [];
  while (normalized.length < currentConfig.rows) {
    normalized.push('');
  }
  return normalized.slice(0, currentConfig.rows);
}

function serializeScreenForSave(screen) {
  if (screen.type === 'manual') {
    return {
      id: screen.id,
      slug: screen.slug,
      type: 'manual',
      name: screen.name || '',
      enabled: true,
      lines: screen.lines,
    };
  }

  return {
    id: screen.id,
    slug: screen.slug,
    type: 'plugin',
    name: screen.name || '',
    enabled: true,
    pluginId: screen.pluginId,
    refreshIntervalSeconds: screen.refreshIntervalSeconds,
    settings: screen.settings || {},
    design: screen.design || {},
  };
}

function buildDefaultManualDraft() {
  return {
    id: createLocalScreenId(),
    slug: '',
    type: 'manual',
    name: '',
    enabled: true,
    lines: [],
  };
}

function getPluginById(pluginId) {
  return availablePlugins.find((plugin) => plugin.id === pluginId) || null;
}

function findLastPopulatedIndex(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]) {
      return index;
    }
  }

  return -1;
}

function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString([], {
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return timestamp;
  }
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds} ${pluralize('sec', seconds)}`;
  }

  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} ${pluralize('min', minutes)}`;
  }

  const hours = Math.round(seconds / 3600);
  return `${hours} ${pluralize('hr', hours)}`;
}

function pluralize(word, count) {
  return count === 1 ? word : `${word}s`;
}

function createLocalScreenId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `screen-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setStatus(message, kind = '') {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message';

  if (!message) {
    statusMessage.classList.add('hidden');
    return;
  }

  if (kind) {
    statusMessage.classList.add(kind);
  }
}

async function readError(response, fallback) {
  try {
    const payload = await response.json();
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}
