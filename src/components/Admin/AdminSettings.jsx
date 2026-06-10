import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { notify } from '../../utils/notificationService';
import { Save, Settings2, Bell } from 'lucide-react';
import LoadingScreen from '../LoadingScreen/LoadingScreen';
import './AdminSettings.css';

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    default_credits: '10000',
    announcement: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('system_settings').select('*');
      if (error) {
        // Handle gracefully if table doesn't exist yet
        console.warn('system_settings table might not exist yet.', error);
        setLoading(false);
        return;
      }

      if (data) {
        const newSettings = { ...settings };
        data.forEach(item => {
          if (item.key === 'default_credits') newSettings.default_credits = item.value;
          if (item.key === 'announcement') newSettings.announcement = item.value;
        });
        setSettings(newSettings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Upsert default credits
      await supabase.from('system_settings').upsert([
        { key: 'default_credits', value: settings.default_credits }
      ]);
      
      // Upsert announcement
      await supabase.from('system_settings').upsert([
        { key: 'announcement', value: settings.announcement }
      ]);

      notify.success('System settings saved successfully!');
    } catch (err) {
      console.error(err);
      notify.error(err, 'Error saving settings. Does system_settings table exist?');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen text="Loading settings..." />;

  return (
    <div className="admin-settings-container">
      <div className="logs-header">
        <h2>Global System Settings</h2>
        <p>Configure default values affecting VoiceForge operation.</p>
      </div>

      <div className="settings-cards-grid">
        <div className="settings-card">
          <div className="card-header">
            <Settings2 className="icon" size={24} />
            <h3>Registration Defaults</h3>
          </div>
          <form onSubmit={saveSettings} className="settings-form">
            <div className="form-group">
              <label>Starting Credits (for new accounts)</label>
              <input 
                type="number" 
                value={settings.default_credits}
                onChange={(e) => setSettings({...settings, default_credits: e.target.value})}
                placeholder="e.g., 10000"
                min="0"
                className="number-input"
              />
              <p className="help-text">
                Number of characters granted automatically to every newly registered user. (Note: modifying the backend / Edge Function might also be needed to use this value in the registration hook).
              </p>
            </div>
            <button type="submit" disabled={saving} className="save-btn">
              <Save size={18} /> {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
        </div>

        <div className="settings-card">
          <div className="card-header">
            <Bell className="icon text-yellow-500" size={24} />
            <h3>System Announcement</h3>
          </div>
          <form onSubmit={saveSettings} className="settings-form">
            <div className="form-group">
              <label>Message displayed to users</label>
              <textarea 
                value={settings.announcement}
                onChange={(e) => setSettings({...settings, announcement: e.target.value})}
                placeholder="e.g., Maintenance expected on Sunday from 10:00 PM..."
                rows={4}
              />
              <p className="help-text">
                If this field is filled, all logged-in users will see it as a yellow warning bar on the main page. Clear the text to disable.
              </p>
            </div>
            <button type="submit" disabled={saving} className="save-btn">
              <Save size={18} /> {saving ? 'Saving...' : 'Update Announcement'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
