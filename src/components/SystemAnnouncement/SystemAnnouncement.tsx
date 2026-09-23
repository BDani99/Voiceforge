import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { AlertTriangle } from 'lucide-react';
import './SystemAnnouncement.css';

export default function SystemAnnouncement() {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const fetchAnnouncement = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'announcement')
          .single();
        
        if (!error && data?.value) {
          setAnnouncement(data.value);
        }
      } catch (err) {
        // silently ignore error if table doesn't exist or setting missing
      }
    };
    
    fetchAnnouncement();
    
    // Check every 5 minutes
    const interval = setInterval(fetchAnnouncement, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!announcement) return null;

  return (
    <div className="system-announcement">
      <AlertTriangle size={18} />
      <span>{announcement}</span>
    </div>
  );
}
