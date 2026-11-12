import type { ImgHTMLAttributes } from "react";
type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string; unoptimized?: boolean; loader?: unknown; fill?: boolean };
export default function Image({ unoptimized: _u, loader: _l, fill, style, ...props }: Props) {
  return <img {...props} style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style } : style} />;
}
