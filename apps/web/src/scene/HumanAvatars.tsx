import React from 'react';

export interface HumanAvatarConfig {
  id: 'kanny' | 'serena';
  name: string;
  role: string;
  badge: string;
  description: string;
}

export const HUMAN_ROLES: Record<'kanny' | 'serena', HumanAvatarConfig> = {
  kanny: {
    id: 'kanny',
    name: 'Kanny',
    role: 'Studio Owner',
    badge: 'Owner (Approval Authority)',
    description: 'Human studio owner. Holds release approval authorization.',
  },
  serena: {
    id: 'serena',
    name: 'Serena',
    role: 'Reader',
    badge: 'Reader (Auditor)',
    description: 'Human reader and auditor. Read-only verification clearance.',
  },
};

interface HumanAvatarsProps {
  reducedMotion: boolean;
  onSelectRole?: (roleId: 'kanny' | 'serena') => void;
  activeRole?: 'kanny' | 'serena';
}

export const HumanAvatars: React.FC<HumanAvatarsProps> = ({
  reducedMotion,
  onSelectRole,
  activeRole = 'kanny',
}) => {
  return (
    <aside className="human-avatars-panel" aria-labelledby="human-roles-heading">
      <h3 id="human-roles-heading" className="human-roles-title">
        Studio Human Authorities
      </h3>
      <p className="human-roles-subtext muted">
        Natural human identity. Visual avatars illustrate authority; server-side session tokens strictly govern approvals.
      </p>

      <div className="human-avatars-grid">
        {/* Kanny: Studio Owner */}
        <div
          className={`human-avatar-card ${activeRole === 'kanny' ? 'human-active' : ''}`}
          data-testid="human-avatar-kanny"
        >
          <div className="human-portrait-frame">
            <svg viewBox="0 0 80 80" className="human-portrait-svg" role="img" aria-label="Kanny - Human Studio Owner">
              <defs>
                <linearGradient id="skin-kanny" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E0AC69" />
                  <stop offset="100%" stopColor="#C68642" />
                </linearGradient>
              </defs>
              {/* Natural Attire (Brown Leather / Studio Vest) */}
              <path d="M 15 80 L 25 60 L 55 60 L 65 80 Z" fill="#4E342E" stroke="#3E2723" strokeWidth="1.5" />
              <path d="M 32 60 L 40 72 L 48 60 Z" fill="#D7CCC8" />
              {/* Neck & Head */}
              <rect x="35" y="48" width="10" height="14" fill="#C68642" />
              <circle cx="40" cy="36" r="16" fill="url(#skin-kanny)" stroke="#8D6E63" strokeWidth="1" />
              {/* Natural Hair (Dark Brown Wavy Crop) */}
              <path d="M 23 34 C 23 20 57 20 57 34 C 55 22 25 22 23 34 Z" fill="#2D1E18" />
              {/* Eyes and Friendly Neutral Expression */}
              <circle cx="34" cy="36" r="1.5" fill="#212121" />
              <circle cx="46" cy="36" r="1.5" fill="#212121" />
              <path d="M 36 43 Q 40 46 44 43" fill="none" stroke="#5D4037" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="human-info">
            <h4 className="human-name">{HUMAN_ROLES.kanny.name}</h4>
            <span className="human-badge badge-owner">{HUMAN_ROLES.kanny.badge}</span>
            <p className="human-desc">{HUMAN_ROLES.kanny.description}</p>
          </div>
        </div>

        {/* Serena: Human Reader */}
        <div
          className={`human-avatar-card ${activeRole === 'serena' ? 'human-active' : ''}`}
          data-testid="human-avatar-serena"
        >
          <div className="human-portrait-frame">
            <svg viewBox="0 0 80 80" className="human-portrait-svg" role="img" aria-label="Serena - Human Reader">
              <defs>
                <linearGradient id="skin-serena" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F5D0C5" />
                  <stop offset="100%" stopColor="#E8B4A2" />
                </linearGradient>
              </defs>
              {/* Natural Attire (Emerald Knit / Scarf) */}
              <path d="M 15 80 L 25 60 L 55 60 L 65 80 Z" fill="#1B5E20" stroke="#0A3D0E" strokeWidth="1.5" />
              <path d="M 30 60 Q 40 68 50 60 Z" fill="#C8E6C9" />
              {/* Neck & Head */}
              <rect x="35" y="48" width="10" height="14" fill="#E8B4A2" />
              <circle cx="40" cy="36" r="16" fill="url(#skin-serena)" stroke="#D7CCC8" strokeWidth="1" />
              {/* Natural Hair (Auburn Long Bob) */}
              <path d="M 22 36 C 22 18 58 18 58 36 C 58 48 55 52 53 54 C 55 40 50 24 40 24 C 30 24 25 40 27 54 C 25 52 22 48 22 36 Z" fill="#5D2E1D" />
              {/* Eyes and Attentive Reader Expression */}
              <circle cx="34" cy="36" r="1.5" fill="#212121" />
              <circle cx="46" cy="36" r="1.5" fill="#212121" />
              <path d="M 36 43 Q 40 45 44 43" fill="none" stroke="#8D6E63" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="human-info">
            <h4 className="human-name">{HUMAN_ROLES.serena.name}</h4>
            <span className="human-badge badge-reader">{HUMAN_ROLES.serena.badge}</span>
            <p className="human-desc">{HUMAN_ROLES.serena.description}</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
