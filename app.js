const STORAGE_KEY = "experience-board-v1";
const SYNC_CONFIG_KEY = "experience-board-sync-v1";
const STATUS_ORDER = ["ongoing", "prepare", "pending", "failed"];
const STATUS_LABELS = {
  ongoing: "Ongoing",
  prepare: "Prepare",
  pending: "Pending",
  failed: "Failed",
};
const GITHUB_SYNC_TARGET = {
  owner: "lkblkq",
  repo: "My-Try",
  branch: "main",
  path: "data/board-data.json",
};
const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const appState = {
  board: null,
  modal: null,
  sync: {
    token: "",
    status: "Sync: local only",
    pendingTimer: null,
    isPushing: false,
  },
};

const elements = {
  statusNav: document.querySelector("#status-nav"),
  projectTabs: document.querySelector("#project-tabs"),
  detailView: document.querySelector("#detail-view"),
  addProjectButton: document.querySelector("#add-project-button"),
  syncStatus: document.querySelector("#sync-status"),
  syncSetupButton: document.querySelector("#sync-setup-button"),
  syncPullButton: document.querySelector("#sync-pull-button"),
  syncPushButton: document.querySelector("#sync-push-button"),
  exportButton: document.querySelector("#export-button"),
  resetButton: document.querySelector("#reset-button"),
  modalRoot: document.querySelector("#modal-root"),
  emptyStateTemplate: document.querySelector("#empty-state-template"),
};

boot();

async function boot() {
  appState.sync = {
    ...appState.sync,
    ...loadSyncConfig(),
  };
  const board = await loadBoard();
  appState.board = board;
  bindEvents();
  render();
}

async function loadBoard() {
  const [localBoard, remoteBoard, seedBoard] = await Promise.all([
    loadLocalBoard(),
    fetchRemoteBoard(),
    loadSeedBoard(),
  ]);

  const board = chooseBoard(localBoard, remoteBoard, seedBoard);
  persist(board, { scheduleSync: false, touch: false });
  updateSyncStatus(appState.sync.token ? "Sync: GitHub ready" : "Sync: local only");
  return board;
}

function bindEvents() {
  elements.addProjectButton.addEventListener("click", () => {
    openProjectModal();
  });

  elements.syncSetupButton.addEventListener("click", openSyncSetupModal);
  elements.syncPullButton.addEventListener("click", pullFromGitHub);
  elements.syncPushButton.addEventListener("click", pushToGitHub);
  elements.exportButton.addEventListener("click", exportBoardData);
  elements.resetButton.addEventListener("click", resetBoardData);

  elements.statusNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) {
      return;
    }

    setSelectedStatus(button.dataset.status);
  });

  elements.projectTabs.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-tab-delete-id]");
    if (deleteButton) {
      const project = findProject(deleteButton.dataset.tabDeleteId);
      if (project) {
        openDeleteProjectModal(project);
      }
      return;
    }

    const button = event.target.closest("[data-project-id]");
    if (!button) {
      return;
    }

    setSelectedProject(button.dataset.projectId);
  });

  elements.detailView.addEventListener("click", handleDetailClick);
}

function handleDetailClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const project = getSelectedProject();
  if (!project) {
    return;
  }

  if (action === "edit-why") {
    openTextModal({
      title: "Why",
      label: "Why",
      initialValue: project.why,
      onSubmit: (value) => updateProject(project.id, { why: value }),
    });
  }

  if (action === "edit-risk") {
    openRiskModal(project);
  }

  if (action === "edit-priority") {
    openPriorityModal(project);
  }

  if (action === "change-name") {
    openRenameProjectModal(project);
  }

  if (action === "delete-project") {
    openDeleteProjectModal(project);
  }

  if (action === "add-card") {
    addCard(project.id);
  }

  if (action === "set-failed") {
    openSetFailedModal(project);
  }

  if (action === "advance-status") {
    moveProjectToNextStatus(project.id);
  }

  if (action === "restore-status") {
    restoreProjectFromFailed(project.id);
  }

  if (action === "edit-card-date") {
    openCardDateModal(project.id, actionTarget.dataset.cardId);
  }

  if (action === "edit-card-thing") {
    openCardTextModal(project.id, actionTarget.dataset.cardId, "thing", "Thing");
  }

  if (action === "edit-card-data") {
    openCardTextModal(project.id, actionTarget.dataset.cardId, "data", "Data");
  }

  if (action === "edit-card-summary") {
    openCardTextModal(project.id, actionTarget.dataset.cardId, "summary", "总结");
  }

  if (action === "edit-card-income") {
    openCardAmountModal(project.id, actionTarget.dataset.cardId, "income", "Income");
  }

  if (action === "edit-card-expense") {
    openCardAmountModal(project.id, actionTarget.dataset.cardId, "expense", "Expense");
  }

  if (action === "delete-card") {
    openDeleteCardModal(project.id, actionTarget.dataset.cardId);
  }
}

