/** @type {import('next').NextConfig} */
const allowedDevOrigins = (() => {
  const origins = new Set();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    return [];
  }

  try {
    origins.add(new URL(apiUrl).hostname);
  } catch {
    // Ignore malformed env values here so Next can still start with defaults.
  }

  return [...origins];
})();

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins,
  async rewrites() {
    return [
      {
        source: "/operator/:ticketId",
        destination: "/operatordetail?ticketId=:ticketId",
      },
      {
        source: "/operatordetail/:ticketId",
        destination: "/operatordetail?ticketId=:ticketId",
      },
    ];
  },
};

export default nextConfig;
