'use client';

import { useState, useEffect } from 'react';
import { SwitchBotDevice } from '@/lib/switchbot';
import { AutomationRule, Trigger, Condition, Action, UserVariable } from '@/types/automation';

interface AutomationViewProps {
    devices: SwitchBotDevice[];
    variables: UserVariable[];
    setVariables: (vars: UserVariable[]) => void;
}

// 簡易ID生成
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

export default function AutomationView({ devices, variables, setVariables }: AutomationViewProps) {
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [currentRule, setCurrentRule] = useState<Partial<AutomationRule>>({});
    const [newVarName, setNewVarName] = useState('');

    useEffect(() => {
        fetchRules();
        console.log('🧱 AutomationView (Synced): Mounted.');

        // 5秒ごとにルールを更新して、エンジンによる変更を反映する
        const interval = setInterval(() => {
            if (!document.hidden && !isEditing) {
                fetchRules();
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [isEditing]);

    const fetchRules = async () => {
        try {
            const res = await fetch('/api/automations');
            if (res.ok) {
                const data = await res.json();
                // 旧データ構造からのマイグレーション（簡易対応）
                const migratedData = data.map((d: AutomationRule & { trigger?: unknown; action?: unknown }) => {
                    if (d.triggers) return d;
                    return {
                        id: d.id,
                        name: d.name,
                        enabled: d.enabled,
                        triggers: d.trigger ? [{ ...(d.trigger as Trigger), id: generateId() }] : [],
                        conditions: [],
                        actions: d.action ? [{ ...(d.action as Action), id: generateId() }] : [],
                        lastRun: d.lastRun
                    } as AutomationRule;
                });
                setRules(migratedData);
            }
        } catch (error) {
            console.error('Failed to fetch rules:', error);
        }
    };


    const saveVariables = async (newVars: UserVariable[]) => {
        setVariables(newVars);
        await fetch('/api/variables?source=UI', {
            method: 'POST',
            body: JSON.stringify(newVars),
        });
    };

    const addVariable = () => {
        if (!newVarName) return;
        const newVar: UserVariable = {
            id: 'var_' + Math.random().toString(36).substr(2, 9),
            name: newVarName,
            value: false
        };
        saveVariables([...variables, newVar]);
        setNewVarName('');
    };

    const deleteVariable = (id: string) => {
        if (!confirm('変数を削除してもよろしいですか？')) return;
        saveVariables(variables.filter(v => v.id !== id));
    };

    const toggleVariable = (id: string) => {
        const newVars = variables.map(v => v.id === id ? { ...v, value: !v.value } : v);
        saveVariables(newVars);
    };

    const saveRule = async () => {
        if (!currentRule.name) {
            alert('ルール名を入力してください');
            return;
        }
        if ((currentRule.triggers?.length ?? 0) === 0) {
            alert('トリガー（いつ）を少なくとも1つ設定してください');
            return;
        }
        if ((currentRule.actions?.length ?? 0) === 0) {
            alert('アクション（実行）を少なくとも1つ設定してください');
            return;
        }

        const newRule: AutomationRule = {
            id: currentRule.id || generateId(),
            name: currentRule.name,
            enabled: currentRule.enabled ?? true,
            triggers: currentRule.triggers || [],
            conditions: currentRule.conditions || [],
            conditionMode: currentRule.conditionMode || 'AND',
            actions: currentRule.actions || [],
            lastRun: currentRule.lastRun
        };

        const updatedRules = currentRule.id
            ? rules.map(r => r.id === newRule.id ? newRule : r)
            : [...rules, newRule];

        try {
            await fetch('/api/automations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedRules),
            });
            setRules(updatedRules);
            setIsEditing(false);
            setCurrentRule({});
        } catch {
            alert('保存に失敗しました');
        }
    };

    const deleteRule = async (id: string) => {
        if (!confirm('削除しますか？')) return;
        const updatedRules = rules.filter(r => r.id !== id);
        setRules(updatedRules);
        await fetch('/api/automations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedRules),
        });
    };

    // --- Helper to render summaries ---
    const getDeviceName = (id: string) => devices.find(d => d.deviceId === id)?.deviceName || '不明なデバイス';
    const formatDays = (days?: number[]) => {
        if (!days || days.length === 0 || days.length === 7) return '';
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        return `(${days.map(d => dayNames[d]).join(',')})`;
    };

    const getVarName = (id: string) => variables.find(v => v.id === id)?.name || id;

    const getSensorProperties = (deviceType?: string) => {
        const type = (deviceType || '').toLowerCase();
        const props = [{ id: 'temperature', label: '温度', unit: '℃' }];

        if (type.includes('meter') || type.includes('hub 2') || type.includes('hub2') || type.includes('co2')) {
            props.push({ id: 'humidity', label: '湿度', unit: '%' });
        }
        if (type.includes('co2')) {
            props.push({ id: 'CO2', label: 'CO2', unit: 'ppm' });
        }
        return props;
    };

    const renderTriggerSummary = (t: Trigger) => {
        if (t.type === 'schedule') return <span>🕒 {t.time || '--:--'} {formatDays(t.days)}</span>;
        if (t.type === 'sensor') {
            const dev = devices.find(d => d.deviceId === t.deviceId);
            const props = getSensorProperties(dev?.deviceType);
            const prop = props.find(p => p.id === (t.property || 'temperature')) || props[0];
            const diffText = t.differential ? ` (Diff ${t.differential})` : '';
            return <span>🌡️ {getDeviceName(t.deviceId || '')} の {prop.label} {t.operator === '>' ? '' : ''}{t.threshold}{prop.unit}{t.operator === '>' ? '以上' : '以下'}{diffText}</span>;
        }
        if (t.type === 'device') return <span>📱 {getDeviceName(t.deviceId || '')} が {t.state === 'on' ? 'ON' : 'OFF'}になった時</span>;
        if (t.type === 'variable') return <span>🚩 変数「{getVarName(t.variableId || '')}」が {t.variableValue ? 'ON' : 'OFF'}になった時</span>;
        return null;
    };

    const renderConditionSummary = (c: Condition) => {
        if (c.type === 'timeRange') return <span>⏳ {c.startTime}~{c.endTime} {formatDays(c.days)}</span>;
        if (c.type === 'sensor') {
            const dev = devices.find(d => d.deviceId === c.deviceId);
            const props = getSensorProperties(dev?.deviceType);
            const prop = props.find(p => p.id === (c.property || 'temperature')) || props[0];
            return <span>🌡️ {getDeviceName(c.deviceId || '')} の {prop.label} {c.operator === '>' ? '' : ''}{c.threshold}{prop.unit}{c.operator === '>' ? '以上' : '以下'}</span>;
        }
        if (c.type === 'device') return <span>📱 {getDeviceName(c.deviceId || '')} が {c.state === 'on' ? 'ON' : 'OFF'}の時</span>;
        if (c.type === 'variable') return <span>🚩 変数「{getVarName(c.variableId || '')}」が {c.variableValue ? 'ON' : 'OFF'}の時</span>;
        return null;
    };

    const renderActionSummary = (a: Action) => {
        if (a.type === 'variable') return <span>🚩 変数「{getVarName(a.variableId || '')}」を {a.variableValue ? 'ON' : 'OFF'} にする</span>;
        if (a.type === 'automation') return <span>🤖 オートメーション「{rules.find(r => r.id === a.automationId)?.name || '自身'}」を {a.automationEnabled ? '許可' : '禁止'} する</span>;
        if (a.type === 'timer') {
            const unitLabel = a.timerUnit === 'hours' ? '時間' : (a.timerUnit === 'minutes' ? '分' : '秒');
            return <span>⏳ {a.timerValue} {unitLabel} 待機する</span>;
        }
        return <span>⚡ {getDeviceName(a.deviceId || '')} を {(a.command === 'turnOn' || a.command === 'turnOff') ? (a.command === 'turnOn' ? 'ON' : 'OFF') : a.command}</span>;
    };

    // --- Helper to add items ---
    const addTrigger = () => {
        const newTrigger: Trigger = { id: generateId(), type: 'sensor' };
        setCurrentRule({ ...currentRule, triggers: [...(currentRule.triggers || []), newTrigger] });
    };
    const addCondition = () => {
        const newCondition: Condition = { id: generateId(), type: 'timeRange' };
        setCurrentRule({ ...currentRule, conditions: [...(currentRule.conditions || []), newCondition] });
    };
    const addAction = () => {
        // Default to device action
        const newAction: Action = { id: generateId(), type: 'device', deviceId: '', command: 'turnOn' };
        setCurrentRule({ ...currentRule, actions: [...(currentRule.actions || []), newAction] });
    };

    const moveAction = (index: number, direction: 'up' | 'down') => {
        if (!currentRule.actions) return;
        const newActions = [...currentRule.actions];
        if (direction === 'up' && index > 0) {
            [newActions[index - 1], newActions[index]] = [newActions[index], newActions[index - 1]];
        } else if (direction === 'down' && index < newActions.length - 1) {
            [newActions[index], newActions[index + 1]] = [newActions[index + 1], newActions[index]];
        }
        setCurrentRule({ ...currentRule, actions: newActions });
    };

    // --- Render Editor ---
    if (isEditing) {
        return (
            <div className="automation-editor fade-in">
                <div className="editor-header-bar">
                    <input
                        type="text"
                        placeholder="ルール名 (例: 朝の自動化)"
                        value={currentRule.name || ''}
                        onChange={e => setCurrentRule({ ...currentRule, name: e.target.value })}
                        className="rule-name-input"
                    />
                    <button onClick={() => setIsEditing(false)} className="close-btn">×</button>
                </div>

                {/* SECTION 1: WHEN */}
                <div className="section-block">
                    <h3 className="section-title">いつ (いずれかの条件が満たされた時)</h3>
                    <div className="item-list">
                        {currentRule.triggers?.map((t, idx) => (
                            <div key={t.id} className="item-row">
                                {/* Type Selector */}
                                <select
                                    className="mini-select"
                                    value={t.type}
                                    style={{ width: '100px' }}
                                    onChange={e => {
                                        const newTriggers = [...(currentRule.triggers || [])];
                                        // Reset fields when type changes
                                        const newType = e.target.value as Trigger['type'];
                                        newTriggers[idx] = { id: t.id, type: newType };
                                        setCurrentRule({ ...currentRule, triggers: newTriggers });
                                    }}
                                >
                                    <option value="device">デバイス</option>
                                    <option value="sensor">センサー</option>
                                    <option value="variable">ユーザー変数</option>
                                    <option value="schedule">時刻</option>
                                </select>

                                {/* VARIABLE TRIGGER UI */}
                                {t.type === 'variable' && (
                                    <>
                                        <select
                                            className="mini-select"
                                            value={t.variableId || ''}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                newTriggers[idx] = { ...t, variableId: e.target.value };
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        >
                                            <option value="">変数選択</option>
                                            {variables.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="mini-select"
                                            value={t.variableValue === undefined ? '' : (t.variableValue ? 'true' : 'false')}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                newTriggers[idx].variableValue = e.target.value === 'true';
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        >
                                            <option value="">状態</option>
                                            <option value="true">ONになった</option>
                                            <option value="false">OFFになった</option>
                                        </select>
                                    </>
                                )}

                                {/* DEVICE TRIGGER UI */}
                                {t.type === 'device' && (
                                    <>
                                        <select
                                            className="mini-select"
                                            value={t.deviceId || ''}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                const devId = e.target.value;
                                                const dev = devices.find(d => d.deviceId === devId);
                                                newTriggers[idx] = { ...t, deviceId: devId, deviceType: dev?.deviceType };
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        >
                                            <option value="">デバイス選択</option>
                                            {devices.filter(d => !(d.deviceType || '').includes('Meter')).map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.deviceName}</option>
                                            ))}
                                        </select>

                                        {/* State Selection based on Device Type */}
                                        <select
                                            className="mini-select"
                                            value={t.state || ''}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                newTriggers[idx].state = e.target.value;
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        >
                                            <option value="">状態</option>
                                            <option value="on">ONになった</option>
                                            <option value="off">OFFになった</option>
                                            {/* Future: Smart Lock / Motion specific states */}
                                        </select>
                                    </>
                                )}

                                {/* SENSOR TRIGGER UI */}
                                {t.type === 'sensor' && (
                                    <>
                                        <select
                                            className="mini-select"
                                            value={t.deviceId || ''}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                const devId = e.target.value;
                                                // Reset property when device changes
                                                newTriggers[idx] = { ...t, deviceId: devId, property: 'temperature' };
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        >
                                            <option value="">センサー選択</option>
                                            {devices.filter(d => (d.deviceType || '').includes('Meter') || (d.deviceType || '').includes('Hub 2') || (d.deviceType || '').includes('CO2')).map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.deviceName}</option>
                                            ))}
                                        </select>

                                        {/* Property Selector */}
                                        <select
                                            className="mini-select"
                                            value={t.property || 'temperature'}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                newTriggers[idx].property = e.target.value;
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        >
                                            {getSensorProperties(devices.find(d => d.deviceId === t.deviceId)?.deviceType).map(p => (
                                                <option key={p.id} value={p.id}>{p.label}</option>
                                            ))}
                                        </select>

                                        <select
                                            className="mini-select"
                                            value={t.operator || '>'}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                newTriggers[idx].operator = e.target.value as '<' | '>';
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        >
                                            <option value=">">以上 ({'>'})</option>
                                            <option value="<">以下 ({'<'})</option>
                                        </select>
                                        <span style={{ fontSize: '0.8rem', marginLeft: '4px' }}>設定</span>
                                        <input
                                            type="number" className="mini-input" style={{ width: '100px' }}
                                            placeholder="閾値"
                                            value={t.threshold || ''}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                newTriggers[idx].threshold = Number(e.target.value);
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        />
                                        <span style={{ fontSize: '0.8rem' }}>
                                            {getSensorProperties(devices.find(d => d.deviceId === t.deviceId)?.deviceType).find(p => p.id === (t.property || 'temperature'))?.unit || '℃'}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', marginLeft: '8px' }}>Diff</span>
                                        <input
                                            type="number" className="mini-input" style={{ width: '80px', marginLeft: '4px' }}
                                            placeholder="差分"
                                            title="ディファレンシャル (ヒステリシス)"
                                            value={t.differential || ''}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                newTriggers[idx].differential = Number(e.target.value);
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        />
                                    </>
                                )}

                                {/* SCHEDULE TRIGGER UI */}
                                {t.type === 'schedule' && (
                                    <>
                                        <input
                                            type="time" className="mini-input"
                                            value={t.time || ''}
                                            onChange={e => {
                                                const newTriggers = [...(currentRule.triggers || [])];
                                                newTriggers[idx] = { ...t, time: e.target.value };
                                                setCurrentRule({ ...currentRule, triggers: newTriggers });
                                            }}
                                        />
                                        <div className="days-picker">
                                            {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                                                <span
                                                    key={i}
                                                    className={`day-chip ${(t.days || []).includes(i) ? 'active' : ''}`}
                                                    onClick={() => {
                                                        const newTriggers = [...(currentRule.triggers || [])];
                                                        const currentDays = t.days || [];
                                                        newTriggers[idx].days = currentDays.includes(i)
                                                            ? currentDays.filter(day => day !== i)
                                                            : [...currentDays, i].sort();
                                                        setCurrentRule({ ...currentRule, triggers: newTriggers });
                                                    }}
                                                >{d}</span>
                                            ))}
                                        </div>
                                    </>
                                )}

                                <button className="remove-btn" onClick={() => {
                                    const newTriggers = currentRule.triggers?.filter((_, i) => i !== idx);
                                    setCurrentRule({ ...currentRule, triggers: newTriggers });
                                }}>🗑️</button>
                            </div>
                        ))}
                    </div>
                    <button className="add-link-btn" onClick={addTrigger}>+ 条件を追加</button>
                </div>

                {/* SECTION 2: AND (Conditions) */}
                <div className="section-block">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 className="section-title" style={{ marginBottom: 0 }}>かつ (Conditions)</h3>
                        <div className="logic-toggle">
                            <div
                                className={`logic-option ${(!currentRule.conditionMode || currentRule.conditionMode === 'AND') ? 'active' : ''}`}
                                onClick={() => setCurrentRule({ ...currentRule, conditionMode: 'AND' })}
                            >すべて (AND)</div>
                            <div
                                className={`logic-option ${currentRule.conditionMode === 'OR' ? 'active' : ''}`}
                                onClick={() => setCurrentRule({ ...currentRule, conditionMode: 'OR' })}
                            >いずれか (OR)</div>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '1rem' }}>
                        {(!currentRule.conditionMode || currentRule.conditionMode === 'AND')
                            ? 'すべての条件が満たされた場合に実行します'
                            : 'いずれかの条件が満たされた場合に実行します'}
                    </p>

                    <div className="item-list">
                        {currentRule.conditions?.map((c, idx) => (
                            <div key={c.id} className="item-row">
                                <select
                                    className="mini-select"
                                    value={c.type}
                                    style={{ width: '100px' }}
                                    onChange={e => {
                                        const newConds = [...(currentRule.conditions || [])];
                                        const newType = e.target.value as Condition['type'];
                                        newConds[idx] = { id: c.id, type: newType };
                                        setCurrentRule({ ...currentRule, conditions: newConds });
                                    }}
                                >
                                    <option value="device">デバイス</option>
                                    <option value="sensor">センサー</option>
                                    <option value="variable">ユーザー変数</option>
                                    <option value="timeRange">時刻</option>
                                </select>

                                {/* VARIABLE CONDITION UI */}
                                {c.type === 'variable' && (
                                    <>
                                        <select
                                            className="mini-select"
                                            value={c.variableId || ''}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                newConds[idx] = { ...c, variableId: e.target.value };
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        >
                                            <option value="">変数選択</option>
                                            {variables.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="mini-select"
                                            value={c.variableValue === undefined ? '' : (c.variableValue ? 'true' : 'false')}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                newConds[idx].variableValue = e.target.value === 'true';
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        >
                                            <option value="">状態</option>
                                            <option value="true">ONである</option>
                                            <option value="false">OFFである</option>
                                        </select>
                                    </>
                                )}

                                {/* DEVICE CONDITION UI */}
                                {c.type === 'device' && (
                                    <>
                                        <select
                                            className="mini-select"
                                            value={c.deviceId || ''}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                const devId = e.target.value;
                                                const dev = devices.find(d => d.deviceId === devId);
                                                newConds[idx] = { ...c, deviceId: devId, deviceType: dev?.deviceType };
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        >
                                            <option value="">デバイス選択</option>
                                            {devices.filter(d => !(d.deviceType || '').includes('Meter')).map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.deviceName}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="mini-select"
                                            value={c.state || ''}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                newConds[idx].state = e.target.value;
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        >
                                            <option value="">状態</option>
                                            <option value="on">ONである</option>
                                            <option value="off">OFFである</option>
                                        </select>
                                    </>
                                )}

                                {/* SENSOR CONDITION UI */}
                                {c.type === 'sensor' && (
                                    <>
                                        <select
                                            className="mini-select"
                                            value={c.deviceId || ''}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                newConds[idx] = { ...c, deviceId: e.target.value, property: 'temperature' };
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        >
                                            <option value="">センサー選択</option>
                                            {devices.filter(d => (d.deviceType || '').includes('Meter') || (d.deviceType || '').includes('Hub 2') || (d.deviceType || '').includes('CO2')).map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.deviceName}</option>
                                            ))}
                                        </select>

                                        {/* Property Selector */}
                                        <select
                                            className="mini-select"
                                            value={c.property || 'temperature'}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                newConds[idx].property = e.target.value;
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        >
                                            {getSensorProperties(devices.find(d => d.deviceId === c.deviceId)?.deviceType).map(p => (
                                                <option key={p.id} value={p.id}>{p.label}</option>
                                            ))}
                                        </select>

                                        <select
                                            className="mini-select"
                                            value={c.operator || '>'}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                newConds[idx].operator = e.target.value as '<' | '>';
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        >
                                            <option value=">">以上 ({'>'})</option>
                                            <option value="<">以下 ({'<'})</option>
                                        </select>
                                        <span style={{ fontSize: '0.8rem', marginLeft: '4px' }}>設定</span>
                                        <input
                                            type="number" className="mini-input" style={{ width: '100px' }}
                                            placeholder="閾値"
                                            value={c.threshold || ''}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                newConds[idx].threshold = Number(e.target.value);
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        />
                                        <span style={{ fontSize: '0.8rem' }}>
                                            {getSensorProperties(devices.find(d => d.deviceId === c.deviceId)?.deviceType).find(p => p.id === (c.property || 'temperature'))?.unit || '℃'}
                                        </span>
                                    </>
                                )}

                                {/* TIME RANGE CONDITION UI */}
                                {c.type === 'timeRange' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, flexWrap: 'wrap' }}>
                                        <input type="time" className="mini-input" value={c.startTime || ''}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                newConds[idx] = { ...c, startTime: e.target.value };
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        />
                                        <span>~</span>
                                        <input type="time" className="mini-input" value={c.endTime || ''}
                                            onChange={e => {
                                                const newConds = [...(currentRule.conditions || [])];
                                                newConds[idx] = { ...c, endTime: e.target.value };
                                                setCurrentRule({ ...currentRule, conditions: newConds });
                                            }}
                                        />
                                        <div className="days-picker">
                                            {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                                                <span
                                                    key={i}
                                                    className={`day-chip ${(c.days || []).includes(i) ? 'active' : ''}`}
                                                    onClick={() => {
                                                        const newConds = [...(currentRule.conditions || [])];
                                                        const currentDays = c.days || [0, 1, 2, 3, 4, 5, 6];
                                                        newConds[idx].days = currentDays.includes(i)
                                                            ? currentDays.filter(day => day !== i)
                                                            : [...currentDays, i].sort();
                                                        setCurrentRule({ ...currentRule, conditions: newConds });
                                                    }}
                                                >{d}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button className="remove-btn" onClick={() => {
                                    const newConds = currentRule.conditions?.filter((_, i) => i !== idx);
                                    setCurrentRule({ ...currentRule, conditions: newConds });
                                }}>🗑️</button>
                            </div>
                        ))}
                    </div>
                    <button className="add-link-btn" onClick={addCondition}>+ 前提条件を設定</button>
                </div>

                {/* SECTION 3: EXECUTE */}
                <div className="section-block">
                    <h3 className="section-title">実行</h3>
                    <div className="item-list">
                        {currentRule.actions?.map((a, idx) => (
                            <div key={a.id} className="item-row">
                                <select
                                    className="mini-select"
                                    value={a.type || 'device'}
                                    style={{ width: '100px' }}
                                    onChange={e => {
                                        const newActions = [...(currentRule.actions || [])];
                                        const newType = e.target.value as 'device' | 'variable' | 'automation' | 'timer';
                                        newActions[idx] = { id: a.id, type: newType };
                                        if (newType === 'device') {
                                            newActions[idx].command = 'turnOn';
                                        } else if (newType === 'variable') {
                                            newActions[idx].variableValue = true;
                                        } else if (newType === 'timer') {
                                            newActions[idx].timerValue = 1;
                                            newActions[idx].timerUnit = 'minutes';
                                        } else {
                                            newActions[idx].automationId = currentRule.id; // デフォルトは自身
                                            newActions[idx].automationEnabled = true;
                                        }
                                        setCurrentRule({ ...currentRule, actions: newActions });
                                    }}
                                >
                                    <option value="device">デバイス</option>
                                    <option value="variable">ユーザー変数</option>
                                    <option value="automation">オートメーション</option>
                                    <option value="timer">待機 (タイマー)</option>
                                </select>

                                {/* TIMER ACTION UI */}
                                {a.type === 'timer' && (
                                    <>
                                        <input
                                            type="number"
                                            className="mini-input"
                                            style={{ width: '80px' }}
                                            min="0"
                                            step="0.01"
                                            value={a.timerValue || 0}
                                            onChange={e => {
                                                const newActions = [...(currentRule.actions || [])];
                                                newActions[idx].timerValue = Number(e.target.value);
                                                setCurrentRule({ ...currentRule, actions: newActions });
                                            }}
                                        />
                                        <select
                                            className="mini-select"
                                            value={a.timerUnit || 'minutes'}
                                            onChange={e => {
                                                const newActions = [...(currentRule.actions || [])];
                                                newActions[idx].timerUnit = e.target.value as 'seconds' | 'minutes' | 'hours';
                                                setCurrentRule({ ...currentRule, actions: newActions });
                                            }}
                                        >
                                            <option value="seconds">秒</option>
                                            <option value="minutes">分</option>
                                            <option value="hours">時間</option>
                                        </select>
                                        <span>待機</span>
                                    </>
                                )}

                                {/* AUTOMATION ACTION UI */}
                                {a.type === 'automation' && (
                                    <>
                                        <select
                                            className="mini-select"
                                            value={a.automationId || ''}
                                            onChange={e => {
                                                const newActions = [...(currentRule.actions || [])];
                                                newActions[idx] = { ...a, automationId: e.target.value };
                                                setCurrentRule({ ...currentRule, actions: newActions });
                                            }}
                                        >
                                            <option value="">（自身）</option>
                                            {rules.map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="mini-select"
                                            value={a.automationEnabled ? 'true' : 'false'}
                                            onChange={e => {
                                                const newActions = [...(currentRule.actions || [])];
                                                newActions[idx].automationEnabled = e.target.value === 'true';
                                                setCurrentRule({ ...currentRule, actions: newActions });
                                            }}
                                        >
                                            <option value="true">許可する</option>
                                            <option value="false">禁止する</option>
                                        </select>
                                    </>
                                )}

                                {/* VARIABLE ACTION UI */}
                                {a.type === 'variable' && (
                                    <>
                                        <select
                                            className="mini-select"
                                            value={a.variableId || ''}
                                            onChange={e => {
                                                const newActions = [...(currentRule.actions || [])];
                                                newActions[idx] = { ...a, variableId: e.target.value };
                                                setCurrentRule({ ...currentRule, actions: newActions });
                                            }}
                                        >
                                            <option value="">変数選択</option>
                                            {variables.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="mini-select"
                                            value={a.variableValue ? 'true' : 'false'}
                                            onChange={e => {
                                                const newActions = [...(currentRule.actions || [])];
                                                newActions[idx].variableValue = e.target.value === 'true';
                                                setCurrentRule({ ...currentRule, actions: newActions });
                                            }}
                                        >
                                            <option value="true">ONにする</option>
                                            <option value="false">OFFにする</option>
                                        </select>
                                    </>
                                )}

                                {/* DEVICE ACTION UI */}
                                {(!a.type || a.type === 'device') && (
                                    <>
                                        <select
                                            className="mini-select"
                                            value={a.deviceId || ''}
                                            onChange={e => {
                                                const newActions = [...(currentRule.actions || [])];
                                                const devId = e.target.value;
                                                newActions[idx] = { ...a, deviceId: devId };
                                                setCurrentRule({ ...currentRule, actions: newActions });
                                            }}
                                        >
                                            <option value="">デバイスを選択</option>
                                            {devices.filter(d => {
                                                const type = d.deviceType || '';
                                                // Exclude sensors, hubs, and remote controllers (physical buttons)
                                                // (Filter logic same as before)

                                                if (type.includes('Meter')) return false;
                                                if (type.includes('Hub') && !type.includes('Robot')) return false;
                                                if (type === 'Motion Sensor') return false;
                                                if (type === 'Contact Sensor') return false;
                                                if (type.includes('Keypad')) return false;

                                                return true;
                                            }).map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.deviceName}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="mini-select"
                                            value={a.command || 'turnOn'}
                                            onChange={e => {
                                                const newActions = [...(currentRule.actions || [])];
                                                newActions[idx] = { ...a, command: e.target.value };
                                                setCurrentRule({ ...currentRule, actions: newActions });
                                            }}
                                        >
                                            <option value="turnOn">ON</option>
                                            <option value="turnOff">OFF</option>
                                        </select>
                                    </>
                                )}

                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <button
                                        className="icon-btn"
                                        onClick={() => moveAction(idx, 'up')}
                                        disabled={idx === 0}
                                        style={{
                                            padding: '4px 8px',
                                            cursor: idx === 0 ? 'default' : 'pointer',
                                            opacity: idx === 0 ? 0.2 : 1,
                                            background: 'none', border: 'none', fontSize: '1.2rem'
                                        }}
                                        title="上へ移動"
                                    >⬆️</button>
                                    <button
                                        className="icon-btn"
                                        onClick={() => moveAction(idx, 'down')}
                                        disabled={idx === (currentRule.actions?.length || 0) - 1}
                                        style={{
                                            padding: '4px 8px',
                                            cursor: idx === (currentRule.actions?.length || 0) - 1 ? 'default' : 'pointer',
                                            opacity: idx === (currentRule.actions?.length || 0) - 1 ? 0.2 : 1,
                                            background: 'none', border: 'none', fontSize: '1.2rem'
                                        }}
                                        title="下へ移動"
                                    >⬇️</button>
                                    <button className="remove-btn" onClick={() => {
                                        const newActions = currentRule.actions?.filter((_, i) => i !== idx);
                                        setCurrentRule({ ...currentRule, actions: newActions });
                                    }}>🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="add-link-btn" onClick={addAction}>+ アクションを追加</button>
                </div>

                <div className="editor-footer">
                    <button className="save-full-btn" onClick={saveRule}>保存</button>
                </div>
            </div>
        );
    }

    // --- Render List ---
    return (
        <div className="automation-view fade-in">
            {/* Variable Management Section */}
            {!isEditing && (
                <div style={{ marginBottom: '1.5rem', background: '#fff', padding: '1rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h3 style={{ fontSize: '1rem', margin: 0 }}>ユーザー変数 (自動更新中)</h3>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <input
                            type="text"
                            className="mini-input"
                            style={{ flex: 1 }}
                            placeholder="変数名 (例: 外出モード)"
                            value={newVarName}
                            onChange={e => setNewVarName(e.target.value)}
                        />
                        <button className="add-link-btn" onClick={addVariable}>追加</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                        {variables.map(v => (
                            <div key={v.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 1rem',
                                background: v.value ? '#e8f5e9' : '#f5f5f5',
                                borderRadius: '24px',
                                border: v.value ? '1px solid #4caf50' : '1px solid #ddd'
                            }}>
                                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{v.name}</span>
                                <div
                                    onClick={() => toggleVariable(v.id)}
                                    style={{
                                        width: '40px', height: '20px', background: v.value ? '#4caf50' : '#ccc',
                                        borderRadius: '20px', position: 'relative', cursor: 'pointer', transition: '0.2s'
                                    }}
                                >
                                    <div style={{
                                        width: '18px', height: '18px', background: '#fff', borderRadius: '50%',
                                        position: 'absolute', top: '1px', left: v.value ? '21px' : '1px', transition: '0.2s'
                                    }} />
                                </div>
                                <button onClick={() => deleteVariable(v.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.5 }}>✕</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {rules.length === 0 ? (
                <div className="empty-state">
                    <p>まだルールがありません</p>
                    <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>「新しいルールを追加」ボタンから作成してください</p>
                </div>
            ) : (
                <div className="rule-list-modern">
                    {rules.map((rule: AutomationRule) => (
                        <div key={rule.id} className="rule-card-modern">
                            <div className="rule-card-header">
                                <span className="rule-card-title">{rule.name}</span>
                                <div className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={rule.enabled}
                                        onChange={async () => {
                                            const updated = { ...rule, enabled: !rule.enabled };
                                            const newRules = rules.map(r => r.id === rule.id ? updated : r);
                                            setRules(newRules);

                                            // Log to history
                                            fetch('/api/history', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    type: 'automation',
                                                    message: `オートメーション「${rule.name}」を ${!rule.enabled ? '有効' : '無効'} にしました`,
                                                    details: { ruleId: rule.id, enabled: !rule.enabled, source: 'UI' }
                                                })
                                            }).catch(() => { });

                                            await fetch('/api/automations', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(newRules),
                                            });
                                        }}
                                    />
                                    <span className="slider"></span>
                                </div>
                            </div>
                            <div className="rule-summary-modern">
                                <div className="summary-block">
                                    <span className="summary-label">いつ</span>
                                    <div className="summary-content">
                                        {(rule.triggers || []).map((t: Trigger) => (
                                            <div key={t.id} className="summary-item">{renderTriggerSummary(t)}</div>
                                        ))}
                                    </div>
                                </div>
                                {rule.conditions && rule.conditions.length > 0 && (
                                    <div className="summary-block">
                                        <span className="summary-label">かつ</span>
                                        <div className="summary-content">
                                            {(rule.conditions || []).map((c: Condition) => (
                                                <div key={c.id} className="summary-item">{renderConditionSummary(c)}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="summary-block">
                                    <span className="summary-label">実行</span>
                                    <div className="summary-content">
                                        {(rule.actions || []).map((a: Action) => (
                                            <div key={a.id} className="summary-item">{renderActionSummary(a)}</div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="rule-actions">
                                <button onClick={() => { setCurrentRule(rule); setIsEditing(true); }}>編集</button>
                                <button onClick={() => deleteRule(rule.id)} style={{ color: 'tomato' }}>削除</button>
                            </div>
                        </div>
                    ))}
                    {/* 新しいルールを追加するためのカードボタン */}
                    <div className="add-rule-card" onClick={() => { setCurrentRule({}); setIsEditing(true); }}>
                        <div className="add-rule-icon">+</div>
                        <span className="add-rule-text">新しいルールを追加</span>
                    </div>
                </div>
            )}
        </div>
    );
}