function render() {
  renderStatusNav();
  renderProjectTabs();
  renderDetailView();
  renderModal();
  renderSyncStatus();
}

function renderStatusNav() {
  const counts = STATUS_ORDER.reduce((accumulator, status) => {
    accumulator[status] = appState.board.projects.filter((project) => project.status === status).length;
    return accumulator;
  }, {});

  elements.statusNav.innerHTML = STATUS_ORDER.map((status) => {
    const activeClass = appState.board.selectedStatus === status ? "active" : "";
    return `
      <button class="status-item ${activeClass}" data-status="${status}" type="button">
        <span>${STATUS_LABELS[status]}</span>
        <span class="status-count">${counts[status]}</span>
      </button>
    `;
  }).join("");
}

function renderProjectTabs() {
  const projects = getProjectsByStatus(appState.board.selectedStatus);
  elements.projectTabs.innerHTML = projects.map((project) => {
    const activeClass = project.id === appState.board.selectedProjectId ? "active" : "";
    return `
      <button class="project-tab ${activeClass}" data-project-id="${project.id}" type="button">
        <span class="project-tab-label">${escapeHtml(project.name)}</span>
        <span
          class="project-tab-delete"
          data-tab-delete-id="${project.id}"
          role="button"
          aria-label="删除 ${escapeAttribute(project.name)}"
          title="删除项目"
        >
          ×
        </span>
      </button>
    `;
  }).join("");
}

function renderDetailView() {
  const project = getSelectedProject();
  if (!project) {
    const fragment = elements.emptyStateTemplate.content.cloneNode(true);
    elements.detailView.replaceChildren(fragment);
    return;
  }

  const statusTrail = project.status === "failed" && project.previousStatus
    ? `${STATUS_LABELS[project.previousStatus]} -> Failed`
    : `${STATUS_LABELS[project.status]} · Updated ${formatDateTime(project.updatedAt)}`;
  const cardTotals = getCardTotals(project.cards);

  elements.detailView.innerHTML = `
    <div class="detail-header">
      <div class="detail-title-wrap">
        <h1 class="detail-title">${escapeHtml(project.name)}</h1>
        <div class="detail-subtitle status-trail">${escapeHtml(statusTrail)}</div>
      </div>
      <div class="toolbar">
        ${renderToolbar(project)}
      </div>
    </div>

    <section class="meta-grid">
      ${renderMetaCard("Why", renderTextValue(project.why), project.status !== "failed" ? "edit-why" : "")}
      ${renderMetaCard("Risk", renderRisk(project.risk), project.status !== "failed" ? "edit-risk" : "")}
      ${renderMetaCard("Priority", renderPriority(project.priority, project.status), showPriorityEditor(project) ? "edit-priority" : "")}
    </section>

    ${project.status === "failed" ? renderFailedCallout(project) : ""}

    <section class="cards-header">
      <div class="section-heading">
        <h2 class="section-title">Details</h2>
        ${project.status === "ongoing" ? `
          <div class="section-metrics">
            <span>Expense ${formatAmount(cardTotals.expense)}</span>
            <span>Income ${formatAmount(cardTotals.income)}</span>
          </div>
        ` : ""}
      </div>
      <div class="helper-text">${project.status === "failed" ? "Failed 状态下只展示，不可编辑卡片。" : "新增的空白卡片会插到最上面。"}</div>
    </section>

    <section class="cards-list">
      ${project.cards.map((card, index) => renderCard(project, card, index)).join("")}
    </section>
  `;
}

