/** @type {import('next').NextConfig} */
const nextConfig = {
  // 自托管优化：构建出独立的 standalone 服务，部署时无需携带 node_modules
  output: 'standalone',
  // 允许反向代理（nginx）正确传递主机头
  async headers() {
    return [];
  },
};

export default nextConfig;
