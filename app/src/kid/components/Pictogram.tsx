/** One ARASAAC pictogram on a white plate (the artwork is drawn for white backgrounds). */
export default function Pictogram({ src, size = 44, className = "" }: { src: string; size?: number; className?: string }) {
  return (
    <span className={`plate ${className}`} style={{ width: size + 8, height: size + 8 }}>
      <img src={src} width={size} height={size} alt="" draggable={false} decoding="async" />
    </span>
  );
}