function renderToolbar(project) {
  const buttons = [];

  if (project.status === "ongoing") {
    buttons.push(buttonMarkup("primary-button", "add-card", "Add Card"));
  }

  if (project.status !== "failed") {
    buttons.push(buttonMarkup("ghost-button", "change-name", "Change Name"));
  }

  if (project.status === "prepare") {
    buttons.push(buttonMarkup("secondary-button", "advance-status", "Set Ongoing"));
  }

  if (project.status === "pending") {
    buttons.push(buttonMarkup("secondary-button", "advance-status", "Set Prepare"));
  }

  if (project.status === "failed" && project.previousStatus) {
    buttons.push(
      buttonMarkup(
        "secondary-button",
        "restore-status",
        `Set ${STATUS_LABELS[project.previousStatus]}`
      )
    );
  }

  if (project.status !== "failed") {
    buttons.push(buttonMarkup("danger-button", "set-failed", "Set Failed"));
  }

  return buttons.join("");
}

function renderFailedCallout(project) {
  return `
    <section class="failed-callout">
      <div class="failed-grid">
        <div>
          <div class="meta-label">From</div>
          <div class="meta-value">${project.previousStatus ? STATUS_LABELS[project.previousStatus] : "Unknown"}</div>
        </div>
        <div>
          <div class="meta-label">Reason</div>
          <div class="meta-value">${renderTextValue(project.failedReason)}</div>
        </div>
      </div>
    </section>
  `;
}

function renderCard(project, card, index) {
  const readonly = project.status === "failed";
  const showMoneyRows = project.status === "ongoing";
  const showSummaryRow = project.status === "ongoing";
  return `
    <article class="card-item">
      <div class="card-toolbar">
        <div class="card-index">${formatDateRange(card.dateDuration)}</div>
        <div class="card-toolbar-actions">
          ${readonly ? "" : buttonMarkup("text-link", "edit-card-date", "Edit", { cardId: card.id })}
          ${readonly ? "" : buttonMarkup("text-link", "delete-card", "Delete", { cardId: card.id })}
        </div>
      </div>
      <div class="card-content">
        ${showSummaryRow ? renderFieldRow("总结", renderTextValue(card.summary), readonly ? "" : buttonMarkup("text-link", "edit-card-summary", "Edit", { cardId: card.id })) : ""}
        ${renderFieldRow("Thing", renderTextValue(card.thing), readonly ? "" : buttonMarkup("text-link", "edit-card-thing", "Edit", { cardId: card.id }))}
        ${renderFieldRow("Data", renderTextValue(card.data), readonly ? "" : buttonMarkup("text-link", "edit-card-data", "Edit", { cardId: card.id }))}
        ${showMoneyRows ? renderFieldRow("Expense", formatAmount(card.expense), readonly ? "" : buttonMarkup("text-link", "edit-card-expense", "Edit", { cardId: card.id })) : ""}
        ${showMoneyRows ? renderFieldRow("Income", formatAmount(card.income), readonly ? "" : buttonMarkup("text-link", "edit-card-income", "Edit", { cardId: card.id })) : ""}
      </div>
    </article>
  `;
}

function renderMetaCard(label, value, action) {
  return `
    <article class="meta-card">
      <div class="meta-heading">
        <div class="meta-label">${label}</div>
        ${action ? `<button class="text-link" data-action="${action}" type="button">Edit</button>` : ""}
      </div>
      <div class="meta-value">${value}</div>
    </article>
  `;
}

function renderFieldRow(label, value, action) {
  return `
    <div class="field-row">
      <div class="field-label">${label}</div>
      <div class="field-value">${value}</div>
      <div>${action}</div>
    </div>
  `;
}

function renderTextValue(value) {
  if (!value) {
    return '<span class="helper-text">暂无内容</span>';
  }

  return escapeHtml(value);
}

function renderRisk(risk) {
  if (!risk) {
    return '<span class="helper-text">未设置</span>';
  }

  return "★".repeat(risk) + "☆".repeat(5 - risk);
}

