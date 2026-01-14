'use client';

import { useEffect, useRef } from 'react';
import { AutomationRule, Condition, Trigger, UserVariable } from '@/types/automation';
import { SwitchBotDevice } from '@/lib/switchbot';

interface AutomationEngineProps {
    devices: SwitchBotDevice[];
}

// 実行されたことを記録するマップ（連打防止）
const executedRules = new Map<string, number>();

interface DeviceStatus {
    power?: string;
    temperature?: number;
    humidity?: number;
    CO2?: number;
    co2?: number;
    [key: string]: string | number | boolean | undefined;
}

// ミリ秒付きのタイムスタンプを取得
const getTimestamp = () => {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const ss = now.getSeconds().toString().padStart(2, '0');
    const sss = now.getMilliseconds().toString().padStart(3, '0');
    return `${hh}:${mm}:${ss}.${sss}`;
};

// Helper to check time range
const checkTimeRange = (currentTime: string, currentDay: number, condition: Condition) => {
    if (condition.startTime && condition.endTime) {
        if (currentTime < condition.startTime || currentTime > condition.endTime) {
            return false;
        }
    }
    if (condition.days && condition.days.length > 0) {
        if (!condition.days.includes(currentDay)) {
            return false;
        }
    }
    return true;
};

export default function AutomationEngine({ devices }: AutomationEngineProps) {
    const rulesRef = useRef<AutomationRule[]>([]);
    const varsRef = useRef<Map<string, boolean>>(new Map());
    const statusRef = useRef<Map<string, DeviceStatus>>(new Map());
    const lastStatusRef = useRef<Map<string, DeviceStatus>>(new Map());

    // ---------------------------------------------------------
    // ルール評価ロジック (共通)
    // ---------------------------------------------------------
    const evaluateRules = async () => {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;
        const currentDay = now.getDay();

        const activeRules = rulesRef.current.filter((r) => r.enabled);

        for (const rule of activeRules) {
            let isTriggered = false;
            const triggers = rule.triggers || [];

            for (const trigger of triggers) {
                if (trigger.type === 'schedule') {
                    const triggerTime = (trigger.time || '').substring(0, 5);
                    if (triggerTime === currentTime) {
                        if (!trigger.days || trigger.days.length === 0 || trigger.days.includes(currentDay)) {
                            console.log(`✅ [${getTimestamp()}] Rule "${rule.name}" triggered by schedule: ${triggerTime}`);
                            isTriggered = true;
                            break;
                        }
                    }
                } else if (trigger.type === 'variable') {
                    const val = varsRef.current.get(trigger.variableId || '');
                    if (val !== undefined && val === trigger.variableValue) {
                        console.log(`✅ [${getTimestamp()}] Rule "${rule.name}" triggered by variable: ${trigger.variableId}`);
                        isTriggered = true;
                        break;
                    }
                } else if (trigger.type === 'sensor' && trigger.deviceId) {
                    const status = statusRef.current.get(trigger.deviceId);
                    const prop = trigger.property || 'temperature';
                    if (status && status[prop] !== undefined) {
                        const val = status[prop];
                        const threshold = trigger.threshold || 0;
                        if (typeof val === 'number') {
                            if (trigger.operator === '>' && val >= threshold) isTriggered = true;
                            if (trigger.operator === '<' && val <= threshold) isTriggered = true;
                        }
                        if (isTriggered) {
                            console.log(`✅ [${getTimestamp()}] Rule "${rule.name}" triggered by sensor: ${trigger.deviceId} val=${val}`);
                            // History Logging
                            try {
                                fetch('/api/history', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        type: 'automation',
                                        message: `オートメーション「${rule.name}」が実行されました`,
                                        details: {
                                            ruleId: rule.id,
                                            trigger: trigger,
                                            deviceId: trigger.deviceId,
                                            deviceName: devices.find(d => d.deviceId === trigger.deviceId)?.deviceName,
                                            source: 'Automation'
                                        }
                                    })
                                }).catch(e => console.error(`[${getTimestamp()}] History log error:`, e));
                            } catch { }
                            break;
                        }
                    }
                } else if (trigger.type === 'device' && trigger.deviceId) {
                    const status = statusRef.current.get(trigger.deviceId);
                    if (status && trigger.state === status.power) {
                        console.log(`✅ [${getTimestamp()}] Rule "${rule.name}" triggered by device: ${trigger.deviceId} state=${status.power}`);
                        isTriggered = true;
                        break;
                    }
                }
            }

            if (!isTriggered) continue;

            // Condition Check
            let conditionsMet = true;
            const conditions = rule.conditions || [];
            const mode = rule.conditionMode || 'AND';

            if (conditions.length > 0) {
                const checkCond = (c: Condition) => {
                    if (c.type === 'timeRange') return checkTimeRange(currentTime, currentDay, c);
                    if (c.type === 'variable') {
                        const val = varsRef.current.get(c.variableId || '');
                        return val !== undefined && val === c.variableValue;
                    }
                    if (c.type === 'sensor' && c.deviceId) {
                        const status = statusRef.current.get(c.deviceId);
                        const prop = c.property || 'temperature';
                        if (!status || status[prop] === undefined) return false;
                        const val = status[prop];
                        if (typeof val === 'number') {
                            if (c.operator === '>' && val >= (c.threshold || 0)) return true;
                            if (c.operator === '<' && val <= (c.threshold || 0)) return true;
                        }
                        return false;
                    }
                    if (c.type === 'device' && c.deviceId) {
                        const status = statusRef.current.get(c.deviceId);
                        return status && c.state === status.power;
                    }
                    return false;
                };

                if (mode === 'AND') {
                    conditionsMet = conditions.every(checkCond);
                } else {
                    conditionsMet = conditions.some(checkCond);
                }
            }

            if (!conditionsMet) {
                // console.log(`❌ [${getTimestamp()}] Rule "${rule.name}" conditions not met.`);
                continue;
            }

            // Execution Trace (Cooldown)
            const lastExec = executedRules.get(rule.id) || 0;
            const nowMs = now.getTime();
            const cooldown = 65 * 1000;

            if (nowMs - lastExec > cooldown) {
                // Mark as executed
                executedRules.set(rule.id, nowMs);

                console.log(`🚀 [${getTimestamp()}] Executing Actions for: ${rule.name}`);
                const actions = rule.actions || [];

                for (const action of actions) {
                    try {
                        if (action.type === 'timer' && action.timerValue) {
                            const value = action.timerValue;
                            const unit = action.timerUnit || 'minutes';
                            let ms = value * 1000;
                            if (unit === 'minutes') ms = value * 60 * 1000;
                            if (unit === 'hours') ms = value * 60 * 60 * 1000;
                            ms = Math.floor(ms); // Integer safe

                            console.log(`       ⏳ [${getTimestamp()}] Waiting for ${value} ${unit} (${ms}ms)...`);
                            await new Promise(resolve => setTimeout(resolve, ms));
                            console.log(`       ⏰ [${getTimestamp()}] Wait finished.`);
                        }
                        else if (action.type === 'variable' && action.variableId) {
                            console.log(`       👉 [${getTimestamp()}] Processing Variable Action. ID: ${action.variableId}, Target Value: ${action.variableValue}`);
                            // Direct save to ensure consistency
                            const latestVRaw = await fetch('/api/variables', { cache: 'no-store' });
                            const latestVData = await latestVRaw.json();
                            const latestVs: UserVariable[] = latestVData.variables || (Array.isArray(latestVData) ? latestVData : []);
                            const idx = latestVs.findIndex(v => v.id === action.variableId);

                            if (idx >= 0) {
                                latestVs[idx].value = !!action.variableValue;
                                await fetch('/api/variables?source=Automation', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(latestVs)
                                });
                                console.log(`   🔹 [${getTimestamp()}] Variable updated: ${latestVs[idx].name} -> ${action.variableValue}`);
                                // Update local ref immediately
                                varsRef.current.set(action.variableId, !!action.variableValue);
                            }
                        }
                        else if (action.type === 'automation' && action.automationId) {
                            console.log(`       👉 [${getTimestamp()}] Processing Automation Action. ID: ${action.automationId}`);
                            const latestRulesRaw = await fetch('/api/automations', { cache: 'no-store' });
                            const latestRules: AutomationRule[] = await latestRulesRaw.json();
                            const idx = latestRules.findIndex(r => r.id === action.automationId);

                            if (idx >= 0) {
                                latestRules[idx].enabled = !!action.automationEnabled;
                                await fetch('/api/automations', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(latestRules)
                                });
                                console.log(`   🔹 [${getTimestamp()}] Automation updated: ${latestRules[idx].name} -> ${action.automationEnabled}`);

                                // update local ref (next loop will sync fully but this helps immediate logic)
                                const rIdx = rulesRef.current.findIndex(r => r.id === action.automationId);
                                if (rIdx >= 0) rulesRef.current[rIdx].enabled = !!action.automationEnabled;

                                fetch('/api/history', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        type: 'automation',
                                        message: `オートメーションによって「${latestRules[idx].name}」を ${action.automationEnabled ? '有効' : '無効'} にしました`,
                                        details: { ruleId: latestRules[idx].id, enabled: action.automationEnabled, source: 'Automation' }
                                    })
                                }).catch(() => { });
                            }
                        }
                        else if (action.deviceId) {
                            await fetch(`/api/devices/${action.deviceId}/control`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    command: action.command,
                                    parameter: action.payload || 'default',
                                    commandType: 'command',
                                    source: 'Automation'
                                })
                            });
                            const targetDev = devices.find(d => d.deviceId === action.deviceId);
                            const devName = targetDev ? targetDev.deviceName : action.deviceId;
                            console.log(`   🔹 [${getTimestamp()}] Device command sent: ${devName} (${action.deviceId}) -> ${action.command}`);
                        }
                    } catch (e) {
                        console.error(`   ⚠️ [${getTimestamp()}] Action failed:`, e);
                    }
                }
            } else {
                // console.log(`⏳ [${getTimestamp()}] Rule "${rule.name}" is in cooldown.`);
            }
        }
    };

    useEffect(() => {
        // ---------------------------------------------------------
        // Loop 1: Fast Loop (Rules & Variables) - 5 seconds
        // ---------------------------------------------------------
        const runFastLoop = async () => {
            try {
                const t = Date.now();
                const [rulesRes, varsRes] = await Promise.all([
                    fetch(`/api/automations?t=${t}`, { cache: 'no-store' }),
                    fetch(`/api/variables?t=${t}`, { cache: 'no-store' })
                ]);

                if (rulesRes.ok && varsRes.ok) {
                    const rules: AutomationRule[] = await rulesRes.json();
                    const varsData = await varsRes.json();
                    const variables: UserVariable[] = varsData.variables || (Array.isArray(varsData) ? varsData : []);

                    // -------------------------------------------------------------
                    // Log User Changes (UI Interactions)
                    // -------------------------------------------------------------

                    // 1. Detect Rule Enables/Disables
                    if (rulesRef.current.length > 0) {
                        for (const newRule of rules) {
                            const oldRule = rulesRef.current.find(r => r.id === newRule.id);
                            if (oldRule && oldRule.enabled !== newRule.enabled) {
                                console.log(`📝 [${getTimestamp()}] [User Action] Rule "${newRule.name}" ${newRule.enabled ? 'Enabled' : 'Disabled'}`);
                            }
                        }
                    }

                    // 2. Detect Variable Changes
                    if (varsRef.current.size > 0) {
                        for (const newVar of variables) {
                            const oldVal = varsRef.current.get(newVar.id);
                            if (oldVal !== undefined && oldVal !== newVar.value) {
                                console.log(`📝 [${getTimestamp()}] [User Action] Variable "${newVar.name}" Changed: ${oldVal} -> ${newVar.value}`);
                            }
                        }
                    }

                    // Update Refs
                    rulesRef.current = rules;
                    variables.forEach(v => varsRef.current.set(v.id, v.value));

                    // Evaluate immediately with cached device status
                    evaluateRules();
                }
            } catch (e) {
                console.error(`🤖 [${getTimestamp()}] Fast Loop Error:`, e);
            }
        };

        // ---------------------------------------------------------
        // Loop 2: Device Status Loop (External API) - 30 seconds
        // ---------------------------------------------------------
        const runDeviceLoop = async () => {
            try {
                // 1. Determine Target Devices (Only active rules triggers/conditions)
                const activeRules = rulesRef.current.filter((r) => r.enabled);
                const targetDeviceIds = Array.from(new Set([
                    ...activeRules.flatMap((r) =>
                        (r.triggers || [])
                            .filter((t: Trigger) => (t.type === 'sensor' || t.type === 'device') && t.deviceId)
                            .map((t: Trigger) => t.deviceId as string)
                    ),
                    ...activeRules.flatMap((r) =>
                        (r.conditions || [])
                            .filter((c: Condition) => (c.type === 'sensor' || c.type === 'device') && c.deviceId)
                            .map((c: Condition) => c.deviceId as string)
                    )
                ]));

                if (targetDeviceIds.length === 0) {
                    // console.log(`🤖 [${getTimestamp()}] No devices to monitor.`);
                    return;
                }

                console.log(`🤖 [${getTimestamp()}] Starting Device Status Check for ${targetDeviceIds.length} devices...`);

                // 2. Fetch Status
                await Promise.all(targetDeviceIds.map(async (id) => {
                    try {
                        const res = await fetch(`/api/devices/${id}/status`);
                        const data = await res.json();
                        if (data.body) {
                            statusRef.current.set(id, data.body);
                        }
                    } catch (e) {
                        console.error(`[${getTimestamp()}] Status fetch error: ${id}`, e);
                    }
                }));

                // 3. Change Detection & Logging
                // Check devices in statusRef that are also in our watch list (targetDeviceIds)
                for (const id of targetDeviceIds) {
                    const currentStatus = statusRef.current.get(id);
                    const lastStatus = lastStatusRef.current.get(id);
                    const device = devices.find(d => d.deviceId === id);

                    if (currentStatus && lastStatus && device) {
                        let logMessage = '';
                        let logType = 'sensor';

                        const isMove = currentStatus.moveDetected ?? currentStatus.isMoving;
                        const lastMove = lastStatus.moveDetected ?? lastStatus.isMoving;

                        if (isMove !== undefined && isMove !== lastMove) {
                            logMessage = isMove ? '動きを検出しました' : '動きが止まりました';
                            logType = 'sensor';
                        }
                        if (currentStatus.lockState !== undefined && currentStatus.lockState !== lastStatus.lockState) {
                            const state = currentStatus.lockState === 'locked' ? '施錠' : '解錠';
                            logMessage = `ドアが${state}されました`;
                            logType = 'device';
                        }
                        if (currentStatus.openState !== undefined && currentStatus.openState !== lastStatus.openState) {
                            const state = currentStatus.openState === 'open' ? '開けられました' : '閉められました';
                            logMessage = `ドアが${state}`;
                            logType = 'sensor';
                        }
                        if (currentStatus.power !== undefined && currentStatus.power !== lastStatus.power) {
                            const state = currentStatus.power === 'on' ? 'ON' : 'OFF';
                            logMessage = `${state}になりました`;
                            logType = 'device';
                        }

                        if (logMessage) {
                            console.log(`🔔 [${getTimestamp()}] [Status Change] ${device.deviceName}: ${logMessage}`);
                            fetch('/api/history', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    type: logType,
                                    message: `${device.deviceName} : ${logMessage}`,
                                    details: { deviceId: id, status: currentStatus }
                                })
                            }).catch(() => { });
                        }
                    }

                    if (currentStatus) {
                        lastStatusRef.current.set(id, currentStatus);
                    }
                }

                // 4. Evaluate Rules (with new status)
                evaluateRules();

            } catch (e) {
                console.error(`🤖 [${getTimestamp()}] Device Loop Error:`, e);
            }
        };

        // Start Initial
        console.log(`🤖 [${getTimestamp()}] Automation Engine (v3) Started.`);
        runFastLoop();
        runDeviceLoop();

        const fastInterval = setInterval(runFastLoop, 5000);
        const deviceInterval = setInterval(runDeviceLoop, 30000);

        return () => {
            clearInterval(fastInterval);
            clearInterval(deviceInterval);
        };
    }, [devices]);

    return null;
}
