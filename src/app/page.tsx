'use client';

import { useEffect, useState } from 'react';
import { SwitchBotDevice } from '@/lib/switchbot';
import { UserVariable } from '@/types/automation';
import DashboardView from '@/components/DashboardView';
import AutomationView from '@/components/AutomationView';
import HistoryView from '@/components/HistoryView';
import AutomationEngine from '@/components/AutomationEngine';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'automation' | 'history'>('dashboard');
  const [devices, setDevices] = useState<SwitchBotDevice[]>([]);
  const [variables, setVariables] = useState<UserVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<string | null>(null);

  const fetchVariables = async () => {
    try {
      const t = Date.now();
      const res = await fetch(`/api/variables?t=${t}`, { cache: 'no-store' });
      const data = await res.json();
      if (data && data.variables) {
        setVariables(data.variables);
        if (data.quota !== undefined) setQuota(data.quota);
      } else if (Array.isArray(data)) {
        // Fallback for old API format (just in case)
        setVariables(data);
      }
    } catch (e) {
      console.error('Core: Variable fetch failed', e);
    }
  };

  useEffect(() => {
    async function fetchDevices() {
      try {
        const res = await fetch('/api/devices');
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // クォータ取得（大文字小文字の両方をケア）
        const q = data.rateLimitRemaining || data.rateLimitremaining;
        if (q !== undefined) setQuota(q);

        if (data.body && data.statusCode === 100) {
          const filterFunc = (d: SwitchBotDevice) => {
            const type = (d.deviceType || d.remoteType || '').toLowerCase();
            return !type.includes('hub') && !d.deviceName.includes('Hub') && !d.deviceName.includes('カメラ');
          };
          const deviceList = (data.body.deviceList || []).filter(filterFunc);
          const remoteList = (data.body.remoteInfraredCommands || []).filter(filterFunc);
          setDevices([...deviceList, ...remoteList]);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchDevices();
    fetchVariables();

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchVariables();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <main>
      <header className="page-header">
        <div className="header-left">
          <div className="tab-group">
            <button
              className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              ダッシュボード
            </button>
            <button
              className={`tab-button ${activeTab === 'automation' ? 'active' : ''}`}
              onClick={() => setActiveTab('automation')}
            >
              オートメーション
            </button>
            <button
              className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              履歴
            </button>
          </div>
        </div>
        <div className="quota-badge">
          <span className="quota-label">Switchbot API本日残り</span>
          <span className="quota-value">{quota || '---'}</span>
        </div>
      </header>

      <AutomationEngine devices={devices} />

      {activeTab === 'dashboard' && (
        <DashboardView devices={devices} loading={loading} error={error} />
      )}

      {activeTab === 'automation' && (
        <AutomationView devices={devices} variables={variables} setVariables={setVariables} />
      )}

      {activeTab === 'history' && (
        <HistoryView devices={devices} />
      )}
    </main>
  );
}