function renderPriority(priority, status) {
  if (!priority && status === "ongoing") {
    return '<span class="helper-text">Ongoing 不主展示优先级</span>';
  }

  if (!priority) {
    return '<span class="helper-text">未设置</span>';
  }

  return `<span class="priority-tag ${priority}">${capitalize(priority)}</span>`;
}

function formatAmount(value) {
  const number = Number(value || 0);
  if (Number.isInteger(number)) {
    return String(number);
  }

  return number.toFixed(2);
}

function showPriorityEditor(project) {
  return project.status === "prepare" || project.status === "pending";
}

function buttonMarkup(className, action, label, data = {}) {
  const attrs = Object.entries(data)
    .map(([key, value]) => `data-${toKebabCase(key)}="${value}"`)
    .join(" ");
  return `<button class="${className}" data-action="${action}" ${attrs} type="button">${label}</button>`;
}

function openProjectModal() {
  const currentStatus = appState.board.selectedStatus;
  openFormModal({
    title: "Add Project",
    body: `
      <label class="form-label">
        Tab Name
        <input class="text-input" name="name" maxlength="60" placeholder="输入项目名" required />
      </label>
    `,
    onSubmit: (formData) => {
      const name = formData.get("name").trim();
      if (!name) {
        return false;
      }

      const newProject = createProject(currentStatus, name);
      appState.board.projects.unshift(newProject);
      appState.board.selectedProjectId = newProject.id;
      persistAndRender();
    },
  });
}

function openRenameProjectModal(project) {
  openFormModal({
    title: "Change Name",
    body: `
      <label class="form-label">
        Tab Name
        <input class="text-input" name="name" maxlength="60" value="${escapeAttribute(project.name)}" required />
      </label>
    `,
    onSubmit: (formData) => {
      const name = formData.get("name").trim();
      if (!name) {
        return false;
      }

      updateProject(project.id, { name });
    },
  });
}

function openDeleteProjectModal(project) {
  openConfirmModal({
    title: "Delete Project",
    description: `删除 ${project.name} 后，这个项目下面的所有卡片都会一起删除。`,
    confirmText: "Delete",
    confirmClass: "danger-button",
    onConfirm: () => {
      appState.board.projects = appState.board.projects.filter((item) => item.id !== project.id);
      syncSelectionAfterRemoval(project.status);
      persistAndRender();
    },
  });
}

function openSetFailedModal(project) {
  openFormModal({
    title: "Set Failed",
    body: `
      <label class="form-label">
        Reason
        <textarea class="text-area" name="reason" maxlength="500" placeholder="输入失败原因" required></textarea>
      </label>
    `,
    onSubmit: (formData) => {
      const reason = formData.get("reason").trim();
      if (!reason) {
        return false;
      }

      updateProject(project.id, {
        status: "failed",
        previousStatus: project.status,
        failedReason: reason,
      });
    },
  });
}

function openTextModal({ title, label, initialValue, onSubmit }) {
  openFormModal({
    title,
    body: `
      <label class="form-label">
        ${label}
        <textarea class="text-area" name="value" maxlength="500" placeholder="输入内容">${escapeHtml(initialValue)}</textarea>
      </label>
    `,
    onSubmit: (formData) => {
      onSubmit(formData.get("value").trim());
    },
  });
}

function openRiskModal(project) {
  appState.modal = {
    title: "Risk",
    renderBody: () => `
      <div class="form-label">
        Risk
        <div class="star-row">
          ${[1, 2, 3, 4, 5].map((value) => `
            <button class="star-button ${project.risk === value ? "active" : ""}" data-risk-value="${value}" type="button">
              ${value} Star${value > 1 ? "s" : ""}
            </button>
          `).join("")}
        </div>
      </div>
    `,
    footer: `
      <button class="ghost-button" data-modal-close type="button">Cancel</button>
    `,
    onClick: (event) => {
      const target = event.target.closest("[data-risk-value]");
      if (!target) {
        return;
      }

      updateProject(project.id, { risk: Number(target.dataset.riskValue) });
      closeModal();
    },
  };
  renderModal();
}

