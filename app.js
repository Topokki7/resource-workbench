(() => {
  "use strict";

  const workDates = [
    "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06",
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
    "2026-11-16", "2026-11-17", "2026-11-19", "2026-11-20", "2026-11-23",
    "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"
  ];

  const resources = {
    DATA: { id: "DATA", name: "数据分析师", capacity: 1, rate: 1200 },
    DESIGN: { id: "DESIGN", name: "视觉设计师", capacity: 1, rate: 1000 },
    PM: { id: "PM", name: "项目经理", capacity: 1, rate: 900 }
  };

  const baselineTasks = [
    { id: "T1", name: "市场洞察分析", start: 0, duration: 5, predecessors: [], resource: "DATA", allocation: 0.7, fixedCost: 1000 },
    { id: "T2", name: "销量预测", start: 2, duration: 4, predecessors: [], resource: "DATA", allocation: 0.6, fixedCost: 1500 },
    { id: "T3", name: "品牌视觉方案", start: 5, duration: 6, predecessors: ["T1"], resource: "DESIGN", allocation: 0.8, fixedCost: 3000 },
    { id: "T4", name: "上市页面设计", start: 6, duration: 5, predecessors: [], resource: "DESIGN", allocation: 0.6, fixedCost: 4000 },
    { id: "T5", name: "上市预算评审", start: 6, duration: 2, predecessors: ["T1", "T2"], resource: "PM", allocation: 0.5, fixedCost: 0 },
    { id: "T6", name: "发布准备复核", start: 11, duration: 3, predecessors: ["T3", "T4", "T5"], resource: "PM", allocation: 0.6, fixedCost: 2000 }
  ];

  const roleLabels = { pm: "项目经理", resource: "部门资源负责人", member: "项目团队成员" };
  const defaultPermissions = {
    pm: { view: true, comment: true, edit: true, permissions: true },
    resource: { view: true, comment: true, edit: true, permissions: true },
    member: { view: true, comment: true, edit: false, permissions: false }
  };
  const defaultCostConfig = {
    rates: { DATA: 1200, DESIGN: 1000, PM: 900 },
    fixedCosts: { T1: 1000, T2: 1500, T3: 3000, T4: 4000, T5: 0, T6: 2000 },
    version: "冻结基线 v0.1"
  };
  const defaultScheduleDraft = { overrides: {}, additionalTasks: [], deletedTaskIds: [], targetFinishSlot: 13 };

  const scenarioCatalog = {
    DATA: [
      { id: "stagger", title: "错峰销量预测", description: "把销量预测移到 11 月 9 日，依赖任务自动向后校正。", tags: ["成本不变", "完成日期不变"] },
      { id: "capacity", title: "增加临时容量", description: "在销量预测期间增加数据分析容量，固定工期不缩短。", tags: ["成本增加", "工期不变"] },
      { id: "allocation", title: "降低任务投入", description: "减少销量预测的每日投入；需人工确认工作量仍可完成。", tags: ["成本下降", "需确认假设"] }
    ],
    DESIGN: [
      { id: "stagger", title: "错峰上市页面设计", description: "等待品牌视觉方案完成后再开始页面设计。", tags: ["成本不变", "可能延期"] },
      { id: "capacity", title: "增加临时设计容量", description: "在页面设计期间增加 0.4 容量，固定工期不缩短。", tags: ["成本增加", "工期不变"] },
      { id: "allocation", title: "降低页面设计投入", description: "把页面设计投入降至可用容量内；需确认交付质量。", tags: ["成本下降", "需确认假设"] }
    ]
  };

  const goalPresets = {
    schedule: { label: "工期优先", maxCostPct: 10, maxDelay: 0 },
    cost: { label: "成本优先", maxCostPct: 0, maxDelay: 3 },
    balanced: { label: "平衡方案", maxCostPct: 5, maxDelay: 1 }
  };

  const state = {
    view: "overview",
    displayMode: "baseline",
    activeRole: "pm",
    activeConflict: "DATA",
    scenarioOptions: { DATA: "stagger", DESIGN: "capacity" },
    scenarioEnabled: { DATA: true, DESIGN: true },
    goal: "balanced",
    customCostLimit: 5,
    customDelayLimit: 1,
    parameters: {
      DATA: { staggerStart: 5, extraCapacity: 0.3, allocation: 0.3 },
      DESIGN: { staggerStart: 11, extraCapacity: 0.4, allocation: 0.2 }
    },
    selectedTask: null,
    selectedHeat: null,
    dependencyDragEnabled: false,
    dependencyLayouts: loadJSON("resource-workbench-dependency-layouts-v1", { baseline: {}, scenario: {} }),
    permissions: loadJSON("resource-workbench-permissions", defaultPermissions),
    permissionHistory: loadJSON("resource-workbench-permission-history", []),
    feedback: loadJSON("resource-workbench-feedback", []),
    decisions: loadJSON("resource-workbench-decisions-v1", []),
    costConfig: loadJSON("resource-workbench-cost-config", defaultCostConfig),
    scheduleDraft: loadJSON("resource-workbench-schedule-draft", defaultScheduleDraft)
  };
  state.scheduleDraft = normalizeScheduleDraft(state.scheduleDraft);
  saveJSON("resource-workbench-schedule-draft", state.scheduleDraft);
  let scheduleEditorDraft = null;

  function cloneTasks(tasks) {
    return tasks.map((task) => ({ ...task, predecessors: [...task.predecessors] }));
  }

  function loadJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : JSON.parse(JSON.stringify(fallback));
    } catch {
      return JSON.parse(JSON.stringify(fallback));
    }
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* local mode may block storage */ }
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
  }

  function shortDate(iso) {
    if (!iso) return "超出范围";
    const [, month, day] = iso.split("-");
    return `${Number(month)}月${Number(day)}日`;
  }

  function compactDate(iso) {
    if (!iso) return "—";
    const [, month, day] = iso.split("-");
    return `${Number(month)}/${Number(day)}`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function repairMojibakeText(value) {
    const text = String(value);
    if (!/[ÃÂäåæçèé]/.test(text) || [...text].some((char) => char.charCodeAt(0) > 255)) return text;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from([...text].map((char) => char.charCodeAt(0))));
      return decoded || text;
    } catch {
      return text;
    }
  }

  function cleanUserText(value) {
    return repairMojibakeText(value).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  }

  function normalizeScheduleDraft(draft) {
    const source = draft && typeof draft === "object" ? draft : defaultScheduleDraft;
    const rawAdditionalTasks = Array.isArray(source.additionalTasks) ? source.additionalTasks.map((task) => ({
      ...task,
      name: cleanUserText(task.name || "未命名任务"),
      predecessors: Array.isArray(task.predecessors) ? task.predecessors.map(String) : []
    })) : [];
    const requestedDeletedIds = Array.isArray(source.deletedTaskIds) ? [...new Set(source.deletedTaskIds.map(String))] : [];
    const baselineIds = new Set(baselineTasks.map((task) => task.id));
    const additionalTasks = rawAdditionalTasks.filter((task) => !requestedDeletedIds.includes(task.id));
    const activeIds = new Set(baselineTasks.map((task) => task.id).concat(additionalTasks.map((task) => task.id)));
    additionalTasks.forEach((task) => { task.predecessors = task.predecessors.filter((id) => activeIds.has(id)); });
    return {
      overrides: source.overrides && typeof source.overrides === "object" ? { ...source.overrides } : {},
      additionalTasks,
      deletedTaskIds: requestedDeletedIds.filter((id) => baselineIds.has(id)),
      targetFinishSlot: Number.isFinite(Number(source.targetFinishSlot)) ? Number(source.targetFinishSlot) : defaultScheduleDraft.targetFinishSlot
    };
  }

  function nextNewTaskId() {
    const numbers = (scheduleEditorDraft.additionalTasks || []).map((task) => /^NT(\d+)$/.exec(task.id)).filter(Boolean).map((match) => Number(match[1]));
    return `NT${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(2, "0")}`;
  }

  function taskById(tasks, id) {
    return tasks.find((task) => task.id === id);
  }

  function rateFor(resourceId) {
    return Number(state.costConfig.rates[resourceId]);
  }

  function fixedCostFor(taskId, fallback = 0) {
    const value = state.costConfig.fixedCosts[taskId];
    return Number(value === undefined ? fallback : value);
  }

  function propagateDependencies(tasks) {
    const result = cloneTasks(tasks);
    for (let pass = 0; pass < result.length; pass += 1) {
      let changed = false;
      result.forEach((task) => {
        if (!task.predecessors.length) return;
        const earliest = Math.max(...task.predecessors.map((id) => {
          const predecessor = taskById(result, id);
          return predecessor ? predecessor.start + predecessor.duration : task.start;
        }));
        if (task.start < earliest) {
          task.start = earliest;
          changed = true;
        }
      });
      if (!changed) break;
    }
    return result;
  }

  function tasksFromDraft(draft) {
    const normalized = normalizeScheduleDraft(draft);
    const deleted = new Set(normalized.deletedTaskIds);
    let tasks = cloneTasks(baselineTasks.filter((task) => !deleted.has(task.id)));
    tasks.forEach((task) => {
      const override = normalized.overrides[task.id];
      if (override) {
        task.start = Number(override.start);
        task.duration = Number(override.duration);
      }
    });
    tasks = tasks.concat(cloneTasks(normalized.additionalTasks.filter((task) => !deleted.has(task.id))));
    const activeIds = new Set(tasks.map((task) => task.id));
    tasks.forEach((task) => { task.predecessors = task.predecessors.filter((id) => activeIds.has(id)); });
    return propagateDependencies(tasks);
  }

  function buildScenario() {
    let tasks = tasksFromDraft(state.scheduleDraft);
    const tempCapacities = [];
    let extraCost = 0;
    const assumptions = [];

    ["DATA", "DESIGN"].forEach((resourceId) => {
      if (!state.scenarioEnabled[resourceId]) return;
      const params = state.parameters[resourceId];
      const option = state.scenarioOptions[resourceId];
      const taskId = resourceId === "DATA" ? "T2" : "T4";
      const target = taskById(tasks, taskId);
      if (!target) return;
      if (option === "stagger") target.start = params.staggerStart;
      if (option === "capacity") {
        tempCapacities.push({ resource: resourceId, start: target.start, duration: target.duration, amount: params.extraCapacity });
        extraCost += params.extraCapacity * target.duration * rateFor(resourceId);
      }
      if (option === "allocation") {
        target.allocation = params.allocation;
        assumptions.push(resourceId === "DATA"
          ? "需人工确认降低数据分析投入后仍能完成相同工作量；固定工期不会自动改变。"
          : "需人工确认降低设计投入后仍满足页面交付与质量要求；固定工期不会自动改变。");
      }
    });

    tasks = propagateDependencies(tasks);
    return { tasks, tempCapacities, extraCost, assumption: assumptions.join(" ") };
  }

  function calculate(tasks, scenario = { tempCapacities: [], extraCost: 0 }) {
    const loads = {};
    const capacities = {};
    Object.keys(resources).forEach((resourceId) => {
      loads[resourceId] = Array(workDates.length).fill(0);
      capacities[resourceId] = Array(workDates.length).fill(resources[resourceId].capacity);
    });

    tasks.forEach((task) => {
      for (let slot = task.start; slot < Math.min(task.start + task.duration, workDates.length); slot += 1) {
        loads[task.resource][slot] += task.allocation;
      }
    });

    const capacityChanges = scenario.tempCapacities || (scenario.tempCapacity ? [scenario.tempCapacity] : []);
    capacityChanges.forEach((change) => {
      for (let slot = change.start; slot < Math.min(change.start + change.duration, workDates.length); slot += 1) {
        capacities[change.resource][slot] += change.amount;
      }
    });

    const conflicts = {};
    let overloadSlots = 0;
    Object.keys(resources).forEach((resourceId) => {
      conflicts[resourceId] = [];
      loads[resourceId].forEach((load, slot) => {
        if (load > capacities[resourceId][slot] + 0.0001) {
          conflicts[resourceId].push(slot);
          overloadSlots += 1;
        }
      });
    });

    let humanCost = 0;
    let fixedCost = 0;
    tasks.forEach((task) => {
      humanCost += task.duration * task.allocation * rateFor(task.resource);
      fixedCost += fixedCostFor(task.id, task.fixedCost);
    });
    const totalCost = humanCost + fixedCost + (scenario.extraCost || 0);

    let dependencyConflicts = 0;
    tasks.forEach((task) => {
      task.predecessors.forEach((id) => {
        const predecessor = taskById(tasks, id);
        if (!predecessor || predecessor.start + predecessor.duration > task.start) dependencyConflicts += 1;
      });
    });

    const finishSlot = tasks.length ? Math.max(...tasks.map((task) => task.start + task.duration)) : 0;
    return {
      loads,
      capacities,
      conflicts,
      overloadSlots,
      conflictResources: Object.values(conflicts).filter((slots) => slots.length > 0).length,
      humanCost,
      fixedCost,
      extraCost: scenario.extraCost || 0,
      totalCost,
      dependencyConflicts,
      finishSlot,
      finishDate: workDates[finishSlot - 1] || null
    };
  }

  let baselineMetrics = calculate(baselineTasks);

  function currentGoal() {
    if (state.goal === "custom") return { label: "自定义", maxCostPct: state.customCostLimit, maxDelay: state.customDelayLimit };
    return goalPresets[state.goal];
  }

  function evaluateScenario(metrics) {
    const goal = currentGoal();
    const costPct = ((metrics.totalCost - baselineMetrics.totalCost) / baselineMetrics.totalCost) * 100;
    const delay = metrics.finishSlot - baselineMetrics.finishSlot;
    const passes = metrics.overloadSlots === 0 && costPct <= goal.maxCostPct + 0.0001 && delay <= goal.maxDelay;
    const reasons = [];
    if (metrics.overloadSlots > 0) reasons.push(`仍有 ${metrics.overloadSlots} 个超配时点`);
    if (costPct > goal.maxCostPct + 0.0001) reasons.push(`成本增幅 ${costPct.toFixed(1)}% 超过 ${goal.maxCostPct}%`);
    if (delay > goal.maxDelay) reasons.push(`延期 ${delay} 个工作日超过 ${goal.maxDelay} 天`);
    return { goal, costPct, delay, passes, reasons };
  }

  function getContributors(tasks, resourceId, slot) {
    return tasks.filter((task) => task.resource === resourceId && task.start <= slot && slot < task.start + task.duration);
  }

  function showView(name) {
    const permissions = state.permissions[state.activeRole];
    if (!permissions.view) {
      showToast(`${roleLabels[state.activeRole]}当前没有查看权限。`);
      return;
    }
    state.view = name;
    document.querySelectorAll("[data-view]").forEach((view) => {
      const active = view.dataset.view === name;
      view.hidden = !active;
      view.classList.toggle("is-active", active);
    });
    document.querySelectorAll(".mode-button[data-view-target]").forEach((button) => {
      const active = button.dataset.viewTarget === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderAll();
  }

  function renderAll() {
    baselineMetrics = calculate(baselineTasks);
    const scenario = buildScenario();
    const scenarioMetrics = calculate(scenario.tasks, scenario);
    renderNavigation(scenarioMetrics);
    renderKPIs(scenarioMetrics);
    renderOverviewConflicts(scenario, scenarioMetrics);
    renderGantt(scenario, scenarioMetrics);
    renderHeatmap(scenario, scenarioMetrics);
    renderCostChart(scenario, scenarioMetrics);
    renderConflictInbox(scenario, scenarioMetrics);
    renderCombinedScenarioStrip();
    renderScenarioOptions();
    renderGuardrails(scenarioMetrics);
    renderEditor(scenario, scenarioMetrics);
    renderScenarioPreview(scenario, scenarioMetrics);
    renderPermissions();
    renderFeedback();
    renderDecisions();
    renderCostEditor();
    renderScheduleEditor();
    applyRoleCapabilities();
  }

  function renderNavigation(scenarioMetrics) {
    const visibleMetrics = state.displayMode === "scenario" ? scenarioMetrics : baselineMetrics;
    document.getElementById("nav-conflict-count").textContent = visibleMetrics.conflictResources;
    document.getElementById("nav-feedback-count").textContent = state.feedback.length;
    document.getElementById("overview-feedback-count").textContent = state.feedback.length;
  }

  function renderKPIs(scenarioMetrics) {
    document.querySelectorAll("[data-display-mode]").forEach((button) => button.classList.toggle("is-selected", button.dataset.displayMode === state.displayMode));
    const useScenario = state.displayMode === "scenario";
    const metrics = useScenario ? scenarioMetrics : baselineMetrics;
    document.getElementById("kpi-finish").textContent = shortDate(metrics.finishDate);
    document.getElementById("kpi-cost").textContent = formatCurrency(metrics.totalCost);
    document.getElementById("kpi-overloads").textContent = metrics.overloadSlots;
    document.getElementById("kpi-dependencies").textContent = metrics.dependencyConflicts;
    document.getElementById("kpi-finish-delta").textContent = useScenario ? finishDeltaText(metrics) : "基线";
    const costDelta = metrics.totalCost - baselineMetrics.totalCost;
    document.getElementById("kpi-cost-delta").textContent = useScenario ? `${costDelta >= 0 ? "+" : "−"}${formatCurrency(Math.abs(costDelta))} vs 基线` : "合成计划值";
    document.getElementById("kpi-overload-detail").textContent = Object.entries(metrics.conflicts)
      .filter(([, slots]) => slots.length)
      .map(([id, slots]) => `${resources[id].name.replace("师", "")} ${slots.length}`)
      .join(" · ") || "无资源超配";
  }

  function finishDeltaText(metrics) {
    const delay = metrics.finishSlot - baselineMetrics.finishSlot;
    if (delay === 0) return "与基线相同";
    return delay > 0 ? `延期 ${delay} 个工作日` : `提前 ${Math.abs(delay)} 个工作日`;
  }

  function renderOverviewConflicts(scenario, scenarioMetrics) {
    const useScenario = state.displayMode === "scenario";
    const metrics = useScenario ? scenarioMetrics : baselineMetrics;
    const container = document.getElementById("overview-conflicts");
    const entries = Object.entries(metrics.conflicts).filter(([, slots]) => slots.length > 0);
    if (!entries.length) {
      container.innerHTML = '<div class="empty-state">当前视图没有资源超配。</div>';
      return;
    }
    container.innerHTML = entries.map(([resourceId, slots], index) => {
      const peak = Math.max(...metrics.loads[resourceId].map((load, slot) => load / metrics.capacities[resourceId][slot]));
      return `<button type="button" class="conflict-card" data-conflict-open="${resourceId}">
        <span class="rank">${String(index + 1).padStart(2, "0")} · ${index === 0 ? "建议先处理" : "待处理"}</span>
        <strong>${resources[resourceId].name}峰值 ${(peak * 100).toFixed(0)}%</strong>
        <small>${compactDate(workDates[slots[0]])}—${compactDate(workDates[slots[slots.length - 1]])} · ${slots.length} 个工作日</small>
        <em>查看贡献任务与方案 →</em>
      </button>`;
    }).join("");
    container.querySelectorAll("[data-conflict-open]").forEach((button) => button.addEventListener("click", () => {
      state.activeConflict = button.dataset.conflictOpen;
      showView("conflicts");
    }));
  }

  function renderGantt(scenario, scenarioMetrics) {
    const gantt = document.getElementById("gantt");
    const showScenario = state.displayMode === "scenario";
    const rowTasks = showScenario ? scenario.tasks : baselineTasks;
    const axis = `<div class="gantt-axis"><span>任务</span>${workDates.map((date) => `<span>${compactDate(date)}</span>`).join("")}</div>`;
    const rows = rowTasks.map((activeTask) => {
      const baselineTask = taskById(baselineTasks, activeTask.id);
      const resourceConflicts = (showScenario ? scenarioMetrics : baselineMetrics).conflicts[activeTask.resource];
      const isConflict = resourceConflicts.some((slot) => activeTask.start <= slot && slot < activeTask.start + activeTask.duration);
      const isChanged = Boolean(showScenario && baselineTask && (activeTask.start !== baselineTask.start || activeTask.duration !== baselineTask.duration || activeTask.allocation !== baselineTask.allocation));
      const dep = activeTask.predecessors.length ? ` · 前置 ${activeTask.predecessors.join("、")}` : "";
      const currentBar = barHTML(activeTask, showScenario ? (baselineTask ? "current" : "scenario-new") : "baseline", isConflict);
      const grid = workDates.map(() => '<span class="gantt-gridline"></span>').join("");
      return `<div class="gantt-row" data-task-row="${activeTask.id}">
        <button type="button" class="task-name" data-task-select="${activeTask.id}"><span class="task-label-text">${escapeHTML(activeTask.name)}${dep}</span><span class="task-label-tags">${!baselineTask ? '<span class="task-risk-label new">新增</span>' : ""}${isChanged ? '<span class="task-risk-label changed">已调整</span>' : ""}${isConflict ? '<span class="task-risk-label">冲突</span>' : ""}</span></button>${grid}${currentBar}
      </div>`;
    }).join("");
    gantt.innerHTML = axis + rows;
    gantt.querySelectorAll("[data-task-select], .task-bar").forEach((button) => button.addEventListener("click", () => {
      state.selectedTask = button.dataset.taskSelect || button.dataset.taskId;
      renderGantt(scenario, scenarioMetrics);
      renderTaskEvidence(scenario);
    }));
    renderTaskEvidence(scenario);
    renderDependencyMap(showScenario ? scenario.tasks : baselineTasks);
  }

  function barHTML(task, mode, conflict) {
    const total = workDates.length;
    const rawStart = Number(task.start);
    const rawDuration = Math.max(1, Number(task.duration) || 1);
    const start = Math.max(0, Math.min(Number.isFinite(rawStart) ? rawStart : 0, total - 1));
    const end = Math.max(start + 1, Math.min((Number.isFinite(rawStart) ? rawStart : 0) + rawDuration, total));
    const visibleDuration = Math.max(1, end - start);
    const outsideWindow = rawStart < 0 || rawStart >= total || rawStart + rawDuration > total;
    const selected = state.selectedTask === task.id ? " is-selected" : "";
    const rangeClass = outsideWindow ? " out-of-range" : "";
    const rangeNote = outsideWindow ? "，部分或全部超出当前项目窗口" : "";
    return `<button type="button" class="task-bar ${mode} resource-${task.resource}${conflict ? " conflict" : ""}${selected}${rangeClass}" data-task-id="${task.id}" style="grid-column:${start + 2} / span ${visibleDuration}" aria-label="${escapeHTML(task.name)} ${shortDate(workDates[task.start])}开始${rangeNote}">${escapeHTML(task.name)}</button>`;
  }

  function renderDependencyMap(tasks) {
    const container = document.getElementById("dependency-map");
    const layoutKey = state.displayMode === "scenario" ? "scenario" : "baseline";
    const savedLayouts = state.dependencyLayouts && typeof state.dependencyLayouts === "object" ? state.dependencyLayouts : { baseline: {}, scenario: {} };
    state.dependencyLayouts = savedLayouts;
    if (!savedLayouts[layoutKey] || typeof savedLayouts[layoutKey] !== "object") savedLayouts[layoutKey] = {};
    document.getElementById("dependency-drag-toggle").checked = state.dependencyDragEnabled;
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state">当前情景没有任务。</div>';
      return;
    }
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const levels = new Map(tasks.map((task) => [task.id, 0]));
    for (let pass = 0; pass < tasks.length; pass += 1) {
      let changed = false;
      tasks.forEach((task) => {
        const validPredecessors = task.predecessors.filter((id) => taskMap.has(id));
        const nextLevel = validPredecessors.length ? Math.max(...validPredecessors.map((id) => levels.get(id) || 0)) + 1 : 0;
        if (nextLevel > (levels.get(task.id) || 0)) { levels.set(task.id, nextLevel); changed = true; }
      });
      if (!changed) break;
    }
    const levelCount = Math.max(...levels.values()) + 1;
    const groups = Array.from({ length: levelCount }, () => []);
    tasks.forEach((task) => groups[levels.get(task.id) || 0].push(task));
    groups[0].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    for (let level = 1; level < groups.length; level += 1) {
      const previousOrder = new Map(groups.slice(0, level).flat().map((task, index) => [task.id, index]));
      groups[level].sort((a, b) => {
        const aPreds = a.predecessors.filter((id) => previousOrder.has(id));
        const bPreds = b.predecessors.filter((id) => previousOrder.has(id));
        const aScore = aPreds.length ? aPreds.reduce((sum, id) => sum + previousOrder.get(id), 0) / aPreds.length : a.start;
        const bScore = bPreds.length ? bPreds.reduce((sum, id) => sum + previousOrder.get(id), 0) / bPreds.length : b.start;
        return aScore - bScore || a.start - b.start || a.id.localeCompare(b.id);
      });
    }
    const nodeWidth = 190;
    const nodeHeight = 54;
    const columnGap = 90;
    const rowGap = 24;
    const paddingX = 30;
    const paddingY = 64;
    const maxRows = Math.max(...groups.map((group) => group.length));
    const graphWidth = Math.max(860, paddingX * 2 + levelCount * nodeWidth + (levelCount - 1) * columnGap);
    const graphHeight = Math.max(250, paddingY + maxRows * nodeHeight + Math.max(0, maxRows - 1) * rowGap + 30);
    const positions = new Map();
    groups.forEach((group, level) => {
      const groupHeight = group.length * nodeHeight + Math.max(0, group.length - 1) * rowGap;
      const availableHeight = graphHeight - paddingY - 30;
      const offsetY = paddingY + Math.max(0, (availableHeight - groupHeight) / 2);
      group.forEach((task, index) => {
        const automatic = { x: paddingX + level * (nodeWidth + columnGap), y: offsetY + index * (nodeHeight + rowGap) };
        const saved = savedLayouts[layoutKey][task.id];
        const position = saved && Number.isFinite(Number(saved.x)) && Number.isFinite(Number(saved.y))
          ? { x: Math.max(0, Math.min(Number(saved.x), graphWidth - nodeWidth)), y: Math.max(34, Math.min(Number(saved.y), graphHeight - nodeHeight)) }
          : automatic;
        positions.set(task.id, position);
      });
    });
    const activeIds = new Set(tasks.map((task) => task.id));
    Object.keys(savedLayouts[layoutKey]).forEach((id) => { if (!activeIds.has(id)) delete savedLayouts[layoutKey][id]; });
    saveJSON("resource-workbench-dependency-layouts-v1", state.dependencyLayouts);
    const edgeData = tasks.flatMap((task) => task.predecessors.filter((id) => positions.has(id)).map((id, edgeIndex) => ({
      from: id,
      to: task.id,
      resource: taskById(tasks, id)?.resource || "DATA",
      long: (levels.get(task.id) || 0) - (levels.get(id) || 0) > 1,
      lane: edgeIndex
    })));
    const edgeGeometry = (edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      const x1 = from.x + nodeWidth;
      const y1 = from.y + nodeHeight / 2;
      const x2 = to.x;
      const y2 = to.y + nodeHeight / 2;
      if (edge.long && !state.dependencyDragEnabled) {
        const corridorY = 42 + edge.lane * 8;
        return { d: `M${x1} ${y1} L${x1 + 18} ${y1} L${x1 + 18} ${corridorY} L${x2 - 18} ${corridorY} L${x2 - 18} ${y2} L${x2} ${y2}`, labelX: (x1 + x2) / 2, labelY: corridorY - 4 };
      }
      const mid = x1 + (x2 - x1) / 2;
      return { d: `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`, labelX: mid, labelY: (y1 + y2) / 2 - 5 };
    };
    const graphEdges = edgeData.map((edge) => {
      const geometry = edgeGeometry(edge);
      return `<g class="dep-edge-group" data-edge-from="${edge.from}" data-edge-to="${edge.to}" data-edge-resource="${edge.resource}"><path class="dep-edge resource-${edge.resource}" d="${geometry.d}" marker-end="url(#dep-arrowhead-${edge.resource.toLowerCase()})"><title>${escapeHTML(edge.from)} 完成后 ${escapeHTML(edge.to)} 才能开始</title></path><text class="dep-edge-label" text-anchor="middle" x="${geometry.labelX}" y="${geometry.labelY}">FS</text></g>`;
    }).join("");
    const graphNodes = tasks.map((task) => dependencySvgNode(task, positions.get(task.id), nodeWidth, nodeHeight)).join("");
    const levelLabels = groups.map((group, level) => {
      const x = paddingX + level * (nodeWidth + columnGap);
      return `<line class="stage-guide" x1="${x - 15}" y1="34" x2="${x - 15}" y2="${graphHeight - 16}"></line><text class="stage-label" x="${x}" y="24">层级 ${level + 1} · ${group.length} 个任务</text>`;
    }).join("");
    const readable = tasks.filter((task) => task.predecessors.length).map((task) => `<div><strong>${task.predecessors.join(" + ")} → ${task.id}</strong><br>${task.predecessors.map((id) => taskById(tasks, id)?.name || id).join("、")}完成后，${escapeHTML(task.name)}才能开始。</div>`).join("");
    container.innerHTML = `<svg class="dependency-graph${state.dependencyDragEnabled ? " is-draggable" : ""}" viewBox="0 0 ${graphWidth} ${graphHeight}" style="min-width:${graphWidth}px" role="img" aria-labelledby="dep-graph-title dep-graph-desc">
      <title id="dep-graph-title">项目任务依赖网络图</title><desc id="dep-graph-desc">从分析准备，经设计与评审，到发布复核的完成后开始依赖关系。</desc>
      <defs>
        <marker id="dep-arrowhead-data" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#2868d8"></path></marker>
        <marker id="dep-arrowhead-design" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#7652b5"></path></marker>
        <marker id="dep-arrowhead-pm" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#1d7d56"></path></marker>
      </defs>
      ${levelLabels}${graphEdges}${graphNodes}
    </svg><div class="dependency-readable">${readable || '<div class="empty-state">当前情景没有任务依赖。</div>'}</div>`;
    const svg = container.querySelector(".dependency-graph");
    const updateEdges = () => {
      edgeData.forEach((edge) => {
        const group = svg.querySelector(`[data-edge-from="${edge.from}"][data-edge-to="${edge.to}"]`);
        if (!group) return;
        const geometry = edgeGeometry(edge);
        group.querySelector("path").setAttribute("d", geometry.d);
        const label = group.querySelector("text");
        label.setAttribute("x", geometry.labelX);
        label.setAttribute("y", geometry.labelY);
      });
    };
    const highlightConnections = (taskId, enabled) => {
      const connectedIds = new Set([taskId]);
      svg.querySelectorAll(".dep-edge-group").forEach((group) => {
        const connected = group.dataset.edgeFrom === taskId || group.dataset.edgeTo === taskId;
        group.querySelector(".dep-edge").classList.toggle("is-highlighted", enabled && connected);
        group.querySelector(".dep-edge").classList.toggle("is-dimmed", enabled && !connected);
        if (connected) { connectedIds.add(group.dataset.edgeFrom); connectedIds.add(group.dataset.edgeTo); }
      });
      svg.querySelectorAll(".dep-node").forEach((node) => node.classList.toggle("is-related", enabled && connectedIds.has(node.dataset.dependencyTask)));
    };
    const selectNode = (element) => {
      state.selectedTask = element.dataset.dependencyTask;
      const scenario = buildScenario();
      renderGantt(scenario, calculate(scenario.tasks, scenario));
      document.getElementById("gantt-wrap").scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    container.querySelectorAll("[data-dependency-task]").forEach((node) => {
      node.addEventListener("click", () => { if (node.dataset.dragMoved !== "true") selectNode(node); });
      node.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") selectNode(node); });
      node.addEventListener("mouseenter", () => highlightConnections(node.dataset.dependencyTask, true));
      node.addEventListener("mouseleave", () => highlightConnections(node.dataset.dependencyTask, false));
      node.addEventListener("focus", () => highlightConnections(node.dataset.dependencyTask, true));
      node.addEventListener("blur", () => highlightConnections(node.dataset.dependencyTask, false));
      if (!state.dependencyDragEnabled) return;
      node.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        node.setPointerCapture(event.pointerId);
        node.classList.add("is-dragging");
        const taskId = node.dataset.dependencyTask;
        const startPosition = { ...positions.get(taskId) };
        const rect = svg.getBoundingClientRect();
        const scaleX = graphWidth / rect.width;
        const scaleY = graphHeight / rect.height;
        const startPointer = { x: event.clientX, y: event.clientY };
        let moved = false;
        const onMove = (moveEvent) => {
          const dx = (moveEvent.clientX - startPointer.x) * scaleX;
          const dy = (moveEvent.clientY - startPointer.y) * scaleY;
          moved = moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
          const next = {
            x: Math.max(0, Math.min(startPosition.x + dx, graphWidth - nodeWidth)),
            y: Math.max(34, Math.min(startPosition.y + dy, graphHeight - nodeHeight))
          };
          positions.set(taskId, next);
          node.setAttribute("transform", `translate(${next.x} ${next.y})`);
          updateEdges();
        };
        const onEnd = () => {
          node.classList.remove("is-dragging");
          node.removeEventListener("pointermove", onMove);
          node.removeEventListener("pointerup", onEnd);
          node.removeEventListener("pointercancel", onEnd);
          if (!moved) return;
          node.dataset.dragMoved = "true";
          savedLayouts[layoutKey][taskId] = positions.get(taskId);
          saveJSON("resource-workbench-dependency-layouts-v1", state.dependencyLayouts);
          setTimeout(() => { delete node.dataset.dragMoved; }, 0);
        };
        node.addEventListener("pointermove", onMove);
        node.addEventListener("pointerup", onEnd);
        node.addEventListener("pointercancel", onEnd);
      });
    });
  }

  function dependencySvgNode(task, position, width = 190, height = 54) {
    const roleClass = task.resource === "DESIGN" ? "design" : task.resource === "PM" ? "pm" : "data";
    const endDate = workDates[Math.min(task.start + task.duration - 1, workDates.length - 1)];
    const visibleName = task.name.length > 11 ? `${task.name.slice(0, 10)}…` : task.name;
    return `<g class="dep-node ${roleClass}" data-dependency-task="${task.id}" transform="translate(${position.x} ${position.y})" role="button" tabindex="0" aria-label="${task.id} ${escapeHTML(task.name)}，${resources[task.resource].name}"><title>${escapeHTML(task.name)}</title><rect x="0" y="0" width="${width}" height="${height}"></rect><text class="task-id" x="12" y="19">${task.id}</text><text class="task-name" x="44" y="20">${escapeHTML(visibleName)}</text><text class="task-meta" x="12" y="41">${resources[task.resource].name} · ${compactDate(workDates[task.start])}—${compactDate(endDate)}</text></g>`;
  }

  function renderTaskEvidence(scenario) {
    const target = document.getElementById("schedule-evidence");
    if (!state.selectedTask) {
      target.textContent = "选择任务后显示日期、投入、成本与前置任务。";
      return;
    }
    const tasks = state.displayMode === "scenario" ? scenario.tasks : baselineTasks;
    const task = taskById(tasks, state.selectedTask);
    if (!task) {
      target.textContent = "该任务只存在于情景草稿，请切换到“情景预览”查看。";
      return;
    }
    const endDate = workDates[Math.min(task.start + task.duration - 1, workDates.length - 1)];
    const cost = task.duration * task.allocation * rateFor(task.resource) + fixedCostFor(task.id, task.fixedCost);
    const baselineTask = taskById(baselineTasks, task.id);
    const changedFromBaseline = state.displayMode === "scenario" && baselineTask && (task.start !== baselineTask.start || task.duration !== baselineTask.duration || task.allocation !== baselineTask.allocation);
    const baselineEnd = baselineTask ? workDates[Math.min(baselineTask.start + baselineTask.duration - 1, workDates.length - 1)] : null;
    const baselineNote = changedFromBaseline ? ` · <strong>基线位置：</strong>${shortDate(workDates[baselineTask.start])}—${shortDate(baselineEnd)}` : "";
    target.innerHTML = `<strong>${task.name}</strong> · 当前 ${shortDate(workDates[task.start])}—${shortDate(endDate)} · ${resources[task.resource].name}投入 ${task.allocation.toFixed(1)} · 计划成本 ${formatCurrency(cost)} · 前置任务 ${task.predecessors.length ? task.predecessors.join("、") : "无"}${baselineNote}`;
  }

  function renderHeatmap(scenario, scenarioMetrics) {
    const useScenario = state.displayMode === "scenario";
    const tasks = useScenario ? scenario.tasks : baselineTasks;
    const metrics = useScenario ? scenarioMetrics : baselineMetrics;
    const heatmap = document.getElementById("heatmap");
    const header = `<span></span>${workDates.map((date) => `<span class="heat-header">${compactDate(date)}</span>`).join("")}`;
    const rows = Object.keys(resources).map((resourceId) => {
      const cells = workDates.map((date, slot) => {
        const load = metrics.loads[resourceId][slot];
        const capacity = metrics.capacities[resourceId][slot];
        const overload = load > capacity + 0.0001;
        const zero = load === 0;
        const selected = state.selectedHeat && state.selectedHeat.resourceId === resourceId && state.selectedHeat.slot === slot;
        return `<button type="button" class="heat-cell${overload ? " overload" : ""}${zero ? " zero" : ""}${selected ? " selected" : ""}" data-heat-resource="${resourceId}" data-heat-slot="${slot}" aria-label="${resources[resourceId].name} ${date} 负荷 ${load.toFixed(1)} 容量 ${capacity.toFixed(1)}">${load.toFixed(1)}/${capacity.toFixed(1)}</button>`;
      }).join("");
      return `<span class="resource-label">${resources[resourceId].name}</span>${cells}`;
    }).join("");
    heatmap.innerHTML = header + rows;
    heatmap.querySelectorAll("[data-heat-resource]").forEach((button) => button.addEventListener("click", () => {
      state.selectedHeat = { resourceId: button.dataset.heatResource, slot: Number(button.dataset.heatSlot) };
      renderHeatmap(scenario, scenarioMetrics);
      renderHeatEvidence(tasks, metrics);
    }));
    renderHeatEvidence(tasks, metrics);
  }

  function renderHeatEvidence(tasks, metrics) {
    const target = document.getElementById("heatmap-evidence");
    if (!state.selectedHeat) {
      target.textContent = "选择热力格后显示负荷构成。";
      return;
    }
    const { resourceId, slot } = state.selectedHeat;
    const contributors = getContributors(tasks, resourceId, slot);
    const detail = contributors.length ? contributors.map((task) => `${task.name} ${task.allocation.toFixed(1)}`).join(" + ") : "无任务投入";
    target.innerHTML = `<strong>${resources[resourceId].name} · ${shortDate(workDates[slot])}</strong>：${detail}；总负荷 ${metrics.loads[resourceId][slot].toFixed(1)}，容量 ${metrics.capacities[resourceId][slot].toFixed(1)}。`;
  }

  function renderCostChart(scenario, scenarioMetrics) {
    const metrics = state.displayMode === "scenario" ? scenarioMetrics : baselineMetrics;
    const max = Math.max(metrics.totalCost, baselineMetrics.totalCost, 1);
    const delta = metrics.totalCost - baselineMetrics.totalCost;
    document.getElementById("cost-chart").innerHTML = `
      <div class="cost-total"><span>${state.displayMode === "scenario" ? "情景计划成本" : "基线计划成本"}<small> · ${escapeHTML(state.costConfig.version)}</small></span><strong>${formatCurrency(metrics.totalCost)}</strong></div>
      <div class="cost-bar-row"><span>人力成本</span><div class="cost-track"><div class="cost-fill" style="width:${metrics.humanCost / max * 100}%"></div></div><span>${formatCurrency(metrics.humanCost)}</span></div>
      <div class="cost-bar-row"><span>固定费用</span><div class="cost-track"><div class="cost-fill fixed" style="width:${metrics.fixedCost / max * 100}%"></div></div><span>${formatCurrency(metrics.fixedCost)}</span></div>
      ${metrics.extraCost ? `<div class="cost-bar-row"><span>临时容量</span><div class="cost-track"><div class="cost-fill delta" style="width:${metrics.extraCost / max * 100}%"></div></div><span>${formatCurrency(metrics.extraCost)}</span></div>` : ""}
      <div class="cost-comparison"><div><span>基线</span><strong>${formatCurrency(baselineMetrics.totalCost)}</strong></div><div><span>当前差异</span><strong>${delta >= 0 ? "+" : "−"}${formatCurrency(Math.abs(delta))}</strong></div></div>`;
    document.getElementById("cost-detail").innerHTML = `<table><thead><tr><th>任务</th><th>人力</th><th>固定</th><th>合计</th></tr></thead><tbody>${(state.displayMode === "scenario" ? scenario.tasks : baselineTasks).map((task) => {
      const human = task.duration * task.allocation * rateFor(task.resource);
      const fixed = fixedCostFor(task.id, task.fixedCost);
      return `<tr><td>${task.name}</td><td>${formatCurrency(human)}</td><td>${formatCurrency(fixed)}</td><td>${formatCurrency(human + fixed)}</td></tr>`;
    }).join("")}</tbody></table>`;
  }

  function renderConflictInbox(scenario, scenarioMetrics) {
    const list = document.getElementById("conflict-inbox-list");
    list.innerHTML = ["DATA", "DESIGN"].map((resourceId, index) => {
      const slots = baselineMetrics.conflicts[resourceId];
      const peak = Math.max(...baselineMetrics.loads[resourceId]);
      return `<button type="button" class="inbox-item${state.activeConflict === resourceId ? " is-selected" : ""}" data-inbox-resource="${resourceId}"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${resources[resourceId].name}超配 ${((peak - 1) * 100).toFixed(0)}%</strong><small>${slots.length} 个工作日 · ${resourceId === "DATA" ? "可无损错峰" : "需比较方案"}</small></div></button>`;
    }).join("");
    list.querySelectorAll("[data-inbox-resource]").forEach((button) => button.addEventListener("click", () => {
      state.activeConflict = button.dataset.inboxResource;
      renderAll();
    }));
    document.getElementById("workspace-resource").textContent = `当前问题 · ${resources[state.activeConflict].name}`;
  }

  function scenarioPlan(resourceId) {
    const optionId = state.scenarioOptions[resourceId];
    return scenarioCatalog[resourceId].find((option) => option.id === optionId) || scenarioCatalog[resourceId][0];
  }

  function renderCombinedScenarioStrip() {
    const container = document.getElementById("combined-scenario-strip");
    container.innerHTML = `<strong>组合情景</strong>${["DATA", "DESIGN"].map((resourceId) => {
      const plan = scenarioPlan(resourceId);
      return `<label class="combined-plan${state.activeConflict === resourceId ? " is-active" : ""}"><input type="checkbox" data-combined-resource="${resourceId}" ${state.scenarioEnabled[resourceId] ? "checked" : ""}><span><b>${resources[resourceId].name}</b><small>${escapeHTML(plan.title)}</small></span></label>`;
    }).join("")}`;
    container.querySelectorAll("[data-combined-resource]").forEach((input) => input.addEventListener("change", () => {
      state.scenarioEnabled[input.dataset.combinedResource] = input.checked;
      renderAll();
    }));
  }

  function renderScenarioOptions() {
    const container = document.getElementById("scenario-options");
    const currentOption = state.scenarioOptions[state.activeConflict];
    container.innerHTML = scenarioCatalog[state.activeConflict].map((option) => `<button type="button" class="scenario-option${currentOption === option.id ? " is-selected" : ""}" data-scenario-option="${option.id}"><strong>${option.title}</strong><small>${option.description}</small><span class="option-meta">${option.tags.map((tag) => `<span class="option-tag${tag.includes("不变") ? " good" : tag.includes("增加") || tag.includes("延期") ? " warn" : ""}">${tag}</span>`).join("")}</span></button>`).join("");
    container.querySelectorAll("[data-scenario-option]").forEach((button) => button.addEventListener("click", () => {
      state.scenarioOptions[state.activeConflict] = button.dataset.scenarioOption;
      state.scenarioEnabled[state.activeConflict] = true;
      renderAll();
    }));
  }

  function renderGuardrails(scenarioMetrics) {
    const goal = currentGoal();
    const evaluation = evaluateScenario(scenarioMetrics);
    document.querySelectorAll("[data-goal]").forEach((button) => button.classList.toggle("is-selected", button.dataset.goal === state.goal));
    document.getElementById("custom-guardrails").hidden = state.goal !== "custom";
    document.getElementById("guardrail-status").textContent = `${goal.label} · ${evaluation.passes ? "通过" : "未通过"}`;
    document.getElementById("custom-cost-limit").value = state.customCostLimit;
    document.getElementById("custom-delay-limit").value = state.customDelayLimit;
    document.getElementById("custom-cost-output").textContent = `${state.customCostLimit}%`;
    document.getElementById("custom-delay-output").textContent = `${state.customDelayLimit} 个工作日`;
    const live = document.getElementById("guardrail-live");
    live.className = `guardrail-live ${evaluation.passes ? "pass" : "fail"}`;
    live.innerHTML = `<strong>当前标准：</strong>超配时点必须为 0，成本增幅 ≤ ${goal.maxCostPct}%，延期 ≤ ${goal.maxDelay} 个工作日。 <strong>当前方案：</strong>成本增幅 ${evaluation.costPct.toFixed(1)}%，延期 ${evaluation.delay} 个工作日，超配时点 ${baselineMetrics.overloadSlots}→${scenarioMetrics.overloadSlots}。 <strong>${evaluation.passes ? "结果：通过。" : `结果：未通过（${evaluation.reasons.join("；")}）。`}</strong>`;
  }

  function renderEditor(scenario, scenarioMetrics) {
    const container = document.getElementById("editor-fields");
    const resourceId = state.activeConflict;
    const params = state.parameters[resourceId];
    const currentOption = state.scenarioOptions[resourceId];
    if (currentOption === "stagger") {
      const taskId = resourceId === "DATA" ? "T2" : "T4";
      const task = taskById(baselineTasks, taskId);
      container.innerHTML = `<label>调整任务<input value="${task.name}" disabled></label><label>情景开始日期<select id="scenario-start-date">${workDates.map((date, index) => `<option value="${index}"${index === params.staggerStart ? " selected" : ""}>${date}</option>`).join("")}</select></label><label>工期与投入<input value="${task.duration} 个工作日 · ${task.allocation.toFixed(1)} 投入" disabled></label>`;
      document.getElementById("scenario-start-date").addEventListener("change", (event) => {
        params.staggerStart = Number(event.target.value);
        renderAll();
      });
    } else if (currentOption === "capacity") {
      const taskId = resourceId === "DATA" ? "T2" : "T4";
      const task = taskById(baselineTasks, taskId);
      container.innerHTML = `<label>容量增加值<input id="extra-capacity" type="range" min="0" max="1" step="0.1" value="${params.extraCapacity}"><output id="extra-capacity-output">+${params.extraCapacity.toFixed(1)}</output></label><label>生效区间<input value="${shortDate(workDates[task.start])}起，共 ${task.duration} 个工作日" disabled></label><label>临时容量成本<input value="${formatCurrency(params.extraCapacity * task.duration * rateFor(resourceId))}" disabled></label>`;
      document.getElementById("extra-capacity").addEventListener("input", (event) => {
        params.extraCapacity = Number(event.target.value);
        renderAll();
      });
    } else {
      const taskId = resourceId === "DATA" ? "T2" : "T4";
      const task = taskById(baselineTasks, taskId);
      container.innerHTML = `<label>每日投入比例<input id="allocation-value" type="range" min="0" max="1" step="0.1" value="${params.allocation}"><output>${params.allocation.toFixed(1)}</output></label><label>原投入<input value="${task.allocation.toFixed(1)}" disabled></label><label>工期规则<input value="固定 ${task.duration} 个工作日，不自动缩短" disabled></label>`;
      document.getElementById("allocation-value").addEventListener("input", (event) => {
        params.allocation = Number(event.target.value);
        renderAll();
      });
    }

    const evaluation = evaluateScenario(scenarioMetrics);
    const validation = document.getElementById("scenario-validation");
    validation.className = `validation-message ${evaluation.passes ? "pass" : "fail"}`;
    validation.textContent = evaluation.passes
      ? `通过“${evaluation.goal.label}”护栏：全部资源冲突已消除，成本增幅 ${evaluation.costPct.toFixed(1)}%，延期 ${evaluation.delay} 个工作日。${scenario.assumption ? ` ${scenario.assumption}` : ""}`
      : `未通过“${evaluation.goal.label}”护栏：${evaluation.reasons.join("；")}。${scenario.assumption}`;
  }

  function renderScenarioPreview(scenario, scenarioMetrics) {
    const costDelta = scenarioMetrics.totalCost - baselineMetrics.totalCost;
    const delay = scenarioMetrics.finishSlot - baselineMetrics.finishSlot;
    document.getElementById("comparison-grid").innerHTML = `
      <div class="comparison-card"><span>超配时点</span><strong>${baselineMetrics.overloadSlots} → ${scenarioMetrics.overloadSlots}</strong><small class="${scenarioMetrics.overloadSlots < baselineMetrics.overloadSlots ? "improve" : "worsen"}">${scenarioMetrics.overloadSlots < baselineMetrics.overloadSlots ? `减少 ${baselineMetrics.overloadSlots - scenarioMetrics.overloadSlots}` : "未改善"}</small></div>
      <div class="comparison-card"><span>计划成本</span><strong>${formatCurrency(baselineMetrics.totalCost)} → ${formatCurrency(scenarioMetrics.totalCost)}</strong><small class="${costDelta <= 0 ? "improve" : "worsen"}">${costDelta === 0 ? "保持不变" : `${costDelta > 0 ? "+" : "−"}${formatCurrency(Math.abs(costDelta))}`}</small></div>
      <div class="comparison-card"><span>完成日期</span><strong>${shortDate(baselineMetrics.finishDate)} → ${shortDate(scenarioMetrics.finishDate)}</strong><small class="${delay <= 0 ? "improve" : "worsen"}">${delay === 0 ? "保持不变" : `延期 ${delay} 个工作日`}</small></div>
      <div class="comparison-card"><span>依赖冲突</span><strong>${baselineMetrics.dependencyConflicts} → ${scenarioMetrics.dependencyConflicts}</strong><small class="${scenarioMetrics.dependencyConflicts === 0 ? "improve" : "worsen"}">${scenarioMetrics.dependencyConflicts === 0 ? "约束可行" : "需要修复"}</small></div>`;
    const enabledPlans = ["DATA", "DESIGN"].filter((resourceId) => state.scenarioEnabled[resourceId]);
    const planNodes = enabledPlans.map((resourceId) => `<div class="dependency-node"><span>${resources[resourceId].name}</span><strong>${escapeHTML(scenarioPlan(resourceId).title)}</strong></div>`).join("<b>＋</b>");
    document.getElementById("dependency-chain").innerHTML = `${planNodes || '<div class="dependency-node"><span>组合情景</span><strong>尚未启用方案</strong></div>'}<b>→</b><div class="dependency-node"><span>最终完成</span><strong>${shortDate(scenarioMetrics.finishDate)}</strong></div><span class="dependency-result">${scenarioMetrics.overloadSlots === 0 ? "冲突已清零" : `仍有 ${scenarioMetrics.overloadSlots} 个超配时点`}</span>`;
  }

  function renderPermissions() {
    const canManage = state.permissions[state.activeRole].permissions;
    const body = document.getElementById("permission-body");
    body.innerHTML = Object.keys(roleLabels).map((role) => `<tr><td>${roleLabels[role]}</td>${["view", "comment", "edit", "permissions"].map((key) => `<td><input type="checkbox" data-permission-role="${role}" data-permission-key="${key}" ${state.permissions[role][key] ? "checked" : ""} ${canManage ? "" : "disabled"} aria-label="${roleLabels[role]} ${key}"></td>`).join("")}</tr>`).join("");
    const history = document.getElementById("permission-history");
    history.innerHTML = state.permissionHistory.length ? state.permissionHistory.slice(-5).reverse().map((item) => `<p>${escapeHTML(item.time)} · ${escapeHTML(item.actor)}：${escapeHTML(item.summary)}</p>`).join("") : "<p>尚无权限变更记录。</p>";
  }

  function renderCostEditor() {
    const rateEditor = document.getElementById("rate-editor");
    const fixedEditor = document.getElementById("fixed-cost-editor");
    rateEditor.innerHTML = Object.keys(resources).map((resourceId) => `<label class="cost-input-row"><span>${resources[resourceId].name}</span><input type="number" min="0" step="50" value="${rateFor(resourceId)}" data-cost-rate="${resourceId}" aria-label="${resources[resourceId].name}单位日成本"></label>`).join("");
    fixedEditor.innerHTML = baselineTasks.map((task) => `<label class="cost-input-row"><span>${task.name}</span><input type="number" min="0" step="100" value="${fixedCostFor(task.id)}" data-fixed-cost="${task.id}" aria-label="${task.name}固定费用"></label>`).join("");
    document.querySelectorAll("[data-cost-rate], [data-fixed-cost]").forEach((input) => input.addEventListener("input", updateCostEditorPreview));
    updateCostEditorPreview();
  }

  function readCostEditorValues() {
    const rates = {};
    const fixedCosts = {};
    document.querySelectorAll("[data-cost-rate]").forEach((input) => { rates[input.dataset.costRate] = Number(input.value); });
    document.querySelectorAll("[data-fixed-cost]").forEach((input) => { fixedCosts[input.dataset.fixedCost] = Number(input.value); });
    return { rates, fixedCosts };
  }

  function updateCostEditorPreview() {
    const values = readCostEditorValues();
    const invalid = [...Object.values(values.rates), ...Object.values(values.fixedCosts)].some((value) => !Number.isFinite(value) || value < 0);
    const target = document.getElementById("cost-editor-preview");
    if (invalid) {
      target.textContent = "请输入大于或等于 0 的有效金额。";
      return;
    }
    const human = baselineTasks.reduce((sum, task) => sum + task.duration * task.allocation * values.rates[task.resource], 0);
    const fixed = baselineTasks.reduce((sum, task) => sum + values.fixedCosts[task.id], 0);
    const current = baselineMetrics.totalCost;
    const next = human + fixed;
    target.innerHTML = `<strong>联动预览：</strong>基线计划成本 ${formatCurrency(current)} → ${formatCurrency(next)}（${next === current ? "不变" : `${next > current ? "+" : "−"}${formatCurrency(Math.abs(next - current))}`}）。保存后首页指标、成本图、情景比较、护栏与导出将同步更新。`;
  }

  function saveCostConfig() {
    if (!state.permissions[state.activeRole].edit) return showToast("当前角色没有修改成本参数的权限。");
    const values = readCostEditorValues();
    const invalid = [...Object.values(values.rates), ...Object.values(values.fixedCosts)].some((value) => !Number.isFinite(value) || value < 0);
    if (invalid) return showToast("成本参数必须是大于或等于 0 的数字。");
    state.costConfig = { ...values, version: `自定义成本草稿 · ${timestamp()}` };
    saveJSON("resource-workbench-cost-config", state.costConfig);
    document.getElementById("cost-dialog").close();
    state.displayMode = "baseline";
    showToast("成本参数已保存，所有相关视图已联动重算。");
    renderAll();
  }

  function resetCosts() {
    if (!state.permissions[state.activeRole].edit) return showToast("当前角色没有修改成本参数的权限。");
    state.costConfig = JSON.parse(JSON.stringify(defaultCostConfig));
    saveJSON("resource-workbench-cost-config", state.costConfig);
    baselineMetrics = calculate(baselineTasks);
    renderAll();
    showToast("已恢复冻结基线成本参数。");
  }

  function renderScheduleEditor() {
    if (!scheduleEditorDraft) scheduleEditorDraft = normalizeScheduleDraft(state.scheduleDraft);
    scheduleEditorDraft = normalizeScheduleDraft(scheduleEditorDraft);
    const deletedIds = new Set(scheduleEditorDraft.deletedTaskIds);
    const activeBaselineTasks = baselineTasks.filter((task) => !deletedIds.has(task.id));
    const activeAdditionalTasks = scheduleEditorDraft.additionalTasks.filter((task) => !deletedIds.has(task.id));
    const targetSelect = document.getElementById("target-finish-date");
    targetSelect.innerHTML = workDates.map((date, index) => `<option value="${index}"${index === Number(scheduleEditorDraft.targetFinishSlot) ? " selected" : ""}>${date}</option>`).join("");
    const body = document.getElementById("schedule-task-body");
    body.innerHTML = activeBaselineTasks.map((task) => {
      const override = scheduleEditorDraft.overrides[task.id] || { start: task.start, duration: task.duration };
      return `<tr><td><strong>${task.id}</strong> ${task.name}</td><td>${resources[task.resource].name}</td><td><select data-schedule-start="${task.id}">${workDates.map((date, index) => `<option value="${index}"${index === Number(override.start) ? " selected" : ""}>${date}</option>`).join("")}</select></td><td><input type="number" min="1" max="20" value="${override.duration}" data-schedule-duration="${task.id}" aria-label="${task.name}工期"></td><td>${task.predecessors.length ? task.predecessors.join("、") : "无"}</td><td><button type="button" class="task-action-button danger" data-delete-task="${task.id}" aria-label="从情景中删除${task.name}">删除</button></td></tr>`;
    }).join("");
    document.getElementById("new-task-start").innerHTML = workDates.map((date, index) => `<option value="${index}">${date}</option>`).join("");
    document.getElementById("new-task-predecessor").innerHTML = `<option value="">无</option>${activeBaselineTasks.concat(activeAdditionalTasks).map((task) => `<option value="${task.id}">${escapeHTML(task.name)}${task.id.startsWith("NT") ? "（新增）" : `（${task.id}）`}</option>`).join("")}`;
    document.getElementById("added-task-list").innerHTML = activeAdditionalTasks.length
      ? activeAdditionalTasks.map((task, index) => `<div class="added-task-item"><div class="added-task-copy"><strong>新增任务 ${index + 1} · ${escapeHTML(task.name)}</strong><span>${resources[task.resource].name} · ${compactDate(workDates[task.start])} · ${task.duration} 天 · 前置 ${task.predecessors[0] ? escapeHTML(taskById(baselineTasks.concat(scheduleEditorDraft.additionalTasks), task.predecessors[0])?.name || task.predecessors[0]) : "无"}</span></div><button type="button" class="task-action-button danger" data-delete-task="${task.id}" aria-label="删除新增任务${escapeHTML(task.name)}">删除</button></div>`).join("")
      : '<div class="empty-state">草稿中还没有新增任务。</div>';
    document.querySelectorAll("[data-schedule-start], [data-schedule-duration], #target-finish-date").forEach((input) => input.addEventListener("input", updateScheduleEditorPreview));
    document.querySelectorAll("[data-delete-task]").forEach((button) => button.addEventListener("click", () => deleteTaskFromScheduleDraft(button.dataset.deleteTask)));
    updateScheduleEditorPreview();
  }

  function readScheduleEditorDraft() {
    const overrides = {};
    const deletedTaskIds = Array.isArray(scheduleEditorDraft.deletedTaskIds) ? [...scheduleEditorDraft.deletedTaskIds] : [];
    baselineTasks.filter((task) => !deletedTaskIds.includes(task.id)).forEach((task) => {
      const startInput = document.querySelector(`[data-schedule-start="${task.id}"]`);
      const durationInput = document.querySelector(`[data-schedule-duration="${task.id}"]`);
      if (!startInput || !durationInput) return;
      const start = Number(startInput.value);
      const duration = Number(durationInput.value);
      if (start !== task.start || duration !== task.duration) overrides[task.id] = { start, duration };
    });
    return {
      overrides,
      additionalTasks: JSON.parse(JSON.stringify(scheduleEditorDraft.additionalTasks || [])),
      deletedTaskIds,
      targetFinishSlot: Number(document.getElementById("target-finish-date").value)
    };
  }

  function tasksFromScheduleDraft(draft) {
    return tasksFromDraft(draft);
  }

  function updateScheduleEditorPreview() {
    if (!scheduleEditorDraft || !document.querySelector("[data-schedule-start]")) return;
    const draft = readScheduleEditorDraft();
    const invalid = Object.values(draft.overrides).some((item) => !Number.isFinite(item.start) || !Number.isFinite(item.duration) || item.duration < 1);
    const target = document.getElementById("schedule-editor-preview");
    if (invalid) {
      target.textContent = "开始日期和工期必须是有效值，工期至少为 1 个工作日。";
      return;
    }
    const tasks = tasksFromScheduleDraft(draft);
    const metrics = calculate(tasks);
    const targetDate = workDates[draft.targetFinishSlot];
    const meetsTarget = metrics.finishSlot - 1 <= draft.targetFinishSlot;
    target.innerHTML = `<strong>草稿预览：</strong>${tasks.length} 个任务；预计完成 ${shortDate(metrics.finishDate)}；目标完成 ${shortDate(targetDate)}；计划成本 ${formatCurrency(metrics.totalCost)}；超配时点 ${metrics.overloadSlots}。<strong>${meetsTarget ? " 当前排期满足目标日期。" : ` 当前排期晚于目标 ${metrics.finishSlot - 1 - draft.targetFinishSlot} 个工作日。`}</strong>`;
  }

  function addTaskToScheduleDraft() {
    const currentDraft = readScheduleEditorDraft();
    scheduleEditorDraft.overrides = currentDraft.overrides;
    scheduleEditorDraft.targetFinishSlot = currentDraft.targetFinishSlot;
    const name = cleanUserText(document.getElementById("new-task-name").value);
    const resource = document.getElementById("new-task-resource").value;
    const start = Number(document.getElementById("new-task-start").value);
    const duration = Number(document.getElementById("new-task-duration").value);
    const allocation = Number(document.getElementById("new-task-allocation").value);
    const predecessor = document.getElementById("new-task-predecessor").value;
    const fixedCost = Number(document.getElementById("new-task-fixed-cost").value);
    if (!name || !Number.isFinite(duration) || duration < 1 || !Number.isFinite(allocation) || allocation < 0 || !Number.isFinite(fixedCost) || fixedCost < 0) {
      showToast("请完整填写任务名称、工期、投入和固定费用。");
      return;
    }
    const id = nextNewTaskId();
    scheduleEditorDraft.additionalTasks.push({ id, name, start, duration, predecessors: predecessor ? [predecessor] : [], resource, allocation, fixedCost });
    renderScheduleEditor();
    document.getElementById("new-task-name").value = "";
    showToast("新任务已加入排期草稿，保存后进入情景预览。");
  }

  function deleteTaskFromScheduleDraft(taskId) {
    const currentDraft = readScheduleEditorDraft();
    scheduleEditorDraft = normalizeScheduleDraft(currentDraft);
    const isAdditionalTask = scheduleEditorDraft.additionalTasks.some((task) => task.id === taskId);
    if (isAdditionalTask) {
      scheduleEditorDraft.additionalTasks = scheduleEditorDraft.additionalTasks.filter((task) => task.id !== taskId);
      scheduleEditorDraft.additionalTasks.forEach((task) => { task.predecessors = task.predecessors.filter((id) => id !== taskId); });
    } else if (!scheduleEditorDraft.deletedTaskIds.includes(taskId)) {
      scheduleEditorDraft.deletedTaskIds.push(taskId);
    }
    scheduleEditorDraft.additionalTasks.forEach((task) => { task.predecessors = task.predecessors.filter((id) => id !== taskId); });
    delete scheduleEditorDraft.overrides[taskId];
    if (state.selectedTask === taskId) state.selectedTask = null;
    renderScheduleEditor();
    showToast(isAdditionalTask ? "新增任务已从草稿中彻底移除；点击保存后更新所有视图。" : "基线任务已从当前情景移除；点击保存后更新所有视图，冻结基线不变。");
  }

  function saveScheduleDraft() {
    if (!state.permissions[state.activeRole].edit) return showToast("当前角色没有修改排期的权限。");
    state.scheduleDraft = normalizeScheduleDraft(readScheduleEditorDraft());
    saveJSON("resource-workbench-schedule-draft", state.scheduleDraft);
    state.dependencyLayouts.scenario = {};
    saveJSON("resource-workbench-dependency-layouts-v1", state.dependencyLayouts);
    document.getElementById("schedule-dialog").close();
    scheduleEditorDraft = null;
    state.displayMode = "scenario";
    showToast("排期草稿已保存，相关视图已切换到情景预览并联动重算。");
    renderAll();
  }

  function resetScheduleDraft() {
    scheduleEditorDraft = normalizeScheduleDraft(defaultScheduleDraft);
    renderScheduleEditor();
    showToast("编辑器已恢复原排期；点击保存后才会替换当前草稿。");
  }

  function applyRoleCapabilities() {
    const permissions = state.permissions[state.activeRole];
    document.getElementById("open-permissions").disabled = !permissions.permissions;
    document.getElementById("open-cost-editor").disabled = !permissions.edit;
    document.getElementById("open-schedule-editor").disabled = !permissions.edit;
    document.getElementById("discard-scenario").disabled = !permissions.edit;
    document.getElementById("dependency-drag-toggle").disabled = !permissions.edit;
    document.getElementById("reset-dependency-layout").disabled = !permissions.edit;
    document.getElementById("feedback-text").disabled = !permissions.comment;
    document.querySelector("#feedback-form button[type='submit']").disabled = !permissions.comment;
    document.querySelectorAll("#conflicts-view input, #conflicts-view select, #conflicts-view button:not([data-view-target])").forEach((element) => {
      if (element.id === "reset-scenario") return;
      element.disabled = !permissions.edit;
    });
    document.getElementById("feedback-role-note").textContent = `${roleLabels[state.activeRole]}：${permissions.comment ? "可以查看并提交反馈" : "当前只能查看，不能提交反馈"}；${permissions.edit ? "可以编辑情景" : "不能编辑情景"}。`;
  }

  function renderFeedback() {
    const list = document.getElementById("feedback-list");
    if (!state.feedback.length) {
      list.innerHTML = '<div class="empty-state">尚无讨论记录。请用左侧表单提交第一条真实反馈。</div>';
      return;
    }
    list.innerHTML = state.feedback.slice().reverse().map((item) => `<article class="feedback-item"><div class="feedback-item-header"><strong>${escapeHTML(item.author)}</strong><span class="status-chip">${escapeHTML(item.status)}</span></div><p>${escapeHTML(item.text)}</p><div class="feedback-meta"><span>${escapeHTML(item.target)}</span><span>${escapeHTML(item.time)}</span></div><div class="feedback-actions"><button type="button" data-feedback-status="已采纳" data-feedback-id="${item.id}">标记已采纳</button><button type="button" data-feedback-status="已关闭" data-feedback-id="${item.id}">关闭</button></div></article>`).join("");
    list.querySelectorAll("[data-feedback-status]").forEach((button) => button.addEventListener("click", () => {
      const item = state.feedback.find((entry) => entry.id === button.dataset.feedbackId);
      if (item) item.status = button.dataset.feedbackStatus;
      saveJSON("resource-workbench-feedback", state.feedback);
      renderAll();
    }));
  }

  function renderDecisions() {
    const list = document.getElementById("decision-log");
    if (!state.decisions.length) {
      list.innerHTML = '<div class="empty-state">尚无已确认决策。请先在“冲突处理”中确认一个情景。</div>';
      return;
    }
    list.innerHTML = state.decisions.slice().reverse().map((item) => `<article class="decision-item"><div class="decision-item-header"><strong>${escapeHTML(item.title)}</strong><span class="status-chip">已确认</span></div><p>${escapeHTML(item.summary)}</p><div class="decision-meta"><span>${escapeHTML(item.actor)}</span><span>${escapeHTML(item.time)}</span><span>${escapeHTML(item.goal)}</span></div></article>`).join("");
  }

  function savePermissions() {
    if (!state.permissions[state.activeRole].permissions) {
      showToast("当前角色没有调整权限的权限。");
      return;
    }
    const next = JSON.parse(JSON.stringify(state.permissions));
    document.querySelectorAll("[data-permission-role]").forEach((input) => {
      next[input.dataset.permissionRole][input.dataset.permissionKey] = input.checked;
    });
    const adminCount = Object.values(next).filter((permission) => permission.permissions).length;
    if (!adminCount) {
      showToast("至少保留一个能够调整权限的角色。");
      return;
    }
    const changes = [];
    Object.keys(next).forEach((role) => Object.keys(next[role]).forEach((key) => {
      if (next[role][key] !== state.permissions[role][key]) changes.push(`${roleLabels[role]}的${permissionLabel(key)}设为${next[role][key] ? "允许" : "禁止"}`);
    }));
    if (!changes.length) {
      showToast("权限没有变化。");
      return;
    }
    state.permissions = next;
    state.permissionHistory.push({ time: timestamp(), actor: roleLabels[state.activeRole], summary: changes.join("；") });
    saveJSON("resource-workbench-permissions", state.permissions);
    saveJSON("resource-workbench-permission-history", state.permissionHistory);
    document.getElementById("permissions-dialog").close();
    showToast("权限已更新并记录变更。");
    renderAll();
  }

  function permissionLabel(key) {
    return { view: "查看权限", comment: "评论权限", edit: "编辑情景权限", permissions: "调整权限" }[key];
  }

  function timestamp() {
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date());
  }

  function confirmScenario() {
    if (!state.permissions[state.activeRole].edit) {
      showToast("当前角色没有编辑情景的权限。");
      return;
    }
    const scenario = buildScenario();
    const metrics = calculate(scenario.tasks, scenario);
    const evaluation = evaluateScenario(metrics);
    if (!evaluation.passes) {
      showToast(`当前方案未通过“${evaluation.goal.label}”护栏，不能确认。`);
      return;
    }
    const enabledPlans = ["DATA", "DESIGN"].filter((resourceId) => state.scenarioEnabled[resourceId]).map((resourceId) => `${resources[resourceId].name}：${scenarioPlan(resourceId).title}`);
    const decision = {
      id: `decision-${Date.now()}`,
      title: `组合情景 · ${enabledPlans.join(" + ")}`,
      actor: `${roleLabels[state.activeRole]}（演示角色）`,
      time: timestamp(),
      goal: evaluation.goal.label,
      summary: `超配时点 ${baselineMetrics.overloadSlots}→${metrics.overloadSlots}；计划成本 ${formatCurrency(baselineMetrics.totalCost)}→${formatCurrency(metrics.totalCost)}；完成日期 ${shortDate(baselineMetrics.finishDate)}→${shortDate(metrics.finishDate)}。`
    };
    state.decisions.push(decision);
    saveJSON("resource-workbench-decisions-v1", state.decisions);
    state.displayMode = "scenario";
    showToast("情景已确认并写入决策记录。");
    renderAll();
  }

  function exportDecision() {
    const scenario = buildScenario();
    const scenarioMetrics = calculate(scenario.tasks, scenario);
    const payload = {
      exported_at: new Date().toISOString(),
      data_origin: "synthetic",
      project: "新产品上市筹备（合成案例）",
      rule_version: "v0.1",
      calendar: { start_date: "2026-11-02", working_weekdays: [0, 1, 2, 3, 4], holidays: ["2026-11-18"], holiday_note: "演示用合成休息日，不代表官方节假日" },
      role: roleLabels[state.activeRole],
      goal: currentGoal(),
      baseline: summaryForExport(baselineMetrics),
      scenario: {
        mode: "combined",
        plans: ["DATA", "DESIGN"].map((resourceId) => ({ resource: resources[resourceId].name, enabled: state.scenarioEnabled[resourceId], option: state.scenarioOptions[resourceId], parameters: state.parameters[resourceId] })),
        summary: summaryForExport(scenarioMetrics),
        tasks: scenario.tasks
      },
      cost_config: state.costConfig,
      schedule_draft: state.scheduleDraft,
      feedback: state.feedback,
      decisions: state.decisions,
      permissions: state.permissions,
      limitations: ["固定工期；增加投入不自动缩短工期", "仅支持完成后开始（FS）依赖", "浏览器本地演示，不是生产级账号或实时协作系统"]
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `决策记录-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("决策记录已导出为 JSON。 ");
  }

  function summaryForExport(metrics) {
    return { finish_date: metrics.finishDate, planned_cost_cny: metrics.totalCost, overload_resource_slots: metrics.overloadSlots, dependency_conflicts: metrics.dependencyConflicts };
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-target]");
    if (viewButton) showView(viewButton.dataset.viewTarget);
  });

  document.querySelectorAll("[data-display-mode]").forEach((button) => button.addEventListener("click", () => {
    state.displayMode = button.dataset.displayMode;
    document.querySelectorAll("[data-display-mode]").forEach((item) => item.classList.toggle("is-selected", item === button));
    renderAll();
  }));

  document.getElementById("discard-scenario").addEventListener("click", () => {
    state.scenarioEnabled = { DATA: false, DESIGN: false };
    state.displayMode = "baseline";
    state.selectedTask = null;
    showToast("已关闭组合方案并回到冻结基线；排期草稿仍保留，可再次进入情景预览。");
    renderAll();
  });

  document.getElementById("dependency-drag-toggle").addEventListener("change", (event) => {
    if (!state.permissions[state.activeRole].edit) return;
    state.dependencyDragEnabled = event.target.checked;
    renderAll();
    showToast(state.dependencyDragEnabled ? "已开启节点拖动；连线会实时跟随。" : "已关闭节点拖动。");
  });

  document.getElementById("reset-dependency-layout").addEventListener("click", () => {
    if (!state.permissions[state.activeRole].edit) return showToast("当前角色不能调整依赖图布局。");
    const layoutKey = state.displayMode === "scenario" ? "scenario" : "baseline";
    state.dependencyLayouts[layoutKey] = {};
    saveJSON("resource-workbench-dependency-layouts-v1", state.dependencyLayouts);
    renderAll();
    showToast("依赖图已按层级自动整理。");
  });

  document.querySelectorAll("[data-goal]").forEach((button) => button.addEventListener("click", () => {
    if (!state.permissions[state.activeRole].edit) return showToast("当前角色不能调整情景目标。");
    state.goal = button.dataset.goal;
    document.querySelectorAll("[data-goal]").forEach((item) => item.classList.toggle("is-selected", item === button));
    document.getElementById("custom-guardrails").hidden = state.goal !== "custom";
    document.getElementById("guardrail-status").textContent = currentGoal().label;
    renderAll();
  }));

  document.getElementById("custom-cost-limit").addEventListener("input", (event) => {
    state.customCostLimit = Number(event.target.value);
    document.getElementById("custom-cost-output").textContent = `${state.customCostLimit}%`;
    renderAll();
  });

  document.getElementById("custom-delay-limit").addEventListener("input", (event) => {
    state.customDelayLimit = Number(event.target.value);
    document.getElementById("custom-delay-output").textContent = `${state.customDelayLimit} 个工作日`;
    renderAll();
  });

  document.getElementById("gantt-zoom").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    document.getElementById("gantt").style.setProperty("--zoom", value / 100);
    document.getElementById("gantt-zoom-value").textContent = `${value}%`;
  });

  document.getElementById("toggle-cost-detail").addEventListener("click", (event) => {
    const detail = document.getElementById("cost-detail");
    detail.hidden = !detail.hidden;
    event.currentTarget.textContent = detail.hidden ? "查看明细" : "收起明细";
  });

  document.getElementById("active-role").addEventListener("change", (event) => {
    state.activeRole = event.target.value;
    showToast(`已切换为${roleLabels[state.activeRole]}。`);
    renderAll();
  });

  document.getElementById("open-permissions").addEventListener("click", () => {
    renderPermissions();
    document.getElementById("permissions-dialog").showModal();
  });
  document.getElementById("open-cost-editor").addEventListener("click", () => {
    if (!state.permissions[state.activeRole].edit) return showToast("当前角色没有修改成本参数的权限。");
    renderCostEditor();
    document.getElementById("cost-dialog").showModal();
  });
  document.getElementById("open-schedule-editor").addEventListener("click", () => {
    if (!state.permissions[state.activeRole].edit) return showToast("当前角色没有修改排期的权限。");
    scheduleEditorDraft = normalizeScheduleDraft(state.scheduleDraft);
    renderScheduleEditor();
    document.getElementById("schedule-dialog").showModal();
  });
  document.getElementById("save-permissions").addEventListener("click", savePermissions);
  document.getElementById("save-costs").addEventListener("click", saveCostConfig);
  document.getElementById("reset-costs").addEventListener("click", resetCosts);
  document.getElementById("add-task-draft").addEventListener("click", addTaskToScheduleDraft);
  document.getElementById("save-schedule").addEventListener("click", saveScheduleDraft);
  document.getElementById("reset-schedule").addEventListener("click", resetScheduleDraft);
  document.getElementById("schedule-dialog").addEventListener("close", () => { scheduleEditorDraft = null; });
  document.getElementById("export-decision").addEventListener("click", exportDecision);
  document.getElementById("confirm-scenario").addEventListener("click", confirmScenario);
  document.getElementById("save-draft").addEventListener("click", () => showToast("情景草稿已保留在当前会话。"));
  document.getElementById("reset-scenario").addEventListener("click", () => {
    state.parameters.DATA = { staggerStart: 5, extraCapacity: 0.3, allocation: 0.3 };
    state.parameters.DESIGN = { staggerStart: 11, extraCapacity: 0.4, allocation: 0.2 };
    state.scenarioOptions = { DATA: "stagger", DESIGN: "capacity" };
    state.scenarioEnabled = { DATA: true, DESIGN: true };
    showToast("情景已重置，基线未改变。");
    renderAll();
  });

  document.getElementById("feedback-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.permissions[state.activeRole].comment) return showToast("当前角色没有评论权限。");
    const text = document.getElementById("feedback-text").value.trim();
    if (!text) return;
    const targetSelect = document.getElementById("feedback-target");
    state.feedback.push({ id: `feedback-${Date.now()}`, author: roleLabels[state.activeRole], time: timestamp(), target: targetSelect.options[targetSelect.selectedIndex].text, text, status: "待处理" });
    saveJSON("resource-workbench-feedback", state.feedback);
    event.target.reset();
    showToast("反馈已加入协作 Dashboard。 ");
    renderAll();
  });

  document.getElementById("clear-feedback").addEventListener("click", () => {
    if (!state.permissions[state.activeRole].comment) return showToast("当前角色不能清空反馈。");
    state.feedback = [];
    saveJSON("resource-workbench-feedback", state.feedback);
    showToast("演示反馈已清空。");
    renderAll();
  });

  document.getElementById("clear-decisions").addEventListener("click", () => {
    if (!state.permissions[state.activeRole].edit) return showToast("当前角色不能清空演示决策。");
    state.decisions = [];
    saveJSON("resource-workbench-decisions-v1", state.decisions);
    showToast("演示决策已清空。");
    renderAll();
  });

  document.getElementById("guardrail-status").textContent = currentGoal().label;
  renderAll();
})();
