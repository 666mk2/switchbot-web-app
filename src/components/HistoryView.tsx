import React, { useEffect, useState } from 'react';
import { HistoryItem } from '../types/history';

import { SwitchBotDevice } from '../lib/switchbot';

interface HistoryViewProps {
    devices: SwitchBotDevice[];
}

export default function HistoryView({ devices }: HistoryViewProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/history');
            if (res.ok) {
                const data = await res.json();
                setHistory(data);
            }
        } catch (e) {
            console.error('Failed to fetch history', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 5000); // 5 sec poll
        return () => clearInterval(interval);
    }, []);

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'sensor': return '🌡️';
            case 'device': return '📱';
            case 'automation': return '🤖';
            case 'variable': return '🚩';
            default: return '📝';
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'sensor': return 'センサー';
            case 'device': return 'デバイス';
            case 'automation': return '自動化';
            case 'variable': return '変数';
            default: return 'その他';
        }
    };

    const getDeviceName = (deviceId: string) => {
        return devices.find(d => d.deviceId === deviceId)?.deviceName || deviceId;
    };

    const formatMessage = (item: HistoryItem) => {
        let msg = item.message;

        // details に deviceId があれば置換を試みる
        if (item.details?.deviceId) {
            const name = getDeviceName(item.details.deviceId as string);
            msg = msg.replace(item.details.deviceId as string, name);
        }

        // オートメーションの場合はコマンド名を日本語に
        if (item.type === 'device' && item.details?.command) {
            const cmd = item.details.command as string;
            if (cmd === 'turnOn') msg = msg.replace('turnOn', 'オン');
            if (cmd === 'turnOff') msg = msg.replace('turnOff', 'オフ');
            if (cmd === 'lock') msg = msg.replace('lock', '施錠');
            if (cmd === 'unlock') msg = msg.replace('unlock', '解錠');
        }

        return msg;
    };

    if (loading && history.length === 0) return <div className="loading-spinner">履歴を読み込み中...</div>;

    return (
        <div className="history-container fade-in">
            <h2 className="section-title">履歴ログ (最新1000件)</h2>
            <div className="history-list">
                {history.length === 0 ? (
                    <div className="empty-state">履歴はありません</div>
                ) : (
                    history.map(item => (
                        <div key={item.id} className="history-item">
                            <div className="history-time">
                                {new Date(item.timestamp).toLocaleString('ja-JP')}
                            </div>
                            <div className="history-type">
                                <span className={`type-badge type-${item.type}`}>
                                    {getTypeIcon(item.type)} {getTypeLabel(item.type)}
                                </span>
                            </div>
                            <div className="history-message">
                                {item.details?.source === 'UI' && <span className="source-badge source-ui" title="ユーザー操作">👤</span>}
                                {item.details?.source === 'Automation' && <span className="source-badge source-auto" title="自動操作">🤖</span>}
                                {formatMessage(item)}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