function openPriorityModal(project) {
  openFormModal({
    title: "Priority",
    body: `
      <label class="form-label">
        Priority
        <select class="select-input" name="priority">
          <option value="">Select</option>
          <option value="high" ${project.priority === "high" ? "selected" : ""}>High</option>
          <option value="medium" ${project.priority === "medium" ? "selected" : ""}>Medium</option>
          <option value="low" ${project.priority === "low" ? "selected" : ""}>Low</option>
        </select>
      </label>
    `,
    onSubmit: (formData) => {
      const priority = formData.get("priority") || null;
      updateProject(project.id, { priority });
    },
  });
}

function openCardDateModal(projectId, cardId) {
  const card = getCard(projectId, cardId);
  if (!card) {
    return;
  }

  openFormModal({
    title: "Date Duration",
    body: `
      <div class="date-grid">
        <label class="form-label">
          Start
          <input class="date-input" type="date" name="start" value="${escapeAttribute(card.dateDuration.start || "")}" />
        </label>
        <label class="form-label">
          End
          <input class="date-input" type="date" name="end" value="${escapeAttribute(card.dateDuration.end || "")}" />
        </label>
      </div>
    `,
    onSubmit: (formData) => {
      updateCard(projectId, cardId, {
        dateDuration: {
          start: formData.get("start") || null,
          end: formData.get("end") || null,
        },
      });
    },
  });
}

function openCardTextModal(projectId, cardId, field, title) {
  const card = getCard(projectId, cardId);
  if (!card) {
    return;
  }

  openFormModal({
    title,
    body: `
      <label class="form-label">
        ${title}
        <textarea class="text-area" name="value" maxlength="1200" placeholder="输入内容">${escapeHtml(card[field])}</textarea>
      </label>
    `,
    onSubmit: (formData) => {
      updateCard(projectId, cardId, { [field]: formData.get("value").trim() });
    },
  });
}

function openCardAmountModal(projectId, cardId, field, title) {
  const card = getCard(projectId, cardId);
  if (!card) {
    return;
  }

  openFormModal({
    title,
    body: `
      <label class="form-label">
        ${title}
        <input class="text-input" type="number" step="0.01" name="value" value="${escapeAttribute(String(card[field] ?? 0))}" />
      </label>
    `,
    onSubmit: (formData) => {
      const raw = formData.get("value");
      const number = raw === "" ? 0 : Number(raw);
      if (Number.isNaN(number)) {
        return false;
      }

      updateCard(projectId, cardId, { [field]: number });
    },
  });
}

function openDeleteCardModal(projectId, cardId) {
  openConfirmModal({
    title: "Delete Card",
    description: "删除后这张卡片的内容会一起消失。",
    confirmText: "Delete",
    confirmClass: "danger-button",
    onConfirm: () => {
      const project = findProject(projectId);
      project.cards = project.cards.filter((card) => card.id !== cardId);
      if (project.cards.length === 0) {
        project.cards = [createEmptyCard()];
      }
      stampProject(project);
      persistAndRender();
    },
  });
}

function openConfirmModal({ title, description, confirmText, confirmClass, onConfirm }) {
  appState.modal = {
    title,
    renderBody: () => `<p>${escapeHtml(description)}</p>`,
    footer: `
      <button class="ghost-button" data-modal-close type="button">Cancel</button>
      <button class="${confirmClass}" data-modal-confirm type="button">${confirmText}</button>
    `,
    onClick: (event) => {
      if (event.target.closest("[data-modal-confirm]")) {
        onConfirm();
        closeModal();
      }
    },
  };
  renderModal();
}

function openFormModal({ title, body, onSubmit }) {
  appState.modal = {
    title,
    renderBody: () => `
      <form id="modal-form" novalidate method="post" action="">
        ${body}
      </form>
    `,
    footer: `
      <button class="ghost-button" data-modal-close type="button">Cancel</button>
      <button class="primary-button" type="submit" form="modal-form">Submit</button>
    `,
    onSubmit: (form) => {
      if (!form.reportValidity()) {
        return false;
      }

      const formData = new FormData(form);
      const result = onSubmit(formData);
      if (result === false) {
        return false;
      }

      closeModal();
      return true;
    },
  };
  renderModal();
}

