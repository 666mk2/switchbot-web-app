export interface HistoryItem {
    id: string;
    timestamp: string;
    type: 'sensor' | 'device' | 'automation' | 'variable';
    message: string;
    details?: {
        deviceId?: string;
        deviceName?: string;
        command?: string;
        parameter?: string;
        source?: 'UI' | 'Automation';
        [key: string]: unknown;
    };
}
