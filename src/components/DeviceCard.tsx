'use client';

import { useState, useEffect } from 'react';
import { SwitchBotDevice } from '@/lib/switchbot';
import { HistoryItem } from '@/types/history';

interface DeviceCardProps {
    device: SwitchBotDevice;
}

export default function DeviceCard({ device }: DeviceCardProps) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{
        power?: string;
        temperature?: number;
        humidity?: number;
        moveDetected?: boolean;
        lockState?: string;
        doorState?: string;
        CO2?: number;
    } | null>(null);
    const [lastFetched, setLastFetched] = useState<string>('');

    const dispType = device.deviceType || device.remoteType || 'Unknown';

    // カテゴリ判定
    const isSensor = dispType.includes('Meter') || dispType.includes('Sensor');
    const isMotion = dispType.includes('Motion') || dispType.includes('Contact');
    const isCamera = dispType.includes('Camera');
    const isClimate = dispType.includes('Air Conditioner') || dispType.includes('DIY AC');
    const isLock = dispType.includes('Smart Lock');
    const isControl = dispType.includes('Switch') || dispType.includes('Light') || dispType.includes('Plug') || isLock;

    useEffect(() => {
        const fetchStatus = async () => {
            // タブが非表示なら取得をスキップしてAPI消費を抑える
            if (document.visibilityState !== 'visible') return;

            try {
                const res = await fetch(`/api/devices/${device.deviceId}/status`);
                const data = await res.json();
                if (data.body) {
                    setStatus(data.body);
                    setLastFetched(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
                }
            } catch (err) {
                console.error('Failed to fetch status', err);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 120000); // 120秒（2分）ごとに更新
        return () => clearInterval(interval);
    }, [device.deviceId]);

    const handleControl = async (command: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/devices/${device.deviceId}/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: command,
                    parameter: 'default',
                    commandType: 'command',
                    deviceName: device.deviceName,
                    source: 'UI',
                }),
            });
            if (res.ok) {
                // UIを即座に更新（楽観的UI更新）
                if (isLock) {
                    // ロックの場合は状態を反転
                    setStatus(prev => prev ? ({ ...prev, lockState: prev.lockState === 'locked' ? 'unlocked' : 'locked' }) : null);
                } else if (isClimate || isControl) {
                    // 電源操作の場合は状態を反転
                    setStatus(prev => prev ? ({ ...prev, power: isActive ? 'off' : 'on' }) : null);
                }

                // 念のため少し待ってからサーバーの正式なステータスも再取得
                setTimeout(async () => {
                    const sRes = await fetch(`/api/devices/${device.deviceId}/status`);
                    const sData = await sRes.json();
                    if (sData.body) setStatus(sData.body);
                }, isLock ? 4000 : 2000);
            }
        } catch (error) {
            console.error('Control error', error);
        } finally {
            setLoading(false);
        }
    };

    const [lastDetection, setLastDetection] = useState<string | null>(null);

    // ... (existing effects)

    // 人感センサーの場合、履歴から最終検知時刻を取得
    useEffect(() => {
        if (!isMotion) return;

        const fetchHistory = async () => {
            try {
                const res = await fetch('/api/history', { cache: 'no-store' });
                if (res.ok) {
                    const history: HistoryItem[] = await res.json();
                    // 最新の「動きを検出」を探す
                    const item = history.find(h =>
                        h.details?.deviceId === device.deviceId &&
                        (h.message.includes('動きを検出') || h.message.includes('動体を検出'))
                    );
                    if (item) {
                        const date = new Date(item.timestamp);
                        const dateStr = date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
                        const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                        setLastDetection(`${dateStr} ${timeStr}`);
                    }
                }
            } catch (e) { console.error('Fetch history failed', e); }
        };
        fetchHistory();
    }, [device.deviceId, isMotion]);

    // アイコン/絵文字の決定
    const getIcon = () => {
        if (dispType.includes('Meter')) return '🌡️';
        if (isMotion) return '🏃';
        if (isCamera) return '📷';
        if (isClimate) return '❄️';
        if (isLock) return '🔒';
        if (dispType.includes('Light')) return '💡';
        if (dispType.includes('Switch')) return '🔘';
        if (dispType.includes('Plug')) return '🔌';
        if (dispType.includes('Hub')) return '🌐';
        return '📦';
    };

    // ステータステキストの生成
    const getStatusText = () => {
        if (!status) return '読み込み中...';

        if (isMotion) {
            if (status.moveDetected) return '動きを検出';
            return lastDetection ? `${lastDetection} | 最後に検出` : '';
        }
        if (isCamera) {
            return `${lastFetched} | 動体を検出`;
        }
        if (isLock) {
            const lockState = status.lockState === 'locked' ? '施錠中' : '解錠中';
            const doorState = status.doorState === 'closed' ? '' : ' | ドア開';
            return `${lockState}${doorState}`;
        }
        if (isClimate || isControl) {
            const power = status.power === 'on' || status.power === 'ON' ? 'オン' : 'オフ';
            return power;
        }
        return '';
    };

    const isActive = status?.power === 'on' || status?.power === 'ON' || status?.moveDetected || (isLock && status?.lockState === 'unlocked');

    return (
        <div className="device-card fade-in">
            <div className="card-top">
                <div className={`device-icon-wrapper ${isActive ? 'device-icon-active' : ''}`}>
                    {getIcon()}
                </div>
                {isControl && (
                    <button
                        className={`power-button ${isActive ? 'active' : ''}`}
                        onClick={() => {
                            if (isLock) {
                                handleControl(status?.lockState === 'locked' ? 'unlock' : 'lock');
                            } else {
                                handleControl(isActive ? 'turnOff' : 'turnOn');
                            }
                        }}
                        disabled={loading}
                    >
                        {loading ? '...' : (isLock ? (status?.lockState === 'locked' ? '解' : '施') : '⏻')}
                    </button>
                )}
            </div>

            <div className="device-info">
                <div className="device-name">{device.deviceName}</div>

                {isSensor && status && (
                    <div className="sensor-values">
                        {status.temperature !== undefined && (
                            <div className="sensor-row">
                                <span className="sensor-icon">🌡️</span>
                                <span className="temp-val">{status.temperature}°C</span>
                            </div>
                        )}
                        {status.humidity !== undefined && (
                            <div className="sensor-row">
                                <span className="sensor-icon">💧</span>
                                <span className="hum-val">{status.humidity}%</span>
                            </div>
                        )}
                        {status.CO2 !== undefined && (
                            <div className="sensor-row">
                                <span className="sensor-icon">🍃</span>
                                <span style={{ color: '#8e8e93' }}>{status.CO2}ppm</span>
                            </div>
                        )}
                    </div>
                )}

                <div className={`device-status ${isActive ? 'status-highlight' : ''}`}>
                    {getStatusText()}
                </div>
            </div>
        </div>
    );
}