function renderModal() {
  if (!appState.modal) {
    elements.modalRoot.innerHTML = "";
    return;
  }

  elements.modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">${appState.modal.title}</h3>
          <button class="ghost-button icon-button" data-modal-close type="button">×</button>
        </div>
        <div class="modal-body">${appState.modal.renderBody()}</div>
        <div class="modal-footer">${appState.modal.footer}</div>
      </div>
    </div>
  `;

  elements.modalRoot.onclick = (event) => {
    if (event.target.closest("[data-modal-close]")) {
      closeModal();
      return;
    }

    appState.modal?.onClick?.(event);
  };

  const form = elements.modalRoot.querySelector("#modal-form");
  if (form) {
    form.dataset.composing = "false";

    form.addEventListener("compositionstart", () => {
      form.dataset.composing = "true";
    });

    form.addEventListener("compositionend", () => {
      form.dataset.composing = "false";
    });

    form.addEventListener("keydown", (event) => {
      const isTextarea = event.target instanceof HTMLTextAreaElement;
      const isComposing = event.isComposing || event.keyCode === 229 || form.dataset.composing === "true";

      if (event.key === "Enter" && isComposing) {
        event.preventDefault();
        return;
      }

      if (event.key === "Enter" && isTextarea && !event.metaKey && !event.ctrlKey) {
        return;
      }

      if (event.key === "Enter" && !isTextarea) {
        event.preventDefault();
        submitModalForm(form);
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitModalForm(form);
    });
  }
}

function submitModalForm(form) {
  return appState.modal?.onSubmit?.(form);
}

function closeModal() {
  appState.modal = null;
  renderModal();
}

function setSelectedStatus(status) {
  appState.board.selectedStatus = status;
  const projects = getProjectsByStatus(status);
  appState.board.selectedProjectId = projects[0]?.id || null;
  persistAndRender({ scheduleSync: false, touch: false });
}

function setSelectedProject(projectId) {
  appState.board.selectedProjectId = projectId;
  persistAndRender({ scheduleSync: false, touch: false });
}

function addCard(projectId) {
  const project = findProject(projectId);
  project.cards.unshift(createEmptyCard());
  stampProject(project);
  persistAndRender();
}

function moveProjectToNextStatus(projectId) {
  const project = findProject(projectId);

  if (project.status === "pending") {
    project.status = "prepare";
  } else if (project.status === "prepare") {
    project.status = "ongoing";
    project.priority = null;
    if (project.cards.length === 0) {
      project.cards.unshift(createEmptyCard());
    }
  }

  project.previousStatus = null;
  stampProject(project);
  appState.board.selectedStatus = project.status;
  persistAndRender();
}

function restoreProjectFromFailed(projectId) {
  const project = findProject(projectId);
  if (!project.previousStatus) {
    return;
  }

  project.status = project.previousStatus;
  project.previousStatus = null;
  stampProject(project);
  appState.board.selectedStatus = project.status;
  persistAndRender();
}

function updateProject(projectId, partial) {
  const project = findProject(projectId);
  Object.assign(project, partial);
  stampProject(project);
  if (partial.status) {
    appState.board.selectedStatus = partial.status;
  }
  persistAndRender();
}

function updateCard(projectId, cardId, partial) {
  const card = getCard(projectId, cardId);
  Object.assign(card, partial, { updatedAt: new Date().toISOString() });
  const project = findProject(projectId);
  stampProject(project);
  persistAndRender();
}

function findProject(projectId) {
  return appState.board.projects.find((project) => project.id === projectId);
}

function getCard(projectId, cardId) {
  return findProject(projectId)?.cards.find((card) => card.id === cardId);
}

function getSelectedProject() {
  const project = findProject(appState.board.selectedProjectId);
  if (project) {
    return project;
  }

  const fallback = getProjectsByStatus(appState.board.selectedStatus)[0] || null;
  if (fallback) {
    appState.board.selectedProjectId = fallback.id;
  }
  return fallback;
}

function getProjectsByStatus(status) {
  return appState.board.projects.filter((project) => project.status === status);
}

function createProject(status, name) {
  return {
    id: crypto.randomUUID(),
    name,
    status,
    previousStatus: null,
    why: "",
    risk: null,
    priority: status === "ongoing" || status === "failed" ? null : null,
    failedReason: "",
    updatedAt: new Date().toISOString(),
    cards: [createEmptyCard()],
  };
}

function stampProject(project) {
  project.updatedAt = new Date().toISOString();
}

function syncSelectionAfterRemoval(status) {
  const projects = getProjectsByStatus(status);
  appState.board.selectedProjectId = projects[0]?.id || null;
}

function persistAndRender(options = {}) {
  persist(appState.board, options);
  render();
}

function persist(board, options = {}) {
  const { scheduleSync = true, touch = true } = options;
  if (touch) {
    board.meta = {
      ...(board.meta || {}),
      lastModifiedAt: new Date().toISOString(),
    };
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  if (scheduleSync) {
    scheduleGitHubSync();
  }
}

function normalizeBoard(board) {
  const nextBoard = {
    ...board,
    meta: {
      ...(board.meta || {}),
      lastModifiedAt: board.meta?.lastModifiedAt || getBoardTimestamp(board),
    },
  };

  nextBoard.projects = board.projects.map((project) => {
    const nextProject = {
      ...project,
      cards: Array.isArray(project.cards) ? project.cards : [],
    };

    nextProject.cards = nextProject.cards.length === 0
      ? [createEmptyCard()]
      : nextProject.cards.map(normalizeCard);

    return nextProject;
  });

  return nextBoard;
}

function createEmptyCard() {
  return {
    id: crypto.randomUUID(),
    dateDuration: { start: null, end: null },
    summary: "",
    thing: "",
    data: "",
    expense: 0,
    income: 0,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeCard(card) {
  return {
    ...card,
    summary: card.summary ?? "",
    expense: Number(card.expense ?? 0),
    income: Number(card.income ?? 0),
  };
}

function exportBoardData() {
  const file = new Blob([JSON.stringify(appState.board, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "experience-board-data.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function resetBoardData() {
  const seed = await loadSeedBoard();
  appState.board = seed;
  persist(appState.board, { scheduleSync: false, touch: false });
  render();
}

function formatDateRange(dateDuration) {
  if (!dateDuration.start && !dateDuration.end) {
    return '<span class="helper-text">Date Duration</span>';
  }

  return `${dateDuration.start || "?"} - ${dateDuration.end || "?"}`;
}

function getCardTotals(cards) {
  return cards.reduce(
    (totals, card) => {
      totals.expense += Number(card.expense || 0);
      totals.income += Number(card.income || 0);
      return totals;
    },
    { expense: 0, income: 0 }
  );
}

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function renderSyncStatus() {
  elements.syncStatus.textContent = appState.sync.status;
}

function updateSyncStatus(text) {
  appState.sync.status = text;
  if (elements.syncStatus) {
    elements.syncStatus.textContent = text;
  }
}

function loadSyncConfig() {
  const raw = window.localStorage.getItem(SYNC_CONFIG_KEY);
  if (!raw) {
    return { token: "" };
  }

  try {
    const parsed = JSON.parse(raw);
    return { token: parsed.token || "" };
  } catch {
    return { token: "" };
  }
}

function saveSyncConfig() {
  window.localStorage.setItem(
    SYNC_CONFIG_KEY,
    JSON.stringify({ token: appState.sync.token || "" })
  );
}

async function loadLocalBoard() {
  const cached = window.localStorage.getItem(STORAGE_KEY);
  if (!cached) {
    return null;
  }

  try {
    return normalizeBoard(JSON.parse(cached));
  } catch {
    return null;
  }
}

async function loadSeedBoard() {
  const response = await fetch("./data/seed.json");
  return normalizeBoard(await response.json());
}

async function fetchRemoteBoard() {
  try {
    const response = await fetch(buildGitHubReadUrl(), {
      headers: GITHUB_API_HEADERS,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload.content) {
      return null;
    }

    return normalizeBoard(JSON.parse(decodeBase64Utf8(payload.content)));
  } catch {
    try {
      const fallback = await fetch(`./data/board-data.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!fallback.ok) {
        return null;
      }
      return normalizeBoard(await fallback.json());
    } catch {
      return null;
    }
  }
}

