export type Operator = '<' | '>' | '==' | '>=' | '<=';

export interface Trigger {
    id: string;
    type: 'sensor' | 'schedule' | 'device' | 'variable';
    // Schedule
    time?: string;
    days?: number[];
    // Sensor
    deviceId?: string;
    property?: string; // e.g., 'temperature', 'humidity', 'CO2', 'battery'
    operator?: '<' | '>';
    threshold?: number;
    differential?: number; // ディファレンシャル
    // Device
    deviceType?: string; // e.g., 'details' for mapping
    state?: string; // 'on', 'off', 'locked', 'unlocked', 'motionDetected', etc.
    // User Variable
    variableId?: string;
    variableValue?: boolean;
}

export interface Condition {
    id: string;
    type: 'timeRange' | 'sensor' | 'device' | 'variable';
    // for timeRange
    startTime?: string;
    endTime?: string;
    days?: number[];
    // for sensor
    deviceId?: string;
    property?: string;
    operator?: '<' | '>';
    threshold?: number;
    differential?: number;
    // for device
    deviceType?: string;
    state?: string;
    // for variable
    variableId?: string;
    variableValue?: boolean;
}

export interface UserVariable {
    id: string;
    name: string;
    value: boolean;
}

export interface Action {
    id: string;
    type?: 'device' | 'variable' | 'automation' | 'timer'; // デフォルトは device
    // for device
    deviceId?: string;
    command?: string;
    payload?: string;
    // for variable
    variableId?: string;
    variableValue?: boolean;
    // for automation
    automationId?: string;
    automationEnabled?: boolean;
    // for timer
    timerValue?: number;
    timerUnit?: 'seconds' | 'minutes' | 'hours';
}

export interface AutomationRule {
    id: string;
    name: string;
    enabled: boolean;
    triggers: Trigger[];   // いずれかが満たされた時 (OR)
    conditions: Condition[]; // 前提条件
    conditionMode?: 'AND' | 'OR'; // 条件の判定モード (デフォルトは AND)
    actions: Action[];     // 実行するアクション
    lastRun?: number;
}
