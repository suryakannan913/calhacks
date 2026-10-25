export default function Avatar({
  name,
  color,
  size = 28,
  online,
}: {
  name: string
  color: string
  size?: number
  online?: boolean
}) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, ['--av' as string]: color }}
    >
      {name[0]}
      {online && <span className="online-dot" />}
    </span>
  )
}