function chooseBoard(localBoard, remoteBoard, seedBoard) {
  if (!localBoard && !remoteBoard) {
    return seedBoard;
  }

  if (localBoard && !remoteBoard) {
    return localBoard;
  }

  if (!localBoard && remoteBoard) {
    return remoteBoard;
  }

  return getBoardTimestamp(remoteBoard) >= getBoardTimestamp(localBoard)
    ? remoteBoard
    : localBoard;
}

function getBoardTimestamp(board) {
  const boardTime = board?.meta?.lastModifiedAt ? (Date.parse(board.meta.lastModifiedAt) || 0) : 0;
  const projectTimes = (board?.projects || []).map((project) => Date.parse(project.updatedAt || 0) || 0);
  return Math.max(boardTime, ...projectTimes, 0);
}

function scheduleGitHubSync() {
  if (!appState.sync.token) {
    return;
  }

  if (appState.sync.pendingTimer) {
    window.clearTimeout(appState.sync.pendingTimer);
  }

  updateSyncStatus("Sync: queued for GitHub");
  appState.sync.pendingTimer = window.setTimeout(() => {
    pushToGitHub({ silent: true });
  }, 1200);
}

async function openSyncSetupModal() {
  openFormModal({
    title: "GitHub Sync Token",
    body: `
      <label class="form-label">
        Personal Access Token
        <input class="text-input" type="password" name="token" value="${escapeAttribute(appState.sync.token)}" placeholder="输入 PAT，留空则清除" />
      </label>
      <div class="helper-text">这个 token 只保存在当前电脑。需要至少有 Contents: write 权限。</div>
    `,
    onSubmit: (formData) => {
      appState.sync.token = formData.get("token").trim();
      saveSyncConfig();
      updateSyncStatus(appState.sync.token ? "Sync: GitHub ready" : "Sync: local only");
    },
  });
}

