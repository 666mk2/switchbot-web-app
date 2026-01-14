'use client';

import { useMemo } from 'react';
import DeviceCard from '@/components/DeviceCard';
import { SwitchBotDevice } from '@/lib/switchbot';

interface DashboardViewProps {
    devices: SwitchBotDevice[];
    loading: boolean;
    error: string | null;
}

export default function DashboardView({ devices, loading, error }: DashboardViewProps) {
    // 部屋名を抽出してグループ化するロジック
    const groupedDevices = useMemo(() => {
        const groups: { [key: string]: SwitchBotDevice[] } = {};

        devices.forEach(device => {
            // 部屋名を推測
            const name = device.deviceName;
            let room = 'その他';

            const keywords = ['寝室', 'リビング', 'キッチン', '洗面所', '風呂', '玄関', 'ふみ部屋', '子供部屋', '廊下', '階段', '書斎', 'トイレ'];
            for (const kw of keywords) {
                if (name.includes(kw)) {
                    room = kw;
                    break;
                }
            }

            if (room === 'その他' && name.length >= 2 && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(name)) {
                // 特定のパターンから抽出するなどの高度な処理も可能だが、一旦はキーワード優先
            }

            if (!groups[room]) groups[room] = [];
            groups[room].push(device);
        });

        // キーワードリストの順序に合わせる（その他を最後に）
        const sortedRooms = Object.keys(groups).sort((a, b) => {
            const keywords = ['寝室', 'ふみ部屋', 'リビング', 'キッチン', '廊下', '玄関', 'その他'];
            const idxA = keywords.indexOf(a);
            const idxB = keywords.indexOf(b);
            return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });

        return sortedRooms.map(room => ({ room, devices: groups[room] }));
    }, [devices]);

    if (loading) {
        return (
            <div className="room-section">
                <div className="skeleton-card" style={{ width: '150px', height: '30px', marginBottom: '1.25rem' }}></div>
                <div className="device-grid">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="skeleton-card fade-in"></div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                padding: '2rem',
                background: 'white',
                border: '1px solid var(--error)',
                borderRadius: '20px',
                color: 'var(--error)',
                marginTop: '2rem'
            }}>
                <p><strong>Connection Error:</strong> {error}</p>
                <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}>
                    Check your SwitchBot credentials in .env.local
                </p>
            </div>
        );
    }

    return (
        <>
            {groupedDevices.map(({ room, devices }) => (
                <div key={room} className="room-section fade-in">
                    <div className="room-header">
                        <span className="room-title">{room}</span>
                        <span className="room-arrow">›</span>
                    </div>
                    <div className="device-grid">
                        {devices.map((device) => (
                            <DeviceCard key={device.deviceId} device={device} />
                        ))}
                    </div>
                </div>
            ))}

            {devices.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '4rem' }}>
                    No devices found.
                </p>
            )}
        </>
    );
}
