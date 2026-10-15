import React from 'react';
import type { AgentVisualConfig, ExpressionId, VisemeId } from './types';

interface AgentPortraitProps {
  agent: AgentVisualConfig;
  viseme: VisemeId;
  expression: ExpressionId;
  reducedMotion: boolean;
  isSpeaking: boolean;
  staggerIndex?: number;
}

export const AgentPortrait: React.FC<AgentPortraitProps> = ({
  agent,
  viseme,
  expression,
  reducedMotion,
  isSpeaking,
  staggerIndex = 0,
}) => {
  // Stagger idle breathing and eye glance timings per agent
  const breathDelay = `${(staggerIndex * 0.8).toFixed(1)}s`;
  const blinkDelay = `${(staggerIndex * 1.3).toFixed(1)}s`;

  // Determine mouth path according to viseme
  const renderMouth = () => {
    switch (viseme) {
      case 'smile':
        return (
          <path
            d="M 40 85 Q 50 94 60 85"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        );
      case 'viseme_open':
        return (
          <path
            d="M 42 83 Q 50 78 58 83 Q 58 92 50 92 Q 42 92 42 83 Z"
            fill="#1E1E2E"
            stroke={agent.circuitryColor}
            strokeWidth="1.5"
          />
        );
      case 'viseme_round':
        return (
          <ellipse
            cx="50"
            cy="86"
            rx="5.5"
            ry="7.5"
            fill="#1E1E2E"
            stroke={agent.circuitryColor}
            strokeWidth="1.5"
          />
        );
      case 'viseme_narrow':
        return (
          <rect
            x="41"
            y="84"
            width="18"
            height="4"
            rx="1.5"
            fill="#FFFFFF"
            stroke="#1E1E2E"
            strokeWidth="1"
          />
        );
      case 'rest':
      default:
        return (
          <path
            d="M 43 85 Q 50 86 57 85"
            fill="none"
            stroke="#DCDFE4"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
    }
  };

  // Expression classes and transforms
  let headTransformClass = 'portrait-head-idle';
  if (!reducedMotion) {
    if (expression === 'nod') headTransformClass = 'portrait-head-nod';
    else if (expression === 'shake') headTransformClass = 'portrait-head-shake';
    else if (expression === 'attentive') headTransformClass = 'portrait-head-attentive';
    else if (expression === 'focused') headTransformClass = 'portrait-head-focused';
    else if (expression === 'smile') headTransformClass = 'portrait-head-smile';
  }

  return (
    <div
      className={`agent-portrait-container agent-${agent.id} ${reducedMotion ? 'reduced-motion' : ''}`}
      data-testid={`portrait-${agent.id}`}
      data-expression={expression}
      data-viseme={viseme}
      data-speaking={isSpeaking}
    >
      <svg
        viewBox="0 0 100 120"
        className="agent-portrait-svg"
        role="img"
        aria-label={`${agent.name} (${agent.role})`}
      >
        <defs>
          {/* Subtle Cybernetic Background Glow */}
          <radialGradient id={`glow-${agent.id}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={agent.glowColor} stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0B0E14" stopOpacity="0" />
          </radialGradient>

          {/* Skin and Hair Gradients */}
          <linearGradient id={`circuit-${agent.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={agent.circuitryColor} />
            <stop offset="100%" stopColor={agent.secondaryColor} />
          </linearGradient>

          <linearGradient id="cyber-skin" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2A2E3D" />
            <stop offset="100%" stopColor="#181B24" />
          </linearGradient>
        </defs>

        {/* Ambient Halo behind head */}
        <circle cx="50" cy="50" r="42" fill={`url(#glow-${agent.id})`} />

        {/* Shoulders & Torso (Subtle Breathing Motion) */}
        <g
          className={reducedMotion ? '' : 'portrait-breathing'}
          style={{ animationDelay: breathDelay }}
        >
          {/* Collar & Armor Plates */}
          <path
            d="M 15 120 L 28 98 L 72 98 L 85 120 Z"
            fill="#12151E"
            stroke="#232838"
            strokeWidth="1.5"
          />
          {/* Circuitry Inlay on Shoulders */}
          <path
            d="M 22 116 L 33 102 M 78 116 L 67 102"
            stroke={`url(#circuit-${agent.id})`}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </g>

        {/* Neck */}
        <path d="M 42 82 L 42 100 L 58 100 L 58 82 Z" fill="#1C202B" />
        <line
          x1="50"
          y1="85"
          x2="50"
          y2="98"
          stroke={agent.circuitryColor}
          strokeWidth="1.2"
          strokeDasharray="2,2"
        />

        {/* Head Group (Tilt, Nod, Shake, Attentive Head Matrix) */}
        <g className={headTransformClass}>
          {/* Face Base */}
          <path
            d="M 30 35 C 30 20 70 20 70 35 C 70 65 65 84 50 86 C 35 84 30 65 30 35 Z"
            fill="url(#cyber-skin)"
            stroke="#343B4E"
            strokeWidth="1.5"
          />

          {/* Distinct Circuitry Traces on Face */}
          {agent.id === 'roy' && (
            <g stroke={agent.circuitryColor} strokeWidth="1.2" fill="none" opacity="0.85">
              <path d="M 33 45 L 37 45 L 40 52" />
              <path d="M 67 45 L 63 45 L 60 52" />
              <circle cx="40" cy="52" r="1" fill={agent.circuitryColor} />
              <circle cx="60" cy="52" r="1" fill={agent.circuitryColor} />
            </g>
          )}

          {agent.id === 'ava' && (
            <g stroke={agent.circuitryColor} strokeWidth="1.2" fill="none" opacity="0.9">
              {/* Asymmetric temple circuitry (prominent on shaved right side) */}
              <path d="M 65 32 L 68 38 L 65 48 L 68 56" />
              <circle cx="68" cy="38" r="1" fill={agent.circuitryColor} />
              <circle cx="68" cy="56" r="1.2" fill={agent.circuitryColor} />
              <path d="M 34 50 L 38 54" />
            </g>
          )}

          {agent.id === 'guz' && (
            <g stroke={agent.circuitryColor} strokeWidth="1.2" fill="none" opacity="0.85">
              <path d="M 35 60 L 42 66 L 46 66" />
              <path d="M 65 60 L 58 66 L 54 66" />
              <circle cx="46" cy="66" r="1" fill={agent.circuitryColor} />
              <circle cx="54" cy="66" r="1" fill={agent.circuitryColor} />
            </g>
          )}

          {/* Hairstyles */}
          {agent.hairStyle === 'asymmetric' && (
            /* Ava: Approved Asymmetric Hairstyle (Long sweep on left, undercut fade on right) */
            <g fill="#1F2330" stroke="#3A435A" strokeWidth="1.2">
              {/* Undercut side (right) */}
              <path d="M 50 18 C 65 18 68 25 68 35 L 64 35 C 64 25 55 22 50 22 Z" fill="#141822" />
              {/* Long sweeping lock flowing down left cheek */}
              <path
                d="M 50 18 C 30 18 24 28 25 45 C 26 58 31 70 33 75 C 31 68 29 52 32 38 C 34 26 42 22 50 20 Z"
                fill="#272C3E"
                stroke={agent.secondaryColor}
                strokeWidth="1.2"
              />
            </g>
          )}

          {agent.hairStyle === 'military' && (
            /* Roy: Structured cyber-military cut */
            <path
              d="M 28 32 C 28 16 72 16 72 32 L 68 22 C 65 19 35 19 32 22 Z"
              fill="#202431"
              stroke="#3D4559"
              strokeWidth="1.2"
            />
          )}

          {agent.hairStyle === 'spikes' && (
            /* Guz: Angular geometric cyber spikes */
            <path
              d="M 28 32 L 32 18 L 40 24 L 50 15 L 60 24 L 68 18 L 72 32 C 68 22 32 22 28 32 Z"
              fill="#1B202D"
              stroke={agent.circuitryColor}
              strokeWidth="1.2"
            />
          )}

          {/* Eyebrows */}
          <g
            stroke="#9BA3B5"
            strokeWidth="1.8"
            strokeLinecap="round"
            className={expression === 'focused' ? 'brows-focused' : ''}
          >
            <line x1="36" y1="44" x2="44" y2="44" />
            <line x1="56" y1="44" x2="64" y2="44" />
          </g>

          {/* Eyes Group (Subtle Blink and Glance) */}
          <g
            className={reducedMotion ? '' : 'portrait-eyes-blink'}
            style={{ animationDelay: blinkDelay }}
          >
            {/* Left Eye */}
            <ellipse cx="40" cy="51" rx="4.5" ry="3.5" fill="#141721" stroke="#3F485C" strokeWidth="1" />
            <circle
              cx="40"
              cy="51"
              r="2"
              fill={agent.circuitryColor}
              className={reducedMotion ? '' : 'portrait-pupil-glance'}
            />

            {/* Right Eye */}
            <ellipse cx="60" cy="51" rx="4.5" ry="3.5" fill="#141721" stroke="#3F485C" strokeWidth="1" />
            <circle
              cx="60"
              cy="51"
              r="2"
              fill={agent.circuitryColor}
              className={reducedMotion ? '' : 'portrait-pupil-glance'}
            />
          </g>

          {/* Nose Accent */}
          <path
            d="M 50 56 L 48 68 L 52 68"
            fill="none"
            stroke="#3F485C"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Synchronized Viseme Mouth */}
          <g className="portrait-mouth">{renderMouth()}</g>
        </g>
      </svg>
    </div>
  );
};
