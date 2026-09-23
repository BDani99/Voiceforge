import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { AlertTriangle } from 'lucide-react';
import './SystemAnnouncement.css';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function SystemAnnouncement() {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let cancelled = false;

    const fetchAnnouncement = async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'announcement')
        .maybeSingle();

      // On errors keep what is shown; a cleared announcement (no row or empty value) hides the banner.
      if (!error && !cancelled) setAnnouncement(data?.value ?? '');
    };

    void fetchAnnouncement();
    const interval = setInterval(() => void fetchAnnouncement(), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!announcement) return null;

  return (
    <div className="system-announcement" role="status">
      <AlertTriangle size={18} aria-hidden="true" />
      <span>{announcement}</span>
    </div>
  );
}
