/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /** Isolate Next from the Vite `src/` tree (see tsconfig.next.json). */
  typescript: {
    tsconfigPath: "./tsconfig.next.json",
  },
};

export default nextConfig;
