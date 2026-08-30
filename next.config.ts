import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Posters are HOTLINKED from TMDB's CDN rather than copied into Supabase
    // Storage: copying would mean a bucket, policies, an upload path,
    // invalidation and quota, all to guard against TMDB deleting an image for a
    // wide release — vanishingly rare, and it already degrades to the drawn
    // placeholder the poster card carries.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        // Pin the PATH PREFIX, not just the host. `poster_path` comes straight
        // from an external API and is concatenated onto this base, so bounding
        // it here is what keeps a crafted path from reaching some other route
        // on the same host.
        pathname: "/t/p/**",
      },
    ],
    // `imageSizes` is deliberately NOT overridden. Those numbers would pick what
    // Next RE-ENCODES to, not which file we hotlink from TMDB — conflating the
    // two once deleted every default step between 342 and the first deviceSize,
    // so a 64px thumbnail had nothing closer than 640 to snap to. Production
    // really was serving a 640px re-encode into a 64px box.
  },
};

export default nextConfig;
