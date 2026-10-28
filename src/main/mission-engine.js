'use strict';

/**
 * Capri Autonomous Mission Engine
 * Orchestrates multi-step missions, task breakdown, dependency resolution,
 * safe execution using real Capri tools, persistent state, risk levels, and pause/resume.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { globalBus } = require('../shared/events');

const MISSION_STATES = Object.freeze({
  DRAFT: 'draft',
  PLANNING: 'planning',
  AWAITING_APPROVAL: 'awaiting_approval',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

const TASK_STATES = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});

const RISK_LEVELS = Object.freeze({
  LOW: 'low',         // Read notes, search web, list apps
  MEDIUM: 'medium',   // Open site, open app, inspect page
  HIGH: 'high',       // Close apps, run terminal commands, write notes
  CRITICAL: 'critical', // Delete files, system configuration changes
});

class MissionEngine {
  constructor(options = {}) {
    this.bus = options.bus || globalBus;
    this.tools = options.tools || {};
    this.storageFile = options.storageFile || path.join(
      app?.getPath ? app.getPath('userData') : process.cwd(),
      'missions.json'
    );
    this.missions = new Map(); // id -> Mission
    this.activeMissionId = null;
    this._stepTimer = null;
    this._load();
  }

  setTools(tools) {
    this.tools = { ...this.tools, ...tools };
  }

  _load() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = JSON.parse(fs.readFileSync(this.storageFile, 'utf8'));
        if (Array.isArray(raw)) {
          for (const m of raw) {
            // Restore recovered state
            if (m.status === MISSION_STATES.RUNNING) {
              m.status = MISSION_STATES.PAUSED; // resume on explicit request
            }
            if (!Array.isArray(m.tasks) || m.tasks.length === 0) {
              m.status = MISSION_STATES.FAILED;
              m.error = 'Mission has no executable tasks';
            }
            this.missions.set(m.id, m);
          }
        }
      }
    } catch {
      // fresh start
    }
  }

  _save() {
    try {
      const data = Array.from(this.missions.values());
      fs.mkdirSync(path.dirname(this.storageFile), { recursive: true });
      fs.writeFileSync(this.storageFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[capri:mission] failed to save missions:', err.message);
    }
  }

  /**
   * Create a new mission from an objective and tasks
   */
  createMission({ title, objective, tasks, context = {}, approvalRequired = false } = {}) {
    objective = String(objective || '').trim();
    if (!objective) throw new Error('Mission objective is required');
    const unfinished = [...this.missions.values()].find((mission) => (
      ![MISSION_STATES.COMPLETED, MISSION_STATES.FAILED, MISSION_STATES.CANCELLED].includes(mission.status)
    ));
    if (unfinished) throw new Error(`Finish or cancel the active mission first: ${unfinished.title}`);
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('A mission needs at least one executable task');
    }
    if (tasks.length > 10) throw new Error('A mission can contain at most 10 tasks');

    const taskIds = new Set();
    for (const [idx, task] of tasks.entries()) {
      if (!task || typeof task !== 'object' || Array.isArray(task)) {
        throw new Error(`Invalid mission task at position ${idx + 1}`);
      }
      const id = String(task?.id || `task-${idx + 1}`);
      if (taskIds.has(id)) throw new Error(`Duplicate mission task id: ${id}`);
      taskIds.add(id);
      const tool = task?.tool || 'none';
      if (tool !== 'none' && typeof this.tools[tool] !== 'function') {
        throw new Error(`Mission tool is unavailable: ${tool}`);
      }
      if (task?.risk && !Object.values(RISK_LEVELS).includes(task.risk)) {
        throw new Error(`Invalid risk level for task ${id}`);
      }
      if (task?.args && (typeof task.args !== 'object' || Array.isArray(task.args))) {
        throw new Error(`Task arguments must be an object: ${id}`);
      }
      if (task?.dependencies != null && !Array.isArray(task.dependencies)) {
        throw new Error(`Task dependencies must be a list: ${id}`);
      }
    }
    if (!tasks.some((task) => task.tool && task.tool !== 'none')) {
      throw new Error('A mission needs at least one real tool action');
    }
    for (const task of tasks) {
      for (const dependency of task.dependencies || []) {
        if (!taskIds.has(dependency) || dependency === task.id) {
          throw new Error(`Invalid dependency for task ${task.id}`);
        }
      }
    }
    const byId = new Map(tasks.map((task, idx) => [String(task.id || `task-${idx + 1}`), task]));
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
      if (visiting.has(id)) throw new Error('Mission task dependencies contain a cycle');
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of byId.get(id)?.dependencies || []) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of taskIds) visit(id);

    const id = `msn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const formattedTasks = tasks.map((t, idx) => ({
      id: t.id || `task-${idx + 1}`,
      description: t.description || `Task ${idx + 1}`,
      tool: t.tool || 'none',
      args: t.args || {},
      status: TASK_STATES.PENDING,
      risk: t.risk || RISK_LEVELS.LOW,
      expected: t.expected || '',
      observed: null,
      error: null,
      attempts: 0,
      maxAttempts: Number.isInteger(t.maxAttempts) ? Math.max(1, Math.min(3, t.maxAttempts)) : 2,
      dependencies: t.dependencies || [],
      startedAt: null,
      completedAt: null,
    }));

    const mission = {
      id,
      title: title || objective.slice(0, 40),
      objective,
      status: MISSION_STATES.PLANNING,
      tasks: formattedTasks,
      context,
      approvalRequired: Boolean(approvalRequired),
      approved: false,
      currentStepIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      error: null,
      finalReport: null,
    };

    // Determine initial state: if any initial task is HIGH/CRITICAL, require approval
    const needsApproval = mission.tasks.some((t) => (
      t.risk === RISK_LEVELS.HIGH || t.risk === RISK_LEVELS.CRITICAL
    ));
    if (needsApproval) {
      mission.pendingTaskId = mission.tasks.find((task) => (
        task.risk === RISK_LEVELS.HIGH || task.risk === RISK_LEVELS.CRITICAL
      ))?.id || null;
    }

    mission.status = needsApproval || mission.approvalRequired
      ? MISSION_STATES.AWAITING_APPROVAL
      : MISSION_STATES.RUNNING;
    this.missions.set(id, mission);
    this._save();

    this.bus.emit('mission.started', { id, title: mission.title, status: mission.status }, 'mission-engine');

    if (mission.status === MISSION_STATES.RUNNING) {
      this.activeMissionId = id;
      this._scheduleExecution();
    }

    return mission;
  }

  getMission(id) {
    return this.missions.get(id) || null;
  }

  getActiveMission() {
    return this.activeMissionId ? this.missions.get(this.activeMissionId) : null;
  }

  listMissions() {
    return Array.from(this.missions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  approveMission(id) {
    const m = this.missions.get(id);
    if (!m || m.status !== MISSION_STATES.AWAITING_APPROVAL) return false;
    if (m.pendingTaskId) {
      const task = m.tasks.find((item) => item.id === m.pendingTaskId);
      if (!task) return false;
      task.approved = true;
      m.pendingTaskId = null;
    } else {
      m.approved = true;
    }
    m.status = MISSION_STATES.RUNNING;
    m.updatedAt = Date.now();
    this.activeMissionId = id;
    this._save();
    this.bus.emit('mission.progress', { id, status: m.status }, 'mission-engine');
    this._scheduleExecution();
    return true;
  }

  pauseMission(id) {
    const m = this.missions.get(id);
    if (!m) return false;
    m.status = MISSION_STATES.PAUSED;
    m.updatedAt = Date.now();
    if (this.activeMissionId === id) this.activeMissionId = null;
    this._save();
    this.bus.emit('mission.progress', { id, status: m.status }, 'mission-engine');
    return true;
  }

  resumeMission(id) {
    const m = this.missions.get(id);
    if (!m || m.status !== MISSION_STATES.PAUSED) return false;
    m.status = MISSION_STATES.RUNNING;
    m.updatedAt = Date.now();
    this.activeMissionId = id;
    this._save();
    this.bus.emit('mission.progress', { id, status: m.status }, 'mission-engine');
    this._scheduleExecution();
    return true;
  }

  cancelMission(id) {
    const m = this.missions.get(id);
    if (!m) return false;
    m.status = MISSION_STATES.CANCELLED;
    m.updatedAt = Date.now();
    if (this.activeMissionId === id) this.activeMissionId = null;
    this._save();
    this.bus.emit('mission.failed', { id, status: m.status, reason: 'cancelled_by_user' }, 'mission-engine');
    return true;
  }

  _scheduleExecution() {
    if (this._stepTimer) return;
    this._stepTimer = setTimeout(() => {
      this._stepTimer = null;
      this._executeStep().catch((err) => {
        console.error('[capri:mission] step execution error:', err);
      });
    }, 150);
  }

  async _executeStep() {
    const mission = this.getActiveMission();
    if (!mission || mission.status !== MISSION_STATES.RUNNING) return;

    if (mission.approvalRequired && !mission.approved) {
      mission.status = MISSION_STATES.AWAITING_APPROVAL;
      this._save();
      this.bus.emit('mission.progress', { id: mission.id, status: mission.status, approval: 'plan' }, 'mission-engine');
      return;
    }

    // Find next eligible pending task whose dependencies are satisfied
    const nextTask = mission.tasks.find((t) => {
      if (t.status !== TASK_STATES.PENDING) return false;
      const depsSatisfied = t.dependencies.every((depId) => {
        const dep = mission.tasks.find((k) => k.id === depId);
        return dep && dep.status === TASK_STATES.COMPLETED;
      });
      return depsSatisfied;
    });

    if (!nextTask) {
      // Check if all completed or any failed
      const anyFailed = mission.tasks.some((t) => t.status === TASK_STATES.FAILED);
      const allDone = mission.tasks.every((t) => t.status === TASK_STATES.COMPLETED || t.status === TASK_STATES.SKIPPED);

      if (allDone) {
        mission.status = MISSION_STATES.COMPLETED;
        mission.completedAt = Date.now();
        mission.finalReport = this._buildReport(mission);
        this.activeMissionId = null;
        this._save();
        this.bus.emit('mission.completed', { id: mission.id, report: mission.finalReport }, 'mission-engine');
        return;
      }

      if (anyFailed) {
        mission.status = MISSION_STATES.FAILED;
        mission.error = 'One or more tasks failed dependency resolution';
        this.activeMissionId = null;
        this._save();
        this.bus.emit('mission.failed', { id: mission.id, error: mission.error }, 'mission-engine');
        return;
      }

      return;
    }

    // Check if task needs individual approval
    if ((nextTask.risk === RISK_LEVELS.HIGH || nextTask.risk === RISK_LEVELS.CRITICAL) && !nextTask.approved) {
      mission.status = MISSION_STATES.AWAITING_APPROVAL;
      mission.pendingTaskId = nextTask.id;
      this._save();
      this.bus.emit('mission.progress', { id: mission.id, status: mission.status, pendingTask: nextTask }, 'mission-engine');
      return;
    }

    // Execute the task
    nextTask.status = TASK_STATES.IN_PROGRESS;
    nextTask.startedAt = Date.now();
    nextTask.attempts++;
    this._save();

    this.bus.emit('mission.progress', {
      id: mission.id,
      task: nextTask.id,
      description: nextTask.description,
      status: nextTask.status,
    }, 'mission-engine');

    try {
      const result = await this._dispatchTool(nextTask.tool, nextTask.args);
      if (result === false || result?.ok === false) {
        throw new Error(result?.error || 'The tool did not complete successfully');
      }
      nextTask.status = TASK_STATES.COMPLETED;
      nextTask.observed = result;
      nextTask.completedAt = Date.now();
    } catch (err) {
      nextTask.error = err.message;
      if (nextTask.attempts < nextTask.maxAttempts) {
        nextTask.status = TASK_STATES.PENDING; // retry
      } else {
        nextTask.status = TASK_STATES.FAILED;
      }
    }

    mission.updatedAt = Date.now();
    this._save();

    // Proceed to next step
    this._scheduleExecution();
  }

  async _dispatchTool(toolName, args) {
    if (!toolName || toolName === 'none') {
      return { ok: true, message: 'Step completed without tool invocation' };
    }

    const handler = this.tools[toolName];
    if (typeof handler !== 'function') {
      throw new Error(`Tool "${toolName}" is not registered or unavailable`);
    }

    return await handler(args);
  }

  _buildReport(mission) {
    const completed = mission.tasks.filter((t) => t.status === TASK_STATES.COMPLETED).length;
    const total = mission.tasks.length;
    return {
      title: mission.title,
      objective: mission.objective,
      totalTasks: total,
      completedTasks: completed,
      durationMs: Date.now() - mission.createdAt,
      tasks: mission.tasks.map((t) => ({
        id: t.id,
        desc: t.description,
        status: t.status,
        result: t.observed,
      })),
    };
  }
}

const missionEngine = new MissionEngine();

module.exports = {
  MISSION_STATES,
  TASK_STATES,
  RISK_LEVELS,
  MissionEngine,
  missionEngine,
};
