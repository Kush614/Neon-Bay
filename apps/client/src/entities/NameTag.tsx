import { Html } from "@react-three/drei";

export function NameTag({ name, color, height = 2.3 }: { name: string; color: string; height?: number }) {
  return (
    <Html position={[0, height, 0]} center distanceFactor={14} zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
      <div style={{ padding: "1px 6px", background: "rgba(10,5,20,0.7)", borderBottom: `2px solid ${color}`, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
        {name}
      </div>
    </Html>
  );
}
