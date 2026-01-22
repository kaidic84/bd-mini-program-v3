// vite.config.ts
import { defineConfig } from "file:///Users/kaidichen/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/%E6%A9%99%E6%9E%9C/%E5%89%8D%E7%AB%AF%E6%AF%8F%E6%97%A5%E8%A1%A8%E5%8D%95/bd-daily-flow-2.0-main/node_modules/vite/dist/node/index.js";
import react from "file:///Users/kaidichen/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/%E6%A9%99%E6%9E%9C/%E5%89%8D%E7%AB%AF%E6%AF%8F%E6%97%A5%E8%A1%A8%E5%8D%95/bd-daily-flow-2.0-main/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///Users/kaidichen/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/%E6%A9%99%E6%9E%9C/%E5%89%8D%E7%AB%AF%E6%AF%8F%E6%97%A5%E8%A1%A8%E5%8D%95/bd-daily-flow-2.0-main/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "/Users/kaidichen/Library/Mobile Documents/com~apple~CloudDocs/\u6A59\u679C/\u524D\u7AEF\u6BCF\u65E5\u8868\u5355/bd-daily-flow-2.0-main";
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: true,
    port: 8080,
    allowedHosts: [
      "nondiscriminating-amuck-francie.ngrok-free.dev"
    ],
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMva2FpZGljaGVuL0xpYnJhcnkvTW9iaWxlIERvY3VtZW50cy9jb21+YXBwbGV+Q2xvdWREb2NzL1x1NkE1OVx1Njc5Qy9cdTUyNERcdTdBRUZcdTZCQ0ZcdTY1RTVcdTg4NjhcdTUzNTUvYmQtZGFpbHktZmxvdy0yLjAtbWFpblwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2thaWRpY2hlbi9MaWJyYXJ5L01vYmlsZSBEb2N1bWVudHMvY29tfmFwcGxlfkNsb3VkRG9jcy9cdTZBNTlcdTY3OUMvXHU1MjREXHU3QUVGXHU2QkNGXHU2NUU1XHU4ODY4XHU1MzU1L2JkLWRhaWx5LWZsb3ctMi4wLW1haW4vdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2thaWRpY2hlbi9MaWJyYXJ5L01vYmlsZSUyMERvY3VtZW50cy9jb20lN0VhcHBsZSU3RUNsb3VkRG9jcy8lRTYlQTklOTklRTYlOUUlOUMvJUU1JTg5JThEJUU3JUFCJUFGJUU2JUFGJThGJUU2JTk3JUE1JUU4JUExJUE4JUU1JThEJTk1L2JkLWRhaWx5LWZsb3ctMi4wLW1haW4vdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4gKHtcbiAgc2VydmVyOiB7XG4gICAgaG9zdDogdHJ1ZSxcbiAgICBwb3J0OiA4MDgwLFxuICAgIGFsbG93ZWRIb3N0czogW1xuICAgICAgXCJub25kaXNjcmltaW5hdGluZy1hbXVjay1mcmFuY2llLm5ncm9rLWZyZWUuZGV2XCIsXG4gICAgXSxcbiAgICBwcm94eToge1xuICAgICAgXCIvYXBpXCI6IHtcbiAgICAgICAgdGFyZ2V0OiBcImh0dHA6Ly9sb2NhbGhvc3Q6NDAwMFwiLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHBsdWdpbnM6IFtyZWFjdCgpLCBtb2RlID09PSBcImRldmVsb3BtZW50XCIgJiYgY29tcG9uZW50VGFnZ2VyKCldLmZpbHRlcihCb29sZWFuKSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcbiAgICB9LFxuICB9LFxufSkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFraEIsU0FBUyxvQkFBb0I7QUFDL2lCLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyx1QkFBdUI7QUFIaEMsSUFBTSxtQ0FBbUM7QUFLekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE9BQU87QUFBQSxFQUN6QyxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixjQUFjO0FBQUEsTUFDWjtBQUFBLElBQ0Y7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxNQUNoQjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTLENBQUMsTUFBTSxHQUFHLFNBQVMsaUJBQWlCLGdCQUFnQixDQUFDLEVBQUUsT0FBTyxPQUFPO0FBQUEsRUFDOUUsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLElBQ3RDO0FBQUEsRUFDRjtBQUNGLEVBQUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
