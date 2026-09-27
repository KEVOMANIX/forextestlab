import Image from "next/image";

export function ProductDemoVideo({
  webm,
  mp4,
  poster,
  alt,
  width,
  height,
  priority = false,
  mobileZoom = false,
}: {
  webm: string;
  mp4: string;
  poster: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  mobileZoom?: boolean;
}) {
  const mediaClass = mobileZoom
    ? "absolute inset-y-0 left-1/2 h-full w-auto min-w-full max-w-none -translate-x-1/2 object-cover sm:static sm:h-auto sm:w-full sm:translate-x-0"
    : "h-auto w-full";

  return (
    <div className={`relative overflow-hidden bg-surface-950 ${mobileZoom ? "aspect-[4/3] sm:aspect-auto" : ""}`}>
      <video
        className={`${mediaClass} motion-reduce:hidden`}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={poster}
        aria-label={alt}
      >
        <source src={webm} type="video/webm" />
        <source src={mp4} type="video/mp4" />
      </video>
      <Image
        src={poster}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes="(max-width: 1024px) 100vw, 78vw"
        className={`${mediaClass} hidden motion-reduce:block`}
      />
    </div>
  );
}