async function pullFromGitHub() {
  updateSyncStatus("Sync: pulling from GitHub...");
  const remoteBoard = await fetchRemoteBoard();
  if (!remoteBoard) {
    updateSyncStatus("Sync: pull failed");
    return;
  }

  appState.board = remoteBoard;
  persist(appState.board, { scheduleSync: false, touch: false });
  render();
  updateSyncStatus(`Sync: pulled ${formatDateTime(new Date().toISOString())}`);
}

async function pushToGitHub(options = {}) {
  const { silent = false } = options;
  if (!appState.sync.token) {
    if (!silent) {
      updateSyncStatus("Sync: token required");
      openSyncSetupModal();
    }
    return false;
  }

  if (appState.sync.isPushing) {
    return false;
  }

  appState.sync.isPushing = true;
  if (!silent) {
    updateSyncStatus("Sync: pushing to GitHub...");
  }

  try {
    const sha = await fetchRemoteSha(appState.sync.token);
    const body = {
      message: `Sync board data ${new Date().toISOString()}`,
      content: encodeBase64Utf8(JSON.stringify(appState.board, null, 2)),
      branch: GITHUB_SYNC_TARGET.branch,
    };

    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(buildGitHubWriteUrl(), {
      method: "PUT",
      headers: {
        ...GITHUB_API_HEADERS,
        Authorization: `Bearer ${appState.sync.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`GitHub sync failed: ${response.status}`);
    }

    updateSyncStatus(`Sync: pushed ${formatDateTime(new Date().toISOString())}`);
    return true;
  } catch {
    updateSyncStatus("Sync: push failed");
    return false;
  } finally {
    appState.sync.isPushing = false;
  }
}

async function fetchRemoteSha(token) {
  const response = await fetch(buildGitHubReadUrl(), {
    headers: {
      ...GITHUB_API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`SHA fetch failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.sha || null;
}

function buildGitHubReadUrl() {
  const { owner, repo, path, branch } = GITHUB_SYNC_TARGET;
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
}

function buildGitHubWriteUrl() {
  const { owner, repo, path } = GITHUB_SYNC_TARGET;
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
