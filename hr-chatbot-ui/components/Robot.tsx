export type RobotMood = "idle" | "thinking" | "answering";

const STATUS: Record<RobotMood, string> = {
  idle: "Ready to help",
  thinking: "Thinking…",
  answering: "Answering…",
};

export default function Robot({ mood }: { mood: RobotMood }) {
  return (
    <div className={`robot-wrap ${mood}`}>
      <svg className="robot" viewBox="-40 -44 280 335" role="img" aria-label={`HR robot – ${STATUS[mood]}`}>
        <ellipse className="shadow" cx="100" cy="232" rx="50" ry="8" />

        <g className="body-group">
          {/* Arms sit behind the torso so their shoulders are hidden */}
          <g className="arm arm-left">
            <rect x="30" y="146" width="18" height="50" rx="9" className="part" />
            <circle cx="39" cy="198" r="9" className="shell" />
          </g>
          <g className="arm arm-right">
            <rect x="152" y="146" width="18" height="50" rx="9" className="part" />
            <circle cx="161" cy="198" r="9" className="shell" />
          </g>

          {/* Torso */}
          <rect x="90" y="126" width="20" height="14" className="part" />
          <rect x="52" y="138" width="96" height="72" rx="24" className="shell" />
          <circle cx="100" cy="170" r="12" className="core" />
          <rect x="78" y="192" width="44" height="4" rx="2" className="part" />

          {/* Head */}
          <g className="head">
            <line x1="100" y1="40" x2="100" y2="20" className="stroke" />
            <circle cx="100" cy="15" r="8" className="bulb" />
            <rect x="28" y="68" width="14" height="34" rx="6" className="part ear" />
            <rect x="158" y="68" width="14" height="34" rx="6" className="part ear" />
            <rect x="40" y="40" width="120" height="90" rx="28" className="shell" />
            <rect x="54" y="55" width="92" height="60" rx="18" className="face" />
            <g className="eyes">
              <ellipse cx="80" cy="82" rx="9" ry="11" className="eye" />
              <ellipse cx="120" cy="82" rx="9" ry="11" className="eye" />
            </g>
            <rect x="86" y="100" width="28" height="6" rx="3" className="mouth" />
          </g>
        </g>

        {/* Thinking: orbiting dots + thought bubbles */}
        <g className="orbit">
          <circle cx="100" cy="0" r="6" />
          <circle cx="172" cy="124" r="5" />
          <circle cx="28" cy="124" r="4" />
        </g>
        <g className="thought">
          <circle cx="170" cy="24" r="5" />
          <circle cx="188" cy="4" r="8" />
          <g className="big">
            <circle cx="212" cy="-22" r="18" />
            <text x="212" y="-15" textAnchor="middle">?</text>
          </g>
        </g>

        {/* Answering: sound waves on both sides */}
        <g className="waves">
          <path d="M184 66 q12 19 0 38" />
          <path d="M196 56 q20 29 0 58" />
          <path d="M16 66 q-12 19 0 38" />
          <path d="M4 56 q-20 29 0 58" />
        </g>
      </svg>
    </div>
  );
}
