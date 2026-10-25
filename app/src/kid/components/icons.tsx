type P = { size?: number };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Back = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m15 5-7 7 7 7" /></svg>
);
export const Speaker = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>
);
export const SpeakerOff = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" /><path d="m16 9.5 5 5m0-5-5 5" /></svg>
);
export const Replay = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4.5v4h4" /></svg>
);
export const Send = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m21 3-9.5 18-2.2-7.8L2 11 21 3Z" /><path d="m21 3-11.7 10.2" /></svg>
);
export const Grid = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" /></svg>
);
export const Chat = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M20 11.5A7.5 7.5 0 0 1 8.4 17.8L4 19l1.2-4A7.5 7.5 0 1 1 20 11.5Z" /></svg>
);
export const Check = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7" /></svg>
);
export const Cross = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.4}><path d="m6 6 12 12M18 6 6 18" /></svg>
);
export const Undo = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m9 14-5-5 5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);
